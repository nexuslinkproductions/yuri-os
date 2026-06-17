#!/usr/bin/env python3
# @capability: voice-mlx-tts-server
# @serves: fast rick voice server | mlx-audio tts | openai-compatible speech endpoint | streaming clone tts
# @does: loads an mlx-audio clone-capable TTS model once (Apple Silicon MLX), clones Rick from a short reference + ref_text, warms the MLX graph, and serves an OpenAI-compatible POST /v1/audio/speech. The fast successor to the Chatterbox server (voice-rick-server.py); chosen model set by VOICE_MLX_MODEL after the bake-off.
# @use: start from the .venv-tts venv; point voice-speak.sh at :8005 (VOICE_TTS_URL). Falls in the engine chain ABOVE chatterbox :8004.
# @exports: (http server)
import io, os, sys, json, wave, threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
import numpy as np
from mlx_audio.tts.utils import load_model

PORT = int(os.environ.get("VOICE_MLX_PORT", "8005"))
REPO = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", ".."))
MODEL_NAME = os.environ.get("VOICE_MLX_MODEL", "mlx-community/MOSS-TTS-Nano-100M")  # bake-off winner: RTF 0.33, first-audio 1.33s, intelligible
REF = os.environ.get("RICK_REF", os.path.join(REPO, "_SYSTEM", "state", "voice", "rick-ref-10s.wav"))
REF_TEXT_FILE = os.path.join(REPO, "_SYSTEM", "state", "voice", "rick-ref-10s.txt")
REF_TEXT = open(REF_TEXT_FILE).read().strip() if os.path.exists(REF_TEXT_FILE) else None

print(f"[mlx-tts] loading {MODEL_NAME} ...", flush=True)
MODEL = load_model(MODEL_NAME)
SR = int(getattr(MODEL, "sample_rate", None) or getattr(MODEL, "sr", 24000))

def _mono(a):
    a = np.asarray(a, dtype=np.float32).squeeze()
    if a.ndim > 1:  # MOSS outputs stereo (N,2); also handle (2,N)
        a = a.mean(axis=0) if a.shape[0] < a.shape[1] else a.mean(axis=1)
    return a

def _gen(text):
    chunks = []
    for seg in MODEL.generate(text=text, ref_audio=REF, ref_text=REF_TEXT):
        a = seg.audio if hasattr(seg, "audio") else seg
        chunks.append(_mono(a))
    return np.concatenate(chunks) if chunks else np.zeros(1, dtype=np.float32)

# warm the MLX graph once so the first real request isn't paying compile cost
try:
    _gen("Hello Marcel."); print("[mlx-tts] warmed up", flush=True)
except Exception as e:
    print(f"[mlx-tts] warmup note: {type(e).__name__}: {e}", flush=True)
print(f"[mlx-tts] READY model={MODEL_NAME} sr={SR} ref={REF} ref_text={'yes' if REF_TEXT else 'no'}", flush=True)

_lock = threading.Lock()

def synth(text):
    with _lock:  # serialize: MLX model state is not reentrant
        audio = _gen(text)
    return wav_bytes(audio, SR)

def wav_bytes(x, sr):
    x = np.clip(x, -1.0, 1.0)
    pcm = (x * 32767.0).astype("<i2").tobytes()
    buf = io.BytesIO()
    with wave.open(buf, "wb") as w:
        w.setnchannels(1); w.setsampwidth(2); w.setframerate(int(sr)); w.writeframes(pcm)
    return buf.getvalue()

class H(BaseHTTPRequestHandler):
    def log_message(self, *a): pass
    def do_GET(self):
        if self.path.startswith("/health"):
            self.send_response(200); self.send_header("Content-Type", "application/json"); self.end_headers()
            self.wfile.write(json.dumps({"ok": True, "model": MODEL_NAME, "sr": SR}).encode())
        else:
            self.send_response(404); self.end_headers()
    def do_POST(self):
        if not self.path.startswith("/v1/audio/speech"):
            self.send_response(404); self.end_headers(); return
        try:
            n = int(self.headers.get("Content-Length", "0"))
            body = json.loads(self.rfile.read(n) or b"{}")
            text = (body.get("input") or "").strip()
            if not text:
                self.send_response(400); self.end_headers(); return
            audio = synth(text)
            self.send_response(200)
            self.send_header("Content-Type", "audio/wav")
            self.send_header("Content-Length", str(len(audio)))
            self.end_headers()
            self.wfile.write(audio)
        except Exception as e:
            sys.stderr.write(f"[mlx-tts] synth error: {e}\n")
            try: self.send_response(500); self.end_headers()
            except Exception: pass

if __name__ == "__main__":
    print(f"[mlx-tts] serving http://127.0.0.1:{PORT}/v1/audio/speech", flush=True)
    ThreadingHTTPServer(("127.0.0.1", PORT), H).serve_forever()
