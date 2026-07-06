# UPGRADE BRIEF — Yuri JARVIS phase 2 (GLM-5.2 major upgrade)

Owner: Marcel. Build lane: GLM-5.2 (you). Verify: Claude/Opus. Test: Marcel. Commit: Claude after Marcel confirms.
Read the files yourself (you have read/edit/write/bash). This brief = the verified ground truth + the task list.
Companion: `00-MASTER-BRIEF.md` (the JARVIS vision + confirm-gate model — STILL BINDING; don't regress it).

## STATUS (what already works — do NOT regress)
- `yuri-z-brain.py` is the live voice brain (:8014, OpenAI-compat for bot.py). It already has: 9 tools
  (bash/read_file/write_file/edit_file/spawn_worker/applescript/gui_script/open_app/screenshot), the
  CONFIRM-GATE state machine (routine→execute, critical→speak+hold→affirm→execute; pending store at
  `_SYSTEM/state/voice/yuri-pending-action.json`), persona+MEMORY injection, the `_is_critical_call`
  classifier, and a `_bash_block_reason` floor (.env/secrets + catastrophe hard-refused). 29-check
  regression suite green. KEEP all of this; the bot.py HTTP contract (/v1/chat/completions + SSE + /health)
  MUST stay intact.

## VERIFIED DIAGNOSIS (Marcel's reported bugs — root causes I found; confirm + fix)

### BUG 1 — worker spawn is split; one path still launches the paid `claude`
- `yuri-spawn-worker.sh` (called by the brain's `spawn_worker` tool) was fixed to launch
  `$REPO/_SYSTEM/Scripts/ai claude-zai` — GOOD.
- `yuri-worker.sh` line 17 STILL does `tmux send-keys ... -l "claude"` — the paid binary. This is the
  "she launches plain claude code, not claude-zai" Marcel sees.
- FIX: unify ALL worker launches onto `ai claude-zai`. Per Marcel's driver brief: workers are Z.ai
  Claude Code MAIN sessions; default model GLM-4.7 must be switched to **GLM-5.2** on session start.
  Decide the cleanest way to make the worker land on GLM-5.2 automatically (e.g. export `ZAI_MODEL=glm-5.2`
  in the worker's tmux env BEFORE `ai claude-zai`, since `run_claude_zai` reads `ZAI_MODEL` — verify in the
  `ai` script). VERIFY the tmux send-keys actually launches a working session (the alias vs absolute path,
  key hydration in the tmux shell) — test it end to end, don't assume. Audit EVERY caller of either script
  (`grep -rn yuri-worker.sh _SYSTEM`) and leave no path on plain `claude`.

### BUG 2 — file/markdown writes get mangled (UTF-8 → "â" mojibake)
- Symptom: em-dash `—` and arrow `→` come out as `â€"` / `â`. Classic UTF-8-decoded-as-Latin1.
- The brain's write path is clean UTF-8 (`write_file` uses `encoding="utf-8"`; `_messages_call` does
  `json.loads(r.read())`). So corruption enters EITHER from the model's tool_use content (z.ai response
  decoding) OR a worker write path.
- FIX: REPRODUCE first — have the brain write a markdown containing `—`, `→`, `"smart quotes"`, then
  `hexdump -C` the bytes on disk and find exactly where the corruption enters. Then fix at the source
  (force UTF-8 decode of the z.ai response if it's the API; or sanitize on write). Add a tiny regression
  (write fancy punctuation → read back → bytes match). Do NOT just strip the characters unless that's the
  only option — Marcel wants correct markdown, not lobotomized markdown.

### BUG 3 — Kokoro TTS "stacks shapes", playback degrades over time, survives terminal kill
- `kokoro_tts.py` runs MLX Kokoro-82M IN-PROCESS inside `bot.py` (no server), `_clear_mlx_cache()` per turn.
- ROOT CAUSE LEADS (verified live):
  1. `voice-mlx-server.py` (PID 74333) has run since **Jun 17 (2 days)**, orphaned, launched by the
     *marvis* path (`overseer.sh` / `marvis_tts.py`) — NOT used by bot.py. It's a stale MLX process holding
     Metal/GPU memory while kokoro competes → the degradation + the broadcast_shapes failures. Killing the
     `yuri` terminal never frees it (it's a detached orphan) = exactly Marcel's "killing the terminal doesn't
     clear it".
  2. `yuri.sh` starts the brain detached `( python3 … & )` and pkills ONLY the brains (lines 21-24) — never
     `bot.py`, `voice-mlx-server.py`, or stray kokoro/MLX. So every relaunch leaves orphans accumulating.
  3. Long-lived bot.py: MLX Metal buffer growth across a long session may need a harder reset than
     `mx.clear_cache()` (consider `mx.metal.clear_cache()` + a memory cap, or recycling).
- FIX: (a) kill the stale orphan(s) and make `yuri.sh` (and/or a `voice-stop` helper) cleanly pkill the FULL
  voice process set on start/stop — bot.py, voice-mlx-server.py, any stray MLX/kokoro — so a relaunch is a
  clean slate; (b) confirm there is no cross-call accumulation in kokoro (`_synth_robust` out-list is local —
  good; check the resampler `self._resampler` for retained state); (c) bound MLX memory so a long session
  stays stable. The broadcast_shapes warnings are a known mlx-audio Kokoro bug already handled by chunk-retry
  — the GOAL is to stop the DEGRADATION (memory/orphan pressure), not to silence every warning.

### BUG 4 — terminal / tmux interaction is unreliable; general JARVIS gaps
- She "can't properly interact with terminals/tmux". Harden the spawn + dispatch: robust session
  create/attach/reuse, reliable `tmux send-keys` (literal vs Enter timing), and a clean way for the brain to
  send a follow-up task to an existing worker. Make the worker terminal visibly land on GLM-5.2.
- Sweep the whole loop for the "still buggy / not full JARVIS" gaps and fix what you find; report anything
  you can't (don't silently work around — Marcel's standing rule).

### BUG 5 — FORBIDDEN `claude -p` brain path still wired (likely the root of "spawns as -p / still limited")
- `bot.py:187` defaults the brain to `http://127.0.0.1:8012/v1` = `claude-p-brain.py`, which spawns
  `claude -p` (claude-p-brain.py:93,98) — a HARD-FORBIDDEN launch shape (CLAUDE.md + persona floor: never
  `claude -p` / `--print` / headless). ONLY `yuri.sh` overrides it to the GLM brain (:8014) via
  `BRAIN_PROXY_URL`.
- `yuri-jarvis.sh` (the JARVIS worker-dispatch launcher) → `exec run-yuri.sh`, which targets the **claude-p
  brain** (:8012) and pkills/relaunches `claude-p-brain.py`. So JARVIS/dispatch mode runs a `claude -p` brain
  WITHOUT the new GLM tools → explains "spawns as -p", "still launches plain claude", "still limited". (Right
  now :8014 GLM is live, :8012 down — but the jarvis path resurrects claude -p.)
- FIX: make the GLM brain (`yuri-z-brain.py` :8014) the ONE brain for ALL launchers. `bot.py` default →
  :8014. `yuri-jarvis.sh` + `run-yuri.sh` must start/own the GLM brain, never `claude-p-brain.py`. WIRE the
  JARVIS worker-DISPATCH capability (the `YURI_DISPATCH` inject-into-a-watched-tmux-worker behavior) into the
  GLM brain so dispatch mode runs on GLM. RETIRE/neutralize `claude-p-brain.py` + `claude-brain-proxy.py` so
  nothing can spawn `claude -p`. Audit every launcher (`yuri.sh`, `yuri-jarvis.sh`, `run-yuri.sh`,
  `yuri-local.sh`, `run-voice.sh`) and confirm none resurrect the `-p` path.

## CONSTRAINTS (hard)
- Preserve the bot.py HTTP contract, the confirm-gate, the `.env`/secrets/catastrophe floor, and the
  model-driven design (she chooses tools — no agency-stripping intent hardcoding).
- Marcel's owned MacBook, owner-authorized. Protected paths still off-limits (`.env`, `backend/data/`,
  `.claude/state|history|...`, `node_modules/`, `.amp/`). Don't touch them.
- Scope edits to the voice subsystem (`_SYSTEM/Scripts/voice/*`) + the `ai` script if needed for the
  GLM-5.2 worker default. No broad refactors outside this.
- KEEP changes verifiable: leave the syntax compiling, add/extend tests where you can, and write a short
  CHANGELOG of every file you touched + why, into `02_RESOURCES/RESEARCH/yuri-jarvis-voice-control-2026-06-19/02-GLM-CHANGELOG.md`.

## DELIVERABLES
1. The fixes for BUG 1–4 in the voice subsystem.
2. `02-GLM-CHANGELOG.md`: every file touched, what changed, why, and how you verified it.
3. A test plan update (extend `YURI_JARVIS_SETUP_AND_TEST.md`) covering: spawn a GLM-5.2 worker, write a
   markdown with fancy punctuation (bytes correct), a long voice session that does NOT degrade, clean restart.
4. Run your own verification (syntax compile, the brain's regression suite, a live /health boot) and report results.

## PROCESS
You build + self-verify → Claude independently verifies (won't trust your green checks) → Marcel tests live →
Marcel confirms → Claude commits + pushes. If you hit a tool limit, report it; don't work around it silently.
