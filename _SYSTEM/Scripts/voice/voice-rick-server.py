#!/usr/bin/env python3
# @capability: voice-rick-tts-server
# @serves: rick voice server | chatterbox turbo tts | openai-compatible speech endpoint | local rick tts
# @does: loads Chatterbox-Turbo once on Apple Silicon MPS (CPU fallback), clones Rick from a reference clip, serves an OpenAI-compatible POST /v1/audio/speech that voice-speak.sh calls.
# @use: Phase 3 Rick voice engine. Start it (from the voice venv), then the Stop-hook loop speaks in Rick's voice.
# @exports: (http server — stdlib only besides chatterbox/torch)
import io, os, sys, json, wave, threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

PORT = int(os.environ.get("VOICE_RICK_PORT", "8004"))
REPO = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", ".."))
REF  = os.environ.get("RICK_REF", os.path.join(REPO, "_SYSTEM", "state", "voice", "rick-ref.wav"))
EXAG = float(os.environ.get("VOICE_EXAGGERATION", "0.7"))   # higher = more manic
CFG  = float(os.environ.get("VOICE_CFG", "0.5"))

import torch, numpy as np
from chatterbox.tts_turbo import ChatterboxTurboTTS

DEVICE = os.environ.get("VOICE_DEVICE") or ("mps" if torch.backends.mps.is_available() else "cpu")
print(f"[rick-tts] loading Chatterbox-Turbo on {DEVICE} ...", flush=True)
try:
    MODEL = ChatterboxTurboTTS.from_pretrained(device=DEVICE)
except Exception as e:
    print(f"[rick-tts] {DEVICE} load failed ({e}); falling back to CPU", flush=True)
    DEVICE = "cpu"
    MODEL = ChatterboxTurboTTS.from_pretrained(device="cpu")
SR = MODEL.sr

# Cache the Rick speaker conditioning ONCE. Passing audio_prompt_path on every
# generate() re-embeds the reference clip each call (voice-encoder + s3gen conditioning)
# — that fixed cost was a large chunk of the per-synth latency. prepare_conditionals
# does it a single time; generate(text) then reuses the cached conds.
HAVE_CONDS = False
if os.path.exists(REF):
    try:
        MODEL.prepare_conditionals(REF, exaggeration=EXAG)
        HAVE_CONDS = True
        print("[rick-tts] Rick ref conditioning cached (no per-call re-embed)", flush=True)
    except Exception as e:
        print(f"[rick-tts] prepare_conditionals failed ({e}); will pass ref per-call", flush=True)
print(f"[rick-tts] READY device={DEVICE} sr={SR} ref={REF} exists={os.path.exists(REF)} cached={HAVE_CONDS}", flush=True)


_lock = threading.Lock()


def synth(text):
    kw = {"exaggeration": EXAG, "cfg_weight": CFG}
    if os.path.exists(REF) and not HAVE_CONDS:
        kw["audio_prompt_path"] = REF      # fallback only if caching failed
    with _lock:  # Chatterbox model is not thread-safe — serialize synth to avoid corruption/crashes
        wav = MODEL.generate(text, **kw)
    return wav_bytes(wav, SR)


def wav_bytes(wav, sr):
    # stdlib WAV encode — avoids torchaudio.save's torchcodec dependency
    x = wav.detach().cpu().numpy().squeeze()
    x = np.clip(x, -1.0, 1.0)
    pcm = (x * 32767.0).astype("<i2").tobytes()
    buf = io.BytesIO()
    with wave.open(buf, "wb") as w:
        w.setnchannels(1); w.setsampwidth(2); w.setframerate(int(sr))
        w.writeframes(pcm)
    return buf.getvalue()


class H(BaseHTTPRequestHandler):
    def log_message(self, *a):
        pass

    def do_GET(self):
        if self.path.startswith("/health"):
            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self.end_headers()
            self.wfile.write(json.dumps({
                "ok": True, "device": DEVICE, "sr": SR,
                "ref": REF, "ref_exists": os.path.exists(REF),
            }).encode())
        else:
            self.send_response(404); self.end_headers()

    def do_POST(self):
        # OpenAI-compatible: POST /v1/audio/speech  {"input": "...", ...}
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
            sys.stderr.write(f"[rick-tts] synth error: {e}\n")
            try:
                self.send_response(500); self.end_headers()
            except Exception:
                pass


if __name__ == "__main__":
    print(f"[rick-tts] serving http://127.0.0.1:{PORT}/v1/audio/speech", flush=True)
    ThreadingHTTPServer(("127.0.0.1", PORT), H).serve_forever()
