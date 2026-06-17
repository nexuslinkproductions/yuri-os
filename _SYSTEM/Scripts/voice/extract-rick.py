#!/usr/bin/env python3
# @capability: voice-rick-speaker-extract
# @serves: separate rick from morty | extract target speaker | clean voice reference from mixed clips | target speaker diarization
# @does: builds a Rick voiceprint from the pure Voicy clips, then keeps ONLY Rick's speech out of mixed Rick+Morty clips (resemblyzer embedding similarity over a sliding window) and concatenates it into one clean reference wav.
# @use: drop mixed Rick+Morty clips in _SYSTEM/state/voice/mixed/, run -> rick-ref-clean.wav. Tune VOICE_SIM_THRESH (0..1).
# @exports: (cli)
import os, sys, glob
import numpy as np
import soundfile as sf
from resemblyzer import VoiceEncoder, preprocess_wav

REPO = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", ".."))
VDIR = os.path.join(REPO, "_SYSTEM", "state", "voice")
PURE = os.path.join(VDIR, "clips")          # pure Rick (Voicy) — voiceprint source
MIXED = sys.argv[1] if len(sys.argv) > 1 else os.path.join(VDIR, "mixed")
OUT = os.path.join(VDIR, "rick-ref-clean.wav")
THRESH = float(os.environ.get("VOICE_SIM_THRESH", "0.74"))
SR = 16000


def audio_files(d):
    fs = []
    for ext in ("*.mp3", "*.wav", "*.m4a", "*.flac", "*.aac", "*.ogg"):
        fs += glob.glob(os.path.join(d, ext))
    return sorted(fs)


enc = VoiceEncoder()

# 1) Rick voiceprint from the pure clips
pure = audio_files(PURE)
if not pure:
    print(f"no pure Rick clips in {PURE}"); sys.exit(1)
print(f"building Rick voiceprint from {len(pure)} pure clips ...")
vps = []
for p in pure:
    try:
        vps.append(enc.embed_utterance(preprocess_wav(p)))
    except Exception as e:
        print(f"  skip {os.path.basename(p)}: {e}")
rick_vp = np.mean(vps, axis=0)
rick_vp /= (np.linalg.norm(rick_vp) + 1e-9)

# 2) keep only Rick out of each mixed clip
mixed = audio_files(MIXED)
if not mixed:
    print(f"no mixed clips in {MIXED} — drop Rick+Morty clips there and rerun")
    sys.exit(1)
kept, total = [], 0.0
for clip in mixed:
    try:
        wav = preprocess_wav(clip)
    except Exception as e:
        print(f"  skip {os.path.basename(clip)}: {e}"); continue
    _, partials, slices = enc.embed_utterance(wav, return_partials=True, rate=8)  # ~8 windows/sec
    sims = partials @ rick_vp
    mask = np.zeros(len(wav), dtype=bool)  # union of Rick windows — each sample counted ONCE
    for sl, s in zip(slices, sims):
        if s >= THRESH:
            mask[sl] = True
    seg = wav[mask]
    if len(seg):
        kept.append(seg)
    clip_kept = len(seg) / SR
    total += clip_kept
    print(f"  {os.path.basename(clip)}: ~{clip_kept:.1f}s rick (max sim {sims.max():.2f})")

if not kept:
    print(f"nothing above threshold {THRESH} — lower VOICE_SIM_THRESH and rerun"); sys.exit(1)
sf.write(OUT, np.concatenate(kept), SR)
print(f"\n✅ {total:.1f}s of clean Rick -> {OUT}")
print(f"   preview: afplay {OUT}")
print(f"   use it:  cp {OUT} {os.path.join(VDIR, 'rick-ref.wav')}  &&  rm -f {os.path.join(VDIR, 'rick-ref.txt')}")
print("   then restart the Marvis server so it re-transcribes the new ref.")
