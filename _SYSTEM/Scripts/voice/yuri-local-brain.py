#!/usr/bin/env python3
# @capability: voice-local-slm-brain
# @serves: free local brain for voice | ollama openai endpoint for yuri | snappy on-device voice brain | local slm becomes yuri with memory
# @does: OpenAI-compatible /v1/chat/completions that drives a LOCAL Ollama model (default llama3.2 —
#        0.7s warm, true chat model) as Yuri's brain. On-device, $0, private, snappy. Keeps a rolling
#        conversation transcript persisted to disk (memory across turns AND restarts — the local-SLM
#        equivalent of `claude -p --resume`), caps num_ctx LOW so it stays featherweight, and strips
#        any <think> CoT so a reasoning model never speaks its reasoning aloud.
# @use: the snappy local brain stage of the Pipecat voice loop. `python yuri-local-brain.py` then point
#        bot.py at http://127.0.0.1:8013/v1 (yuri-local.sh does this). Swap the model with
#        YURI_LOCAL_MODEL (e.g. a reasoning model — <think> is stripped automatically).
# @exports: (http server :8013)
import os, json, uuid, re, urllib.request
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

PORT = int(os.environ.get("YURI_LOCAL_BRAIN_PORT", "8013"))
MODEL = os.environ.get("YURI_LOCAL_MODEL", "llama3.2:latest")
OLLAMA = os.environ.get("OLLAMA_HOST", "http://localhost:11434").rstrip("/")
if not OLLAMA.startswith(("http://", "https://")):  # OLLAMA_HOST is often bare host:port
    OLLAMA = "http://" + OLLAMA
NUM_CTX = int(os.environ.get("YURI_LOCAL_NUM_CTX", "4096"))   # cap LOW — the 128k default ballooned to 10GB
TEMP = float(os.environ.get("YURI_LOCAL_TEMP", "0.7"))
TIMEOUT = float(os.environ.get("YURI_LOCAL_TIMEOUT", "60"))
TURNS = int(os.environ.get("YURI_LOCAL_CONTEXT_TURNS", "12"))  # rolling history depth (each turn = 2 msgs)
SYS_DEFAULT = os.environ.get(
    "YURI_LOCAL_SYSTEM",
    "You are Yuri, a spoken voice assistant talking out loud to Marcel. Reply in ONE or two natural, "
    "conversational sentences — no markdown, no code blocks, no lists, no headings, no reasoning aloud. "
    "Be concise, direct, warm, and human. If you don't know, say so briefly. You run fully on-device.",
)

# Persisted rolling transcript = Yuri's memory across turns AND restarts (the local-SLM stand-in for
# claude -p --resume). One source of truth lives here in the brain, independent of the client.
HIST_FILE = os.path.join(os.path.dirname(__file__), "..", "..", "state", "voice", "yuri-local-history.json")

_THINK = re.compile(r"<think>.*?</think>", re.DOTALL | re.IGNORECASE)


def _strip_think(t: str) -> str:
    """Remove a reasoning model's <think> CoT so it's never spoken. If a trace opened but never
    closed (truncated), drop everything from <think> on. llama3.2 emits none — this future-proofs
    swapping in a reasoning model via YURI_LOCAL_MODEL."""
    t = _THINK.sub("", t)
    i = t.lower().find("<think>")
    if i != -1:
        t = t[:i]
    return t.strip()


def _latest_user(messages):
    for m in reversed(messages or []):
        if m.get("role") == "user":
            c = m.get("content")
            return (c if isinstance(c, str) else " ".join(
                p.get("text", "") for p in (c or []) if isinstance(p, dict))).strip()
    return ""


def _load_history():
    try:
        with open(HIST_FILE) as f:
            h = json.load(f)
            return h if isinstance(h, list) else []
    except Exception:
        return []


def _save_history(hist):
    try:
        os.makedirs(os.path.dirname(HIST_FILE), exist_ok=True)
        tmp = HIST_FILE + ".tmp"
        with open(tmp, "w") as f:
            json.dump(hist[-(2 * TURNS):], f)
        os.replace(tmp, HIST_FILE)
    except Exception:
        pass


def _ollama_chat(messages):
    """Call Ollama's NATIVE /api/chat (honors options.num_ctx, unlike the OpenAI-compat shim)."""
    payload = json.dumps({
        "model": MODEL,
        "messages": messages,
        "stream": False,
        "options": {"num_ctx": NUM_CTX, "temperature": TEMP},
    }).encode()
    req = urllib.request.Request(f"{OLLAMA}/api/chat", data=payload,
                                 headers={"Content-Type": "application/json"})
    with urllib.request.urlopen(req, timeout=TIMEOUT) as r:
        d = json.loads(r.read())
    return (d.get("message", {}) or {}).get("content", "").strip()


def run_brain(req_messages):
    user_msg = _latest_user(req_messages) or "(no input)"
    hist = _load_history()
    send = [{"role": "system", "content": SYS_DEFAULT}] + hist[-(2 * TURNS):] + [
        {"role": "user", "content": user_msg}]
    try:
        raw = _ollama_chat(send)
    except Exception as e:
        return f"My local brain hiccuped: {str(e)[:80]}"
    reply = _strip_think(raw) or "I didn't catch that."
    hist.append({"role": "user", "content": user_msg})
    hist.append({"role": "assistant", "content": reply})
    _save_history(hist)
    return reply


class H(BaseHTTPRequestHandler):
    def log_message(self, *a):
        pass

    def do_GET(self):
        if self.path.startswith("/health"):
            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self.end_headers()
            self.wfile.write(json.dumps({"ok": True, "brain": "ollama-local", "model": MODEL}).encode())
        else:
            self.send_response(404)
            self.end_headers()

    def do_POST(self):
        if not self.path.startswith("/v1/chat/completions"):
            self.send_response(404)
            self.end_headers()
            return
        n = int(self.headers.get("Content-Length", "0"))
        try:
            body = json.loads(self.rfile.read(n) or b"{}")
        except Exception:
            body = {}
        reply = run_brain(body.get("messages", []))
        if bool(body.get("stream")):
            self.send_response(200)
            self.send_header("Content-Type", "text/event-stream")
            self.end_headers()

            def sse(d):
                self.wfile.write(f"data: {json.dumps(d)}\n\n".encode())
                self.wfile.flush()
            sse({"choices": [{"delta": {"role": "assistant"}, "index": 0}]})
            sse({"choices": [{"delta": {"content": reply}, "index": 0}]})
            sse({"choices": [{"delta": {}, "index": 0, "finish_reason": "stop"}]})
            self.wfile.write(b"data: [DONE]\n\n")
            self.wfile.flush()
        else:
            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self.end_headers()
            self.wfile.write(json.dumps({"choices": [{"message": {"role": "assistant", "content": reply},
                                                      "finish_reason": "stop", "index": 0}]}).encode())


if __name__ == "__main__":
    print(f"[yuri-local-brain] :{PORT} -> ollama {MODEL} (on-device, free, num_ctx={NUM_CTX})", flush=True)
    ThreadingHTTPServer(("127.0.0.1", PORT), H).serve_forever()
