"""One-shot: bake the fixed Claude 'your turn' call-outs in Kokoro bm_george.
Reusable — re-run to regenerate the WAVs (e.g. to change the phrase or voice)."""
import os
import wave
import numpy as np
from kokoro_onnx import Kokoro

TTS = os.path.join(os.path.dirname(__file__), "jeffrey", "tts")
OUT = r"C:\Users\rene\.claude\voice"
VOICE = os.environ.get("CALLOUT_VOICE", "bm_george")
LANG = "en-gb"

os.makedirs(OUT, exist_ok=True)
k = Kokoro(os.path.join(TTS, "kokoro-v1.0.onnx"), os.path.join(TTS, "voices-v1.0.bin"))


def gen(text, name):
    samples, sr = k.create(text, voice=VOICE, speed=1.0, lang=LANG)
    pcm = (np.clip(samples, -1.0, 1.0) * 32767.0).astype("<i2").tobytes()
    path = os.path.join(OUT, name)
    with wave.open(path, "wb") as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(sr)
        w.writeframes(pcm)
    print(f"wrote {path}  ({len(samples)/sr:.1f}s @ {sr}Hz)")


gen("Sire, I have completed the tasks. I need you to take a look, please.", "turn.wav")
gen("Sire, I have a question that needs your input.", "input.wav")
print("DONE")
