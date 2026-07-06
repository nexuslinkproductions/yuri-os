#!/usr/bin/env python3
# @capability: voice-claude-p-brain
# @serves: free claude brain for voice | claude -p openai endpoint | pipecat llm via max subscription | jarvis brain no api cost
# @does: OpenAI-compatible /v1/chat/completions that drives `claude -p` HEADLESS on the Max SUBSCRIPTION
#        (FREE — not the metered Anthropic API). Each turn: fold the conversation -> `claude -p
#        [--model M] [--append-system-prompt SYS] <prompt>` -> stdout = the reply -> back to Pipecat.
# @use: the free brain stage of the Pipecat voice loop (JARVIS/Yuri). `python claude-p-brain.py` then
#        point bot.py's LLM service at http://127.0.0.1:8012/v1. Owner override 2026-06-18: the
#        no-headless rule is LIFTED for this voice companion lane (Anthropic restriction postponed);
#        uses the Max subscription, never an API key. Reply stays conversational (spoken register).
# @exports: (http server :8012)
import os, json, subprocess, uuid
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

PORT = int(os.environ.get("CLAUDE_P_BRAIN_PORT", "8012"))
MODEL = os.environ.get("CLAUDE_P_MODEL", "")  # optional: sonnet | opus | <model-id>; empty = CLI default
TIMEOUT = float(os.environ.get("CLAUDE_P_TIMEOUT", "180"))
TURNS = int(os.environ.get("CLAUDE_P_CONTEXT_TURNS", "12"))  # bounded recent history per call
SYS_DEFAULT = os.environ.get(
    "CLAUDE_P_SYSTEM",
    "You are Yuri, a spoken voice assistant talking out loud to Marcel. Reply in ONE or two natural, "
    "conversational sentences — no markdown, no code blocks, no lists, no headings. Be concise, direct, "
    "and human; if you don't know, say so briefly.",
)

WORKER_TARGET = os.environ.get("YURI_WORKER_TARGET", "yuri-worker:0.0")  # tmux session:window.pane
DISPATCH = os.environ.get("YURI_DISPATCH", "0") == "1"
DISPATCH_NOTE = (
    "\n\nYou ALSO command a separate 'worker' Claude running in a terminal that Marcel watches. When "
    "Marcel clearly wants the worker to DO development work (build, edit, run, fix, or investigate code), "
    "emit EXACTLY one line beginning 'DISPATCH:' followed by a complete, self-contained prompt for the "
    "worker, then a separate ONE short spoken sentence telling Marcel what you sent it. If he is only "
    "talking with you or asking a question, do NOT dispatch — just reply normally."
)


def _handle_dispatch(reply):
    """Pull any 'DISPATCH:' line out of the reply, inject it into the worker tmux pane via send-keys,
    and return only the spoken remainder. Headless dispatch: Yuri (claude -p) composes the worker
    prompt, this wrapper does the deterministic injection (no focus war — terminal send-keys)."""
    if not DISPATCH or "DISPATCH:" not in reply.upper():
        return reply
    spoken, tasks = [], []
    for line in reply.splitlines():
        if line.strip().upper().startswith("DISPATCH:"):
            task = line.split(":", 1)[1].strip()
            if task:
                tasks.append(task)
        else:
            spoken.append(line)
    for task in tasks:
        try:
            subprocess.run(["tmux", "send-keys", "-t", WORKER_TARGET, "-l", task], check=False)
            subprocess.run(["tmux", "send-keys", "-t", WORKER_TARGET, "Enter"], check=False)
        except Exception:
            pass
    out = " ".join(s.strip() for s in spoken if s.strip()).strip()
    return out or ("Sent it to the worker." if tasks else reply)


# Persistent Yuri session: resume the SAME claude session every turn so she keeps real memory +
# continuity (claude holds the whole conversation natively — no 12-turn fold), with headless
# reliability and the natural -p voice. The session id persists across restarts too.
SESSION_FILE = os.path.join(os.path.dirname(__file__), "..", "..", "state", "voice", "yuri-session-id")


def _latest_user(messages):
    for m in reversed(messages or []):
        if m.get("role") == "user":
            c = m.get("content")
            return (c if isinstance(c, str) else " ".join(
                p.get("text", "") for p in (c or []) if isinstance(p, dict))).strip()
    return ""


def _run(args, user_msg):
    r = subprocess.run(args + [user_msg], capture_output=True, text=True, timeout=TIMEOUT)
    return r.returncode, ((r.stdout or "").strip() or (r.stderr or "").strip())


def run_claude(messages):
    user_msg = _latest_user(messages) or "(no input)"
    sys_full = SYS_DEFAULT + (DISPATCH_NOTE if DISPATCH else "")
    sid = ""
    try:
        with open(SESSION_FILE) as f:
            sid = f.read().strip()
    except Exception:
        pass
    try:
        # Resume the existing session (real memory). Send ONLY the new turn — claude has the history.
        if sid:
            rc, out = _run(["claude", "-p", "--resume", sid], user_msg)
            if rc == 0:
                return _handle_dispatch(out or "I didn't catch that.")
            # stale/missing session id -> fall through and create a fresh one
        sid = str(uuid.uuid4())
        create = ["claude", "-p", "--session-id", sid]
        if MODEL:
            create += ["--model", MODEL]
        if sys_full:
            create += ["--append-system-prompt", sys_full]
        rc, out = _run(create, user_msg)
        if rc == 0:
            try:
                os.makedirs(os.path.dirname(SESSION_FILE), exist_ok=True)
                with open(SESSION_FILE, "w") as f:
                    f.write(sid)
            except Exception:
                pass
        return _handle_dispatch(out or "I didn't catch that.")
    except subprocess.TimeoutExpired:
        return "Sorry, I took too long thinking on that one."
    except Exception as e:
        return f"brain error: {e}"


class H(BaseHTTPRequestHandler):
    def log_message(self, *a):
        pass

    def do_GET(self):
        if self.path.startswith("/health"):
            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self.end_headers()
            self.wfile.write(json.dumps({"ok": True, "brain": "claude -p", "model": MODEL or "default"}).encode())
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
        reply = run_claude(body.get("messages", []))
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
            self.wfile.write(json.dumps({"choices": [{"message": {"role": "assistant", "content": reply}, "finish_reason": "stop", "index": 0}]}).encode())


if __name__ == "__main__":
    print(f"[claude-p-brain] :{PORT} -> claude -p (Max subscription, free), model={MODEL or 'default'}", flush=True)
    ThreadingHTTPServer(("127.0.0.1", PORT), H).serve_forever()
