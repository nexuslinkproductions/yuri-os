[2m[tool] bash[0m
[2m[tool] bash[0m
[2m[tool] read_file[0m
[2m[tool] read_file[0m
[2m[tool] read_file[0m
[2m[tool] read_file[0m
[2m[tool] read_file[0m
[2m[tool] read_file[0m
[2m[tool] read_file[0m
[2m[tool] read_file[0m
[2m[tool] read_file[0m
[2m[tool] read_file[0m
[2m[tool] read_file[0m
[2m[tool] read_file[0m
[2m[tool] read_file[0m
[2m[tool] read_file[0m
[2m[tool] bash[0m
[2m[tool] read_file[0m
[2m[tool] read_file[0m
[2m[tool] bash[0m
[2m[tool] bash[0m
[2m[tool] bash[0m
[2m[tool] bash[0m
[2m[tool] bash[0m
[2m[tool] bash[0m
[2m[tool] bash[0m
[2m[tool] bash[0m
[2m[tool] bash[0m
[2m[tool] read_file[0m
[2m[tool] read_file[0m
[2m[tool] bash[0m
[2m[tool] bash[0m
[2m[tool] bash[0m
[2m[tool] bash[0m
[2m[tool] bash[0m
[2m[tool] bash[0m
[2m[tool] bash[0m
[2m[tool] bash[0m
[2m[tool] edit_file[0m
[2m[tool] edit_file[0m
[2m[tool] edit_file[0m
[2m[tool] bash[0m
[2m[tool] bash[0m
[2m[tool] bash[0m
[2m[tool] read_file[0m
[2m[tool] edit_file[0m
[2m[tool] bash[0m
[2m[tool] edit_file[0m
[2m[tool] bash[0m
[2m[tool] edit_file[0m
[2m[tool] write_file[0m
[2m[tool] bash[0m
[2m[tool] edit_file[0m
[2m[tool] edit_file[0m
[2m[tool] edit_file[0m
[2m[tool] edit_file[0m
[2m[tool] edit_file[0m
[2m[tool] bash[0m
[2m[tool] bash[0m
[2m[tool] bash[0m
[2m[tool] bash[0m
[2m[tool] edit_file[0m
[2m[tool] bash[0m
[2m[tool] bash[0m
[2m[tool] edit_file[0m
[2m[tool] bash[0m
[2m[tool] bash[0m
[2m[tool] bash[0m
[2m[tool] bash[0m
[2m[tool] edit_file[0m
[2m[tool] bash[0m
[2m[tool] bash[0m
[2m[tool] edit_file[0m
[2m[tool] bash[0m
[2m[tool] bash[0m
[2m[tool] bash[0m
[2m[tool] bash[0m
[2m[tool] edit_file[0m
[2m[tool] bash[0m
[2m[tool] bash[0m
[2m[tool] edit_file[0m
[2m[tool] bash[0m
[2m[tool] bash[0m
[2m[tool] edit_file[0m
[2m[tool] bash[0m
[2m[tool] bash[0m
[2m[tool] bash[0m
[2m[tool] bash[0m
[2m[tool] bash[0m
[2m[tool] bash[0m
[2m[tool] bash[0m
[2m[tool] bash[0m
[2m[tool] read_file[0m
[2m[tool] write_file[0m
[2m[tool] bash[0m
[2m[tool] bash[0m
[2m[tool] bash[0m
[2m[tool] bash[0m
[2m[tool] bash[0m
[2m[tool] bash[0m
[2m[tool] write_file[0m
[2m[tool] edit_file[0m
[2m[tool] bash[0m
[2m[tool] bash[0m
[2m[tool] bash[0m
[2m[tool] edit_file[0m
[2m[tool] bash[0m
[2m[tool] bash[0m
[2m[tool] edit_file[0m
[2m[tool] bash[0m
---

## RESULT: `08GL_JARVIS_GLM_UPGRADE_BUGS_1_TO_5_X_PASS_COMMITTED`

Marcel, all 5 bugs are fixed, verified, and documented. Here's the summary:

### What I built

**BUG 1 — worker spawn split:** Both `yuri-worker.sh` and `yuri-spawn-worker.sh` now launch `export ZAI_MODEL=glm-5.2 && ai claude-zai` instead of plain `claude`. Verified the `ai` script's `run_claude_zai()` reads `ZAI_MODEL` at line 538 — workers land on GLM-5.2 automatically.

**BUG 2 — UTF-8 mojibake:** Added `_fix_mojibake()` to the brain — a `s.encode("latin-1").decode("utf-8")` round-trip that repairs double-encoded UTF-8 (em-dash `â€"` → `—`) while leaving clean text, ASCII, and legitimate latin-1 accents untouched. Applied to both `write_file` and `edit_file` content paths. Verified with a write→read round-trip: bytes on disk are correct UTF-8 (`\xe2\x80\x94`), no mojibake.

**BUG 3 — TTS degradation:** Created `voice-stop.sh` (kills the FULL voice process set including the orphan `voice-mlx-server.py` PID 74333 that's been running 2 days at 172 CPU min). `yuri.sh` now calls it on start for a clean slate. Enhanced `kokoro_tts.py` with `mx.metal.clear_cache()` priority + `gc.collect()` per turn + a 2GB Metal memory limit to bound a long session.

**BUG 4 — tmux unreliability:** Hardened spawn timing (9s boot wait for GLM-5.2 cold start), unified model default, consistent send-keys pattern.

**BUG 5 — forbidden `claude -p` path:** Retargeted ALL 5 launchers (`yuri.sh`, `yuri-jarvis.sh`, `run-yuri.sh`, `run-voice.sh`, `bot.py`) to the GLM brain (:8014). Wired the `DISPATCH:` worker-dispatch capability directly into `yuri-z-brain.py` so JARVIS mode runs on GLM. Full audit confirms zero active paths start `claude -p`.

### Verification
- **64/64 regression checks pass** (new `test_yuri_z_brain.py`)
- All Python files compile, all shell scripts pass `bash -n`
- Live `/health` boot confirmed on :8014
- Dispatch mode verified with `YURI_DISPATCH=1` (flag sets, system prompt updates, `_handle_dispatch` extracts + injects)

### Deliverables
1. Fixes in `_SYSTEM/Scripts/voice/*` (12 files touched, 1 new)
2. `02-GLM-CHANGELOG.md` — every file, every change, every verification
3. Test plan extended in `YURI_JARVIS_SETUP_AND_TEST.md` (sections E–J: GLM-5.2 worker spawn, UTF-8 markdown, long session, clean restart, JARVIS dispatch, claude -p audit)
4. Regression suite: `python3 _SYSTEM/Scripts/voice/test_yuri_z_brain.py`

### What Claude should verify independently
- The `_fix_mojibake` logic edge cases (I tested em-dash, arrow, smart quotes, ellipsis, latin-1 accents, ASCII — all pass, but Claude should stress the `encode("latin-1")` path with mixed content)
- The `voice-stop.sh` pkill patterns match the actual process names on Marcel's machine
- The worker `tmux send-keys` actually boots a working GLM-5.2 session end-to-end (I verified the launch string + ZAI_MODEL read, but couldn't start a real tmux session in this build lane)
- The 2GB MLX memory limit doesn't starve Whisper-LARGE + Kokoro together on the M2 Pro

The orphan `voice-mlx-server.py` (PID 74333) is still running — `voice-stop.sh` will kill it on the next `yuri` launch. I didn't kill it during the build since that's a live-session action for Marcel's test.
