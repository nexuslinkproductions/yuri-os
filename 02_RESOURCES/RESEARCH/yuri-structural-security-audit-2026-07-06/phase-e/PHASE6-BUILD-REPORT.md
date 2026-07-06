# PHASE 6 BUILD REPORT — SEC-2 taint + SEC-5 unattended profile + residual credential paths (2026-07-06)

**Scope:** `_SYSTEM/Scripts/voice/yuri-z-brain.py` + `_SYSTEM/Scripts/policy/yuri-safety-core.mjs`.
Builds on SEC-1/3/4 (already shipped, see `phase-e/SEC-BUILD-REPORT.md`). Findings source:
`FABLE-AUDIT-SYNTHESIS.md` §1 (SEC-2, SEC-5) + owner control-packet ("THE THREE BUILDS").

## (A) Residual credential paths (additive, both denylists)

**`yuri-safety-core.mjs`:**
- `PROTECTED_TARGETS`: added `~/.config/gcloud` (dir), `~/.kube` (dir), `~/.gnupg` (dir), `~/.config/op`
  (dir, 1Password CLI), `~/.config/1Password` (dir), `~/.config/gh/hosts.yml` (file, gh CLI token store).
- `PROTECTED_LITERAL_PATTERNS`: `homeRelativePattern()` mirrors for all six, matching the same three
  surface forms (`~/...`, `$HOME/...`, shell-expanded absolute) the existing SEC-4 patterns use.
- **New pattern class — private-key material ANYWHERE by name**, not scoped to `~/.ssh/`: a raw regex
  matching `id_rsa`/`id_ed25519`/`id_ecdsa`/`id_dsa`(`.pub` too) and `*.pem`/`*.p12` as bare filename
  tokens, regardless of directory. A backup/download copy of a key living outside `~/.ssh/` is exactly
  the gap the owner packet named, and the existing path-prefix denylist structure can't express
  "this filename, anywhere" — required a new pattern shape, not just new entries.

**`yuri-z-brain.py`** (`PROTECTED` tuple): added the six new HOME-relative stores via
`os.path.expanduser("~")`, plus `id_ed25519`/`id_ecdsa`/`id_dsa`/`.pem`/`.p12` as bare substrings
(`id_rsa` was already substring-matched anywhere — pre-existing, confirmed by reading the tuple before
editing). Substring match already gives "anywhere by name" for free in this file's model (no regex
needed), unlike the JS side.

**Verified live** (runtime import + `evaluateToolCall`, not just `node --check` static parse — the
prior SEC-4 pass caught a runtime-only regex bug that static parse missed, so this pass re-ran the same
discipline): `cat ~/.config/gcloud/credentials.db`, `~/.kube/config`, `~/.gnupg/secring.gpg`,
`~/.config/op/config`, `~/.config/1Password/1password.sqlite`, `~/.config/gh/hosts.yml`, a key file
named `id_rsa`/`id_ed25519.pub` living in `/tmp/backup/` (outside `~/.ssh/`), and `foo.pem`/`foo.p12` in
an arbitrary repo-relative path — all DENY. `git status` / `ls -la /tmp` — ALLOW, no false positive.

## (B) SEC-2 — taint-track untrusted content (`yuri-z-brain.py`)

**Mechanism (minimal, as specified — a counter + a set-membership check, no provenance graph):**
- `_TAINT_WINDOW` (env `YURI_Z_TAINT_WINDOW`, default 3) — N tool-call slots the taint covers.
- `_TAINT_SOURCE_TOOLS = ("read_doc",)` — tools whose OUTPUT is untrusted content.
- `_TAINT_ADJACENT_TOOLS = ("bash", "write_file", "edit_file", "applescript", "gui_script", "conductor_send")`
  — the critical-adjacent set that escalates while taint is active.
- `_taint_mark()` — called from `_exec_tool`'s `read_doc` branch right after the doc actually reads
  (not at classification time), arming the module-level `_taint_remaining` counter.
- `_taint_consume_if_adjacent(name)` — called during classification in `_run_agent_loop`; decays the
  counter by 1 and returns True only for a taint-adjacent tool while the window is active. A
  non-adjacent tool (read_file, xref, remember, screenshot, morning_brief, usage_status) does NOT
  spend the window, so an interleaved read-only follow-up doesn't waste the taint before the actually
  risky call arrives.
- Folded into `_run_agent_loop`'s existing critical-call classification as an additional `or` term,
  independent of `_is_critical_call`'s regex verdict — this is the exact wiring point SEC-2 named
  ("escalate the NEXT critical-adjacent tool call... regardless of the regex verdict").
- Spoken reason: the confirm text now names WHY when the escalation came from taint — *"That follows
  reading an external document, so I'm confirming first."* — distinct from the generic confirm line,
  per the packet's "speak a clear reason" instruction.

**In-process only, does not persist to disk** (unlike `PENDING_FILE`) — a fresh process should start
untainted, and the window must decay on its own after N slots rather than staying primed forever.

## (C) SEC-5 — unattended profile + cumulative-risk counter (`yuri-z-brain.py`)

**Reduced-capability unattended profile:**
- `UNATTENDED = os.environ.get("YURI_Z_UNATTENDED", "0") == "1"` — default OFF.
- `_UNATTENDED_DENY_BY_DEFAULT = ("bash", "write_file", "edit_file", "applescript", "gui_script", "conductor_send", "spawn_worker")`
  — the mutating/outward-facing set named in the packet. `spawn_worker` is included: it opens a NEW
  worker terminal that itself gets full capability, which is exactly the unattended
  capability-expansion SEC-5 is meant to prevent — leaving it allowed would make the reduction
  meaningless (spawn a worker, have IT do the denied thing).
- `_UNATTENDED_ALWAYS_ALLOWED` — `read_file`, `read_doc`, `xref`, `remember`, `screenshot`,
  `morning_brief`, `usage_status` stay allowed (can't mutate or reach outward).
- `_unattended_allowlist()` parses `YURI_Z_UNATTENDED_ALLOW` (comma-separated) for an explicit,
  per-run override — e.g. `YURI_Z_UNATTENDED_ALLOW=bash,write_file` permits a scoped overnight batch
  job without disarming the whole reduced profile.
- `_unattended_block_reason(name)` is called at the TOP of `_exec_tool`, before any other gate or IO —
  cheapest possible refusal, and it fires before the inline safety-floor / SEC-1 unified-gate checks
  even run (denying earlier can only narrow behavior further, never bypass those gates).
- Refusal is a clear, spoken-ready string naming the exact env var to set to permit it.

**Session cumulative-risk counter:**
- `_RISK_THRESHOLD` (env `YURI_Z_RISK_THRESHOLD`, default 4), `_RISK_DECAY_CALLS` (env
  `YURI_Z_RISK_DECAY_CALLS`, default 10) — an integer score + linear decay, in-process, reset per
  session (module state, same scope as the taint window — not persisted to disk).
- `_RISK_WEIGHTS` — `new_file` (1.0), `chmod` (1.5), `out_of_repo_read` (1.0), `critical_passed` (1.0).
  These are the concrete chain steps the packet named (new file → chmod +x → LaunchAgent) plus an
  approved-critical-action bump, since an approved action still compounds session risk.
- `_risk_bump(kind)` called from `_exec_tool` at the point each notable action actually RUNS: a
  brand-new `write_file` target (checked via `os.path.exists` before write), a `bash` command matching
  `\bchmod\b`, a `read_file` whose resolved path lands outside the repo root, and (from `run_brain`'s
  confirm-execution path) a confirmed critical action.
- `_risk_tick()` called once per dispatched tool call (any kind) to advance the decay clock even on
  calls that don't themselves bump risk — otherwise a risk-bumping session would never decay.
- `_risk_escalated()` folded into `_run_agent_loop`'s classification as a THIRD `or` term (after regex,
  after taint) — the next dispatched call escalates once the threshold is crossed, even though that
  call alone looks routine by every other signal. Spoken reason: *"A few notable things have stacked
  up this session, so I'm confirming this one first."*

## Bug found and fixed during self-verification (adversarial attack on my own build)

**SAME-BATCH TAINT BYPASS (real, confirmed, fixed before shipping):** the packet asked "can taint be
bypassed by interleaving a benign tool between read_doc and the malicious call?" — the interleaved-tool
case is NOT a bypass (verified: a non-adjacent tool between them doesn't spend the window; the first
adjacent tool after `read_doc`, whenever it arrives across iterations, is still caught). But probing the
adjacent question surfaced a REAL gap: a model emitting `read_doc` AND a critical-adjacent tool in the
**same** response (same `tool_uses` batch, same loop iteration) bypassed the cross-iteration counter
entirely. Root cause: `_taint_mark()` only fires when `read_doc` actually EXECUTES inside `_exec_tool`
— which happens AFTER the whole batch is classified in `_run_agent_loop` (classification runs once per
iteration, before any of that iteration's tools are dispatched). So a same-batch companion call was
classified while `_taint_remaining` was still 0, then both tools ran together in the same "no critical
calls" execution branch.

Verified with a live spy on `_exec_tool` through the REAL `_run_agent_loop` (not just the unit-level
taint functions) using a payload with zero destructive/critical regex tokens
(`echo pwned-marker >> /tmp/proof.txt`) to isolate the taint mechanism from the pre-existing
`_DESTRUCTIVE` hard-block — confirmed the bash call executed unheld before the fix.

**Fix:** added a same-batch look-ahead in the classification loop — if a taint-SOURCE tool
(`read_doc`) appears earlier in the SAME batch (in model-emitted order) before an adjacent tool, treat
that adjacent tool as tainted too, independent of and in addition to the persistent cross-iteration
`_taint_remaining` counter. `or` short-circuits so the persistent window isn't ALSO spent when the
same-batch signal alone already caught it — the two mechanisms compose rather than double-charge.
Re-verified: the same attack payload now holds for confirmation with the correct taint-reason text; a
new regression test (`test_yuri_z_brain.py` K1d) locks this in through the real agent loop, not just
the standalone taint helpers.

## Phase-6 security matrix — results

All run via `test_yuri_z_brain.py` Section K (44 new checks after the fix — 48 total counting K1d's
sub-checks) plus direct `evaluateToolCall`/`_is_protected` probes:

| Case | Expected | Result |
|---|---|---|
| TAINT: benign bash right after `read_doc` (cross-iteration) | escalates | PASS |
| TAINT: window decays after N slots, normal classification resumes | PASS | PASS |
| TAINT: non-adjacent tool (read_file) doesn't spend the window | preserved | PASS |
| TAINT: SAME-BATCH read_doc + regex-invisible bash | escalates (bug found + fixed) | PASS |
| TAINT: same-batch hold speaks the taint reason + stores correct pending action | PASS | PASS |
| UNATTENDED: bash/write_file/edit_file/applescript/gui_script/conductor_send/spawn_worker denied by default | DENY (7/7) | PASS |
| UNATTENDED: read_file/read_doc/xref/remember/screenshot/morning_brief/usage_status allowed | ALLOW (7/7) | PASS |
| UNATTENDED: allowlist override re-permits a named tool, does not blanket-permit others | PASS | PASS |
| UNATTENDED: gate is a no-op with the flag unset (module default) | inert | PASS |
| CUMULATIVE: N notable actions cross threshold → next action escalates | PASS | PASS |
| CUMULATIVE: single notable action alone (below threshold) does not escalate | PASS | PASS |
| CUMULATIVE: escalation signal independent of regex verdict | PASS | PASS |
| CUMULATIVE: score decays after enough quiet ticks | PASS | PASS |
| NEW CREDS: gcloud/kube/gnupg/op/1Password/gh-hosts + id_ed25519/id_ecdsa/*.pem/*.p12 anywhere | DENY (10/10, both gate + `_is_protected`) | PASS |
| NO REGRESSION: attended + no taint + low risk → routine work unaffected | PASS | PASS |
| NO REGRESSION: unattended gate inert by default | PASS | PASS |

**Test suites:** `test_yuri_z_brain.py` 138/141 (same 3 pre-existing failures as the SEC-1/3/4 baseline
— `write_file is critical`, `edit_file is critical`, `bash rm is critical` — confirmed identical to the
`git show HEAD` baseline before this session's edits, not introduced by Phase 6).
`test_jarvis_memory.py` 35/35, no change. `node --check` and Python `ast.parse` both clean. Brain module
imports cleanly with all new flags defaulting OFF (`UNIFIED_GATE=False`, `UNATTENDED=False`,
`_taint_remaining=0`, `_risk_score=0.0`) — confirmed via fresh `importlib` load. Live end-to-end runs
through the real `_run_agent_loop` (not just unit-level function calls) confirm both the taint
escalation and the unattended deny fire at the actual dispatch seam.

## Residual risk / gaps NOT covered (adversarial self-check, named without being asked twice)

- **`fetch_url`/web/screen-reader tools do not exist yet** — `_TAINT_SOURCE_TOOLS` is scoped to
  `read_doc` only, per the packet's "and any future fetch_url/web/screen tool" framing. When one of
  those ships, it MUST be added to `_TAINT_SOURCE_TOOLS` explicitly — this is not automatic, and a
  future contributor could easily forget to wire a new untrusted-content tool into the taint set.
- **Taint window is a blunt N-slot counter, not per-content-provenance.** A model that reads a
  document, does 3 unrelated adjacent actions Marcel actually wants, then (window exhausted) sneaks
  the injected action on slot 4 is not caught — SEC-2 explicitly scoped this to "minimal, no
  provenance graph," so this is an accepted, named tradeoff, not an oversight.
  `YURI_Z_TAINT_WINDOW` is tunable if 3 proves too short/long in practice.
- **The unattended deny list is a fixed 7-tool enumeration.** A new tool added to `TOOLS` in the future
  that is mutating/outward-facing will NOT be auto-denied under `YURI_Z_UNATTENDED=1` unless someone
  remembers to add it to `_UNATTENDED_DENY_BY_DEFAULT` — same class of gap as the taint-source list.
  Recommend: a lint/test that asserts every tool in `TOOLS` is classified into exactly one of
  `_UNATTENDED_DENY_BY_DEFAULT` / `_UNATTENDED_ALWAYS_ALLOWED` so a forgotten addition fails loudly
  instead of silently defaulting to allowed. Not built here — out of the packet's named scope, flagging
  for a follow-up.
- **`conductor_create`/`conductor_draft`/`conductor_list`/`conductor_peek`/`open_app` are not named by
  either the taint-adjacent set or the unattended deny set.** `conductor_create` opens a new session
  (capability-adjacent to `spawn_worker`, which IS denied) and `open_app` can launch arbitrary
  applications — these were not in the packet's explicit lists, so I did not expand scope unilaterally,
  but they are a plausible gap for the SAME reasons `spawn_worker` was included. Flagging honestly
  rather than silently leaving them out of the report.
- **The cumulative-risk weights (`new_file`=1.0, `chmod`=1.5, etc.) and threshold=4 are a first-pass
  calibration, not empirically tuned.** A real overnight run generating many legitimate new files
  (e.g. a build lane) could hit the threshold on entirely benign work and start escalating routine
  calls. This is the classic false-positive/false-negative tradeoff of any threshold-based detector;
  `YURI_Z_RISK_THRESHOLD`/`YURI_Z_RISK_DECAY_CALLS` are tunable envs specifically so the owner can
  recalibrate after observing real sessions rather than guessing correctly on the first pass.
- **Risk-bump detection is pattern-based, not exhaustive.** `chmod` detection is a regex substring on
  the bash command; a chmod invoked through an indirect wrapper script (not literally containing the
  word `chmod`) would not bump risk. Same class of limitation as any regex-based classifier elsewhere
  in this file — consistent with the existing `_CRITICAL_BASH` design, not a new weakness introduced
  here.
- **None of Phase 6 touches the SEC-1 unified gate's arming state** — `UNIFIED_GATE` remains
  independently DISARMED-by-default from the prior build; Phase 6's mechanisms all layer on top of
  whichever gate (inline-only or unified) is currently active, per the "additive, fail-closed" packet
  constraint.

## Arming instructions (owner-gated per Self-Governance Charter)

- **(A) Residual credential paths are LIVE now**, no arming needed — additive denylist hardening on
  existing enforcement paths, same class as the prior SEC-4 patch.
- **(B) SEC-2 taint tracking is LIVE now, unconditionally** — it has no disarm flag by design (the
  packet did not ask for one, and a taint mechanism that defaults off provides zero protection against
  the exact threat model it targets). It only ever ADDS an escalation on top of the existing gate;
  it cannot lift a block the regex classifier or the inline safety floor already raised.
- **(C) SEC-5 unattended profile is DISARMED by default.** To arm: set `YURI_Z_UNATTENDED=1` in the
  voice-brain's environment before an overnight/unattended run. Optional: `YURI_Z_UNATTENDED_ALLOW`
  (comma-separated tool names) to permit specific overnight tasks without disarming the whole profile.
- **(C) SEC-5 cumulative-risk counter is LIVE now, unconditionally** — same reasoning as taint: a
  disarm flag would defeat the purpose of a background safety-net that's supposed to catch what
  per-call classification misses. Tunable via `YURI_Z_RISK_THRESHOLD`/`YURI_Z_RISK_DECAY_CALLS` if the
  default calibration proves too sensitive or too lax in practice.
- None of this weakens anything: the inline floor / SEC-1 unified gate (when armed) still run first
  and unconditionally; taint, risk, and the unattended profile can only ADD refusals or escalations,
  never lift ones already raised by an earlier layer.

## Files changed

- `_SYSTEM/Scripts/policy/yuri-safety-core.mjs`
- `_SYSTEM/Scripts/voice/yuri-z-brain.py`
- `_SYSTEM/Scripts/voice/test_yuri_z_brain.py` (Phase-6 regression matrix, Section K)

## Rollback

All three files are tracked; `git checkout -- _SYSTEM/Scripts/policy/yuri-safety-core.mjs _SYSTEM/Scripts/voice/yuri-z-brain.py _SYSTEM/Scripts/voice/test_yuri_z_brain.py` reverts fully.
