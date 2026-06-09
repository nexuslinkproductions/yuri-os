# YURI Red-Team Disclosure Report — Confirmed Defects

**Scope:** 30 defects, each surviving ≥2 of 3 adversarial lenses, across 7 organs. Five headline items re-verified live this session (traversal fail-open, milestone collapse, ladder rung-skip, duplicate-id data loss, prototype-chain corruption — all reproduced exactly).

**Severity tally (synthesizer-assigned, reconciled against the 3 corrected-severity votes):** 3 HIGH · 18 MEDIUM · 9 LOW.

> Note on severities: the original `severity` field skewed high; the three independent `correctedSeverities` votes pulled most items to medium/low. This report uses the reconciled severity (modal corrected vote, broken toward the security impact where a gate fails open). Several "high" originals are governance/classifier modules with **no production caller yet** — real but latent, hence medium. The genuinely-high items are where a *security/continuity boundary fails open on reachable input*.

---

## Organ: formula-foundry — `_SYSTEM/Scripts/math/formula-foundry.mjs`
*Six defects. This module is Core A — the dimensional legality grammar and the proof-promotion preflight. The classifier defect undermines the whole engine's reason to exist; the two binding defects make its central safety claim unverifiable.*

### F-1 · MEDIUM · classifyDimension substring `includes()` misclassification — `:56`
- **Repro (verified live):** `classifyDimension('inhibitory signal') → INFORMATION (witness 'bit')`; `classifyDimension('probabilistic coordinate') → INFORMATION (witness 'nat')`; `'the bitcoin price in usd' → INFORMATION`.
- **Impact:** The classifier *is* the composition legality gate (`dimensionsCompatible`/`composeCheck`). `'bit'`/`'nat'` collide with a huge English surface (bitrate, arbitrary, inhibitory, coordinate, signature). A DISTANCE quantity whose prose contains those substrings is silently retyped → illegal composition admitted as legal, or legal one rejected. The "stop dimensionally-incoherent chains" purpose is defeated at its root.
- **Fix:** Tokenize on `/[^a-z0-9-]+/` and test keyword *membership*, or anchor `(^|[^a-z])${kw}([^a-z]|$)`. Whole-word witnesses only, specific→general priority preserved.

### F-2 · MEDIUM · proofPreflightCandidate verdict is fully self-asserted — `:298`
- **Repro (verified live):** card with `implementedBy:'foo/math-kernel.mjs#doesNotExist123'` → `{ inert:false, hasBinding:true, validationOk:true, validationErrors:[] }`. The symbol is not an export.
- **Impact:** Central safety claim is "no promotion without a real kernel binding + green example," but `inert` is derived purely from the card's self-declared `promotionStatus`/`advisoryOnly`/`implementedBy`, and `validationOk` never resolves the symbol (see F-3). A caller trusting preflight as the promotion guard treats a phantom-bound card as promotable — fail-open promotion gate. Latent (no production caller) → medium.
- **Fix:** When `hasBinding` and `implementedBy` references the kernel, independently import and assert `typeof kernel[sym]==='function'` before reporting non-inert; require strict verified `binding===true`, never self-declared fields alone.

### F-3 · MEDIUM · wrapAsProofBank hardcodes `advisoryOnly:true`, skipping the one fail-closed provenance check — `:289`
- **Repro (verified live):** bogus binding → `validationOk:true, validationErrors:[]`. The wrapper-injected `advisoryOnly:true` makes `math-proof-gate.mjs validateFormulaCard` early-return (lines 310–315) *before* `assertImplementedBySymbolResolves` (line 319) — symbol never checked.
- **Impact:** The docstring (286–289) explicitly claims the wrapper "fires … assertImplementedBySymbolResolves … the full card contract." False — the wrapper's own flag disables exactly that. The kernel-binding provenance gate is dead in this path; this is the mechanism behind F-2.
- **Fix:** Run a second non-advisory validation pass to fire the binding check (or resolve the symbol inline in preflight, independent of the bank's advisory flag). Treat unresolvable symbol as hard `validationOk:false`. Correct the docstring.

### F-4 · MEDIUM · composeOperatorSequences `maxBranch` drops legal successors without setting `truncated` — `:218`
- **Repro (verified live):** one source feeding 5 legal SCORE targets, `{maxBranch:1}` → only first successor taken (`break`), 4 dropped, yet `truncated:false`. The flag is set only on `maxCandidates`, never on per-node `maxBranch` nor `domainFilter`/`startSet`/`endSet` pruning.
- **Impact:** Documented (line 194) to enumerate "every dimensionally-legal chain." With default `maxBranchingPerNode:24`, any node with >24 legal successors silently loses chains while reporting complete — the canon-flagged "exhausted over a top-N prefix" lie. Correctness, not security → medium.
- **Fix:** Set `truncated=true` (or `branchTruncated`) on the `maxBranch` cut and on filter pruning; surface a dropped-successor count so callers know it's a bounded sample.

### F-5 · MEDIUM · catalogFormulas swallows JSON parse errors silently — `:84`
- **Repro:** `try { bank = JSON.parse(...) } catch { continue; }`. Any malformed `*.json` (truncated write, merge markers) is dropped with zero output; live catalog reads 23 cards across 6 banks with no error channel.
- **Impact:** A bank that fails to parse vanishes — its cards never enter the catalog, bindings never count toward coverage, compositions over them become silently impossible. A half-written propagation auto-edit degrades the engine's legality picture invisibly. "Silent garbage" applied to its own inputs.
- **Fix:** `catch (e) { skipped.push({ file, error: e.message }); continue; }` and include `skipped` in the return.

### F-6 · LOW · classifyDimension `String(x)`-coerces non-string input — `:52`
- **Repro:** `classifyDimension(['bit']) → INFORMATION`; `classifyDimension({toString:()=>'energy'}) → ENERGY`.
- **Impact:** A malformed card whose `units.output` is an array/object should surface as a schema problem; instead it's coerced to a confident (likely wrong) dimension feeding the composition gate. Repo-local banks (semi-trusted) cap severity.
- **Fix:** `if (typeof unitText !== 'string') return { dimension:'UNKNOWN', witness:null, malformed:true };`

---

## Organ: foundry-bakeoff — `_SYSTEM/Scripts/math/formula-foundry-bakeoff.mjs`
*Three defects in the promotion-ladder governance. Two combine into a full authorization bypass: one ledger line owner-approves any formula.*

### B-1 · MEDIUM · promote() never checks current rung — single forged record jumps to top — `:72`
- **Repro (verified live):** `promote({ id:'evil', promotionStatus:'hypothesis' }, 'owner-approved', [{ formulaId:'evil', rung:'owner-approved', gate:'i-said-so', stamp:'x' }]) → { ok:true, status:'owner-approved' }`.
- **Impact:** `PROMOTION_LADDER` is decorative — `canPromote`/`promote` verify only that a record exists for `toRung`, never that the card sits on the immediately-lower rung. A hypothesis card reaches owner-approved without clearing proof-gated or real-data-bakeoff. Defeats the module's governance purpose. Latent (no production caller) → medium.
- **Fix:** `idxFrom = LADDER.indexOf(card.promotionStatus); idxTo = LADDER.indexOf(toRung); refuse unless idxTo === idxFrom + 1` AND gate records exist for every rung current+1..toRung.

### B-2 · MEDIUM · Gate-record forgery — any truthy non-`'demotion'` value authorizes — `:67`
- **Repro:** `canPromote('evil','proof-gated',[{ formulaId:'evil', rung:'proof-gated', gate:'x' }]).ok === true`; `gate:1`, `gate:{}` also pass. Only `gate==='demotion'`/falsy is rejected. `appendGateRecord` writes any gate string with zero validation a real gate ran.
- **Impact:** The "gate record proves a rung was cleared" contract is unenforceable — no closed-set, no signature, no proof-hash. Combined with B-1, one hand-written JSONL line owner-approves any formula. (Two lenses high, one low; security boundary → medium.)
- **Fix:** `const ALLOWED_GATES = new Set(['math-proof-gate','real-data-bakeoff','counterexample-suite']); typeof r.gate==='string' && ALLOWED_GATES.has(r.gate)`. Better: bind to a verified evidenceHash and re-verify.

### B-3 · LOW · demote() silently rewrites invalid/typo rung to `'hypothesis'` — `:80`
- **Repro:** `demote('f9','prof-gated'/*typo*/,'regress') → { ok:true, status:'hypothesis' }`. `const rung = PROMOTION_LADDER.includes(toRung) ? toRung : 'hypothesis'` swallows the bad input.
- **Impact:** Intending to demote one rung but mistyping silently nukes the formula to `hypothesis` with `ok:true` — operator never learns the input was invalid; lands on the wrong rung.
- **Fix:** `if (!PROMOTION_LADDER.includes(toRung)) return { ok:false, reason:'unknown demotion rung: '+toRung };` — write nothing.

---

## Organ: openprocess-pool — `_SYSTEM/Scripts/openprocess-pool.mjs`
*Four defects in the "what did we start but not finish?" continuity organ. The duplicate-id loss is the standout — it silently tells the operator work is done when it isn't, breaking the module's explicit promise.*

### O-1 · HIGH · whatIsUnfinished drops/mis-attributes processes on duplicate id (first-match) — `:113`
- **Repro (verified live):** `whatIsUnfinished([{id:'dup',state:'closed',title:'CLOSED'},{id:'dup',state:'open',title:'OPEN',nextCandidateAction:'do it'}]) → []` — the genuinely-open process is missing. Two `open` dups → titles `['A','A']` (B lost, A double-counted).
- **Impact:** Lines 113/118 resolve via `processes.find(q=>q.id===x.id)` (first match). For a pool aggregating tasks/research/bugs from multiple lanes over weeks (the module's stated use case), a closed duplicate seen first makes the `state!=='closed'` filter delete the open one — operator told work is done when it isn't. "Forgetting is broken trust" — a continuity/trust failure on the module's one promise. Three lenses high/med/high → **high**.
- **Fix:** Carry identity by array position through `openMass`, or `const byId = new Map(); for (const p of processes) if (!byId.has(p.id)) byId.set(p.id,p)` with an explicit duplicate-id warning. Better: reject/de-dup duplicate ids up front in `rankPool` so collisions fail loud.

### O-2 · MEDIUM · Unvalidated `opts.weights` poisons mass with NaN/Infinity, corrupts ranking + totals — `:80`
- **Repro:** `openMass({...},{weights:{value:NaN}}) → mass NaN`; `{value:1e309} → Infinity`; `{value:'5'}` string-coerced. `poolTotal([2 clean],{weights:{value:1e309}}) → Infinity` (one bad weight poisons the whole total). `rankPool([...],{weights:{value:NaN}})` → comparator `b.mass-a.mass = NaN` → sort silently degenerates to insertion order, no error.
- **Impact:** The `{...weights}` spread (line 80) accepts any caller weights with zero validation; non-finite mass collapses the ranking and the operator's answer becomes garbage with no thrown error. Violates the boundary-validate / no-silent-fail / `-0`/NaN-normalize canon. (Two lenses med, one low.)
- **Fix:** After merge, assert every weight finite (throw, mirroring `math-kernel.assertFiniteNumber`); guard `if(!Number.isFinite(mass)) throw`; normalize `-0` via `mass + 0`; make the comparator NaN-safe or rely on the throw.

### O-3 · MEDIUM · openMass/rankPool/staleness crash on null/undefined/non-object entries — `:79`
- **Repro:** `openMass(null) → TypeError (reading 'state')`; `rankPool([null,{...}])` throws on the null, aborting the ranking; `staleness({evidence:[null,'x',42]}) → TypeError (reading 'base')` at line 41.
- **Impact:** `statusOpen`/`unfinishedRisk`/`operatorValue`/`verifiedClosureEvidence`/`staleness` deref proc/evidence fields with no object guard. One null/non-object entry (partial JSON load, deleted record, sparse upstream array) aborts `rankPool`/`poolTotal`/`whatIsUnfinished` for the whole pool — crashes instead of failing closed.
- **Fix:** Top of `openMass`: `if (!proc || typeof proc !== 'object') return {id:undefined, mass:0, terms:{...zeroed}}`; `rankPool` filters invalid entries; `staleness` skips non-object evidence elements.

### O-4 · LOW · whatIsUnfinished `top:0` returns 10 (falsy-default coalesce) — `:116`
- **Repro:** `whatIsUnfinished(fifteenProcs, {top:0}).length → 10`. `ranked.slice(0, opts.top || 10)` treats the legitimate `0` as unset.
- **Impact:** A caller asking for top 0 (or computing dynamically to 0) gets 10 records. Silent wrong-answer, no security boundary.
- **Fix:** `const n = Number.isInteger(opts.top) && opts.top >= 0 ? opts.top : 10;`

---

## Organ: telemetry-cockpit — `_SYSTEM/Scripts/lane-telemetry-cockpit.mjs`
*Six defects in the read-only operator-truth tool. Module-internal helpers `milestoneOf`/`MILESTONES` (exports confirmed: `readTelemetry, renderCockpit, summarizeByTrace`). The suffix-collision item is the standout — it lies about lane status, the one thing the tool exists to surface.*

### T-1 · MEDIUM · Milestone suffix-match flips a running lane to `done` — `:23`
- **Repro:** `milestoneOf('worker.revision_complete') → 'complete'` (`.endsWith('complete')` true). `revision_complete` is a real intermediate phase live in `originator-telemetry.jsonl`. Events `[worker.start, worker.revision_complete]` → `summarizeByTrace(...).status === 'done'`. Same class: `worker.cleanup_incomplete`.
- **Impact:** A lane mid-revision is shown with the ✓ done flag (status logic line 48 fires on the mismatched milestone). The operator believes a lane finished when it's still running — a correctness lie in the one tool meant to surface truth.
- **Fix:** `const seg = String(phase).split('.').pop(); return MILESTONES.includes(seg) ? seg : null;` — `revision_complete`/`cleanup_incomplete` become non-matches; `worker.complete`/`process_exit` still match.

### T-2 · MEDIUM · MILESTONES.find returns first endsWith hit — `process_start`→`start` — `:23`
- **Repro:** `'start'` precedes `'process_start'` in MILESTONES; `milestoneOf('worker.process_start')` hits `endsWith('start')` at index 0, returns `'start'`. Dedup (line 54) then collapses the genuine `start`+`process_start` pair into one row.
- **Impact:** Rendered timeline shows `start` where `process_start` occurred; distinct lifecycle events under-counted. Operator gets a wrong/under-counted milestone path.
- **Fix:** Same exact-last-segment matcher as T-1 — order-independent, deterministic.

### T-3 · MEDIUM · Crash on non-string/missing `ts` — `.localeCompare` on undefined/number — `:54`
- **Repro:** event missing `ts` → milestone `ts:undefined` → `a.ts.localeCompare` throws `Cannot read properties of undefined`; `{ts:1}` → `localeCompare is not a function`. Line 59 `b.lastTs.localeCompare` same exposure. Both are valid JSON, so the `readTelemetry` JSON.parse try/catch (line 27) does not shield them.
- **Impact:** One malformed-but-valid-JSON event (writer bug, partial event, numeric ts) crashes the whole cockpit instead of degrading — gate does not fail closed on bad event shape.
- **Fix:** `String(e.ts ?? '')` for milestone/first/last ts; sort with `(a,b)=>String(a.ts).localeCompare(String(b.ts))` (lines 54, 59). Better: `Date.parse` once with `NaN→0`, sort numerically.

### T-4 · MEDIUM · Unbounded full-file read of append-only unrotated log → OOM at scale — `:27`
- **Repro:** `fs.readFileSync(file,'utf8').split('\n').filter(Boolean).map(JSON.parse)` loads the entire file, then the full line array, then every event object at once. Live `originator-telemetry.jsonl` is 6.0MB / 10,688 events in ~11 hours, no rotation; measured RSS 80MB.
- **Impact:** The cockpit only ever needs the most-recent N traces (default 12) yet ingests all history. As the append-only log grows over days/weeks it will hit V8 string/heap limits and crash the read — the read-only tool fails on its own growing substrate and slows every run. (Three lenses low; class is real CWE-400, kept medium for the growth trajectory.)
- **Fix:** Read only the tail — seek to `max(0, size - CAP)`, drop the first partial line, parse the rest; cap CAP (~8MB); pair with writer-side rotation. Document that older runs aren't shown.

### T-5 · LOW · Crash in renderCockpit on non-string `traceId` — `:71`
- **Repro:** `{ts:'...', traceId:12345, phase:'worker.start', data:{}}` (valid JSON) → `summarizeByTrace` keeps the number (`e.traceId || 'unknown'` passes truthy numbers) → `t.traceId.slice(-28)` throws `slice is not a function`.
- **Impact:** A numeric/boolean `traceId` in any single event crashes the human render path. traceIds are normally string-shaped → low.
- **Fix:** `const id = (typeof e.traceId === 'string' && e.traceId) ? e.traceId : 'unknown';` at line 33; and/or `String(t.traceId).slice(-28)` in render.

### T-6 · LOW · CLI `--limit` unvalidated — NaN shows zero rows, negative drops last N — `:83`
- **Repro:** `--limit abc` → `parseInt → NaN` → `slice(0,NaN)` = 0 rows, header "showing NaN"; `--limit -5` → `slice(0,-5)` silently omits the 5 most-recent traces; `--limit 0` shows nothing.
- **Impact:** A bad operator flag produces a silently empty/truncated cockpit with no error — could hide active lanes during an incident. Violates fail-closed/surface-errors canon.
- **Fix:** `let n = parseInt(...,10); if (!Number.isInteger(n) || n < 1) { console.error('--limit must be a positive integer'); process.exit(2); }` then clamp `Math.min(n, traces.length)`.

---

## Organ: discovery-precision-gate — `_SYSTEM/Scripts/discovery-precision-gate.mjs`
*Seven defects in the pre-energy-gate that's supposed to block lane claims touching protected/out-of-scope authority. The traversal fail-open is the headline: a `..`-laden path reaches `.env` and PASSES. The lexical gap recurs at four sites (veto, scope, denial, precision metric).*

### D-1 · MEDIUM · Protected-path veto fails OPEN on `../` traversal — `:33`
- **Repro (verified live):** `discoveryPrecisionGate({ paths:['_SYSTEM/Scripts/math/../../../.env'] }, {}) → pass=true, vetoes=[]`. `normalizePath` does split/join + strip `./` but does **not** collapse `..` (yuri-id-bridge.mjs:46–51), so `isProtectedPath` returns false and the veto never fires.
- **Impact:** The gate's whole job is to block claims that touched protected authority before the energy gate. A traversal-laden path sails past protected/denied/scope vetoes — the exact "protected veto fail-open on bad input" mode. Sibling canon `fs-utils` already returns null on `..`-escape; the pattern was not reused. (Three lenses med/low/med.)
- **Fix:** `const abs = path.resolve(REPO_ROOT, rel); if (!abs.startsWith(REPO_ROOT + path.sep)) veto('escapes-repo'); rel = path.relative(REPO_ROOT, abs);`. Add `..`-rejection in `normalizePath` or a `safeRel()` helper. Fail CLOSED on any path not provably in-repo.

### D-2 · MEDIUM · Gate crashes (uncaught TypeError) on non-string path element — `:28`
- **Repro (verified live):** `discoveryPrecisionGate({ paths:[123, null, {}] }, sub)` throws `TypeError: The "path" argument must be of type string`. `{ discoveryFootprint:[null] }` throws `Cannot read properties of null (reading startsWith)` at line 22 (normalizePath(null) returns null, then `rel.startsWith` throws).
- **Impact:** A gate that throws is not fail-closed — it aborts the gating pipeline. If a caller wraps the energy pipeline in try/catch the claim proceeds ungated (fail-open); otherwise the process crashes. Either way a buggy/hostile lane controlling `claim.paths` picks the outcome. No production caller yet caps severity.
- **Fix:** `const toRel = (p) => normalizePath(String(p ?? '')); referenced = [...].map(toRel).filter(Boolean);`. Make `normalizePath` return `''` (not the falsy input) so downstream `startsWith` is always safe.

### D-3 · MEDIUM · inScope() redundant bare-startsWith defeats its own boundary check — `:22`
- **Repro (verified live):** allowed `['_SYSTEM/Scripts/math']`; `{ paths:['_SYSTEM/Scripts/mathEVIL.mjs'] } → pass=true`. Line 22 OR-chains a boundary-aware `rel.startsWith(n+'/')` with a final `|| rel.startsWith(n)` (no separator), so any prefix-sharing sibling is judged in-scope; the `endsWith('/')` logic is dead.
- **Impact:** Out-of-allowed-scope bypass — a lane touches sibling dirs outside its granted authority as long as the name shares a prefix. Contradicts the test's intent ("an out-of-scope claim is vetoed").
- **Fix:** Drop `|| rel.startsWith(n)`. Use `rel === n || rel.startsWith(n.endsWith('/') ? n : n + '/')`.

### D-4 · MEDIUM · Denied-path check uses unbounded startsWith — over-blocks + mis-scores siblings — `:34`
- **Repro (verified live):** denied `['_SYSTEM/Scripts/secret']`; `{ paths:['_SYSTEM/Scripts/secretkeys.mjs'] }` vetoed as `denied-path` though it's a distinct sibling file. Same unbounded startsWith at line 40 drives `precisionScore` — `'_SYSTEM/Scripts/secretly/ok.mjs'` scores 0 against denied `'secret'`.
- **Impact:** Inverse of D-3 — over-eager denial of legitimately-named siblings corrupts both the veto verdict and the `precisionScore` the downstream energy/proof gate consumes. A gate that can't distinguish `secret/` from `secretkeys.mjs` is untrustworthy as a pre-filter.
- **Fix:** `denied.some(d => rel === d || rel.startsWith(d.endsWith('/') ? d : d + '/'))` at lines 34 and 40, after the traversal-canonicalization fix.

### D-5 · MEDIUM · precisionScore gameable — empty footprint always scores perfect 1.0 — `:41`
- **Repro (verified live):** `{ paths:['01_PROJECTS/evil.ts'], discoveryFootprint:[] } → precisionScore=1` even with `pass=false`. A lane scores 1.0 by omitting the footprint while declaring out-of-scope paths.
- **Impact:** `precisionScore` is the advisory signal the energy/proof gate and operator weigh; a lane that wants to look surgical reports an empty footprint and gets a perfect 1.0. Self-declared, uncross-checked footprint is trivially gameable.
- **Fix:** Empty footprint → non-perfect/`unknown` sentinel (`precisionScore=null`, `no-footprint-declared` note), or compute over the union of `claim.paths` + footprint. Flag `footprint.length===0 && referenced.length>0` as suspicious.

### D-6 · MEDIUM · precisionScore counts traversal/absolute paths as in-scope — `:40`
- **Repro (verified live):** `{ discoveryFootprint:['_SYSTEM/Scripts/math/../../../.env'] }, { allowedPaths:['_SYSTEM/Scripts/math'] } → precisionScore=1`. `footIn` tests lexical `!isProtectedPath && inScope && !denied`, so the traversal-to-`.env` entry counts clean.
- **Impact:** Even once D-1's veto is fixed, the reported precision (1.0) tells the energy gate the lane was perfectly surgical while it actually traversed to a protected file — compounds D-1 at the scoring layer.
- **Fix:** Reuse the single canonicalized `safeRel()` helper (from D-1) for both the veto loop and the `footIn` computation so they share one dot-dot-resolved view.

### D-7 · LOW · substrate.allowedPaths/deniedPaths not array-validated — string substrate crashes — `:26`
- **Repro (verified live):** `discoveryPrecisionGate({ paths:['x'] }, { allowedPaths:'_SYSTEM' })` throws `TypeError: (...).map is not a function`. A string is truthy so `|| []` doesn't catch it.
- **Impact:** Malformed config (a single allowed path written as a string rather than a 1-element array — a common authoring mistake) crashes the gate instead of failing closed.
- **Fix:** `const arr = (v) => Array.isArray(v) ? v : (v == null ? [] : [v]); const allowed = arr(substrate.allowedPaths).map(toRel);`

---

## Organ: filing-assessor — `_SYSTEM/Scripts/filing-assessor.mjs`
*Four defects in the owner-facing relocation/purge recommender. The missing protected veto is the standout — and the worst because the report is acted upon: it recommends walking protected/secret files out of their zone.*

### A-1 · HIGH · Protected/secret paths classified filable; report recommends relocating `.claude/state`, `backend/data`, `.env` artifacts out of protected zone — `:34`
- **Repro:** `node filing-assessor.mjs '.claude/state/secret-telemetry.jsonl' 'backend/data/leak.jsonl' '.env.bak'` → `.claude/state/...jsonl → _SYSTEM/state (misplaced ⚠)`, `backend/data/leak.jsonl → _SYSTEM/state (misplaced ⚠)`, `.env.bak → EPHEMERAL (purge candidate)`. `classifyArtifact('.claude/state/x.jsonl').zone === '_SYSTEM/state'`.
- **Impact:** The module's entire purpose is an owner-acted relocation/purge report. It recommends moving a *protected* `.claude/state/` telemetry file into *unprotected, repo-tracked* `_SYSTEM/state/`, and tags `.env.bak`/`backend/data` as purge candidates. If the owner acts, protected and secret-adjacent files are walked out of their protected zone or deleted. The veto it needs (`isProtectedPath`) is exported by the same `yuri-id-bridge.mjs` it already imports `normalizePath` from — `isProtectedPath('.claude/state/x.jsonl')`/`('backend/data/..')`/`('.env')`/`('node_modules/..')` all return true — but it never calls it. Fail-open security gate. One lens high → **high** (acted-upon destructive direction).
- **Fix:** `import { normalizePath, isProtectedPath } from './yuri-id-bridge.mjs';`. In `classifyArtifact`, before the rule loop: `if (isProtectedPath(filePath)) return { kind:'protected', zone:null, protected:true, reason:'protected surface — never a filing candidate' };`. In `assess()`, force `misplaced:false` + surface `protected:true`, excluding these from misplaced/ephemeralInRepo lists.

### A-2 · LOW · Unanchored substring zone matching misroutes outside files INTO the zone — `:30`
- **Repro:** `assess('evil/_SYSTEM/Scripts/path/totally-elsewhere.mjs') → recommendedZone '_SYSTEM/Scripts', misplaced true`; `assess('my02_RESOURCES_notes/thing-spec.md') → '02_RESOURCES/RESEARCH', misplaced true`. Rules use `p.includes('_SYSTEM/Scripts')`/`p.includes('02_RESOURCES')`.
- **Impact:** A file under an arbitrary/typo-named dir is recommended for relocation *into* the real protected tree, flagged `misplaced=true`. Acting collides with/overwrites real scripts or pulls untrusted content into canonical zones. Combined with A-1 this is the move-direction that matters — toward protected zones.
- **Fix:** Normalize first, then `rel === zone || rel.startsWith(zone + '/')` (the idiom `currentZoneOf` already uses at line 50), for all `p.includes` rules (lines 25–31).

### A-3 · LOW · assessAll throws uncaught TypeError on a non-string element, aborting the batch — `:69`
- **Repro:** `assessAll(['...ok.md', null, '...x.mjs'])` → uncaught `TypeError: Cannot read properties of null (reading 'startsWith')` (classifyArtifact:36). `assessAll([123])` → `path must be of type string`. A caller feeding glob/fs.stat results where one entry is null/Dirent kills the whole report.
- **Impact:** One malformed element crashes the batch — no report for any valid path. Violates no-silent-fail/fail-closed-per-input. `assessAll` guards the top level (Array.isArray) but not per-element.
- **Fix:** Top of `classifyArtifact`: `if (typeof filePath !== 'string' || !filePath) return { kind:'invalid', zone:null, reason:'non-string or empty path' };` and/or wrap the per-row map in a try/catch emitting an `{ path:String(p), kind:'invalid', error }` row.

### A-4 · LOW · Overbroad EPHEMERAL `.bak-` regex flags legitimate (tracked) config backups as purge candidates — `:24`
- **Repro:** `classifyArtifact('.claude/settings.json.bak-cwdfix') → zone 'EPHEMERAL', kind 'scratch', 'purge candidate'`. This file currently exists in this repo's git status. `/\.bak-/.test(name)` matches `.bak-` anywhere.
- **Impact:** Deliberate named config backups (a common pattern, present in this repo) are reported as ephemeral purge candidates; acting deletes intentional safety backups.
- **Fix:** Anchor the suffix `/\.bak(-[\w.]+)?$/`; treat `.bak-` ephemeral only as a trailing token; gate any purge behind A-1's protected veto and require an explicit `/tmp/` location for repo-resident files.

---

## Organ: yuri-decode — `_SYSTEM/Scripts/yuri-decode.mjs`
*Two defects in the decode instrument. The prototype-chain corruption is the standout — silent type-confusion on an extremely common token.*

### Y-1 · MEDIUM · Frequency map inherits Object.prototype — token `'constructor'` corrupts its own count into a string — `:28`
- **Repro (verified live):** `decode('constructor constructor').frequency.constructor === 'function Object() { [native code] }11'` (a **string**, typeof `'string'`). `const freq = {}` (line 27) inherits Object.prototype; `'constructor'` survives `rawTokenize`, so `freq['constructor']` reads the inherited native function (truthy), and `(freq[tok] || 0) + 1` becomes `nativeFn + 1` = string concat.
- **Impact:** Silent type corruption of the documented frequency-count contract. Any text containing "constructor" (extremely common in code/technical decode input — this instrument's whole purpose) returns a non-numeric, monotonically-wrong count. Downstream LLM reasoning over `featureSurface`/`frequency` receives a string where it contractually expects a number — type-confusion the consumer can't detect. (`valueOf`/`hasOwnProperty`/`toString` are neutralized only incidentally by lowercasing; `constructor` is the live reachable landmine.)
- **Fix:** `const freq = Object.create(null);` (line 27) — no inherited `constructor`/`__proto__`/`valueOf`. Same defense as the corpus's `merge-patch.proto-pollution.test.ts`. Verify: `decode('constructor').frequency.constructor === 1`.

### Y-2 · LOW · Numerology channels silently truncate at 200k chars while `length` reports full size — two texts collide — `:33`
- **Repro:** `A = 'a'.repeat(199999)+' zzz'+'a'.repeat(100000); B = 'a'.repeat(199999)+' zzz'`; `decode(A).numerology.gematria === decode(B).numerology.gematria` (both 2332495878) yet `decode(A).length=300003` vs `decode(B).length=200003`. `nexus-numerology` MAX_CHARS=200000 slices before hashing (line 27).
- **Impact:** For >200k-char inputs the numerology block no longer corresponds to the full text it claims to represent, and two materially-different long texts produce identical numerology — silently, alongside a full-length `length` and full token set with no truncation marker. Advisory channels + only >200k inputs → low.
- **Fix:** Add a deterministic flag `numerologyTruncated: t.length > 200000` to the numerology block, and/or export MAX_CHARS so yuri-decode can annotate the surface. At minimum document the cap in the decode JSDoc. The consumer must be able to see the numerology no longer matches `length`.

---

## Residual risk / verification notes
- **Verified live this session (5/30):** D-1 traversal (`pass:true, vetoes:[]`), T-1/T-2 module shape (exports = `readTelemetry,renderCockpit,summarizeByTrace`; helpers internal), B-1 rung-skip (`ok:true, owner-approved`), O-1 dup-id (`[]`), Y-1 prototype (`typeof 'string'`), plus F-1 classifier (`inhibitory → INFORMATION 'bit'`). The remaining 24 carry deterministic repros from the corpus and were not independently re-run.
- **Severity philosophy:** "no production caller yet" caps several governance/classifier items at medium — real defect, latent blast radius. Re-rate to high the moment any of these gates is wired into the live energy/promotion pipeline.
- **Single highest-leverage fix:** add a canonical `safeRel(REPO_ROOT, p)` helper that resolves `..`, proves in-repo, and returns null/throws on escape — then route D-1, D-3, D-4, D-6, A-1, A-2 (and the `normalizePath` callers) through it. One helper closes the largest cluster.
