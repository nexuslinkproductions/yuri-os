# YURI Code Bible — Defensive Patterns from the Red-Team

Reusable canon distilled from 30 confirmed defects (each survived ≥2 of 3 adversarial lenses) across 7 organs. These are not a defect list — they are the patterns the attack *validated*. Organized by defect class. Every pattern: anti-pattern → rule → one-line corrected example.

A single mechanical truth runs through almost all of it: **`String.includes()` and `String.startsWith()` are not boundary-aware, lexical normalization is not canonicalization, and a flag a record asserts about itself is not a verified fact.** Most of the 30 defects are one of those three mistakes wearing a different costume.

---

## Class 1 — Lexical matching where you meant *boundary* matching

The single most-repeated defect class: substring/prefix tests standing in for token, segment, or component-boundary tests. It appears as classifier confusion, scope bypass, milestone collapse, and zone misrouting — six organs, eight findings.

### P1.1 — Word-boundary keyword witnesses, never raw `includes()`
- **Anti-pattern:** `classifyDimension` tested `unitText.includes('bit')`/`includes('nat')` → `'coordinate'` matches `coordi·NAT·e`, `'inhibitory'` matches `inhibi·BIT·ory`, `'arbitrary'`, `'signature'`, `'the bitcoin price'` all retype to INFORMATION. The legality grammar the whole engine exists to provide is driven by accidental English-word collisions. (formula-foundry:56 — verified live: `inhibitory signal → INFORMATION witness 'bit'`.)
- **Rule:** Tokenize first (`split(/[^a-z0-9-]+/)`) and test keyword membership against whole tokens, or anchor per-keyword: `(^|[^a-z])${kw}([^a-z]|$)`. Keep specific→general priority, but only over whole-word witnesses.
- **Corrected:** `const toks = new Set(text.toLowerCase().split(/[^a-z0-9-]+/)); if (toks.has('bit') || toks.has('nat')) dim = 'INFORMATION';`

### P1.2 — Path scope/denial must match on a component boundary, not a string prefix
- **Anti-pattern:** scope check OR-chained a boundary-aware `rel.startsWith(n+'/')` with a dead `|| rel.startsWith(n)` → `'_SYSTEM/Scripts/mathEVIL.mjs'` passes scope for allowed `'_SYSTEM/Scripts/math'`; the careful `endsWith('/')` logic is inert. Inverse on the denied side: `'secret'` denies sibling `'secretkeys.mjs'` (false positive) and corrupts `precisionScore`. Zone classifier had the same bug with `p.includes('_SYSTEM/Scripts')` matching `evil/_SYSTEM/Scripts/...` and routing untrusted content *toward* a protected zone. (discovery-precision-gate:22,34,40; filing-assessor:30.)
- **Rule:** One idiom for every in/out-of-tree test: `rel === base || rel.startsWith(base.endsWith('/') ? base : base + '/')`. Never bare `startsWith`, never `includes` for path membership.
- **Corrected:** `const under = (rel, base) => rel === base || rel.startsWith(base.replace(/\/?$/, '/'));`

### P1.3 — Match the exact final segment of dotted phase/event names, not a suffix
- **Anti-pattern:** `milestoneOf` did `phase.endsWith('complete')` → real intermediate phase `worker.revision_complete` (live in `originator-telemetry.jsonl`) classifies as terminal `complete`, flipping a still-revising lane to `status=done`. `MILESTONES.find(m => phase.endsWith(m))` returned `'start'` for `worker.process_start` because `'start'` precedes `'process_start'` in the array — order-dependent first-wins. (telemetry-cockpit:23 — these are module-internal helpers, not exported.)
- **Rule:** Split on `.`, take the last segment, test exact membership against a closed set. Order-independent, suffix-collision-proof.
- **Corrected:** `const seg = String(phase).split('.').pop(); return MILESTONES.includes(seg) ? seg : null;`

### P1.4 — Anchor "ephemeral/scratch" name patterns to the trailing token
- **Anti-pattern:** `/\.bak-/.test(name)` flagged `.claude/settings.json.bak-cwdfix` (a real tracked repo file) as a purge candidate — `.bak-` matches anywhere in the name. Acting on the report deletes intentional config backups. (filing-assessor:24.)
- **Rule:** Anchor the suffix (`/\.bak(-[\w.]+)?$/`) and only treat a pattern as ephemeral when it is the trailing token — and gate any purge recommendation behind a protected veto and an explicit `/tmp/` location, never a name pattern alone for repo-resident files.
- **Corrected:** `const ephemeral = /\.bak(-[\w.]+)?$/.test(name) && rel.startsWith('/tmp/');`

---

## Class 2 — Canonicalize the path before any security decision (fail-OPEN traversal)

### P2.1 — Resolve `..` and prove in-repo before vetoing; lexical normalize is not canonicalization
- **Anti-pattern:** `normalizePath` did split/join + strip `./` but never collapsed `..`, so `isProtectedPath('_SYSTEM/Scripts/math/../../../.env')` returned `false` and the protected veto never fired → gate returns `pass=true, vetoes=[]` for a footprint that reaches `.env`. The *same* lexical gap also counts the traversal-to-`.env` footprint as in-scope and scores `precisionScore=1.0`, lying to the downstream energy gate that the lane was perfectly surgical. The sibling canon module `fs-utils` already returns `null` on `..`-escaping/absolute paths — the pattern existed and was not reused. (discovery-precision-gate:33,40 — verified live: `pass:true, vetoes:[]`.)
- **Rule:** Canonicalize to an absolute path under `REPO_ROOT` *before* any veto or scoring. Reject anything that resolves outside the root. One `safeRel()` helper feeds both the veto loop and the precision metric so they share one dot-dot-resolved view.
- **Corrected:** `const abs = path.resolve(REPO_ROOT, rel); if (!abs.startsWith(REPO_ROOT + path.sep)) return veto('escapes-repo'); rel = path.relative(REPO_ROOT, abs);`

### P2.2 — Apply the protected veto you already import; classification is not authorization
- **Anti-pattern:** `filing-assessor` imported `normalizePath` from `yuri-id-bridge.mjs` — the same module that *exports `isProtectedPath`* — but never called it. So `.claude/state/secret-telemetry.jsonl` is classified filable and the owner-facing report recommends relocating it into unprotected `_SYSTEM/state/`, and `.env.bak`/`backend/data` are tagged purge candidates. The veto was one import away. (filing-assessor:34.)
- **Rule:** Any module that produces owner-acted relocation/purge/promotion advice must fail closed on protected paths *first*, before the rule loop. Import and call the canonical veto; classifying a protected path is itself the bug.
- **Corrected:** `if (isProtectedPath(filePath)) return { kind:'protected', zone:null, protected:true, reason:'protected surface — never a filing candidate' };`

---

## Class 3 — Self-asserted state is not a verified gate (fail-OPEN promotion)

The governance organs trusted records to vouch for themselves. Every promotion/validation gate that read a flag the candidate set on itself was defeated by setting that flag.

### P3.1 — Resolve the real binding; never derive "verified" from self-declared fields
- **Anti-pattern:** `proofPreflightCandidate` computed `inert` purely from the card's own `promotionStatus`/`advisoryOnly`/`implementedBy`, and the validation meant to back it never resolved the kernel symbol — so a card with `implementedBy:'…/math-kernel.mjs#doesNotExist123'` reports `inert:false, validationOk:true, validationErrors:[]`. The "no promotion without a real kernel binding" claim is structurally unverifiable in this path. (formula-foundry:298.)
- **Rule:** When a record claims a binding, independently import the target and assert `typeof kernel[sym] === 'function'` before reporting non-inert. A missing/unresolvable symbol is a hard `validationOk:false`. Require `verifiedBinding === true`, never `selfDeclared === true`.
- **Corrected:** `const k = await import(modPath); if (typeof k[sym] !== 'function') return { inert:true, validationOk:false, errors:['unresolved binding '+sym] };`

### P3.2 — A wrapper must not inject the flag that disables the check it claims to run
- **Anti-pattern:** `wrapAsProofBank` hardcoded `advisoryOnly:true` on the bank, which makes `validateFormulaCard` early-return at lines 310–315 *before* `assertImplementedBySymbolResolves` at 319 — the one fail-closed provenance check is bypassed. The docstring at 286–289 explicitly claims the wrapper "fires … assertImplementedBySymbolResolves … the full card contract." The wrapper's own injected flag makes that claim false. (formula-foundry:289.)
- **Rule:** Never let a convenience wrapper set a flag that suppresses the validation the wrapper exists to perform. Run a dedicated non-advisory pass (or an inline symbol-resolution step) so the binding check always fires, and make the docstring match real behavior.
- **Corrected:** `validateFormulaBank({ ...bank, advisoryOnly:false }); // force the provenance pass; do not inherit advisory`

### P3.3 — Ladder promotion must verify adjacency, not just "a record exists for the target rung"
- **Anti-pattern:** `promote()` checked only that a gate record exists for `toRung`, never the card's *current* rung — so a `hypothesis` card jumps the entire ladder (simulated→counterexample→proof-gated→bakeoff) straight to `owner-approved` with one forged record. The `PROMOTION_LADDER` is decorative. (formula-foundry-bakeoff:72 — verified live: `{ok:true, status:'owner-approved'}`.)
- **Rule:** Promotion requires single-step adjacency *and* gate records for every rung from current+1 through target: `idxTo === idxFrom + 1` where `idxFrom = LADDER.indexOf(card.status)`. No skipping intermediate proof obligations.
- **Corrected:** `if (LADDER.indexOf(toRung) !== LADDER.indexOf(card.promotionStatus) + 1) return { ok:false, reason:'rung-skip' };`

### P3.4 — Authorization tokens come from a closed set bound to verified evidence, never any truthy value
- **Anti-pattern:** `canPromote` accepted any truthy non-`'demotion'` gate value — `gate:'i-said-so'`, `gate:1`, `gate:{}` all authorize. `appendGateRecord` writes whatever string the caller passes with zero proof a real gate ran. One hand-written JSONL ledger line owner-approves any formula. (formula-foundry-bakeoff:67.)
- **Rule:** Validate the gate identifier against a closed `ALLOWED_GATES` set *and* require it be a string; better, bind authorization to an `evidenceHash` the gate process produced and re-verify it, rather than trusting an opaque label.
- **Corrected:** `const ALLOWED = new Set(['math-proof-gate','real-data-bakeoff','counterexample-suite']); if (typeof r.gate !== 'string' || !ALLOWED.has(r.gate)) return false;`

### P3.5 — A self-declared, uncross-checked metric is gameable by under-reporting
- **Anti-pattern:** `precisionScore` returns a perfect `1.0` when `discoveryFootprint` is empty — so a lane scores 1.0 by simply *omitting* the footprint while declaring out-of-scope `paths` and `pass:false`. The metric rewards saying less. (discovery-precision-gate:41.)
- **Rule:** An empty/absent self-reported set is `unknown` (non-perfect sentinel), never "perfect." Compute the metric over the *union* of declared paths + footprint so omission can't manufacture a clean score; flag `footprint.length===0 && referenced.length>0` as suspicious.
- **Corrected:** `const precisionScore = footprint.length === 0 ? null : inScopeCount / (footprint.length + outOfScopePaths.length);`

---

## Class 4 — Boundary-validate every input; fail CLOSED, not by crash and not by coercion

Two failure modes, equally wrong: (a) deref untrusted input and throw an uncaught `TypeError` that aborts the whole pipeline (a thrown gate is fail-OPEN if any caller wraps it in try/catch), and (b) silently coerce malformed input into a confident-but-wrong answer.

### P4.1 — Type-check at the boundary; reject malformed, don't coerce it into a confident answer
- **Anti-pattern:** `classifyDimension(['bit'])` → `INFORMATION` via `String(['bit'])==='bit'`; `{toString:()=>'energy'}` → `ENERGY`. A malformed card units field is silently typed instead of surfaced as a schema problem. (formula-foundry:52.)
- **Rule:** If input is not the expected primitive (string here), return `{ malformed:true }` / `UNKNOWN`, never `String()`-coerce an object/array into a confident classification.
- **Corrected:** `if (typeof unitText !== 'string') return { dimension:'UNKNOWN', witness:null, malformed:true };`

### P4.2 — Validate numeric weights/config are finite before they touch the math; normalize `-0`/`NaN`
- **Anti-pattern:** `openMass({…},{weights:{value:NaN}})` → `mass NaN`; `{value:1e309}` → `Infinity`; `{value:'5'}` string-coerced. One bad weight poisons `poolTotal` for the whole pool (`→ Infinity`), and `rankPool`'s comparator `b.mass - a.mass` returns `NaN` for non-finite mass so the sort silently degenerates to insertion order — the operator's "what's unfinished?" answer becomes garbage with no thrown error. (openprocess-pool:80.)
- **Rule:** After merging defaults+caller weights, assert every value is a finite number (throw, mirroring `math-kernel.assertFiniteNumber`); guard the aggregate with `if(!Number.isFinite(mass)) throw`; normalize `-0` via `mass + 0`. Make comparators NaN-safe or rely on the upstream throw.
- **Corrected:** `for (const v of Object.values(w)) if (!Number.isFinite(v)) throw new Error('non-finite weight'); mass = mass + 0;`

### P4.3 — Guard object/element shape before dereferencing; degrade per-row, don't abort the batch
- **Anti-pattern:** `openMass(null)`, `rankPool([null,{…}])`, `staleness({evidence:[null]})`, `assessAll([…,null,…])`, `discoveryPrecisionGate({paths:[123,null,{}]})` all throw uncaught `TypeError` and abort the *entire* run for one malformed element trivially produced by a partial JSON load or sparse upstream array. A gate that throws is not fail-closed. (openprocess-pool:79; filing-assessor:69; discovery-precision-gate:28,26.)
- **Rule:** Boundary-check each element (`!e || typeof e !== 'object'`/`typeof p !== 'string'`) and emit an explicit `{ kind:'invalid' }` / skip path, so one bad row degrades gracefully while valid rows still produce a report. Normalize config shape (`Array.isArray(v) ? v : v == null ? [] : [v]`) before `.map`.
- **Corrected:** `if (typeof filePath !== 'string' || !filePath) return { kind:'invalid', reason:'non-string path' };`

### P4.4 — Coerce/guard the field types you sort, slice, and stringify on the render path
- **Anti-pattern:** `t.milestones.sort((a,b)=>a.ts.localeCompare(b.ts))` throws when `ts` is missing (`undefined.localeCompare`) or numeric (`(1).localeCompare is not a function`); `t.traceId.slice(-28)` throws on a numeric `traceId`. All from valid JSON lines, so the `JSON.parse` try/catch in `readTelemetry` does not shield them — the cockpit crashes instead of degrading. (telemetry-cockpit:54,59,71.)
- **Rule:** Normalize at ingestion. Coerce timestamps with `String(e.ts ?? '')` (or `Date.parse` with `NaN→0`) and sort string-safe; coerce ids with `String(t.traceId)` / `typeof === 'string' ? : 'unknown'`. A `try/catch` around `JSON.parse` guards parsing, not downstream shape — guard both.
- **Corrected:** `.sort((a,b) => String(a.ts).localeCompare(String(b.ts)));  const id = String(t.traceId).slice(-28);`

### P4.5 — Validate CLI args; explicit `0`/negative/non-numeric must fail loud, not silently empty
- **Anti-pattern:** `--limit abc` → `parseInt → NaN` → `slice(0,NaN)` shows 0 rows under header "showing NaN"; `--limit -5` → `slice(0,-5)` silently drops the 5 *most-recent* traces an operator most wants; `--limit 0` shows nothing. An operator's bad flag silently hides active lanes during an incident. (telemetry-cockpit:83.)
- **Rule:** Validate after parse — reject non-integer or out-of-range with a non-zero exit, then clamp into `[1, traces.length]`.
- **Corrected:** `const n = parseInt(a,10); if (!Number.isInteger(n) || n < 1) { console.error('--limit must be a positive integer'); process.exit(2); }`

### P4.6 — Use `Number.isInteger`/nullish checks, never `||`, for numeric defaults
- **Anti-pattern:** `ranked.slice(0, opts.top || 10)` treats the legitimate value `0` as unset and returns 10 — `top:0` yields 10 results. (openprocess-pool:116.)
- **Rule:** A falsy-but-valid numeric (`0`, `''`) must not be coalesced away. Validate explicitly, then fall back.
- **Corrected:** `const n = Number.isInteger(opts.top) && opts.top >= 0 ? opts.top : 10;`

---

## Class 5 — Never swallow errors or truncate silently; surface every drop

### P5.1 — Collect parse failures into a diagnostics channel; bare `catch { continue }` hides desync
- **Anti-pattern:** `catalogFormulas` did `try { JSON.parse } catch { continue; }` — a corrupt/truncated/merge-conflicted bank file vanishes from the catalog with zero output, silently shrinking coverage and making any composition over its formulas impossible. The "silent garbage" the engine exists to prevent, now applied to its own inputs. (formula-foundry:84.)
- **Rule:** On any catch, push `{ file, error: e.message }` to a returned `skipped[]` (and/or `process.stderr`); include it in the return so callers and the CLI see which inputs failed.
- **Corrected:** `catch (e) { skipped.push({ file, error: e.message }); continue; } ... return { cards, skipped };`

### P5.2 — Set a `truncated`/`incomplete` flag on *every* cut path, not just one limit
- **Anti-pattern:** `composeOperatorSequences` set `truncated` only on the `maxCandidates` limit, never on the per-node `maxBranch` `break` (drops legal successors) nor on `domainFilter`/`startSet`/`endSet` pruning. An enumerator documented as listing "every dimensionally-legal chain" silently returns a prefix sample reporting `truncated:false` — an "exhausted over a top-N prefix" lie the wrapper can't detect. (formula-foundry:218.)
- **Rule:** Any path that drops a legal successor or prunes the space sets a completeness flag and ideally a dropped-count, so callers know the result is a bounded sample, not the complete set.
- **Corrected:** `if (sorted.length > maxBranch) { result.truncated = true; result.dropped += sorted.length - maxBranch; }`

### P5.3 — Surface truncation at the surface that reports `length`; don't let two inputs collide silently
- **Anti-pattern:** `yuri-decode` numerology slices input at `MAX_CHARS=200000` before hashing, while `decode.length` and tokens cover the full string — so two materially different >200k texts produce identical `gematria/digitalRoot/harmonicSignature` next to a full-length `length` field, with no marker. (yuri-decode:33.)
- **Rule:** When a sub-channel truncates, emit a deterministic flag (`numerologyTruncated: t.length > 200000`) on the surface that also reports the full size, so a consumer can see the channel no longer matches the length field.
- **Corrected:** `numerology.truncated = text.length > MAX_CHARS;`

### P5.4 — Fail closed on an invalid enum target; never silently rewrite to a default
- **Anti-pattern:** `demote('f9','prof-gated' /*typo*/,'regress')` → `{ok:true, status:'hypothesis'}`. `const rung = LADDER.includes(toRung) ? toRung : 'hypothesis'` swallows the typo and nukes the formula all the way to `hypothesis` while returning `ok:true` — operator never learns the input was invalid. (formula-foundry-bakeoff:80.)
- **Rule:** An unrecognized enum value is an error, not a default. Return `{ok:false, reason}` and write nothing.
- **Corrected:** `if (!LADDER.includes(toRung)) return { ok:false, reason:'unknown rung: '+toRung };`

---

## Class 6 — Resolve identity by the right key; never first-match a non-unique field

### P6.1 — Build an explicit id→record map and surface collisions; `find(first-match)` silently loses data
- **Anti-pattern:** `whatIsUnfinished` resolved a scored row to its source via `processes.find(q => q.id === x.id)` (first match). With duplicate ids — realistic for a pool aggregating tasks/research/bugs from multiple lanes over weeks, the module's stated use case — a `closed` duplicate seen first makes the `state!=='closed'` filter silently delete the genuinely-`open` one: the operator is told work is done when it isn't. Same first-match mis-attributes title/state/nextCandidateAction across collided ids. (openprocess-pool:113 — verified live: returns `[]`, the open process vanishes.)
- **Rule:** Carry identity by array position through scoring, or build a `Map` and explicitly reject/warn on duplicate ids up front so collisions fail loud. Never resolve a non-unique key by first-match. "Forgetting is broken trust" — a continuity organ that silently drops open work fails its one promise.
- **Corrected:** `const scored = processes.map((p,i) => ({ ...openMass(p), _idx:i })); const src = processes[row._idx];`

---

## Class 7 — Prototype-safe collections for untrusted keys

### P7.1 — `Object.create(null)` for any map keyed by external tokens
- **Anti-pattern:** `const freq = {}` inherits `Object.prototype`, so the token `'constructor'` reads the inherited native function (truthy) and `(freq[tok] || 0) + 1` evaluates to `nativeFn + 1` = string concat → `freq.constructor === 'function Object() { [native code] }1'` (a *string*, not a count). Any decode input containing "constructor" — extremely common in technical text, this instrument's whole purpose — returns a non-numeric, monotonically-wrong count the consumer can't detect. (yuri-decode:28 — verified live: `typeof === 'string'`.)
- **Rule:** Any frequency/count/lookup map keyed by external strings is created with `Object.create(null)` — no inherited `constructor`/`__proto__`/`valueOf` to collide. Same defense the local corpus uses against the proto-pollution class (`merge-patch.proto-pollution.test.ts`).
- **Corrected:** `const freq = Object.create(null); freq[tok] = (freq[tok] || 0) + 1; // verify: decode('constructor').frequency.constructor === 1`

---

## The four meta-rules these 30 defects keep teaching

1. **Boundary, not substring.** `includes`/`startsWith`/`endsWith` answer "does this string contain that string," never "is this the same component/token/segment." If a security or classification decision rides on the answer, you almost certainly meant the boundary version. (Classes 1, 2.)
2. **Canonicalize before you decide.** Lexical normalization (`./` strip, split/join) is not `..`-resolution. Resolve to a real absolute path under the root and prove containment *before* any veto or score — and reuse the *one* helper for veto and metric alike. (Class 2.)
3. **Verify the binding, don't trust the flag.** A record's self-declared `promotionStatus`/`advisoryOnly`/`gate`/footprint is an assertion, not evidence. Resolve the real symbol, check rung adjacency, validate against a closed set, cross-check the metric. A wrapper must never inject the flag that disables its own check. (Class 3.)
4. **Fail closed and loud, per-input.** Type-check at the boundary and reject malformed (don't coerce it confident, don't throw-and-abort-the-batch). Surface every drop, truncation, swallowed parse, and invalid enum — `truncated:false` over a prefix-cut, a silent `continue` on a corrupt bank, and an `ok:true` on a typo'd rung are all the same lie. (Classes 4, 5.)
