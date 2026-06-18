#!/usr/bin/env python3
# @capability: voice-mic-check
# @serves: test microphone capture | is the mic hot | diagnose no voice input | mic level db
# @does: records 5s from the system default input device and reports RMS/peak dB so you can tell a
#        dead/muted/permission-blocked mic (silence) from a working one (audio) — bisects "Yuri didn't
#        hear me" into input-hardware vs pipeline-VAD.
# @use: stop the bot first (Ctrl-C), then `.venv-pipecat/bin/python mic-check.py` and TALK when prompted.
import math
import numpy as np
import sounddevice as sd

SR = 24000
DUR = 5
din, _ = sd.default.device
name = sd.query_devices(din)["name"] if isinstance(din, int) and din >= 0 else "?"
print(f"input device: [{din}] {name}")
print(f"Recording {DUR}s — TALK NOW, say 'testing one two three'...")
rec = sd.rec(int(DUR * SR), samplerate=SR, channels=1)
sd.wait()
a = rec.flatten().astype("float32")
peak = float(np.max(np.abs(a))) if a.size else 0.0
rms = float(np.sqrt(np.mean(a ** 2))) if a.size else 0.0
peak_db = 20 * math.log10(peak + 1e-9)
rms_db = 20 * math.log10(rms + 1e-9)
print(f"peak={peak_db:.1f} dB   rms={rms_db:.1f} dB")
if peak < 0.005:
    print("=> SILENT — the mic is NOT capturing. Check: DJI transmitter powered on + unmuted,")
    print("   and System Settings ▸ Privacy & Security ▸ Microphone ▸ (your terminal app) is ON.")
    print("   Devices with input:")
    for i, d in enumerate(sd.query_devices()):
        if d["max_input_channels"] > 0:
            print(f"     [{i}] {d['name']}")
else:
    print("=> AUDIO DETECTED — the mic works. The issue is the bot's VAD/endpointing; tell Rick.")
