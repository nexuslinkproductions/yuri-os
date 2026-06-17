#!/usr/bin/env python3
# @capability: voice-ab-refs
# @serves: compare rick reference clips | a/b clone references | pick the better rick base
# @does: loads Chatterbox once and synthesizes the SAME line from two different reference clips, so you can hear which reference clones Rick better. No EQ — raw clone character.
# @use: python voice-ab-refs.py <refA.wav> <refB.wav> [outdir]
# @exports: (cli)
import sys, os, wave
import numpy as np, torch
from chatterbox.tts_turbo import ChatterboxTurboTTS

REF_A = sys.argv[1]
REF_B = sys.argv[2]
OUTDIR = sys.argv[3] if len(sys.argv) > 3 else "/tmp"
TXT = ("Listen Morty, sometimes science is more art than science. "
       "A lot of people don't get that. Wubba lubba dub dub.")

dev = "mps" if torch.backends.mps.is_available() else "cpu"
print(f"loading Chatterbox on {dev} ...", flush=True)
m = ChatterboxTurboTTS.from_pretrained(device=dev)

def synth(ref, out):
    wav = m.generate(TXT, audio_prompt_path=ref)
    x = wav.detach().cpu().numpy().squeeze()
    x = np.clip(x, -1.0, 1.0)
    pcm = (x * 32767.0).astype("<i2").tobytes()
    with wave.open(out, "wb") as w:
        w.setnchannels(1); w.setsampwidth(2); w.setframerate(int(m.sr)); w.writeframes(pcm)
    print(f"wrote {out}  (ref={os.path.basename(ref)})", flush=True)

synth(REF_A, os.path.join(OUTDIR, "refA-soundboard.wav"))
synth(REF_B, os.path.join(OUTDIR, "refB-clean.wav"))
print("AB_DONE", flush=True)
