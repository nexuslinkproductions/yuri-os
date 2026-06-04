#!/usr/bin/env node
/**
 * memory-relocator.mjs — the canonical "forgetting" mechanism: RELOCATE, never delete.
 *
 * Supersedes the two crude relocators (memory-evict.mjs atime-LRU, memory-archive.mjs
 * mtime+flag move-to-_archive with no recall path). A memory that has decayed below the
 * retrievability floor is DEMOTED to the subconscious cold store (memory-cold.db, body
 * verbatim) AND its source file is moved into a reversible `relocated/` dir — double
 * safety, nothing is ever deleted. The active index keeps only a tombstone. Promotion-
 * back restores the body byte-identical. Silent engram: storage ≠ retrievability.
 *
 * Decay keys on the recall-event ledger (memory-usage.mjs) — the real USE signal — with
 * file mtime as the prior for memories that predate the ledger (graceful degradation,
 * no fabricated usage). Scoring is the pure yuri-fsrs module. tier sets base stability
 * (semantic decays slowest); explicit force_keep / archive:false / pinned files are
 * exempt from decay entirely.
 *
 * Pure planning core (planRelocations) is unit-testable in isolation; the execute layer
 * does the I/O behind --dry-run.
 */
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { evaluateRetention } from './math/yuri-fsrs.mjs';
import { redundancyVerdict } from './math/yuri-mdl.mjs';
import { buildUsageIndex } from './memory-usage.mjs';
import { openColdStore, upsertCold, getCold, removeCold, coldCount } from './memory-cold-store.mjs';
import { memoryRoot } from './claude-memory-write.mjs';

const _HERE = path.dirname(fileURLToPath(import.meta.url));
const SYSTEM_ROOT = path.resolve(_HERE, '..');
const REPO_ROOT = path.resolve(_HERE, '..', '..');
// Subconscious consolidates the CLAUDE behavioral memory (Track B), not the legacy
// _SYSTEM/memory store (owner directive 2026-06-02). memoryRoot() resolves the Track-B
// path from the repo root regardless of cwd.
export const DEFAULT_MEMORY_ROOT = memoryRoot(REPO_ROOT);
const PINNED_FILES = new Set(['memory-core.md', 'MEMORY.md', 'identity.md']);
// Standing behavioral-floor types — never demoted into the subconscious (owner policy 2026-06-02).
// Only stale project/reference/episodic memories decay; feedback + user rules are permanent.
const PROTECTED_TYPES = new Set(['feedback', 'user']);
const DAY_MS = 1000 * 60 * 60 * 24;

// MEM-04 — operational telemetry is NOT a recallable behavioral memory. The append-only
// session journal (~1.3MB and unbounded) would be loaded body-and-all on every scan, and
// if it ever demoted it would become one monstrous FTS5 row that dominates BM25 and
// poisons recall. Exclude it by name, AND cap any single file's demotable size so no
// future runaway telemetry slips into the forgetting loop. Skips are logged, not silent.
const EXCLUDED_FROM_SUBCONSCIOUS = new Set(['session-journal.md']);
const MAX_DEMOTABLE_BYTES = 64 * 1024;
// MEM-02 — quality/length floor. A near-empty or garbled file must not masquerade as a
// fresh, high-retrievability memory; below this it is treated as already-dead content
// (lastUsed pinned to epoch so it scores fully decayed rather than fully fresh).
const MIN_QUALITY_BYTES = 80;
// MEM-02 — per-slug stable first-seen sidecar: the checkout-survivable last-touch prior
// for memory files that have no git history (the live Track-B store is untracked) and no
// recall-ledger entry yet. Populated lazily, read-only-stable thereafter.
export const FIRST_SEEN_SIDECAR = path.join(SYSTEM_ROOT, 'state', 'memory-first-seen.json');

// tier -> base stability (days). Semantic = consolidated, decays slowest; working = fast.
const TIER_STABILITY = { semantic: 60, episodic: 14, working: 3 };
const DEFAULT_STABILITY_DAYS = 14;

// MEM-02 (card 14, MDL) — normalized marginal-bits threshold below which a body is REDUNDANT
// (predicted by the rest of the kept store). The relocator demotes ONLY on (R<rFloor AND
// redundant) — a stale-but-UNIQUE memory (high marginal bits) is PROTECTED from demote even
// when its retrievability decayed; a fresh-but-REDUNDANT restatement still needs low R too.
// Tunable via energy-weights.json fsrs.redundancyFloor (fail-closed validated).
const DEFAULT_REDUNDANCY_FLOOR = 0.15;

// MEM-05 — supersession family penalty. When ≥2 memories share a family prefix (e.g.
// session-resume-*), the OLDER siblings are penalized so they cross rFloor once a NEWER sibling
// exists, while the newest stays warm. This is the "superseded by a newer anchor of the same
// family" rule. Data-driven: tunable via energy-weights.json fsrs.supersessionPenaltyDays.
// 0 disables it.
//
// The penalty is applied as BOTH (a) a lastUsed back-date by penaltyDays AND (b) a
// stability SHRINK to the working-tier base. The back-date alone is tier-fragile: a
// superseded anchor mistakenly tagged tier:semantic (S=60) won't cross rFloor from a fixed
// few-days back-date. Collapsing a superseded anchor's stability to the working base makes
// the decay tier-RELATIVE and robust — a superseded anchor decays like the transient it now
// is, regardless of how it was originally tiered. Superseded items also bypass MDL protection
// in planRelocations (uniqueness is moot once a newer sibling supersedes the role).
const DEFAULT_SUPERSESSION_PENALTY_DAYS = 30;
const SUPERSEDED_STABILITY_DAYS = TIER_STABILITY.working;   // collapse to fastest-decay tier
// Family-prefix extractor: strips a trailing date / descriptor so all session-resume-* slugs
// (and any dated anchor family) group together. Returns null when the slug has no family form.
export function familyPrefix(slug) {
  if (typeof slug !== 'string') return null;
  const m = slug.match(/^([a-z]+(?:-[a-z]+)*?)-\d{4}-\d{2}-\d{2}/i);
  return m ? m[1].toLowerCase() : null;
}

// Canonicalize a frontmatter `type:` value so PROTECTED_TYPES membership cannot be evaded by a
// trailing inline comment, surrounding quotes, or casing (`type: user # note` / `type: "user"`
// / `type: USER`). Fail-CLOSED toward protection: normalize maximally before the closed-set test.
function normalizeType(raw) {
  if (typeof raw !== 'string') return null;
  let t = raw.replace(/\s+#.*$/, '').trim();                     // strip YAML inline comment
  if (t.length >= 2 && ((t[0] === '"' && t[t.length - 1] === '"') || (t[0] === "'" && t[t.length - 1] === "'"))) {
    t = t.slice(1, -1).trim();                                   // strip surrounding quotes
  }
  return t ? t.toLowerCase() : null;
}

/** Minimal frontmatter reader — tolerant of Track A (flat name/type) and Track B (nested metadata). */
export function parseFrontmatter(content) {
  const out = { body: content };
  if (!content.startsWith('---')) return out;
  const end = content.indexOf('\n---', 3);
  if (end === -1) return out;
  const fm = content.slice(3, end);
  out.body = content.slice(content.indexOf('\n', end + 1) + 1);
  const pick = (re) => { const m = fm.match(re); return m ? m[1].trim() : null; };
  out.name = pick(/^\s*name:\s*(.+)$/m);
  out.tier = pick(/^\s*tier:\s*(.+)$/m);
  out.type = normalizeType(pick(/^\s*type:\s*(.+)$/m));
  out.trig = pick(/^\s*trig:\s*(.+)$/m) || '';
  out.refs = pick(/^\s*refs:\s*(.+)$/m) || '';
  out.description = pick(/^\s*description:\s*(.+)$/m) || '';
  const salRaw = pick(/^\s*salience:\s*(.+)$/m);
  out.salience = salRaw !== null && Number.isFinite(Number(salRaw)) ? Number(salRaw) : 0;
  const fk = fm.match(/^\s*force_keep:\s*(true|false)\s*$/im);
  const ar = fm.match(/^\s*archive:\s*(true|false)\s*$/im);
  out.forceKeepFlag = (fk && fk[1].toLowerCase() === 'true') || (ar && ar[1].toLowerCase() === 'false');
  return out;
}

const REDUNDANCY_SCAFFOLD_HEADING_RE = /^#{1,6}\s*(?:GOAL|WHEN|EXIT|RISKS|EVIDENCE|NOTES|CONTEXT|STATUS|NEXT|TODO)\s*$/i;

/**
 * MDL compares semantic memory CONTENT, not archival storage bytes (red-team L3#3). `item.body`
 * stays the whole file for byte-identical restore; this strips YAML frontmatter and scaffold-only
 * memory headings before gzip marginal-bits scoring so a shared high-entropy metadata scaffold
 * cannot false-demote a genuinely distinct body.
 */
export function redundancyComparisonText(content) {
  const raw = typeof content === 'string' ? content : '';
  const body = parseFrontmatter(raw).body;
  return body.split(/\r?\n/).filter((line) => !REDUNDANCY_SCAFFOLD_HEADING_RE.test(line.trim())).join('\n').trim();
}

function crosslinksFrom(refs) {
  return (String(refs).match(/\[\[([^\]]+)\]\]/g) || []).map((s) => s.replace(/\[\[|\]\]/g, '')).join(',');
}

/** Read the first-seen sidecar ({slug|filename -> ms}); {} on any failure (fail-open). */
function readFirstSeen(sidecar = FIRST_SEEN_SIDECAR) {
  try {
    const obj = JSON.parse(fs.readFileSync(sidecar, 'utf8'));
    return obj && typeof obj === 'object' && !Array.isArray(obj) ? obj : {};
  } catch { return {}; }
}

/** Persist the first-seen map. Best-effort: never throws into a scan path. */
function writeFirstSeen(map, sidecar = FIRST_SEEN_SIDECAR) {
  try {
    fs.mkdirSync(path.dirname(sidecar), { recursive: true });
    fs.writeFileSync(sidecar, JSON.stringify(map, null, 2) + '\n');
    return true;
  } catch { return false; }
}

/**
 * MEM-02 — checkout-stable last-CONTENT-change time for a memory file, in ms.
 *
 * Priority: (1) git author-date of the last commit that TOUCHED the file
 * (`git log -1 --format=%at -- <path>`, ×1000) — this survives `git checkout`, reindex,
 * and any pure rewrite that resets mtime; (2) a persisted per-slug first-seen sidecar
 * timestamp — the de-facto stable signal for the live Track-B store, which is untracked
 * by git so the git path yields nothing for it; (3) filesystem mtime as the last resort.
 *
 * The git call is wrapped: a missing git, an untracked file (empty stdout), a non-numeric
 * line, or any spawn error ALL fall through cleanly to the sidecar, then mtime. It never
 * throws and never returns a fabricated "fresh" timestamp from a failed git probe.
 *
 * @returns {number|null} ms, or null if no stable signal exists (caller falls back to mtime).
 */
export function lastContentChangeMs(file, { firstSeen, sidecar = FIRST_SEEN_SIDECAR, mtimeMs, slug, nowMs = Date.now() } = {}) {
  const filename = path.basename(file);
  const key = slug || filename;
  // (1) git author-date — survives checkout. cwd at the file's dir so a basename pathspec
  // resolves regardless of whether the file is inside the invocation's repo.
  try {
    const out = execFileSync('git', ['log', '-1', '--format=%at', '--', file], {
      cwd: path.dirname(file), stdio: ['ignore', 'pipe', 'ignore'], timeout: 5000,
    }).toString().trim();
    if (out) {
      const secs = Number(out.split('\n')[0]);
      if (Number.isFinite(secs) && secs > 0) return secs * 1000;
    }
  } catch { /* git absent / untracked / detached — fall through, never fabricate */ }
  // (2) first-seen sidecar — the stable prior for the untracked live store. Lazily seed it
  // with the BEST available current signal (mtime, else now) so a file's first-observed
  // time is pinned and stops drifting on every subsequent reindex/rewrite.
  const map = firstSeen || readFirstSeen(sidecar);
  const recorded = Number(map[key]);
  if (Number.isFinite(recorded) && recorded > 0) return recorded;
  // seed lazily: prefer mtime as the first observation, else now. Persist only when we own
  // the read (firstSeen not injected by a batched caller, which persists once at the end).
  const seed = Number.isFinite(Number(mtimeMs)) && Number(mtimeMs) > 0 ? Number(mtimeMs) : nowMs;
  map[key] = seed;
  if (!firstSeen) writeFirstSeen(map, sidecar);
  return seed;
}

/**
 * Build a scoring item from a memory file (pure given injected usageIndex + nowMs).
 *
 * lastUsedMs prior chain (MEM-02): ledger lastUsedMs → checkout-stable lastContentChangeMs
 * (git author-date → first-seen sidecar → mtime) → nowMs. Bare mtime is no longer the
 * primary prior: it is reset by checkout/reindex/rewrite, so a 60-day-dormant memory
 * looked fresh after any repo op and demote stayed at 0. A `lastTouchMs` override and a
 * shared `firstSeen` map can be injected (tests / batched scans) to keep this pure.
 *
 * Quality floor (MEM-02): a sub-MIN_QUALITY_BYTES body is treated as dead content — its
 * lastUsed is pinned to epoch (0) so it scores fully decayed, not fresh, and cannot
 * false-protect itself by recency.
 */
export function buildItem(file, content, { usageIndex = {}, nowMs = Date.now(), mtimeMs, lastTouchMs, firstSeen } = {}) {
  const fm = parseFrontmatter(content);
  const filename = path.basename(file);
  const slug = fm.name || filename.replace(/\.md$/, '');
  const usage = usageIndex[slug] || usageIndex[filename] || {};
  const forceKeep = Boolean(fm.forceKeepFlag) || PINNED_FILES.has(filename) || PROTECTED_TYPES.has(fm.type);
  const baseStabilityDays = TIER_STABILITY[fm.tier] || DEFAULT_STABILITY_DAYS;
  const lowQuality = typeof content === 'string' && content.trim().length < MIN_QUALITY_BYTES;
  const ledgerLastUsed = Number(usage.lastUsedMs) > 0 ? Number(usage.lastUsedMs) : null;
  // stable last-touch prior is computed ONLY when actually needed (not low-quality and no
  // ledger entry) — avoids a spurious git probe + sidecar write when the answer is already
  // determined. injected override → helper (git → sidecar → mtime) → nowMs.
  let lastUsedMs;
  if (lowQuality) {
    lastUsedMs = 0;                                   // garbled/empty → fully decayed, never "fresh"
  } else if (ledgerLastUsed != null) {
    lastUsedMs = ledgerLastUsed;                      // real USE always wins
  } else {
    const stableTouch = lastTouchMs != null
      ? Number(lastTouchMs)
      : lastContentChangeMs(file, { firstSeen, mtimeMs, slug, nowMs });
    lastUsedMs = Number.isFinite(stableTouch) && stableTouch > 0 ? stableTouch : nowMs;
  }
  return {
    slug,
    file,
    filename,
    body: content,                 // store the WHOLE file (frontmatter + body) so restore is exact
    title: fm.name || filename,
    trig: [fm.trig, fm.description].filter(Boolean).join(' ').slice(0, 200),
    crosslinks: crosslinksFrom(fm.refs),
    salience: fm.salience,
    baseStabilityDays,
    forceKeep,
    lowQuality,
    bytes: typeof content === 'string' ? Buffer.byteLength(content) : 0,
    useCount: usage.useCount || 0,
    lastUsedMs,
  };
}

/**
 * MEM-05 — supersession back-date pass (PURE). Group items by family prefix (e.g.
 * session-resume-*); for any family with >1 member, back-date the effective lastUsedMs of
 * every member EXCEPT the newest by penaltyDays, so the OLDER siblings cross rFloor once a
 * newer anchor exists while the newest stays warm. Force-kept / protected items are skipped
 * (they never demote anyway). Newest = max lastUsedMs (tie-break: lexically-greatest slug,
 * which for date-suffixed families is the later date). Returns a NEW array; never mutates input.
 */
export function applySupersession(items, { penaltyDays = DEFAULT_SUPERSESSION_PENALTY_DAYS } = {}) {
  // disabled path also strips any incoming `superseded` flag — authoritative state only.
  if (!Array.isArray(items) || items.length < 2 || !(penaltyDays > 0)) {
    return (Array.isArray(items) ? items : []).map((i) => { const { superseded, ...rest } = (i || {}); return { ...rest }; });
  }
  const families = new Map();
  for (const it of items) {
    if (it.forceKeep) continue;                       // protected anchors don't participate
    const fam = familyPrefix(it.slug);
    if (!fam) continue;
    if (!families.has(fam)) families.set(fam, []);
    families.get(fam).push(it);
  }
  const penalize = new Set();   // slugs (by object identity) to back-date
  for (const [, members] of families) {
    if (members.length < 2) continue;
    // newest = max lastUsedMs, tie-break greater slug (later date suffix sorts greater)
    let newest = members[0];
    for (const m of members) {
      const a = Number(m.lastUsedMs) || 0;
      const b = Number(newest.lastUsedMs) || 0;
      if (a > b) { newest = m; continue; }
      // Tie on last-touch: the CANONICAL anchor wins, never a slug-forged one. A SHORTER slug is
      // canonical — an injected longer suffix (`...-zzz`) must NOT out-rank and force-demote the
      // real current anchor; equal length falls back to lexical for deterministic stability.
      if (a === b) {
        const ms = String(m.slug), ns = String(newest.slug);
        if (ms.length < ns.length || (ms.length === ns.length && ms > ns)) newest = m;
      }
    }
    for (const m of members) if (m !== newest) penalize.add(m);
  }
  const pen = penaltyDays * DAY_MS;
  return items.map((it) => {
    // STRIP any incoming `superseded` flag on the non-penalized path — only THIS pass's
    // determination is authoritative, so a stale/poisoned upstream flag can never make a
    // non-superseded item bypass MDL protection in planRelocations.
    if (!penalize.has(it)) { const { superseded, ...rest } = it; return { ...rest }; }
    const lastUsed = (Number.isFinite(Number(it.lastUsedMs)) ? Number(it.lastUsedMs) : 0) - pen;
    // collapse stability to the working base so a superseded anchor decays like a transient,
    // independent of its original tier — but never RAISE the stability of an already-faster item.
    const baseStabilityDays = Math.min(
      Number.isFinite(Number(it.baseStabilityDays)) ? Number(it.baseStabilityDays) : SUPERSEDED_STABILITY_DAYS,
      SUPERSEDED_STABILITY_DAYS,
    );
    return { ...it, lastUsedMs: lastUsed, baseStabilityDays, superseded: true };
  });
}

/**
 * PURE: split items into demote/keep on TWO orthogonal axes (MEM-02 card 14 + MEM-05).
 *
 *   Axis 1 — FSRS retrievability (yuri-fsrs evaluateRetention): R < rFloor.
 *   Axis 2 — MDL redundancy (yuri-mdl marginalBits): a body whose content is predicted by
 *            the rest of the KEPT store (low marginal bits) is REDUNDANT; a lexically novel
 *            body is IRREDUCIBLE and PROTECTED from demote even when stale.
 *
 * Demote iff (R < rFloor AND redundant). Keep if EITHER retrievable OR irreducible-given-rest.
 * force_keep / feedback / user are already exempt upstream (item.forceKeep → evaluateRetention
 * returns demote:false). The MEM-05 supersession back-date is applied first so older same-family
 * anchors cross rFloor.
 *
 * The redundancy axis can be disabled (redundancyFloor<=0) to recover the pure-FSRS baseline
 * for A/B diffing. cfg = the fsrs knob block + nowMs (+ optional redundancyFloor, supersessionPenaltyDays).
 */
export function planRelocations(items, cfg = {}) {
  const {
    redundancyFloor = DEFAULT_REDUNDANCY_FLOOR,
    supersessionPenaltyDays = DEFAULT_SUPERSESSION_PENALTY_DAYS,
    ...fsrsCfg
  } = cfg;
  const staged = applySupersession(items || [], { penaltyDays: supersessionPenaltyDays });

  // First pass: FSRS R-axis. lowR = crossed the retrievability floor (demote CANDIDATE);
  // kept-by-R go straight to keep and form the "rest of store" the redundancy axis reads.
  const lowR = [];
  const keep = [];
  for (const item of staged) {
    const r = evaluateRetention(item, fsrsCfg);
    const scored = { ...item, R: r.R, reason: r.reason };
    (r.demote ? lowR : keep).push(scored);
  }

  // Second pass (card 14): the redundancy axis only RUNS on R-floor candidates. The "rest of
  // store" is every KEPT body PLUS the other low-R candidates (a candidate must be redundant
  // against the *surviving* corpus, not just the other doomed items). Disabled when floor<=0.
  const demote = [];
  if (!(redundancyFloor > 0)) {
    // pure-FSRS baseline: every R-floor candidate demotes (A/B comparison path)
    for (const c of lowR) demote.push({ ...c, redundancyBits: null });
  } else {
    const keptBodies = keep.map((k) => redundancyComparisonText(k.body));
    for (const cand of lowR) {
      // MEM-05 — a SUPERSEDED same-family anchor bypasses MDL protection: a newer sibling has
      // replaced its role, so its lexical uniqueness is MOOT (redundant-by-supersession). The
      // supersession back-date IS the redundancy signal; demote on the R-axis alone. This is the
      // intended exception to card 14's "stale-but-unique → protect" rule, which is meant for
      // standalone references, not for an old session-resume a newer one already superseded.
      if (cand.superseded) {
        demote.push({ ...cand, redundancyBits: null, reason: `${cand.reason}; superseded by a newer same-family anchor (uniqueness moot)` });
        continue;
      }
      const candBody = redundancyComparisonText(cand.body);
      // A candidate with no assessable body (empty / sub-quality) gets NO redundancy
      // protection — the axis ABSTAINS and the FSRS verdict stands (demote). This is the
      // honest neutral: we can't certify a near-empty file as "novel/irreducible", and the
      // relocator's own MIN_QUALITY_BYTES floor already pinned a garbled file fully-decayed.
      const v = redundancyVerdict(candBody, keptBodies.concat(
        lowR.filter((o) => o !== cand).map((o) => redundancyComparisonText(o.body)),
      ).join('\n'), { redundancyFloor });
      const protect = v.irreducible && !v.lowQuality;   // only a substantive, novel body is protected
      if (protect) {
        // low-R but IRREDUCIBLE given the rest → PROTECT (card 14's stale-but-unique guard)
        keep.push({ ...cand, redundancyBits: v.bits, reason: `${cand.reason}; PROTECTED: ${v.reason}` });
      } else {
        // redundant OR no-body-to-protect → FSRS demote stands
        demote.push({ ...cand, redundancyBits: v.bits, reason: `${cand.reason}; ${v.reason}` });
      }
    }
  }
  return { demote, keep };
}

/**
 * Scan a memory root into scoring items (reads files + ledger; checkout-stable last-touch
 * prior via buildItem). Pinned index files, the MEM-04 exclusion set, and any file over
 * MAX_DEMOTABLE_BYTES are dropped from the scoring set (skips logged, never silent). The
 * first-seen sidecar is read once and persisted once for the whole scan (lazy genesis).
 * `onSkip` lets callers observe excluded files; defaults to a stderr log.
 */
export function loadItems(root = DEFAULT_MEMORY_ROOT, { nowMs = Date.now(), usageIndex, firstSeen, onSkip } = {}) {
  if (!fs.existsSync(root)) return [];
  const usage = usageIndex || buildUsageIndex();
  const seenMap = firstSeen || readFirstSeen();
  const skip = typeof onSkip === 'function'
    ? onSkip
    : (f, why) => process.stderr.write(`[relocator] skip ${f} (${why})\n`);
  const items = [];
  for (const f of fs.readdirSync(root)) {
    if (!f.endsWith('.md') || PINNED_FILES.has(f)) continue;
    if (EXCLUDED_FROM_SUBCONSCIOUS.has(f)) { skip(f, 'excluded-from-subconscious (operational telemetry)'); continue; }
    const file = path.join(root, f);
    let mtimeMs = nowMs;
    let size = 0;
    try { const st = fs.statSync(file); mtimeMs = st.mtimeMs; size = st.size; } catch { /* keep nowMs */ }
    if (size > MAX_DEMOTABLE_BYTES) { skip(f, `over MAX_DEMOTABLE_BYTES (${size} > ${MAX_DEMOTABLE_BYTES})`); continue; }
    items.push(buildItem(file, fs.readFileSync(file, 'utf8'), { usageIndex: usage, nowMs, mtimeMs, firstSeen: seenMap }));
  }
  if (!firstSeen) writeFirstSeen(seenMap);   // persist lazily-seeded first-seen once per scan
  return items;
}

/**
 * Execute demotions: upsert each into the cold store (body verbatim), move the source
 * file into root/relocated/ (reversible), and record a relocation-index entry. dryRun
 * plans without touching anything. Returns a summary.
 */
// CAP-01 / collision-safety helpers (red-team #4). A slug becomes an index key and its source file
// is moved into relocated/ — both must be containment-safe and the move durably recorded per item.
function assertSafeSlug(slug) {
  if (typeof slug !== 'string' || slug.length === 0) throw new Error(`relocation: empty/invalid slug ${JSON.stringify(slug)}`);
  if (slug.includes('/') || slug.includes('\\') || slug.includes('\0') || slug === '.' || slug === '..' || slug.includes('..')) {
    throw new Error(`relocation: unsafe slug ${JSON.stringify(slug)} (path traversal / separator)`);
  }
}
function atomicWriteJSON(file, obj) {
  const tmp = `${file}.tmp-${process.pid}`;                       // same-dir temp → rename is atomic on POSIX
  fs.writeFileSync(tmp, JSON.stringify(obj, null, 2) + '\n');
  fs.renameSync(tmp, file);
}
// Never overwrite an existing relocated/ copy (a prior relocation of the same filename) — suffix it.
function collisionSafeDest(dir, filename) {
  let dest = path.join(dir, filename);
  if (!fs.existsSync(dest)) return dest;
  const ext = path.extname(filename);
  const stem = filename.slice(0, filename.length - ext.length);
  let n = 1;
  while (fs.existsSync(dest = path.join(dir, `${stem}.reloc${n}${ext}`))) n += 1;
  return dest;
}

export function executeRelocation(plan, { coldDb, root = DEFAULT_MEMORY_ROOT, dryRun = true, nowMs = Date.now() } = {}) {
  const relocatedDir = path.join(root, 'relocated');
  const indexPath = path.join(root, 'relocation-index.json');
  const moved = [];
  if (!dryRun) fs.mkdirSync(relocatedDir, { recursive: true });
  const index = (() => { try { return JSON.parse(fs.readFileSync(indexPath, 'utf8')); } catch { return { relocated: {} }; } })();
  if (!index.relocated || typeof index.relocated !== 'object') index.relocated = {};

  for (const item of plan.demote) {
    if (dryRun) { moved.push({ slug: item.slug, R: item.R, dryRun: true }); continue; }
    assertSafeSlug(item.slug);                                    // fail-closed: never key/move on a traversing slug
    // Order: cold safety-copy FIRST (body durable before the source moves) → move → record →
    // atomically persist the index PER ITEM, so a crash mid-loop never orphans an already-moved file.
    upsertCold(coldDb, {
      slug: item.slug, title: item.title, body: item.body, trig: item.trig,
      salience: item.salience, baseStabilityDays: item.baseStabilityDays,
      crosslinks: item.crosslinks, sourcePath: item.file, reason: item.reason, nowMs,
    });
    const dest = collisionSafeDest(relocatedDir, item.filename);  // never clobber a prior relocated copy
    fs.renameSync(item.file, dest);                               // reversible move, not delete
    index.relocated[item.slug] = { coldHome: 'memory-cold.db', relocatedFile: dest, demotedAt: Math.trunc(nowMs), R: item.R, reason: item.reason, sourcePath: item.file };
    atomicWriteJSON(indexPath, index);                            // durable after EACH move (temp+rename)
    moved.push({ slug: item.slug, R: item.R, dest });
  }
  return { demoted: moved.length, kept: plan.keep.length, moved, dryRun };
}

/** Promotion-back: restore a cold memory to the active root byte-identical, clear cold + index. */
export function promoteHot(slug, { coldDb, root = DEFAULT_MEMORY_ROOT, nowMs = Date.now() } = {}) {
  const rec = getCold(coldDb, slug);
  if (!rec) return { ok: false, reason: 'not in cold store' };
  const indexPath = path.join(root, 'relocation-index.json');
  const index = (() => { try { return JSON.parse(fs.readFileSync(indexPath, 'utf8')); } catch { return { relocated: {} }; } })();
  const entry = index.relocated[slug];
  const destName = entry ? path.basename(entry.sourcePath || `${slug}.md`) : `${slug}.md`;
  const dest = path.join(root, destName);
  fs.writeFileSync(dest, rec.body);                       // restore verbatim
  removeCold(coldDb, slug);
  // remove the relocated/ copy if present, mark index promoted
  if (entry) { try { if (entry.relocatedFile && fs.existsSync(entry.relocatedFile)) fs.unlinkSync(entry.relocatedFile); } catch {} ; entry.promotedBackAt = Math.trunc(nowMs); index.relocated[slug] = entry; }
  try { fs.writeFileSync(indexPath, JSON.stringify(index, null, 2) + '\n'); } catch {}
  return { ok: true, restored: dest };
}

/**
 * STEP 3 / MEM-01 — owner-decision artifact: print the full demote-set table for an
 * injectable rFloor WITHOUT touching anything. Pure dry-run reporting — the operator must
 * approve the set before any real forgetting (--execute) is allowed.
 */
export function seedDryRun(root = DEFAULT_MEMORY_ROOT, { rFloor = 0.6, nowMs = Date.now(), firstSeen } = {}) {
  const items = loadItems(root, { nowMs, firstSeen });
  const { demote, keep } = planRelocations(items, { nowMs, rFloor });
  const rows = demote
    .map((d) => ({
      slug: d.slug,
      R: Number(d.R.toFixed(3)),
      ageDays: Math.round(Math.max(0, (nowMs - (Number(d.lastUsedMs) || nowMs)) / DAY_MS)),
      tier: d.baseStabilityDays === 60 ? 'semantic' : d.baseStabilityDays === 14 ? 'episodic' : d.baseStabilityDays === 3 ? 'working' : `S${d.baseStabilityDays}`,
      bodyBytes: d.bytes,
    }))
    .sort((a, b) => a.R - b.R);
  return { rFloor, scanned: items.length, demoted: rows.length, kept: keep.length, rows };
}

/** Render a seed demote-set as a fixed-width table (owner-readable). */
export function formatSeedTable(seed) {
  const head = `rFloor=${seed.rFloor}  scanned=${seed.scanned}  demote=${seed.demoted}  keep=${seed.kept}`;
  if (!seed.rows.length) return `${head}\n  (no items cross the floor — empty demote-set)`;
  const w = { slug: Math.max(4, ...seed.rows.map((r) => r.slug.length)), tier: 8 };
  const pad = (s, n) => String(s).padEnd(n);
  const padL = (s, n) => String(s).padStart(n);
  const lines = [head, `  ${pad('slug', w.slug)}  ${padL('R', 6)}  ${padL('age(d)', 7)}  ${pad('tier', w.tier)}  ${padL('bytes', 7)}`];
  for (const r of seed.rows) {
    lines.push(`  ${pad(r.slug, w.slug)}  ${padL(r.R.toFixed(3), 6)}  ${padL(r.ageDays, 7)}  ${pad(r.tier, w.tier)}  ${padL(r.bodyBytes, 7)}`);
  }
  return lines.join('\n');
}

if (import.meta.url === `file://${process.argv[1]}`) {
  // --seed [rFloor] [--at-days N]: owner-decision dry-run. Prints the demote-set table,
  // executes NOTHING. --at-days advances the scoring clock N days to PROJECT the dormant
  // tail (labeled as a projection, never presented as present-time forgetting).
  if (process.argv.includes('--seed')) {
    const i = process.argv.indexOf('--seed');
    const arg = process.argv[i + 1];
    const rFloor = arg && !arg.startsWith('--') && Number.isFinite(Number(arg)) ? Number(arg) : 0.6;
    const j = process.argv.indexOf('--at-days');
    const atDays = j !== -1 && Number.isFinite(Number(process.argv[j + 1])) ? Number(process.argv[j + 1]) : 0;
    const nowMs = Date.now() + atDays * DAY_MS;
    const seed = seedDryRun(DEFAULT_MEMORY_ROOT, { rFloor, nowMs });
    if (atDays) console.log(`# PROJECTION: scoring clock advanced +${atDays}d (not present-time forgetting)`);
    console.log(formatSeedTable(seed));
  } else {
    const dryRun = !process.argv.includes('--execute');
    const items = loadItems();
    const cfg = { nowMs: Date.now(), rFloor: 0.6 };
    const plan = planRelocations(items, cfg);
    const db = dryRun ? null : openColdStore();
    const res = executeRelocation(plan, { coldDb: db, dryRun });
    if (db) db.close();
    console.log(JSON.stringify({ scanned: items.length, ...res, demoteSlugs: plan.demote.map((d) => `${d.slug} (R=${d.R.toFixed(2)})`) }, null, 2));
  }
}
