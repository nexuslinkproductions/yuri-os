# Quantum Rick Packet — A.1 Revision (Address Codex BLOCKED Verdict)

**Status:** revision packet
**Drafted by:** Claude (Opus, main thread)
**Predecessor:** A.1 first cut landed (24/24 tests pass) but Codex final-pass returned BLOCKED with three specific gaps.
**Codex verdict:** [_SYSTEM/reports/codex-final-pass/2026-05-28T19-54-05-498Z_06-codex-a1-final-pass-packet/last-message.txt](../../codex-final-pass/2026-05-28T19-54-05-498Z_06-codex-a1-final-pass-packet/last-message.txt)

---

## CLAUDE CONTROL PACKET

### Goal

Address the three blocking gaps Codex identified in A.1's Privacy Gate validator and concurrency test. After revision, the validator must mechanically enforce what the module header documents, and the concurrent-append test must actually test concurrent writes.

### Target files (modify, do not create)

- `_SYSTEM/Scripts/math/yuri-energy-trace.mjs` — validator hardening
- `_SYSTEM/Scripts/math/yuri-energy-trace.test.mjs` — replace serial concurrent test with real parallel test, add Map/Set rejection tests, add structural-position tests

### The three blocking gaps (verbatim from Codex)

**Gap 1 — Map/Set payloads escape validation.**

> `Object.entries(node)` at line 70 returns no entries for `Map` and `Set`. A `Map([['promptText', 'secret']])` and `Set(['secret'])` both passed my negative probe.

**Fix:** Before recursing via `Object.entries`, check if the value is a `Map`, `Set`, or other non-plain-object. Either:
- (a) Throw immediately on any non-plain-object container that's not Array — the spec doesn't support them
- (b) Enumerate via the container's own iteration protocol (`map.values()`, `set.values()`) and validate each value

Recommendation: option (a). The spec is "plain objects + arrays + primitives." Explicit rejection of Map/Set/custom-class containers is cleaner than partial support.

**Gap 2 — Allowed string keys are global, not structural.**

> Line 73 checks only the local key name, not structural position. A nested `{ runId: "free text" }` under an arbitrary object would pass.

**Fix:** Replace the global allow-list with a structural allow-list. At each recursion depth, the validator knows its path. Allowed string-typed fields by path:

- **Root level:** `timestamp`, `runId`, `lane`, `decision`, `dominantTerm`
- **`weights` object:** any key is allowed, but values must be numeric
- **`componentContributions` object:** any key is allowed, values must be numeric
- **`componentDeltas` object:** any key is allowed, values must be numeric
- **`stateBefore_summary` object:** all leaf values must be numeric — no strings at any depth
- **`stateAfter_summary` object:** same as stateBefore_summary
- **Anywhere else (e.g., nested object that doesn't match these paths):** no string values permitted

Implementation pattern: pass a `currentPath` argument through recursion (e.g., `["root", "stateBefore_summary", "evidence_age_stats"]`). The validator checks the path against the structural allow-list to decide whether a string at this position is permitted.

**Gap 3 — "Concurrent append" test is actually serial.**

> Test at line 348 calls `appendTrace` synchronously in a loop. Not parallel.

**Fix:** Use `node:child_process.fork` (or `worker_threads`) to spawn N child processes, each appending 1 record to the same file. Use `Promise.all` to wait for all completions. Parse the resulting file as JSONL. Assert exactly N valid records, all distinct, no partial lines, no interleaved bytes.

Suggested implementation:

```js
// In the test:
import { fork } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const workerPath = path.join(__dirname, 'energy-trace-test-worker.mjs');

test('appendTrace handles real concurrent writes from multiple processes', async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'energy-trace-parallel-'));
  process.env.YURI_STATE_DIR = tmpDir;
  const N = 10;
  await Promise.all(Array.from({length: N}, (_, i) => new Promise((resolve, reject) => {
    const child = fork(workerPath, [String(i), tmpDir]);
    child.on('exit', (code) => code === 0 ? resolve() : reject(new Error(`worker ${i} exit ${code}`)));
  })));
  const date = new Date().toISOString().slice(0, 10);
  const file = path.join(tmpDir, 'energy-trace', `${date}.jsonl`);
  const lines = fs.readFileSync(file, 'utf8').trim().split('\n');
  assert.equal(lines.length, N, `expected ${N} lines, got ${lines.length}`);
  for (const line of lines) {
    const record = JSON.parse(line); // throws if malformed
    assert.ok(record.runId);
  }
  const runIds = new Set(lines.map((l) => JSON.parse(l).runId));
  assert.equal(runIds.size, N, 'each worker should write a distinct runId');
});
```

The worker file (`energy-trace-test-worker.mjs`) is small — accepts `runId` and `tmpDir` from argv, calls `appendTrace` with a synthetic record, exits 0.

### Constraints

- **Do not change** the public exports of `yuri-energy-trace.mjs` (`validateRecord`, `buildTraceRecord`, `appendTrace`, `traceGateEvaluation`). Internal helper functions may be added/refactored.
- **Validator must remain pure.** No side effects, no I/O.
- **Backward-compatible behavior on already-valid records.** Any record that passed the old validator must still pass the new one, unless it was passing due to one of the three flagged gaps.
- **Test count increases.** Old 24 tests stay (some may be modified, none deleted unless explicitly redundant). New tests added for: Map/Set rejection at multiple recursion depths, structural-position checks (nested `runId` must fail), real parallel concurrent test.

### Acceptance criteria

1. `Map` rejection test passes — appending a record containing a `Map` value throws.
2. `Set` rejection test passes — appending a record containing a `Set` value throws.
3. Structural-position test 1 passes — `{ ...validRecord, stateBefore_summary: { runId: "free text" } }` throws.
4. Structural-position test 2 passes — `{ ...validRecord, someUnknownObject: { runId: "free text" } }` throws.
5. Structural-position test 3 confirms intended-allowed paths still pass — `{ ...validRecord, weights: { alpha: 1.0, beta: 2.0 } }` does not throw.
6. Real parallel concurrent test passes — 10 child processes write 10 distinct records, file contains exactly 10 valid JSON lines.
7. All previously-passing tests still pass.
8. No regressions: `node --test _SYSTEM/Scripts/math/yuri-energy-trace.test.mjs _SYSTEM/Scripts/math/yuri-energy.test.mjs _SYSTEM/Scripts/root-architecture.test.mjs` returns all-pass.

### Test command

```bash
node --test _SYSTEM/Scripts/math/yuri-energy-trace.test.mjs && \
node --test _SYSTEM/Scripts/math/yuri-energy.test.mjs && \
node --test _SYSTEM/Scripts/root-architecture.test.mjs && \
echo "ALL PASS"
```

### Rollback boundary

Two modified files. If acceptance fails:
```bash
git checkout _SYSTEM/Scripts/math/yuri-energy-trace.mjs _SYSTEM/Scripts/math/yuri-energy-trace.test.mjs
```

### Route-plan classification

- `lane: quantum-rick`
- `scenario: implementation-revision-substrate`
- `tier: focused-implementation-high-stakes`
- `qualityGate: main-session-review + codex-final-pass-required`
- `codexPolicy: required-final-pass` (same as A.1 first cut — substrate code review remains non-negotiable)

### Adversarial verification (Quantum self-checks before reporting done)

Three failure modes:

1. **Structural allow-list false-positives.** The new structural validator might reject legitimate records that were valid under the old global allow-list. Verification: re-run all 24 original tests; any newly-failing test indicates the allow-list is too restrictive. If found, audit each failure case — either the test was relying on the gap (and should be updated), or the allow-list excludes a legitimate path.

2. **Parallel test flakiness.** Child-process tests can fail intermittently on slow CI or with timing race conditions. Verification: run the parallel test 5 times in sequence; all 5 must pass. If any flake, the test needs additional synchronization.

3. **Map/Set rejection too eager.** Rejecting all non-plain-objects might catch legitimate use cases the spec didn't anticipate. Verification: review the actual record schema fields — are any of them intended to hold Maps or Sets? (They are not, per the schema in 05's "trace record schema" section, but verify by inspection.)

### What Quantum returns

A single message containing:
1. Confirmation of files modified.
2. Test count: original 24 → new total (expected ~28+ with the new tests added).
3. Diff stat scoped to the two modified files.
4. Three adversarial self-check results.
5. Residual risk statement, particularly around the non-blocking Codex concerns (relative vs absolute YURI_STATE_DIR, partial malformed line tolerance).
6. Integration findings.

---

## Notes for Marcel (not in the packet)

- This is the revision cycle that closes the architecturally-correct Codex-review loop. Each round-trip surfaces real issues; that's the discipline working.
- The structural allow-list change is the most architecturally significant fix — it converts the validator from "is this key name allowed somewhere?" to "is this string at this position allowed?" — a genuinely stronger property.
- After this revision lands and Codex re-certifies, A.2 (gate-dispatch wiring in observability mode) dispatches. That's the unlock for B.1 data collection.
- Dispatch command:
  ```bash
  node _SYSTEM/Scripts/rick-tmux-lanes.mjs feed quantum --prompt "Quantum Rick — A.1 revision to address 3 Codex blocking gaps. Packet at _SYSTEM/reports/energy-landscape-paper-2026-07/07-quantum-a1-revision-packet.md. Compact first if needed. Fix: (1) Map/Set escape validation in validateRecord, (2) global vs structural allow-list — implement path-aware validation, (3) replace serial 'concurrent' test with real parallel test via child_process.fork. Run all three test suites for regression check. Apply 3 adversarial self-checks." --execute
  ```
