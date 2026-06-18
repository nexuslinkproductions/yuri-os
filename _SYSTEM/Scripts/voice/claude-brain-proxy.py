#!/usr/bin/env python3
# @capability: voice-claude-brain-proxy
# @serves: openai-compatible claude code proxy | pipecat brain bridge | voice to claude code | drive live claude session
# @does: exposes /v1/chat/completions (OpenAI streaming shape) for Pipecat's LLM stage, but drives the
#        LIVE interactive Claude Code tmux session — injects the user turn via `tmux send-keys` and returns
#        the reply the Stop hook drops as an ATOMIC per-turn FILE in the replies dir. No headless/SDK; it
#        drives the REAL session. File-drop (not a FIFO) is race-free: the writer needs no reader, rename
#        is atomic, and a per-turn drain prevents stale cross-talk (the old FIFO lost fast replies to ENXIO).
# @use: the brain stage of the Pipecat voice rebuild. Run alongside a tmux-backed `claude` (bridge mode
#        armed: VOICE_BRIDGE=1 in that session) so the Stop hook drops replies into the replies dir.
# @exports: (http server :8011)
import os, sys, json, time, subprocess
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

REPO = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", ".."))
PORT = int(os.environ.get("BRAIN_PROXY_PORT", "8011"))
TARGET = os.environ.get("VOICE_TMUX_TARGET", "claude:0.0")
REPLY_DIR = os.environ.get("VOICE_REPLY_DIR", os.path.join(REPO, "_SYSTEM", "state", "voice", "replies"))
REPLY_TIMEOUT = float(os.environ.get("VOICE_REPLY_TIMEOUT", "180"))


def ensure_dir():
    os.makedirs(REPLY_DIR, exist_ok=True)


def drain_replies():
    # clear stale reply files BEFORE injecting, so this turn only consumes Yuri's NEW reply
    try:
        for n in os.listdir(REPLY_DIR):
            if not n.startswith("."):
                try:
                    os.unlink(os.path.join(REPLY_DIR, n))
                except OSError:
                    pass
    except FileNotFoundError:
        pass


def inject(text):
    # drive the LIVE interactive session — keystrokes, not headless
    subprocess.run(["tmux", "send-keys", "-t", TARGET, "-l", text], check=False)
    subprocess.run(["tmux", "send-keys", "-t", TARGET, "Enter"], check=False)


def wait_reply(keepalive=None):
    # poll the replies dir; the Stop hook drops an atomic <id>.json when Yuri finishes her turn.
    # Race-free: file writes need no reader (no ENXIO), rename is atomic (never a partial read).
    deadline = time.time() + REPLY_TIMEOUT
    while time.time() < deadline:
        try:
            for n in sorted(os.listdir(REPLY_DIR)):
                if n.startswith("."):
                    continue
                p = os.path.join(REPLY_DIR, n)
                try:
                    with open(p) as f:
                        obj = json.load(f)
                    os.unlink(p)
                    return (obj.get("text") or "").strip()
                except (FileNotFoundError, json.JSONDecodeError):
                    continue
        except FileNotFoundError:
            pass
        if keepalive and not keepalive():
            break
        time.sleep(0.1)
    return ""


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
            self._json(200, {"ok": True, "target": TARGET, "replies": REPLY_DIR})
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
        ensure_dir()
        drain_replies()  # only consume the reply generated AFTER this injection
        if bool(body.get("stream")):
            # Headers + role chunk IMMEDIATELY, keepalive comments during the wait — the HTTP
            # connection never goes idle while Yuri thinks (fixes the earlier BrokenPipe stall).
            try:
                self.send_response(200)
                self.send_header("Content-Type", "text/event-stream")
                self.send_header("Cache-Control", "no-cache")
                self.end_headers()

                def sse(d):
                    self.wfile.write(f"data: {json.dumps(d)}\n\n".encode()); self.wfile.flush()

                def ka():
                    try:
                        self.wfile.write(b": keepalive\n\n"); self.wfile.flush(); return True
                    except Exception:
                        return False

                sse({"choices": [{"delta": {"role": "assistant"}, "index": 0}]})
                if user.strip():
                    inject(user.strip())
                reply = wait_reply(keepalive=ka) or "Sorry, I didn't catch a reply."
                sse({"choices": [{"delta": {"content": reply}, "index": 0}]})
                sse({"choices": [{"delta": {}, "index": 0, "finish_reason": "stop"}]})
                self.wfile.write(b"data: [DONE]\n\n"); self.wfile.flush()
            except (BrokenPipeError, ConnectionResetError):
                pass
        else:
            if user.strip():
                inject(user.strip())
            reply = wait_reply() or "Sorry, I didn't catch a reply."
            try:
                self._json(200, {"choices": [{"message": {"role": "assistant", "content": reply},
                                              "finish_reason": "stop", "index": 0}]})
            except (BrokenPipeError, ConnectionResetError):
                pass


if __name__ == "__main__":
    ensure_dir()
    print(f"[brain-proxy] :{PORT} -> tmux {TARGET}, replies {REPLY_DIR}", flush=True)
    ThreadingHTTPServer(("127.0.0.1", PORT), H).serve_forever()
