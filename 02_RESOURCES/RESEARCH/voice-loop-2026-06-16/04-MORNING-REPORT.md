# Morning report — faster Rick voice (overnight build) — 2026-06-17

## TL;DR
The latency wall was Chatterbox (~5s/line, can't stream). Researched the streaming clone-TTS field past Orpheus, ran an on-hardware bake-off, and shipped a **~4× faster engine**: **MOSS-TTS-Nano-100M** via mlx-audio. Built, wired, tested, committed + pushed (`769e3e8b`). It's the new default; Chatterbox stays as a one-flag fallback.

## Numbers (measured on your Mac, same line, Rick-cloned)
| Engine | first-audio | speed | intelligible |
|---|---|---|---|
| **MOSS-Nano-100M (NEW default)** | **~1.2s** | RTF 0.33 (3× realtime) | ✓ word-perfect |
| Chatterbox (old) | ~5s | ~1× realtime | ✓ |
| CSM-1b (Sesame) | 11s | RTF 2.58 — rejected | ✓ |

With the sentence-chunking already in place, the first short sentence should land in **~0.5s**.

## Test it on wake (one command)
1. `pkill -f parakeet-listen` then relaunch **`overseer`** in a cmux tab → it now starts the MOSS server (:8005) and the updated mic listener (with mute).
2. Talk. It should feel ~4× snappier.

## The ONE decision that's yours: does MOSS sound enough like Rick?
A 100M model is tiny — speed is great, but Rick-likeness is your ear's call, not mine. Play the A/B set:
```
afplay _SYSTEM/state/voice/ab-samples/2-moss-nano-100m.wav   # NEW (fast)
afplay _SYSTEM/state/voice/ab-samples/1-chatterbox.wav       # OLD (slow, richer)
```
- Happy with MOSS → nothing to do, it's the default.
- Prefer Chatterbox's voice → `VOICE_TTS_ENGINE=chatterbox overseer` (instant revert, fully intact).
- Want a middle option (better quality, still faster than Chatterbox) → say so and I'll bake OmniVoice / Qwen3-TTS / Higgs-v2 with your ref.

## Also fixed tonight (all pushed)
- **Conditioning cache** on Chatterbox: was re-embedding the Rick ref every synth → 10.4s→1.85s short line.
- **Latest-wins playback**: stale replies no longer play 45-60s after you moved on; newest cuts off older.
- **Chunked playback**: first sentence plays while the rest synthesize.
- **No sentence cap**: speaks the whole answer (was wrongly truncating to 3).
- **Mute**: say "mute"/"unmute" or run `mute` — *needs the relaunch above to take effect* (your running listener predates it).

## Caveats / open
- **EQ** (`eq-bands.conf`) was tuned for Chatterbox's tone. MOSS may sound different and want a re-tune via `voice-eq.sh` — or no EQ at all. Quick to adjust.
- The one-off **18s Chatterbox synth** you may see in a sample was GPU contention from the bake-off, not a regression.
- MOSS streaming API isn't implemented upstream yet; we get speed from RTF 0.33 + chunking, not token-streaming. If you want true token-streaming later, Orpheus/Higgs are the path.
- **capabilities.json**: tonight's commit reconciled the registry, which swept in a *parallel session's* alpha-factor strategy caps (their `.mjs` are still uncommitted/untouched). Harmless — self-heals when they commit. Flagged for transparency.

## Files
- `_SYSTEM/Scripts/voice/voice-mlx-server.py` (MOSS server :8005) · `voice-speak.sh` (engine chain) · `overseer.sh` (starts MOSS) · `mic-toggle.sh` (mute)
- venv `_SYSTEM/state/voice/.venv-tts` · ref `rick-ref-10s.wav` + `.txt` · A/B `ab-samples/` (all gitignored)
- Research: `03-STREAMING-TTS-RESEARCH.md`
