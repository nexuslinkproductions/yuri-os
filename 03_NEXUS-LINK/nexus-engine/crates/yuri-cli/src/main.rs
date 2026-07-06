//! # yuri-cli — the `yuri` binary
//!
//! A thin end-to-end driver that wires the Nexus Link spine without owning any math:
//!
//! ```text
//!   ingest      fixture JSON ──HackerOneFeed.parse──▶ Aggregator::pipeline
//!               (nexus-ingest, VETO-FIRST) ──▶ SqliteStore.put_lead / put_score
//!   queue       SqliteStore.list_leads + get_score ──▶ DefaultRankable.rank (kernel EVH)
//!               ──▶ pursue-queue truncated to the effort budget (PRIOR badges, EV inversion)
//!   calibration SqliteStore.calibration_state ──▶ Brier or NotYetCalibrated
//! ```
//!
//! Every number printed here is produced by `nexus-score` / `nexus-core` /
//! `nexus-store`. The CLI computes **no** EV, EVH, net-of-take, or Brier value itself —
//! it loads records, calls the ports, and formats the result.
//!
//! ## Persistence
//!
//! Leads + scores land in an on-disk, tenant-isolated [`nexus_store::SqliteStore`] at
//! `--db` (default: a stable path under the system temp dir). `ingest` then `queue` /
//! `calibration` share that file, so the spine is exercised across process boundaries.

#![forbid(unsafe_code)]

use std::path::PathBuf;
use std::process::ExitCode;

use clap::{Parser, Subcommand};
use time::OffsetDateTime;
use uuid::Uuid;

use nexus_core::{
    CoreError, CoreResult, DefaultRankable, LeadRecord, Rankable, ScoreRecord, Store, TenantId,
};
use nexus_ingest::{Aggregator, Feed, HackerOneFeed};
use nexus_score::ev::ScoredLead;
use nexus_store::{CalibrationState, SqliteStore};

/// The single tenant this CLI operates as. The spine is tenant-isolated at every layer;
/// a one-tenant CLI pins a stable id so `ingest` and `queue` address the same rows.
/// (Multi-tenant operation would surface this as a flag; it is intentionally fixed here.)
const CLI_TENANT: Uuid = Uuid::from_u128(0x5955_5249_0000_4000_8000_0000_0000_0001);

/// Wire the spine end-to-end: ingest a bug-bounty fixture, rank the pursue-queue, and
/// report calibration state. All math lives in the kernel/core/store crates.
#[derive(Debug, Parser)]
#[command(name = "yuri", version, about, long_about = None)]
struct Cli {
    #[command(subcommand)]
    command: Command,
}

#[derive(Debug, Subcommand)]
enum Command {
    /// Ingest leads from a committed bug-bounty fixture into an on-disk SqliteStore.
    ///
    /// The fixture is a HackerOne-shaped JSON body (the richest feed: per-asset scope +
    /// bounty-eligibility). It is parsed offline, run through the VETO-FIRST ingest
    /// pipeline, and the admitted leads + their prior scores are persisted.
    Ingest {
        /// Path to the HackerOne-shaped fixture JSON to ingest.
        #[arg(long)]
        fixture: PathBuf,
        /// On-disk SQLite database path (default: a stable path under the temp dir).
        #[arg(long)]
        db: Option<PathBuf>,
    },
    /// Print the EVH-descending pursue-queue, truncated to an effort budget.
    Queue {
        /// Effort budget in hours: pursue leads in EVH order until the cumulative
        /// `effort_hours` would exceed this.
        #[arg(long)]
        budget_hours: f64,
        /// On-disk SQLite database path (default: a stable path under the temp dir).
        #[arg(long)]
        db: Option<PathBuf>,
    },
    /// Print the honesty-loop calibration state (Brier score or NotYetCalibrated).
    Calibration {
        /// On-disk SQLite database path (default: a stable path under the temp dir).
        #[arg(long)]
        db: Option<PathBuf>,
    },
}

fn main() -> ExitCode {
    let cli = Cli::parse();
    let result = match cli.command {
        Command::Ingest { fixture, db } => run_ingest(&fixture, db),
        Command::Queue { budget_hours, db } => run_queue(budget_hours, db),
        Command::Calibration { db } => run_calibration(db),
    };
    match result {
        Ok(()) => ExitCode::SUCCESS,
        Err(e) => {
            eprintln!("yuri: error: {e}");
            ExitCode::FAILURE
        }
    }
}

/// The default on-disk database path: a stable file under the system temp dir so
/// `ingest` and a later `queue`/`calibration` in the same shell address the same store.
fn default_db_path() -> PathBuf {
    let mut p = std::env::temp_dir();
    p.push("yuri-nexus-cli.db");
    p
}

/// The tenant this CLI runs as.
fn tenant() -> TenantId {
    TenantId::new(CLI_TENANT)
}

/// Resolves the effective db path: the `--db` value, or the default temp path.
fn resolve_db_path(db: Option<PathBuf>) -> PathBuf {
    db.unwrap_or_else(default_db_path)
}

/// Opens (creating + migrating if needed) the on-disk store at the given path.
fn open_store(path: &std::path::Path) -> CoreResult<SqliteStore> {
    SqliteStore::open(path)
}

// --- ingest -----------------------------------------------------------------------

fn run_ingest(fixture: &std::path::Path, db: Option<PathBuf>) -> CoreResult<()> {
    let bytes = std::fs::read(fixture)
        .map_err(|e| CoreError::Store(format!("read fixture {}: {e}", fixture.display())))?;

    // Parse the HackerOne-shaped fixture offline, then run the real VETO-FIRST ingest
    // pipeline. The pipeline drops out-of-scope / ineligible assets via the kernel veto
    // BEFORE they could become leads; only admitted assets come back.
    let programs = HackerOneFeed
        .parse(&bytes)
        .map_err(|e| CoreError::Store(format!("parse fixture: {e}")))?;

    let t = tenant();
    let captured_at = OffsetDateTime::now_utc();
    let aggregator = Aggregator::default();
    let ingested = aggregator.pipeline(t, programs, captured_at)?;

    let db_path = resolve_db_path(db);
    let mut store = open_store(&db_path)?;
    let mut persisted = 0usize;
    for il in &ingested {
        store.put_lead(t, &il.lead)?;
        store.put_score(t, &il.score)?;
        persisted += 1;
    }

    println!("INGEST");
    println!("  fixture : {}", fixture.display());
    println!("  db      : {}", db_path.display());
    println!("  tenant  : {t}");
    println!(
        "  admitted: {persisted} lead(s) persisted (out-of-scope / ineligible assets were \
         hard-vetoed before ranking)"
    );
    if persisted == 0 {
        println!("  note    : nothing admitted — every asset in this fixture was vetoed.");
    }
    Ok(())
}

// --- queue ------------------------------------------------------------------------

/// A queue row: the kernel's ranking output joined back to the record fields the CLI
/// needs to display (probability, prior flag, payout, effort). The kernel `ScoredLead`
/// carries only `id` + `evh`; the rest is read from the persisted lead/score.
struct QueueRow {
    lead: LeadRecord,
    score: ScoreRecord,
    evh: f64,
}

fn run_queue(budget_hours: f64, db: Option<PathBuf>) -> CoreResult<()> {
    let t = tenant();
    let store = open_store(&resolve_db_path(db))?;

    // Load every lead and its score, build the kernel leads, and let the kernel rank.
    // The CLI does not compute EVH — `rank` is the kernel's `rank_by_evh`.
    let leads = store.list_leads(t)?;
    if leads.is_empty() {
        println!("QUEUE: no leads in store. Run `yuri ingest --fixture <path>` first.");
        return Ok(());
    }

    let ranker = DefaultRankable;
    let mut kernel_leads = Vec::with_capacity(leads.len());
    for lead in &leads {
        let score = store.get_score(t, lead.id)?;
        kernel_leads.push((lead.clone(), score, ranker.to_kernel_lead(lead, &score)?));
    }
    let scored: Vec<ScoredLead<_>> =
        ranker.rank(&kernel_leads.iter().map(|(_, _, k)| *k).collect::<Vec<_>>())?;

    // Join the kernel ranking (id, evh) back to the records for display, preserving the
    // kernel's descending-EVH order.
    let mut rows: Vec<QueueRow> = Vec::with_capacity(scored.len());
    for s in &scored {
        if let Some((lead, score, _)) = kernel_leads.iter().find(|(l, _, _)| l.id == s.id) {
            rows.push(QueueRow {
                lead: lead.clone(),
                score: *score,
                evh: s.evh,
            });
        }
    }

    print_queue(&rows, budget_hours);
    Ok(())
}

/// Renders the pursue-queue as a clean text table: EVH-descending, PRIOR-badged, with
/// the budget cut line and the EV inversion called out. (The designed HTML board is a
/// separate artifact — this is text only.)
fn print_queue(rows: &[QueueRow], budget_hours: f64) {
    println!("PURSUE-QUEUE  (EVH-descending, budget {budget_hours:.1}h)");
    println!(
        "  {:<4} {:<14} {:>10} {:>10} {:>8} {:>7} {:>7}  FLAGS",
        "#", "LEAD", "EVH", "PAYOUT", "P(conv)", "EFFORT", "CUM-H"
    );
    println!("  {}", "-".repeat(86));

    // Truncation is a PREFIX cut, not a knapsack fill: you work the EVH-ranked queue
    // top-down and stop the moment the next lead would exceed the budget. That lead and
    // everything after it fall below the cut line — we do not skip an expensive lead to
    // squeeze a cheaper one in behind it (that would reorder the pursue priority).
    let mut cumulative = 0.0_f64;
    let mut within_budget_count = 0usize;
    let mut cut = false;

    for (i, row) in rows.iter().enumerate() {
        let effort = row.lead.effort_hours;
        let in_budget = !cut && (cumulative + effort <= budget_hours);
        if in_budget {
            cumulative += effort;
            within_budget_count += 1;
        } else if !cut {
            // First lead to overflow the budget: draw the cut line once, right above it.
            println!(
                "  {}  budget cut at {:.1}h ({} lead(s) fit) ----",
                " ".repeat(4),
                budget_hours,
                within_budget_count
            );
            cut = true;
        }

        let prior = if row.score.is_prior { "PRIOR" } else { "MEAS " };
        let inversion = inversion_flag(rows, i);
        let payout = payout_display(&row.lead);
        let cum_display = if in_budget {
            format!("{cumulative:.2}")
        } else {
            "--".to_string()
        };

        println!(
            "  {:<4} {:<14} {:>10.2} {:>10} {:>8.3} {:>7.2} {:>7}  [{prior}]{inversion}",
            i + 1,
            short_id(&row.lead),
            row.evh,
            payout,
            row.score.p_conv,
            effort,
            cum_display,
        );
    }

    println!("  {}", "-".repeat(86));
    println!(
        "  {} of {} lead(s) fit the {:.1}h budget.",
        within_budget_count,
        rows.len(),
        budget_hours
    );
    print_inversion_summary(rows);
    println!(
        "  Every P is a designed PRIOR until outcomes are logged — run `yuri calibration` \
         to grade them."
    );
}

/// The per-row EV-inversion flag.
///
/// A row is tagged `<<EV-INVERSION` when it outranks at least one lead **below** it that
/// has a strictly higher `p_conv` — i.e. EV-per-hour put a lower-probability lead above a
/// higher-probability one, the entire reason EV ranking exists. The beaten higher-P lead
/// is tagged `(out-ranked by lower-P)`.
fn inversion_flag(rows: &[QueueRow], i: usize) -> String {
    let me = rows[i].score.p_conv;
    // Did I (ranked at i) beat any LOWER-ranked lead with a higher probability?
    let beats_higher_p_below = rows[i + 1..].iter().any(|r| r.score.p_conv > me + 1e-12);
    if beats_higher_p_below {
        return " <<EV-INVERSION (lower P, ranked higher)".to_string();
    }
    // Was I (ranked at i) beaten by any HIGHER-ranked lead with a lower probability?
    let beaten_by_lower_p_above = rows[..i].iter().any(|r| r.score.p_conv + 1e-12 < me);
    if beaten_by_lower_p_above {
        return " (out-ranked by a lower-P lead)".to_string();
    }
    String::new()
}

/// Prints a one-line plain-language summary of the headline inversion, if any: the
/// lowest-probability lead that still ranks above a higher-probability lead.
fn print_inversion_summary(rows: &[QueueRow]) {
    for (i, row) in rows.iter().enumerate() {
        let me = row.score.p_conv;
        if let Some(beaten) = rows[i + 1..].iter().find(|r| r.score.p_conv > me + 1e-12) {
            println!(
                "  EV-INVERSION: {} (P={:.3}, {}) out-ranks {} (P={:.3}, {}) — lower probability, \
                 higher expected value per hour.",
                short_id(&row.lead),
                me,
                payout_display(&row.lead),
                short_id(&beaten.lead),
                beaten.score.p_conv,
                payout_display(&beaten.lead),
            );
            return;
        }
    }
}

/// A short, stable display handle for a lead (first segment of its UUID).
fn short_id(lead: &LeadRecord) -> String {
    let s = lead.id.0.to_string();
    s.split('-').next().unwrap_or(&s).to_string()
}

/// The lead's gross payout as `"<amount> <currency>"`, read straight off the record's
/// exact-decimal money (no f64 round-trip in the display).
fn payout_display(lead: &LeadRecord) -> String {
    format!("{} {}", lead.v_deal.amount, lead.v_deal.currency)
}

// --- calibration ------------------------------------------------------------------

fn run_calibration(db: Option<PathBuf>) -> CoreResult<()> {
    let t = tenant();
    let store = open_store(&resolve_db_path(db))?;
    let state = store.calibration_state(t)?;
    println!("CALIBRATION");
    match state {
        CalibrationState::NotYetCalibrated => {
            println!("  state : NotYetCalibrated");
            println!(
                "  meaning: no (prediction, outcome) pairs logged yet — every P(conv) is still \
                 a designed PRIOR, not a measurement."
            );
        }
        CalibrationState::Calibrated { brier, n } => {
            println!("  state : Calibrated");
            println!("  brier : {brier:.4}  (lower is better; 0.25 = always-guess-0.5 baseline)");
            println!("  n     : {n} paired outcome(s)");
        }
    }
    Ok(())
}
