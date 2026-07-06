#!/usr/bin/env python3
# @capability: voice-listen-parakeet
# @serves: talk to the overseer | mic into overseer | always-on voice input | hands free claude | parakeet streaming STT
# @does: always-on mic -> Parakeet MLX (parakeet-tdt-0.6b, ~100x real-time on Apple Silicon) -> cmux send into the overseer surface. Energy-VAD segments utterances (injects on pause, not fixed windows), echo-gates against the Rick TTS playback (won't transcribe its own voice), drops empty/hallucinated segments.
# @use: launched by voice-listen.sh when the parakeet venv exists. Tune via env: VOICE_SILENCE_RMS, VOICE_SILENCE_HANG, VOICE_MIN_SPEECH, VOICE_MIC_DEVICE, VOICE_PARAKEET_MODEL (default mlx-community/parakeet-tdt-0.6b-v3 = EN+DE auto-detect; v2 for English-only).
"""Always-on Parakeet-MLX mic -> overseer (cmux). VAD-segmented, echo-gated."""
import os, sys, time, queue, subprocess
import numpy as np
import mlx.core as mx
import sounddevice as sd
from parakeet_mlx import from_pretrained
from parakeet_mlx.audio import get_logmel

REPO = os.environ.get("REPO") or os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", ".."))
MODEL_NAME   = os.environ.get("VOICE_PARAKEET_MODEL", "mlx-community/parakeet-tdt-0.6b-v3")
SAMPLE_RATE  = 16000
BLOCK        = 1600                                              # 0.1s frames
SILENCE_RMS  = float(os.environ.get("VOICE_SILENCE_RMS",  "0.012"))   # below this RMS = silence (tune per mic/room)
SILENCE_HANG = float(os.environ.get("VOICE_SILENCE_HANG", "0.8"))     # secs of trailing silence that ends an utterance
MIN_SPEECH   = float(os.environ.get("VOICE_MIN_SPEECH",   "0.3"))     # ignore blips shorter than this
MIN_CHARS    = int(os.environ.get("VOICE_MIN_CHARS", "3"))
MAX_UTTER    = float(os.environ.get("VOICE_MAX_UTTER", "30"))         # hard cap on one utterance (secs)
MIC          = os.environ.get("VOICE_MIC_DEVICE")               # sounddevice index/name; None = system default
SURFACE_FILE = os.path.join(REPO, "_SYSTEM/state/overseer/overseer.surface")
SURFACE      = os.environ.get("VOICE_OVERSEER_SURFACE") or (
    open(SURFACE_FILE).read().strip() if os.path.exists(SURFACE_FILE) else "")

NOISE = {"", "you", "thank you", "thanks", "thanks for watching", "bye", "bye.", "so",
         "um", "uh", "okay", "ok", "yeah", "hmm", "[blank_audio]", "music", "applause", "."}

MUTE_FLAG   = os.path.join(REPO, "_SYSTEM/state/voice/mic.muted")
MUTE_WORDS  = {"mute", "muteyourself", "stoplistening", "stoplisten", "rickstop", "gotosleep", "pausemic"}
UNMUTE_WORDS = {"unmute", "startlistening", "ricklisten", "wakeup", "resumemic", "imback"}

def rick_speaking() -> bool:
    return subprocess.run(["pgrep", "-x", "afplay"], capture_output=True).returncode == 0

def is_noise(t: str) -> bool:
    alnum = "".join(c for c in t.lower() if c.isalnum())
    if len(alnum) < MIN_CHARS:
        return True
    return t.strip().lower().strip(".,!?") in NOISE

def inject(text: str):
    try:
        subprocess.run(["cmux", "send", "--surface", SURFACE, "--", text], check=True)
        time.sleep(0.4)                                          # let the TUI register the paste before Enter
        subprocess.run(["cmux", "send-key", "--surface", SURFACE, "enter"], check=True)
        print(f"→ {text}", flush=True)
    except subprocess.CalledProcessError as e:
        print(f"✗ inject failed ({e}) — is the overseer surface still alive?", flush=True)

def main():
    if not SURFACE:
        sys.exit("✗ no overseer surface recorded. Start 'overseer' first, or set VOICE_OVERSEER_SURFACE=<cmux surface>.")
    print(f"loading Parakeet ({MODEL_NAME})… first run downloads ~600MB", flush=True)
    model = from_pretrained(MODEL_NAME, dtype=mx.float32)
    preproc = model.preprocessor_config
    dev = (int(MIC) if MIC and MIC.isdigit() else MIC) if MIC else None
    print(f"🎙  parakeet listener LIVE → surface {SURFACE}", flush=True)
    print(f"    speak normally; injects when you pause. pauses while Rick talks. Ctrl-C to stop.", flush=True)
    print(f"    tune: VOICE_SILENCE_RMS={SILENCE_RMS} VOICE_SILENCE_HANG={SILENCE_HANG} VOICE_MIC_DEVICE", flush=True)

    q: "queue.Queue[np.ndarray]" = queue.Queue()
    def cb(indata, frames, t_info, status):
        q.put(indata[:, 0].copy())

    utter, speaking, last_voice, cooldown_until = [], False, 0.0, 0.0
    with sd.InputStream(samplerate=SAMPLE_RATE, channels=1, dtype="float32",
                        blocksize=BLOCK, callback=cb, device=dev):
        while True:
            frame = q.get()
            now = time.time()
            # echo gate: ignore mic entirely while Rick speaks + brief cooldown after (kills feedback loop)
            if rick_speaking():
                cooldown_until = now + 0.6
                utter, speaking = [], False
                continue
            if now < cooldown_until:
                utter, speaking = [], False
                continue
            rms = float(np.sqrt(np.mean(frame ** 2)))
            if rms >= SILENCE_RMS:
                speaking = True
                last_voice = now
                utter.append(frame)
            elif speaking:
                utter.append(frame)                              # keep trailing silence
                over_cap = len(utter) * BLOCK / SAMPLE_RATE >= MAX_UTTER
                if now - last_voice >= SILENCE_HANG or over_cap:
                    audio = np.concatenate(utter)
                    dur = len(audio) / SAMPLE_RATE
                    utter, speaking = [], False
                    if dur >= MIN_SPEECH:
                        res = model.generate(get_logmel(mx.array(audio), preproc))
                        txt = (res[0].text if res else "").strip()
                        norm = "".join(c for c in txt.lower() if c.isalnum())
                        # voice mute/unmute (works even while muted, so you can unmute by voice)
                        if norm in UNMUTE_WORDS:
                            if os.path.exists(MUTE_FLAG):
                                try: os.remove(MUTE_FLAG)
                                except OSError: pass
                            print("🎙 unmuted (voice)", flush=True); continue
                        if os.path.exists(MUTE_FLAG):
                            continue   # muted: ignore everything except the unmute word above
                        if norm in MUTE_WORDS:
                            open(MUTE_FLAG, "w").close()
                            print("🔇 muted (voice) — say 'unmute' to resume", flush=True); continue
                        if txt and not is_noise(txt):
                            inject(txt)

if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        print("\nlistener stopped.")
