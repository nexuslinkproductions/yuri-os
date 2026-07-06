//! `mark_paid` — settlement routed through the salience hard-veto.
//!
//! Marking a lead paid is the one ledger action that can be **refused by policy**, not
//! just by arithmetic. The refusal we care about: settling against an **unvalued crypto
//! receipt**. Without a fiat valuation the ledger would post a meaningless number, so
//! that case is modelled as a *protected-path violation* and run through
//! [`Veto::gate_transition`]. An increase in `protected_path_violations` between the
//! before- and after-snapshot fires the kernel's **non-offsettable hard veto** — no
//! amount of "good" evidence buys it back. You cannot mark paid without a valuation.
//!
//! A *valued* receipt (or a plain fiat settlement) does **not** bump the violation
//! counter, so the same gate accepts it.
//!
//! ## What a successful settlement produces
//!
//! On accept, `mark_paid` returns a balanced [`JournalEntry`]: debit the cash/asset
//! account, credit the revenue account, for the settled fiat [`Money`]. It posts
//! nothing live — building the entry is the v1 surface; persistence is the caller's
//! [`Store`](nexus_core::Store) step. CSV / manual import only, no live banking.

use uuid::Uuid;

use nexus_core::{CampaignSnapshot, Money, UWeights, Veto};
use nexus_score::salience::GateDecision;

use crate::entry::{JournalEntry, Posting};
use crate::error::{LedgerError, LedgerResult};
use crate::receipt::CryptoReceipt;

/// What is being settled: already-fiat, or a crypto receipt that must be valued first.
#[derive(Debug, Clone, PartialEq)]
pub enum Settlement {
    /// A plain fiat settlement — the amount is already in a real currency.
    Fiat {
        /// The fiat amount paid.
        amount: Money,
    },
    /// A crypto receipt. If unvalued, settlement is hard-vetoed; if valued, the
    /// receipt's fiat valuation is what gets posted.
    Crypto {
        /// The receipt being settled.
        receipt: CryptoReceipt,
    },
}

impl Settlement {
    /// Resolves the fiat [`Money`] to post, or `None` if the settlement cannot be
    /// valued (an unvalued crypto receipt). `None` is precisely the protected-path case.
    #[must_use]
    fn fiat_amount(&self) -> Option<Money> {
        match self {
            Settlement::Fiat { amount } => Some(amount.clone()),
            Settlement::Crypto { receipt } => {
                receipt.valuation.as_ref().map(|v| v.value.clone())
            }
        }
    }

    /// The unvalued-crypto receipt id, if this settlement is the blocked case.
    #[must_use]
    fn unvalued_receipt_id(&self) -> Option<Uuid> {
        match self {
            Settlement::Crypto { receipt } if !receipt.is_valued() => Some(receipt.id),
            _ => None,
        }
    }
}

/// The outcome of a [`mark_paid`] call: either the posted entry, or the gate's veto.
#[derive(Debug, Clone)]
pub struct PaidResult {
    /// The balanced journal entry produced by the settlement.
    pub entry: JournalEntry,
    /// The gate decision that admitted it (always `accept == true`, `hard_veto == false`
    /// here — a vetoed settlement returns `Err` instead).
    pub gate: GateDecision,
}

/// Routes a settlement through the salience hard-veto and, if admitted, builds the
/// balanced revenue journal entry.
///
/// The `before` snapshot is the campaign state prior to settlement. This builds the
/// `after` snapshot by **copying `before` and adding one protected-path violation iff
/// the settlement is an unvalued crypto receipt** — that single delta is what the
/// non-offsettable hard veto keys on. The snapshots are then threaded through
/// [`Veto::gate_transition`]; on `hard_veto` the call returns a typed error (a precise
/// [`LedgerError::UnvaluedCryptoReceipt`] for the unvalued-crypto case, otherwise
/// [`LedgerError::HardVeto`]), so a blocked settlement can never silently post.
///
/// On accept, debits `cash_account` and credits `revenue_account` for the fiat amount,
/// producing a balanced [`JournalEntry`].
///
/// # Errors
/// - [`LedgerError::UnvaluedCryptoReceipt`] when an unvalued crypto receipt is
///   hard-vetoed (cannot mark paid without a receipt-timestamp valuation).
/// - [`LedgerError::HardVeto`] for any other hard veto the gate raises.
/// - [`LedgerError::Core`] for a tenant mismatch / kernel rejection from the gate.
/// - [`LedgerError::Unbalanced`] / [`LedgerError::MixedCurrency`] from entry
///   construction (unreachable for the debit==credit shape, but kept fallible).
#[allow(clippy::too_many_arguments)]
pub fn mark_paid<V>(
    veto: &V,
    before: &CampaignSnapshot,
    settlement: &Settlement,
    weights: &UWeights,
    threshold: f64,
    entry_id: Uuid,
    cash_account: Uuid,
    revenue_account: Uuid,
    memo: impl Into<String>,
) -> LedgerResult<PaidResult>
where
    V: Veto,
{
    // Build the after-snapshot: identical to `before` except an unvalued crypto receipt
    // adds exactly one protected-path violation — the non-offsettable hard-veto trigger.
    let mut after = *before;
    let unvalued = settlement.unvalued_receipt_id();
    if unvalued.is_some() {
        after.protected_path_violations = before.protected_path_violations.saturating_add(1);
    }

    // Route through the kernel gate. The hard veto fires iff
    // after.protected_path_violations > before.protected_path_violations.
    let gate = veto.gate_transition(before, &after, weights, threshold)?;

    if gate.hard_veto || !gate.accept {
        // Prefer the precise reason for the unvalued-crypto case so callers can branch.
        if let Some(receipt_id) = unvalued {
            return Err(LedgerError::UnvaluedCryptoReceipt { receipt_id });
        }
        return Err(LedgerError::HardVeto { reason: gate.reason });
    }

    // Admitted. There must be a fiat amount to post — for an admitted settlement there
    // always is (fiat, or a valued crypto receipt). The unvalued case was vetoed above.
    let amount = match settlement.fiat_amount() {
        Some(m) => m,
        // Defensive: an admitted-yet-unvaluable settlement is a contradiction. Surface
        // it as the same typed block rather than panicking or posting a bad number.
        None => {
            let receipt_id = unvalued.unwrap_or_else(Uuid::nil);
            return Err(LedgerError::UnvaluedCryptoReceipt { receipt_id });
        }
    };

    // Double entry: debit cash (+), credit revenue (−), same magnitude → sums to ZERO.
    let value = amount.amount;
    let currency = amount.currency.clone();
    let entry = JournalEntry::try_new(
        entry_id,
        memo,
        vec![
            Posting::debit(cash_account, value, currency.clone()),
            Posting::credit(revenue_account, value, currency),
        ],
    )?;

    Ok(PaidResult { entry, gate })
}
