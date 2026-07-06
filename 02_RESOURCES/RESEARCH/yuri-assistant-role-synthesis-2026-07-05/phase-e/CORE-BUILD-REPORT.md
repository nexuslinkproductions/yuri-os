# Fable Pass-1 Core Build Report — yuri-z-brain.py

Scope: 5 build items in `_SYSTEM/Scripts/voice/yuri-z-brain.py` + one new data file
`_SYSTEM/state/runtime/work-state.json`. Sole owner of the brain file this run.

## Item 1 — Work-state carryover

- New file: `_SYSTEM/state/runtime/work-state.json`, seeded `{"updated": <iso>, "open": [{"item": "example: ...", "nextStep": "example: ..."}]}`. Example rows are filtered out at read time so the seed renders no block.
- `WORK_STATE_FILE` constant added next to `MEMORY_FILE` (yuri-z-brain.py ~L49).
- `_work_state_block()` (new, ~L123-148): reads the file, skips malformed/`example:`-prefixed rows, renders a compact `## WHERE WE LEFT OFF` block. Fail-open on missing file / bad JSON / non-list `open` → returns `""` silently (verified via direct call against a nonexistent path and a hand-corrupted JSON file — both returned `''`, no exception).
- Wired into `_build_system()` (~L157-159): appended right after the MEMORY.md block, before the canonical-truth (T3) seam.
- `_set_work_state(item, next_step="")` (new, ~L327-360): tiny read-modify-write helper (same atomic-tmp-then-`os.replace` pattern as `_save_pending`), replaces an existing entry for the same item case-insensitively instead of duplicating. NOT a config engine — just a schema-matched updater.
- Wired through EXISTING plumbing: the `remember` tool handler (~L757-763) now also calls `_set_work_state(summary, cues)` whenever `kind == "commitment"`, since a commitment IS an open thread/next-step. No new tool schema added for this item, per the spec's explicit "do not build a config engine" instruction.
- Verified live: round-tripped `_set_work_state("finish the read_doc tool", "test it end to end")` → block rendered correctly → re-set the same item with a new nextStep → block shows exactly one entry with the updated step (no duplication).

## Item 2 — Download/install gate patch

`_CRITICAL_BASH` (yuri-z-brain.py ~L330-338) extended with three new alternations:

1. Package installs: `\b(brew|pip3?|npm|pnpm|yarn|cargo|gem|go|apt(?:-get)?)\s+install\b`
2. Downloads that write to disk: `\bwget\b(?!.*-[A-Za-z]*O-)|\bcurl\b[^\n|]*(-[A-Za-z]*[oO][A-Za-z]*\b|\s>>?\s)`
   - curl only writes to disk on `-O`/`-o`/redirect (streams to stdout otherwise) → gated only on those flags.
   - wget writes to disk BY DEFAULT even with no flags → gated on bare `wget`, EXCEPT when explicitly piped to stdout via `-O-` or combined `-qO-` (negative lookahead).
3. Non-local `git clone`: `\bgit\s+clone\b[^\n]*(https?://|git@|ssh://)` — local-path clones excluded (no protocol prefix).

### Test matrix (script-verified, all pass)

| Input | Expected | Result |
|---|---|---|
| `brew install wget`, `pip install requests`, `pip3 install numpy`, `npm install express`, `pnpm install`, `yarn install`, `cargo install ripgrep`, `gem install rails`, `go install golang.org/x/tools/cmd/goimports@latest`, `apt install curl`, `apt-get install -y build-essential` | critical | all match |
| `curl -O https://…`, `curl -o out.tar.gz https://…`, `curl https://… > out.tar.gz`, `wget https://…/file -O out.tar.gz`, `wget https://…/x` (bare) | critical | all match |
| `git clone https://github.com/foo/bar.git`, `git clone git@github.com:foo/bar.git` | critical | all match |
| `npm run build`, `npm run test`, `pip list`, `pip show requests`, `git status`, `git clone /local/path/to/repo dest`, `curl http://localhost:8080/health`, `curl -s http://127.0.0.1:8014/health`, `cargo build`, `go build ./...`, `go run main.go`, `brew list`, `yarn test`, `ls -la`, `git commit -m x`, `rm test.txt` | routine (no match) | none match |
| `wget -O- https://…/x \| head`, `wget -qO- https://…/x` | routine (explicit stdout pipe) | none match |
| `git push`, `git push --force`, `sendmail x@y.com` | critical (pre-existing) | still match — no regression |

All 34 matrix cases pass with zero false positives/negatives, re-run against the live loaded module (not just a standalone regex copy).

## Item 3 — Affirm-regex hardening

- Added `_affirms_early(msg, max_words=3)` (~L347-362, constant `_AFFIRM_MAX_WORDS = 3`): true only when the WHOLE user message is ≤3 words AND matches `_AFFIRM` within it.
- Root-cause note: a prefix-window check alone (checking only the first 3 words) does NOT fix the spec's own example — "yeah, but also check my calendar" has "yeah" as word 1, so a prefix-only check still fires. The fix that actually excludes it is capping the **entire message length**, since real confirms are short standalone replies and don't carry a trailing clause.
- Call site updated (~L944, was L848 pre-edit): `if pending and _affirms_early(user_msg) and not _NEGATE.search(user_msg):` — `_NEGATE` behavior is untouched.
- `_AFFIRM` / `_NEGATE` regex definitions themselves are unchanged; only the call-site logic changed from raw `_AFFIRM.search()` to the new length-gated `_affirms_early()`.

### Test matrix (script-verified, all pass)

| Input | Expected | Result |
|---|---|---|
| `yes`, `yeah`, `yep`, `confirm`, `do it`, `go ahead`, `go for it`, `correct`, `affirmative`, `sure`, `please do`, `that's right`, `proceed`, `make it so`, `yes do it`, `sure, go ahead`, `yes, do it` | affirms | all match |
| `yeah, but also check my calendar` (the spec's exact example) | does NOT affirm | correctly rejected |
| `no wait actually yes do it`, `I was thinking maybe yes`, `what do you mean by confirm`, `actually let's not, no` | does NOT affirm | correctly rejected |
| `yes but wait`, `sure but hold on a sec` | does NOT affirm (via existing `_NEGATE` catching "wait"/"hold on" at the call-site, since `_affirms_early` alone would pass "yes but wait" at exactly 3 words) | correctly rejected end-to-end via the combined `_affirms_early(...) and not _NEGATE.search(...)` call-site logic |

Existing suite checks `affirm regex matches yes` / `affirm regex matches confirm` still pass unchanged (they test `_AFFIRM.search()` directly, which is untouched).

## Item 4 — `read_doc` tool

- Tool schema added to `TOOLS` (~L500-509 insertion point, after `xref`): name `read_doc`, required `path`, description states text-only/no-vision/bounded/fails-clearly.
- Constants added (~L274-275): `READ_DOC_CHAR_CAP` (env `YURI_Z_READ_DOC_CAP`, default 20000), `READ_DOC_TIMEOUT` (env `YURI_Z_READ_DOC_TIMEOUT`, default 60s).
- `_extract_doc_text(path)` (new helper, ~L775-833):
  - `.pdf` → `pdftotext -layout <path> -` (binary path verified: `/opt/homebrew/bin/pdftotext`, PATH fallback if the absolute path ever moves).
  - `.doc/.docx/.xls/.xlsx` → `soffice --headless --convert-to txt --outdir <tmpdir> <path>`, then reads the produced `.txt`, cleans up the tmpdir in a `finally`. Binary path verified: `/opt/homebrew/bin/soffice`.
  - Bounds output to `READ_DOC_CHAR_CAP` chars with a `…(truncated)` marker, matching the existing `_cap()` convention used for bash/AppleScript output.
  - Fail-open on: missing file, missing CLI (`FileNotFoundError`), timeout, non-zero exit, unsupported extension, or soffice not producing the expected output file — every branch returns a string, never raises.
- Tool dispatch added in `_exec_tool` (~L833-840, next to `xref`): resolves relative paths against `REPO`, absolute paths pass through as-is, protected-path check (`_is_protected`) applied before touching the filesystem.
- Not added to the confirm-gate (`_is_critical_call`) — it's read-only, same tier as `read_file`/`xref`.

### Live verification (real files in the repo, not mocks)

- PDF: `02_RESOURCES/RESEARCH/papers/Recursive Language Models - MIT.pdf` → extracted 20013 chars (hit the cap), correct truncation marker appended, opening text `"Recursive Language Models … Alex L. Zhang … Abstract"` — matches the real paper.
- DOCX: `_SYSTEM/docs/research/exeoflow-yuri-os-target-briefing.docx` → extracted 20013 chars (hit the cap), opening text `"# ExeoFlow x YURI OS Enterprise Target Dossier …"` — matches the real doc content.
- Failure paths verified: unsupported extension (`.xyz`) → clear message; missing file → clear message (checked before the extension branch); no `path` arg via `_exec_tool` → `"no document path given"`; protected path (`.env`) → `"refused: protected path (safety floor)"`.

## Item 5 — MEM_CAP raise

- `MEM_CAP` default changed 14000 → 20000 (yuri-z-brain.py, one line). `YURI_Z_MEM_CAP` env override still wins, unchanged. MEMORY.md is currently 15447 bytes — now fits under the cap without truncation (verified `wc -c` before editing).

## Syntax / test results

- `python3 -c "import ast,sys; ast.parse(...)"` → `SYNTAX OK`.
- Full module import (bypassing `__main__`, same harness as the existing test file) → succeeds, `jarvis_memory`/`jarvis_xref` guarded imports resolve when run from the voice dir.
- `python3 _SYSTEM/Scripts/voice/test_yuri_z_brain.py` → **90/93 passed**, identical to the pre-edit baseline. The 3 failures (`write_file is critical`, `edit_file is critical`, `bash rm is critical`) are **pre-existing** — they test an older, since-deliberately-narrowed confirm-gate behavior (the file's own comments at ~L254-260 document the 2026-06-19 narrowing that made routine write/edit/rm non-critical; the test file's assertions were never updated to match). Confirmed via baseline run before any edits: same 3 failures, same count, out of scope for this task.
- No new test failures introduced by any of the 5 items.

## Residual risk

- `read_doc`'s soffice path spins up a LibreOffice headless process per call (~60s timeout budget) — slow but bounded; no caching. Acceptable for occasional document reads, not for bulk use.
- `_set_work_state` is currently reachable only via `remember(kind="commitment")` — there is no dedicated voice-facing "mark this done" tool, so closing out a completed item still requires either editing the JSON directly or restating it via `remember`. Matches the spec's explicit "don't build a config engine" instruction; flagging as a natural Phase-2 follow-up if the carryover block needs a completion path.
- The install/download gate is pattern-based, not a sandboxed policy — a sufficiently obfuscated command (e.g. base64-encoded curl invocation) would not be caught. Same class of limitation as the pre-existing `_DESTRUCTIVE` regex; not a regression, just an inherent property of regex-based gating that the existing safety floor already accepts.
- `_affirms_early`'s 3-word cap is a heuristic tuned to the spec's stated examples; a genuinely short but compound confirm-plus-request (e.g. "yes and also...") would still be excluded by design (that's a redirection, not a pure confirm) — intentional, not a bug.
