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
import os, json, subprocess
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


def run_claude(messages):
    sys_txt = SYS_DEFAULT
    convo = []
    for m in messages or []:
        role = m.get("role")
        c = m.get("content")
        txt = c if isinstance(c, str) else " ".join(
            p.get("text", "") for p in (c or []) if isinstance(p, dict))
        txt = (txt or "").strip()
        if not txt:
            continue
        if role == "system":
            sys_txt = (sys_txt + "\n" + txt).strip()
        elif role in ("user", "assistant"):
            convo.append(("You" if role == "user" else "Yuri") + ": " + txt)
    prompt = "\n".join(convo[-TURNS:]) if convo else "(no input)"
    args = ["claude", "-p"]
    if MODEL:
        args += ["--model", MODEL]
    if sys_txt:
        args += ["--append-system-prompt", sys_txt]
    args.append(prompt)
    try:
        r = subprocess.run(args, capture_output=True, text=True, timeout=TIMEOUT)
        return (r.stdout or "").strip() or (r.stderr or "").strip() or "I didn't catch that."
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
