# Mechanism Card — fsrs-retrievability-demotion

> Forget by RELOCATING, never deleting. Score memories by FSRS retrievability against the real recall ledger; demote below a floor to a reversible cold store. Storage ≠ retrievability.

| field | value |
|---|---|
| **slug** | `fsrs-retrievability-demotion` |
| **source** | IN-REPO clean-room transfer (FSRS spaced-repetition → YURI memory) — `_SYSTEM/Scripts/memory-relocator.mjs` + `_SYSTEM/Scripts/math/yuri-fsrs.mjs` |
| **anchor** | `planRelocations` @ `memory-relocator.mjs:205`; `evaluateRetention` @ `yuri-fsrs.mjs:73` (memory-relocator is under concurrent edit — anchor by symbol NAME; line numbers verified at writing, re-grep if drifted) |
| **license** | internal (YURI-OS); FSRS algorithm is open (MIT, permissive) |
| **lane** | js (Rust for a heavy at-scale relocator; the scoring math is language-agnostic) |
| **YURI use** | the canonical "forgetting" organ — decayed Track-B memories are demoted to the subconscious cold store + a reversible `relocated/` dir; promote-back restores byte-identical |

## Mechanism (one line)
Compute each memory's retrievability `R = (1 + factor · t/S)^decay` from base stability `S` (set by tier) and days-since-last-USE (`t`), where the use signal comes from the real recall-event ledger with file mtime as a graceful prior; DEMOTE iff `R < rFloor` and the item isn't force-kept; demotion writes the body verbatim to a cold store AND moves the source into a reversible dir — nothing is ever deleted, and a later recall can restore it byte-identical (the testing effect).

## Algorithm (the idiom, distilled)
1. **Tier sets base stability** — `TIER_STABILITY = { semantic:60, episodic:14, working:3 }` days (`memory-relocator.mjs:60`); semantic = consolidated, decays slowest.
2. **Use signal: ledger first, checkout-stable touch prior, then now** — the `lastUsedMs` prior chain (`:171-184`): real ledger `usage.lastUsedMs` always wins (`:179`); a garbled/empty ledger value → `0` (fully decayed, never falsely "fresh") (`:177`); memories predating the ledger fall back to a checkout-stable content-change touch, else `nowMs` (`:184`). Decay keys on the real recall ledger (`memory-usage.mjs`) — graceful degradation, no fabricated usage.
3. **Force-keep is exempt** — `forceKeep = Boolean(fm.forceKeepFlag) || PINNED_FILES.has(filename) || PROTECTED_TYPES.has(fm.type)` (`:168`); `evaluateRetention` short-circuits force-kept items to `{demote:false, R:1, S:Infinity}` (`yuri-fsrs.mjs:75`). Behavioral-floor types (`feedback`, `user`) never decay (`PROTECTED_TYPES` @ `:40`; `PINNED_FILES` @ `:37`).
4. **Pure FSRS scoring** — `retrievability(S, t) = (1 + factor·t/S)^decay`, `factor = 19/81` (`yuri-fsrs.mjs:26`), clamped `[0,1]`; `S<=0 → 0`, `t<=0 → 1` (`yuri-fsrs.mjs:42`). `evaluateRetention` returns `{ demote: R < rFloor, R, S, reason }` (`:73`, `demote: R < rFloor` @ `:82`), default `rFloor = 0.6` (`:74`).
5. **Pure planning core** — `planRelocations(items, cfg)` (`:205`) splits into `{demote, keep}` by calling `evaluateRetention` per item (`:209`); fully unit-testable, zero I/O.
6. **Reversible execute, dry-run by default** — `executeRelocation` (`:249`): upsert body verbatim into the cold store, then `fs.renameSync(item.file, dest)` into `relocated/` — a MOVE, not a delete (`:264`) — and record a relocation-index entry; `dryRun` plans without touching anything; CLI defaults to dry-run unless `--execute` (`:338`).
7. **Promote-back restores byte-identical** — `promoteHot` (`:273`) writes `rec.body` back verbatim (`:281`), clears cold + index: a recall raises the memory hot again, restored exactly.

## When to apply
- Any store that must shed cold items without losing them — caches, memory tiers, archive pipelines. Relocate to a reversible cold tier instead of deleting.
- Any decay/eviction decision that should reflect actual USE, not just age — key on a recall ledger with mtime as a fallback prior.
- Any destructive-looking maintenance op — gate it behind a pure plan + a dry-run default + a reversible move + a restore path.

## The failure it prevents
- **Irreversible forgetting / data loss.** Crude relocators delete or flag-and-move with no recall path. This double-safes: body in the cold DB + source in `relocated/` (`:264`), and `promoteHot` restores it verbatim (`:281`). Nothing is ever destroyed, so "forgetting" stays reversible — the precondition for trusting an automated forgetter.
- **Age-based eviction killing live memories.** Pure mtime/atime LRU evicts a frequently-recalled-but-old memory. Keying decay on the recall ledger (`:171-184`) means a used memory's `t` resets, raising `R` above the floor — the testing effect, not a clock.
- **Decaying the behavioral floor.** Without the exemption, standing rules (`feedback`/`user`) would decay out. `PROTECTED_TYPES` + `PINNED_FILES` + `force_keep` (`:37`, `:40`, `:168`) make them permanent (`S:Infinity`).
- **Fabricated usage for pre-ledger memories.** Defaulting unknown use to "never used" would over-demote legacy memories; the checkout-stable touch prior (`:184`) degrades gracefully, while a GARBLED ledger value is treated as fully decayed not fresh (`:177`).
- **Untested destructive code.** A relocator that does I/O inline can't be safely unit-tested. The pure `planRelocations`/`evaluateRetention` core + dry-run default (`:338`) let every demotion decision be verified before any file moves.

## Clean-rewrite note
FSRS is open/MIT — the retrievability formula and the testing-effect model transfer freely. The YURI-specific excellence is the RELOCATE-not-delete discipline + dry-run-default + pure-plan/execute split; preserve those when porting. In Rust, keep the plan/execute separation (`fn plan(...) -> Plan`, `fn execute(plan, dry_run)`) and the reversible move + restore path.

## Verification
Real source read (not from memory). Grep-verified path:line in this repo (memory-relocator is under concurrent edit — symbol names are the durable anchor; lines verified at writing, re-grep if drifted):
- `memory-relocator.mjs:60` `const TIER_STABILITY = { semantic: 60, episodic: 14, working: 3 };`
- `memory-relocator.mjs:171-184` `lastUsedMs` prior chain (ledger `:179` → garbled→0 `:177` → stable-touch/now `:184`)
- `memory-relocator.mjs:205` `export function planRelocations(items, cfg = {})` (pure split)
- `memory-relocator.mjs:264` `fs.renameSync(item.file, dest)` reversible move, not delete
- `memory-relocator.mjs:281` `fs.writeFileSync(dest, rec.body)` restore verbatim (`promoteHot` @ `:273`)
- `yuri-fsrs.mjs:73` `export function evaluateRetention` → `{ demote: R < rFloor, ... }` (`:82`), `rFloor=0.6` (`:74`)
