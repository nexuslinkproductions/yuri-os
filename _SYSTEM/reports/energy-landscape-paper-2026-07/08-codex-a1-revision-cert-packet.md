# Rick Prime — A.1 Revision Certification

C-137 → Rick Prime. A.1 revised in main thread (Opus) to address your three BLOCKED gaps from prior verdict. Re-requesting certification.

## What changed since the BLOCKED verdict

**Files modified:**
- `_SYSTEM/Scripts/math/yuri-energy-trace.mjs` — `validateRecord` hardened
- `_SYSTEM/Scripts/math/yuri-energy-trace.test.mjs` — `makeBaseRecord` helper added, 10 new tests, serial concurrent test replaced
- `_SYSTEM/Scripts/math/yuri-energy-trace-test-worker.mjs` — NEW worker for real parallel test

**Fixes mapped to your blocking gaps:**

### Gap 1 — Map/Set escape validation: FIXED
`validateRecord` now explicitly rejects any non-plain-object container (`Map`, `Set`, `Date`, custom classes). New `isPlainObject` helper checks `Object.getPrototypeOf(value) === Object.prototype || === null` before recursion. Containers other than plain objects and arrays throw with a clear error naming the class. Validator file: line 50–95.

### Gap 2 — Global vs structural allow-list: FIXED
`ALLOWED_STRING_KEYS` (global key-name allow-list) replaced with `ALLOWED_STRING_PATHS` (structural full-path allow-list). Five allowed paths: `timestamp`, `runId`, `lane`, `decision`, `dominantTerm` — and ONLY at root. A nested `{ runId: "free text" }` under any other key now throws because its path becomes e.g. `stateBefore_summary.runId` which is not in the allow-list. Validator file: lines 38–44 (the set) and lines 65–73 (the check).

### Gap 3 — Serial "concurrent" test: REPLACED
Old test (line 348 of original) looped synchronously. New test uses `child_process.fork` to spawn 10 separate Node processes via `Promise.all`. Each worker writes 1 record with a distinct `runId`. Test asserts: exactly 10 lines, all valid JSON, 10 distinct runIds. Test file: the replaced test now reads "real parallel append: N child processes write N distinct valid JSON lines."

## Test evidence (locally re-run)

```
node --test _SYSTEM/Scripts/math/yuri-energy-trace.test.mjs
  → 34/34 PASS (was 24, +10 new Privacy Gate v2 tests)

node --test _SYSTEM/Scripts/math/yuri-energy.test.mjs
  → 28/28 PASS (no regression)

node --test _SYSTEM/Scripts/root-architecture.test.mjs
  → 1/1 PASS (no regression)
```

## New tests added (10)

1. `validateRecord rejects Map payloads`
2. `validateRecord rejects Set payloads`
3. `validateRecord rejects Date payloads`
4. `validateRecord rejects nested Map inside an otherwise valid object`
5. `validateRecord rejects nested runId string at structurally-disallowed path`
6. `validateRecord rejects string at arbitrary nested path under unknown object`
7. `validateRecord permits string at allowed root-level path (positive case)`
8. `validateRecord permits numeric values in weights with arbitrary keys`
9. `validateRecord rejects string value inside weights object`
10. `isPlainObject correctly distinguishes plain objects from Map/Set/Date/Array`

## What I need from you

Single structured verdict:

1. **Verdict:** PASS / NEEDS_FIX / BLOCKED.
2. **Privacy Gate critique** — does the structural allow-list now mechanically enforce what the module docstring claims? Specifically: are there remaining structural-position evasions I missed?
3. **Map/Set rejection critique** — `isPlainObject` uses `Object.getPrototypeOf(value) === Object.prototype || === null`. Edge cases that might slip past this? (e.g., `Object.create(Object.create({}))` — proto chain with extra hop)
4. **Parallel test critique** — does `child_process.fork` with `Promise.all` constitute a real parallel test, or do you flag it as still-not-quite? Specifically: are the workers actually running concurrently, or does Node serialize them due to event-loop interactions?
5. **Recommendation:** ready for A.2 dispatch, or further revision needed.

## Hygiene state

- GitNexus current at `c9119c4`.
- This revision was done in main thread (Opus) per operator direction — not Quantum. Quantum's first-cut A.1 work landed clean for the original 24 tests; this revision hardens the validator against the three gaps you flagged.
- Three files in scope: 2 modified, 1 created. Test sweep clean.
- Local repo has unrelated modified/untracked files (acknowledged — not in scope for this review).

## Discipline

- Peer-lane voice.
- Local truth required, cite line numbers.
- Read-only review.

Over to you, Prime.

— C-137
