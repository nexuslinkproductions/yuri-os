# Overseer Runbook (cmux) — 2026-06-17

GOAL: You open a cmux tab and type ONE word — `overseer`. That Claude session talks back in **Rick**, and you tell it what to do. It drives **worker** Claude sessions (plain `claude` in your other cmux tabs) via `cmux send`, watches them via the cmux Feed, and stays light by keeping its memory on disk. You conduct; it conducts the fleet; you watch the panes.

## The simple flow (this is the whole thing)
1. **Tab 1 — the overseer:** type `overseer` → voice-armed conductor launches and greets you in Rick.
2. **Tabs 2,3,4 — workers:** type `claude` normally. Silent (no voice). These are the hands.
3. Tell the overseer what you want. It runs `cmux-dispatch.sh dispatch <surface> "<task>"` to push work into a worker tab, watches the panes, reports back short (spoken).

`overseer` = `bash _SYSTEM/Scripts/voice/overseer.sh`. The launcher: starts the Rick TTS server on :8004 if it's down, turns the **global** voice flag OFF (so only the overseer speaks, not the workers), seeds the fleet board, then launches `claude` with `VOICE_AGENT_ACTIVE=1` + the overseer role + an opening board-read.

### One-time: make `overseer` a real command
Add this line to `~/.zshrc` (I'm not allowed to edit your shell profile), then `source ~/.zshrc`:
```sh
alias overseer='bash /Users/marcelspatz/YURI-OS-MUSUBI/_SYSTEM/Scripts/voice/overseer.sh'
```
Until then, just run `bash _SYSTEM/Scripts/voice/overseer.sh` in the tab.

## "How do we deal with context within the overseer?" — the core answer
The overseer is a long-lived conductor; its context window WILL fill. The fix is not a bigger window — it's that **the overseer never holds the heavy state in its head.** Two rules, both baked into its role prompt (`overseer-role.md`):

1. **It's a ROUTER, not a worker.** It never opens big files or runs broad scans itself — it dispatches a worker to read+summarize and report back one bounded paragraph. Its own context only ever sees: short worker summaries, the board, the feed. Cheap and bounded by design.
2. **Its memory lives on disk — the fleet board** (`_SYSTEM/state/overseer/board.md`): goal spine, worker roster (surface→task→status), decisions, blockers, next actions. It reads the board on start and after every `/compact`, and updates it on every change. So its context window is **disposable working RAM** — when it fills, `/compact` (auto-armed at 60%) and re-read the board: zero state lost, because the real state was never in the window.

Net: the overseer can run all day. Compaction is lossless for it. The board is the single source of truth; the window is scratch space.

## Per-session voice gating (why only the overseer speaks)
The Stop hook speaks when armed by **env `VOICE_AGENT_ACTIVE=1`** OR the flag file `_SYSTEM/state/voice-loop.enabled`. The launcher sets the env on the overseer only and turns the flag OFF — so workers (plain `claude`, no env) stay silent. If every session suddenly talks, the flag got left on: `bash _SYSTEM/Scripts/voice-seam.sh off`.

## Overseer toolkit (it calls these via its Bash tool)
- `bash _SYSTEM/Scripts/voice/cmux-dispatch.sh workers` — list worker surfaces (`cmux list-pane-surfaces`).
- `bash _SYSTEM/Scripts/voice/cmux-dispatch.sh dispatch <surface> "<task>"` — `cmux send --surface <s> "<task>"` then a distinct Enter key.
- `bash _SYSTEM/Scripts/voice/cmux-dispatch.sh feed` — the cmux activity Feed.
- Worker surfaces are cmux refs: `surface:2`, `pane:1`. Discover once, record on the board, address by ref.

## cmux API (verified 2026-06-17 via `cmux <cmd> --help`)
- `cmux send --surface surface:2 -- "<text>"` — text into a surface (NOTE: `--surface` is a FLAG; `\n`/`\r` in text also send Enter).
- `cmux send-key --surface surface:2 enter` — one key event.
- `cmux list-pane-surfaces` — surfaces in the focused pane (refs).
- `cmux feed tui` — activity Feed. `cmux hooks setup` — enable the agent hook bus once.

## VERIFY on first cmux run (couldn't test headless)
- `cmux send --surface <s> -- "hi"` + `cmux send-key --surface <s> enter` actually submits in the worker. If Enter doesn't fire in the Claude TUI, the dispatch helper sends text then a 0.4s-settled `send-key enter` — adjust the sleep or try `\n` in the text if needed.
- Real surface refs from `cmux list-pane-surfaces` (a plain `claude` in a cmux tab should show as a pane surface — confirm it's addressable).
- Overseer speaks but workers don't (env gating worked).

## Talk to it — the always-on mic (BUILT, Parakeet MLX)
After the overseer is up, run `listen` (or `bash _SYSTEM/Scripts/voice/voice-listen.sh`) in any other terminal. It captures your mic, transcribes with **Parakeet TDT (parakeet-mlx, ≈100× real-time on Apple Silicon)**, and injects each utterance into the overseer's cmux tab when you pause. It **echo-gates**: while Rick is speaking it ignores the mic, so it never transcribes its own voice into a loop.

- Engine pick (research → `02-STT-MODEL-RESEARCH.md`): Parakeet beats whisper.cpp large-v3-turbo by ~100× on speed; whisper.cpp stays as the zero-dep fallback (`VOICE_STT_ENGINE=whisper`).
- Surface targeting: `overseer.sh` records its `$CMUX_SURFACE_ID` to `_SYSTEM/state/overseer/overseer.surface`; the listener reads it. So `listen` works from any terminal once the overseer is up.
- Tune live (like the EQ): `VOICE_SILENCE_RMS` (mic sensitivity — raise if it triggers on noise), `VOICE_SILENCE_HANG` (pause length that ends an utterance, default 0.8s), `VOICE_MIN_SPEECH`, `VOICE_MIC_DEVICE`. List mic devices: `_SYSTEM/state/voice/.venv-stt/bin/python -c "import sounddevice;print(sounddevice.query_devices())"`.
- venv: `_SYSTEM/state/voice/.venv-stt` (parakeet-mlx + sounddevice; gitignored under `_SYSTEM/state/voice`).

Full loop now closed: you talk → Parakeet → overseer tab → overseer dispatches workers + replies → Rick speaks → mic re-opens. Hands-free.

## Phase C (optional polish): lower-latency streaming + barge-in
The current listener is VAD-segmented (injects on pause). Future: true token-streaming via Parakeet `transcribe_stream` for live partials, barge-in (interrupt Rick mid-sentence), and a wake-word gate. Full architecture: `00-MASTER-BRIEF.md`.

## Files
- `_SYSTEM/Scripts/voice/overseer.sh` — one-word launcher (server-up + flag-off + voice-armed claude + role + board read).
- `_SYSTEM/Scripts/voice/overseer-role.md` — the appended system prompt (router-not-worker + board protocol + speak-short).
- `_SYSTEM/Scripts/voice/cmux-dispatch.sh` — dispatch/workers/feed/peek toolkit.
- `_SYSTEM/Scripts/voice/board.template.md` → seeds `_SYSTEM/state/overseer/board.md` (gitignored runtime state).
