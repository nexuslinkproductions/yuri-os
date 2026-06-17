#!/usr/bin/env python3
# @capability: voice-claude-brain-proxy
# @serves: openai-compatible claude code proxy | pipecat brain bridge | voice to claude code | drive live claude session
# @does: exposes /v1/chat/completions (OpenAI streaming shape) for Pipecat's LLM stage, but drives the LIVE interactive Claude Code tmux session — injects the user turn via `tmux send-keys` and returns the reply the Stop hook writes to a FIFO. No headless/SDK; it drives the REAL session.
# @use: the brain stage of the Pipecat voice rebuild. Run alongside a tmux-backed `claude` (bridge mode armed) so the Stop hook feeds replies back.
# @exports: (http server :8011)
import os, sys, json, time, select, subprocess
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

REPO = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", ".."))
PORT = int(os.environ.get("BRAIN_PROXY_PORT", "8011"))
TARGET = os.environ.get("VOICE_TMUX_TARGET", "claude:0.0")
FIFO = os.environ.get("VOICE_REPLY_FIFO", os.path.join(REPO, "_SYSTEM", "state", "voice", "reply.fifo"))
REPLY_TIMEOUT = float(os.environ.get("VOICE_REPLY_TIMEOUT", "180"))


def ensure_fifo():
    os.makedirs(os.path.dirname(FIFO), exist_ok=True)
    if not os.path.exists(FIFO):
        os.mkfifo(FIFO)


def inject(text):
    # drive the LIVE interactive session — keystrokes, not headless
    subprocess.run(["tmux", "send-keys", "-t", TARGET, "-l", text], check=False)
    subprocess.run(["tmux", "send-keys", "-t", TARGET, "Enter"], check=False)


def read_reply():
    # block on the FIFO the Stop hook writes, with a timeout guard
    fd = os.open(FIFO, os.O_RDONLY | os.O_NONBLOCK)
    buf = b""
    deadline = time.time() + REPLY_TIMEOUT
    try:
        while time.time() < deadline:
            r, _, _ = select.select([fd], [], [], 1.0)
            if fd in r:
                chunk = os.read(fd, 65536)
                if chunk:
                    buf += chunk
                    if buf.endswith(b"\n"):
                        break
                elif buf:
                    break
        return buf.decode("utf-8", "replace").strip()
    finally:
        os.close(fd)


class H(BaseHTTPRequestHandler):
    def log_message(self, *a):
        pass

    def _json(self, code, obj):
        self.send_response(code)
        self.send_header("Content-Type", "application/json")
        self.end_headers()
        self.wfile.write(json.dumps(obj).encode())

    def do_GET(self):
        if self.path.startswith("/health"):
            self._json(200, {"ok": True, "target": TARGET, "fifo": FIFO})
        else:
            self.send_response(404); self.end_headers()

    def do_POST(self):
        if not self.path.startswith("/v1/chat/completions"):
            self.send_response(404); self.end_headers(); return
        n = int(self.headers.get("Content-Length", "0"))
        try:
            body = json.loads(self.rfile.read(n) or b"{}")
        except Exception:
            body = {}
        user = ""
        for m in reversed(body.get("messages", [])):
            if m.get("role") == "user":
                c = m.get("content")
                user = c if isinstance(c, str) else " ".join(
                    p.get("text", "") for p in c if isinstance(p, dict))
                break
        ensure_fifo()
        if user.strip():
            inject(user.strip())
        reply = read_reply() or "Sorry, I didn't catch a reply."

        if bool(body.get("stream")):
            self.send_response(200)
            self.send_header("Content-Type", "text/event-stream")
            self.end_headers()

            def sse(d):
                self.wfile.write(f"data: {json.dumps(d)}\n\n".encode()); self.wfile.flush()
            sse({"choices": [{"delta": {"role": "assistant"}, "index": 0}]})
            sse({"choices": [{"delta": {"content": reply}, "index": 0}]})
            sse({"choices": [{"delta": {}, "index": 0, "finish_reason": "stop"}]})
            self.wfile.write(b"data: [DONE]\n\n"); self.wfile.flush()
        else:
            self._json(200, {"choices": [{"message": {"role": "assistant", "content": reply},
                                          "finish_reason": "stop", "index": 0}]})


if __name__ == "__main__":
    ensure_fifo()
    print(f"[brain-proxy] :{PORT} -> tmux {TARGET}, fifo {FIFO}", flush=True)
    ThreadingHTTPServer(("127.0.0.1", PORT), H).serve_forever()
