# Red-team Fix Tracker — 7 organs (2026-06-09)

32 confirmed defects (>=2/3 adversarial lenses). O-1 + timeout-ceiling already fixed natively; remainder routed to Codex, verified locally.

## formula-foundry (6)

- [ ] **F-1** [medium (was high)] `formula-foundry.mjs:56` — classifyDimension uses naive substring includes() — common English words misclassify the dimension, defeating the composition legality gate
      FIX: Match on word boundaries, not raw substrings. Tokenize unitText (split on /[^a-z0-9-]+/) and test keyword membership against tokens, or use anchored regex per keyword: new RegExp(`(^|[^a-z])${esc(kw)}([^a-z]|$)`). The bu
- [ ] **F-2** [medium (was high)] `formula-foundry.mjs:298` — proofPreflightCandidate verdict is fully self-asserted — a card claiming verified-baseline with a bogus kernel binding is reported non-inert and valid
      FIX: In proofPreflightCandidate, when hasBinding is true and the implementedBy references math-kernel.mjs, independently resolve the symbol (import the kernel and assert typeof kernel[sym]==='function') before reporting non-i
- [ ] **F-3** [medium (was high)] `formula-foundry.mjs:289` — wrapAsProofBank hardcodes advisoryOnly:true, which makes validateFormulaBank SKIP assertImplementedBySymbolResolves — the one fail-closed provenance c
      FIX: Do not force advisoryOnly:true in the proof-bank wrapper when the intent is to run the binding check. Either (a) run a second, non-advisory validation pass specifically to fire assertImplementedBySymbolResolves, or (b) a
- [ ] **F-4** [medium] `formula-foundry.mjs:218` — composeOperatorSequences maxBranch silently drops legal successors without setting truncated — completeness claim is unsound
      FIX: Set truncated=true (or a distinct flag like branchTruncated/incomplete) whenever the maxBranch break drops successors, and likewise note when domainFilter/startSet/endSet pruned the space. Surface a per-node or aggregate
- [ ] **F-5** [medium] `formula-foundry.mjs:84` — catalogFormulas swallows JSON parse errors silently — a corrupt/truncated bank file vanishes from the catalog with no diagnostic
      FIX: Collect parse failures into a returned diagnostics/errors array (and/or write to process.stderr) instead of bare `continue`. e.g. catch (e) { skipped.push({ file, error: e.message }); continue; } and include skipped in t
- [ ] **F-6** [low] `formula-foundry.mjs:52` — classifyDimension stringifies arbitrary non-string input via String(x) — object/array units are coerced, not rejected
      FIX: Validate the input type at the boundary: if unitText is neither string, null, nor undefined, return { dimension:'UNKNOWN', witness:null, malformed:true } (or have catalogFormulas record a card-shape warning) rather than 

## foundry-bakeoff (3)

- [ ] **B-2** [high] `formula-foundry-bakeoff.mjs:67` — Gate-record forgery: any truthy non-'demotion' gate value authorizes promotion (no closed-set / no proof binding)
      FIX: Validate gate against a closed set of legitimate gate identifiers (e.g. ALLOWED_GATES = new Set(['math-proof-gate','real-data-bakeoff','counterexample-suite',...])) and require gate to be a string: `typeof r.gate === 'st
- [ ] **B-1** [medium (was high)] `formula-foundry-bakeoff.mjs:72` — promote() never checks current rung — single forged gate record jumps hypothesis straight to owner-approved (ladder rung-skip)
      FIX: Add an adjacency check: promote must require (a) the card's current promotionStatus is the rung immediately below toRung in PROMOTION_LADDER, AND (b) gate records exist for EVERY rung from current+1 through toRung. Compu
- [ ] **B-3** [low (was medium)] `formula-foundry-bakeoff.mjs:80` — demote() silently rewrites an invalid/typo target rung to 'hypothesis' instead of failing closed
      FIX: Fail closed: if !PROMOTION_LADDER.includes(toRung) return { ok:false, reason:`unknown demotion rung: ${toRung}` } and write nothing, rather than defaulting to 'hypothesis'.

## openprocess-pool (4)

- [ ] **O-2** [high] `openprocess-pool.mjs:113` — whatIsUnfinished drops/mis-attributes processes on duplicate id via find() first-match
      FIX: Build an id->process map keyed by the scored identity (e.g. index by array position carried through openMass, or `const byId = new Map(); for(const p of processes) if(!byId.has(p.id)) byId.set(p.id,p)` plus an explicit d
- [x] **O-1** [medium (was high)] `openprocess-pool.mjs:80` — Unvalidated opts.weights poisons mass with NaN/Infinity and corrupts pool ranking + totals (no silent-fail violation)
      FIX: Validate the merged weights before use: after `const w = {...DEFAULT_WEIGHTS, ...(opts.weights||{})}`, assert every value is a finite number (throw on non-finite/non-number, mirroring math-kernel's assertFiniteNumber). T
- [ ] **O-3** [low (was medium)] `openprocess-pool.mjs:79` — openMass / rankPool / staleness crash on null, undefined, or non-object pool entries (process-crash on malformed input)
      FIX: At the top of openMass: `if (!proc || typeof proc !== 'object') return {id:undefined,type:undefined,mass:0,terms:{...zeroed}}` or throw a single descriptive error; have rankPool filter/validate entries with an explicit i
- [ ] **O-4** [low] `openprocess-pool.mjs:116` — whatIsUnfinished top:0 returns 10 results instead of 0 (falsy default-coalesce bug)
      FIX: Use nullish coalescing and validate: `const n = Number.isInteger(opts.top) && opts.top >= 0 ? opts.top : 10; const top = ranked.slice(0, n);` so an explicit 0 is honored and a non-integer falls back.

## telemetry-cockpit (6)

- [ ] **T-1** [medium (was high)] `lane-telemetry-cockpit.mjs:23` — Milestone suffix-match misclassifies real `revision_complete` phase as `complete` → flips a still-running lane to status=done
      FIX: Stop suffix-matching arbitrary substrings. Match only the exact final dotted segment: `const milestoneOf = (phase) => { const seg = String(phase).split('.').pop(); return MILESTONES.includes(seg) ? seg : null; };`. This 
- [ ] **T-2** [medium] `lane-telemetry-cockpit.mjs:23` — MILESTONES.find returns first endsWith hit → `process_start`/`process_exit` mislabeled as `start`
      FIX: Use the exact-last-segment matcher from finding #1; it returns 'process_start' for 'worker.process_start' deterministically. No reliance on MILESTONES order.
- [ ] **T-3** [low (was medium)] `lane-telemetry-cockpit.mjs:54` — Process crash (uncaught TypeError) when a milestone event has a non-string or missing `ts` — `.localeCompare` on undefined/number
      FIX: Coerce/guard timestamps: store `firstTs/lastTs` and milestone `ts` as `String(e.ts ?? '')`, and sort with a string-safe comparator `((a,b)=>String(a.ts).localeCompare(String(b.ts)))` (line 54 and 59). Better: parse to ep
- [ ] **T-4** [low] `lane-telemetry-cockpit.mjs:71` — Process crash in renderCockpit when `traceId` is a non-string — `t.traceId.slice(-28)` throws
      FIX: Normalize at ingestion: `const id = (typeof e.traceId === 'string' && e.traceId) ? e.traceId : 'unknown';` on line 33, and/or coerce in render: `String(t.traceId).slice(-28)`.
- [ ] **T-5** [low (was medium)] `lane-telemetry-cockpit.mjs:27` — Unbounded full-file read of an append-only, unrotated telemetry log → memory exhaustion / OOM at scale
      FIX: Read only the tail: open the file and read the last ~N MB (or last K lines) since events are append-ordered and render slices to `limit` anyway — e.g. seek to `max(0, size - CAP)` with a fs.read of a bounded buffer, drop
- [ ] **T-6** [low] `lane-telemetry-cockpit.mjs:83` — CLI `--limit` is unvalidated: non-numeric → NaN (silently shows zero rows), negative → silently drops the last N traces
      FIX: Validate after parse: `let limit = parseInt(args[i+1],10); if (!Number.isInteger(limit) || limit < 1) { console.error('--limit must be a positive integer'); process.exit(2); }` and clamp `Math.min(Math.max(limit,1), trac

## discovery-precision-gate (7)

- [ ] **D-1** [medium (was high)] `discovery-precision-gate.mjs:33` — Protected-path veto fails OPEN on ../ traversal — lexical normalizePath never resolves dot-dot, so a footprint can reach .env/node_modules/.claude and
      FIX: Canonicalize before any veto: resolve to an absolute path under REPO_ROOT and reject escapes. e.g. const abs = path.resolve(REPO_ROOT, rel); if (!abs.startsWith(REPO_ROOT + path.sep)) -> veto 'escapes-repo'; then compare
- [ ] **D-2** [medium] `discovery-precision-gate.mjs:28` — Gate CRASHES (uncaught TypeError) on non-string path element — fails open by exception when a lane supplies a number/null/object in paths or discovery
      FIX: Coerce + filter at the boundary: const toRel = (p) => normalizePath(String(p ?? '')); referenced = [...].map(toRel).filter(Boolean); and make normalizePath return '' (not the falsy input) for empty so downstream startsWi
- [ ] **D-4** [medium] `discovery-precision-gate.mjs:22` — inScope() redundant bare-startsWith clause defeats its own boundary check — sibling dirs sharing a name prefix pass scope
      FIX: Drop the trailing `|| rel.startsWith(n)`. Use only: rel === n || rel.startsWith(n.endsWith('/') ? n : n + '/'). Apply the same component-boundary fix to the denied check (next finding).
- [ ] **D-7** [medium] `discovery-precision-gate.mjs:40` — precisionScore counts traversal/absolute paths as in-scope — same lexical gap corrupts the precision metric, not just the veto
      FIX: Reuse the single canonicalized safeRel() helper (from the traversal fix) for BOTH the veto loop and the footIn computation so they share one in-repo, dot-dot-resolved view of every path.
- [ ] **D-3** [low (was medium)] `discovery-precision-gate.mjs:26` — substrate.allowedPaths / deniedPaths not array-validated — string substrate crashes the gate
      FIX: const arr = (v) => Array.isArray(v) ? v : (v == null ? [] : [v]); const allowed = arr(substrate.allowedPaths).map(toRel); const denied = arr(substrate.deniedPaths).map(toRel); — normalize shape before mapping.
- [ ] **D-5** [low (was medium)] `discovery-precision-gate.mjs:34` — Denied-path check uses unbounded startsWith — both over-blocks (false denial) and the precision branch mis-scores siblings
      FIX: Boundary-match denials too: denied.some(d => rel === d || rel.startsWith(d.endsWith('/') ? d : d + '/')) at BOTH line 34 and line 40, after the traversal-canonicalization fix so 'd' and 'rel' are both repo-relative canon
- [ ] **D-6** [low (was medium)] `discovery-precision-gate.mjs:41` — precisionScore is gameable — empty discoveryFootprint always scores a perfect 1.0 regardless of out-of-scope claim.paths
      FIX: Default empty footprint to a NON-perfect / 'unknown' sentinel (e.g. precisionScore=null with a 'no-footprint-declared' note), or compute precision over the UNION of claim.paths + footprint so omitting the footprint canno

## filing-assessor (4)

- [ ] **A-1** [medium (was high)] `filing-assessor.mjs:34` — Protected/secret paths are classified as filable and flagged misplaced — the owner-facing report recommends relocating .claude/state, backend/data, no
      FIX: Import isProtectedPath alongside normalizePath: `import { normalizePath, isProtectedPath } from './yuri-id-bridge.mjs';`. In classifyArtifact, BEFORE the rule loop, fail closed: `if (isProtectedPath(filePath)) return { k
- [ ] **A-2** [low (was medium)] `filing-assessor.mjs:30` — Unanchored substring zone matching (p.includes / regex) misroutes files that live OUTSIDE the real zone INTO it, with misplaced=true
      FIX: Anchor the membership test on path segments, not raw substring. Normalize first, then test `rel === zone || rel.startsWith(zone + '/')` (the same idiom currentZoneOf already uses at line 50) instead of `p.includes(zone)`
- [ ] **A-3** [low (was medium)] `filing-assessor.mjs:69` — assessAll throws an uncaught TypeError and aborts the entire batch report when any element is a non-string (null/number/object)
      FIX: Boundary-validate at the top of classifyArtifact: `if (typeof filePath !== 'string' || !filePath) return { kind: 'invalid', zone: null, reason: 'non-string or empty path — cannot classify' };`. And/or wrap the per-row ma
- [ ] **A-4** [low] `filing-assessor.mjs:24` — Overbroad EPHEMERAL .bak- regex flags legitimate config backups (incl. a real tracked repo file) as purge candidates
      FIX: Tighten the EPHEMERAL test: anchor the .bak suffix (`/\.bak(-[\w.]+)?$/`) and only treat .bak- as ephemeral when it is the trailing token, not embedded. Better, gate any EPHEMERAL/purge recommendation behind the protecte

## yuri-decode (2)

- [ ] **Y-1** [medium] `yuri-decode.mjs:28` — Frequency map inherits Object.prototype — token 'constructor' corrupts its own count into a string
      FIX: Create the frequency map with a null prototype so no inherited key can collide: replace `const freq = {};` (line 27) with `const freq = Object.create(null);`. Object.create(null) has no 'constructor'/'__proto__'/'valueOf
- [ ] **Y-2** [low] `yuri-decode.mjs:33` — Numerology channels silently truncate at 200k chars while length reports full size — two distinct texts collide
      FIX: Surface the truncation rather than swallowing it: add a deterministic flag to the numerology block, e.g. `numerologyTruncated: t.length > 200000`, and/or export MAX_CHARS from nexus-numerology so yuri-decode can annotate

