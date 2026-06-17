#!/usr/bin/env python3
# @capability: voice-marvis-tts-server
# @serves: marvis rick voice server | streaming clone tts http | openai-compatible marvis | rick voice for the stop hook
# @does: loads Marvis (mlx-audio) once, serves an OpenAI-compatible /v1/audio/speech that clones Rick from the ref and returns a wav. Thread-locked (single MLX model). Powers the Stop-hook voice path via voice-speak.sh on :8004.
# @use: run from .venv-pipecat python; voice-speak.sh hits it on :8004.
# @exports: (http server)
import os, io, sys, json, wave, threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
import numpy as np
from mlx_audio.tts.utils import load_model

REPO = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", ".."))
PORT = int(os.environ.get("VOICE_MARVIS_PORT", "8004"))
REF = os.environ.get("RICK_REF", os.path.join(REPO, "_SYSTEM", "state", "voice", "rick-ref.wav"))
MODEL = os.environ.get("MARVIS_MODEL", "Marvis-AI/marvis-tts-250m-v0.2")
SR = 24000

print(f"[marvis-srv] loading {MODEL} ...", flush=True)
_model = load_model(MODEL)
_lock = threading.Lock()

# Cloning needs ref_text (the ref transcript) — without it Marvis produces a generic voice.
# Transcribe the ref ONCE at startup (this is what generate_audio does internally).
REF_TEXT = os.environ.get("RICK_REF_TEXT")
REF_TEXT_CACHE = os.path.join(os.path.dirname(REF), "rick-ref.txt")
if not REF_TEXT and os.path.exists(REF_TEXT_CACHE):
    try:
        REF_TEXT = open(REF_TEXT_CACHE, encoding="utf-8").read().strip()
        print("[marvis-srv] ref_text loaded from cache", flush=True)
    except Exception:
        REF_TEXT = None
if not REF_TEXT and os.path.exists(REF):
    try:
        from mlx_audio.stt import load as load_stt
        print("[marvis-srv] transcribing ref for clone alignment ...", flush=True)
        _stt = load_stt("mlx-community/whisper-large-v3-turbo-asr-fp16")
        REF_TEXT = _stt.generate(REF).text
        del _stt
        try:
            open(REF_TEXT_CACHE, "w", encoding="utf-8").write(REF_TEXT)
        except Exception:
            pass
        print(f"[marvis-srv] ref_text = {REF_TEXT!r}", flush=True)
    except Exception as e:
        print(f"[marvis-srv] ref transcription FAILED: {e} (clone will be weak)", flush=True)
        REF_TEXT = None
print(f"[marvis-srv] READY :{PORT} ref={REF} ref_text={'set' if REF_TEXT else 'NONE'}", flush=True)


def synth(text):
    with _lock:  # single MLX model — serialize requests
        chunks = []
        for seg in _model.generate(text=text, ref_audio=REF, ref_text=REF_TEXT, stream=False,
                                   verbose=False):
            chunks.append(np.array(seg.audio, dtype=np.float32).reshape(-1))
    audio = np.concatenate(chunks) if chunks else np.zeros(1, dtype=np.float32)
    pcm = (np.clip(audio, -1.0, 1.0) * 32767.0).astype("<i2").tobytes()
    buf = io.BytesIO()
    with wave.open(buf, "wb") as w:
        w.setnchannels(1); w.setsampwidth(2); w.setframerate(SR); w.writeframes(pcm)
    return buf.getvalue()


class H(BaseHTTPRequestHandler):
    def log_message(self, *a): pass

    def do_GET(self):
        if self.path.startswith("/health"):
            self.send_response(200); self.send_header("Content-Type", "application/json"); self.end_headers()
            self.wfile.write(json.dumps({"ok": True, "engine": "marvis", "ref_exists": os.path.exists(REF)}).encode())
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
            self.send_response(200); self.send_header("Content-Type", "audio/wav")
            self.send_header("Content-Length", str(len(audio))); self.end_headers()
            self.wfile.write(audio)
        except Exception as e:
            sys.stderr.write(f"[marvis-srv] synth error: {e}\n")
            try:
                self.send_response(500); self.end_headers()
            except Exception:
                pass


if __name__ == "__main__":
    ThreadingHTTPServer(("127.0.0.1", PORT), H).serve_forever()
