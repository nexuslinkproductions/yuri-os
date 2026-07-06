#!/usr/bin/env python3
# @capability: voice-silero-vad-check
# @serves: test silero vad on my voice | why isnt vad firing | vad confidence diagnostic | gain vs clipping vad
# @does: records the default mic, then runs the EXACT pipecat Silero VAD model on the recording at
#        several gain levels, reporting max confidence + how many frames exceed threshold. Isolates
#        "Silero can't recognize this audio" from "Pipecat isn't wiring the VAD".
# @use: stop the bot, then `.venv-pipecat/bin/python mic-vad-check.py` and TALK NORMALLY for 6s.
import numpy as np
import sounddevice as sd
from pipecat.audio.vad.silero import SileroVADAnalyzer
from pipecat.audio.vad.vad_analyzer import VADParams

SR = 16000
DUR = 6
din, _ = sd.default.device
print(f"input device: [{din}] {sd.query_devices(din)['name']}")
print(f"Recording {DUR}s @ 16kHz — TALK NORMALLY now (count out loud, say a full sentence)...")
rec = sd.rec(int(DUR * SR), samplerate=SR, channels=1, dtype="int16")
sd.wait()
raw = rec.flatten()
print(f"recorded {len(raw)} samples, raw peak={np.max(np.abs(raw)) / 32768:.3f}\n")


def test_gain(g):
    a = np.clip(raw.astype(np.float32) * g, -32768, 32767).astype(np.int16)
    an = SileroVADAnalyzer(params=VADParams(confidence=0.3, min_volume=0.0))
    an.set_sample_rate(SR)
    n = an.num_frames_required()  # 512 @ 16k
    confs = []
    for i in range(0, len(a) - n, n):
        confs.append(an.voice_confidence(a[i:i + n].tobytes()))
    confs = np.array(confs) if confs else np.array([0.0])
    clip_pct = 100.0 * np.mean(np.abs(a) >= 32760)
    print(f"gain x{g}: max_conf={confs.max():.2f}  mean={confs.mean():.2f}  "
          f"frames>0.5={int((confs > 0.5).sum())}/{len(confs)}  peak={np.max(np.abs(a)) / 32768:.3f}  clip={clip_pct:.1f}%")


for g in (1, 2, 3, 5):
    test_gain(g)
print("\nIf any row shows frames>0.5 ≥ a few → Silero CAN detect you (it's a Pipecat wiring issue).")
print("If ALL rows are max_conf<0.3 → Silero rejects this mic's audio (deeper problem).")
