#!/usr/bin/env python3
# @capability: voice-zai-glm-brain
# @serves: glm voice brain | z.ai brain for yuri | snappy claude-class voice brain | glm-5-turbo voice | replace claude -p brain
# @does: OpenAI-compatible /v1/chat/completions (for bot.py) that drives a Z.ai GLM model (default
#        glm-5-turbo — Claude-class + ~snappy, no claude -p spawn lag) over Z.ai's Anthropic Messages
#        endpoint (api.z.ai/api/anthropic, Bearer auth — the surface the GLM Coding Plan subscription
#        covers; the OpenAI /paas/v4 surface 429s on the plan). Persisted rolling-transcript memory
#        across turns AND restarts, model-driven tool-calling (spawn_worker), <think> strip.
# @use: the snappy cloud brain stage of the Pipecat voice loop. `python yuri-z-brain.py` then point
#        bot.py at http://127.0.0.1:8014/v1 (yuri.sh does this). Key from ZAI_API_KEY or keychain
#        yuri-zai-api-key. Swap model with ZAI_MODEL.
# @exports: (http server :8014)
import os, json, re, subprocess, urllib.request
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

PORT = int(os.environ.get("YURI_Z_BRAIN_PORT", "8014"))
MODEL = os.environ.get("ZAI_MODEL", "glm-5-turbo")
ZAI_URL = os.environ.get("ZAI_BASE_URL", "https://api.z.ai/api/anthropic").rstrip("/")
MAX_TOKENS = int(os.environ.get("YURI_Z_MAX_TOKENS", "1024"))   # voice replies are short
TIMEOUT = float(os.environ.get("YURI_Z_TIMEOUT", "60"))
TURNS = int(os.environ.get("YURI_Z_CONTEXT_TURNS", "12"))


def _zai_key():
    k = os.environ.get("ZAI_API_KEY", "").strip()
    if k:
        return k
    try:
        return subprocess.run(["security", "find-generic-password", "-a", os.environ.get("USER", ""),
                               "-s", "yuri-zai-api-key", "-w"], capture_output=True, text=True).stdout.strip()
    except Exception:
        return ""


SYS_DEFAULT = os.environ.get(
    "YURI_Z_SYSTEM",
    "You are Yuri, a spoken voice assistant talking out loud to Marcel. Reply in ONE or two natural, "
    "conversational sentences — no markdown, no lists, no headings, no reasoning aloud. Be concise, "
    "direct, warm, and human. You have tools, but call a tool ONLY when Marcel EXPLICITLY asks for that "
    "exact action (e.g. he literally says to open or spawn a terminal or worker). For questions, "
    "chit-chat, or anything else, just talk — do NOT call any tool. After a tool runs, say briefly what you did.",
)

HIST_FILE = os.path.join(os.path.dirname(__file__), "..", "..", "state", "voice", "yuri-z-history.json")
_THINK = re.compile(r"<think>.*?</think>", re.DOTALL | re.IGNORECASE)

SPAWN_HELPER = os.path.join(os.path.dirname(__file__), "yuri-spawn-worker.sh")
WORKER_NAME = os.environ.get("YURI_WORKER_NAME", "worker1")

# Capabilities the model CHOOSES to call (Anthropic tool schema: name/description/input_schema).
TOOLS = [{
    "name": "spawn_worker",
    "description": ("Open a NEW worker terminal (a visible Terminal window running a Claude Code session). "
                    "Call this ONLY when Marcel EXPLICITLY asks to open/spawn/launch/start a terminal, worker, "
                    "or session. Do NOT call it for questions, acknowledgements, or general talk."),
    "input_schema": {
        "type": "object",
        "properties": {"task": {"type": "string", "description": "Optional first task to send the worker; omit if he only wants it opened."}},
    },
}]


def _strip_think(t: str) -> str:
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


def _exec_tool(name, args):
    if name == "spawn_worker":
        task = ((args or {}).get("task") or "").strip()
        try:
            cmd = ["bash", SPAWN_HELPER, WORKER_NAME] + ([task] if task else [])
            subprocess.Popen(cmd, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)  # non-blocking
            return f"worker '{WORKER_NAME}' terminal is opening" + (f" with task: {task}" if task else "")
        except Exception as e:
            return f"failed to open worker: {str(e)[:60]}"
    return f"unknown tool: {name}"


def _messages_call(messages, system):
    """One call to Z.ai's Anthropic Messages endpoint. Returns the parsed message dict
    {content:[blocks], stop_reason}. Bearer auth (the GLM Coding Plan convention)."""
    body = json.dumps({
        "model": MODEL, "max_tokens": MAX_TOKENS, "system": system,
        "messages": messages, "tools": TOOLS, "stream": False,
    }).encode()
    req = urllib.request.Request(f"{ZAI_URL}/v1/messages", data=body, headers={
        "Content-Type": "application/json",
        "Authorization": f"Bearer {_zai_key()}",
        "anthropic-version": "2023-06-01",
    })
    with urllib.request.urlopen(req, timeout=TIMEOUT) as r:
        return json.loads(r.read())


def _text_of(content):
    """Join the text blocks of an Anthropic content array."""
    if isinstance(content, str):
        return content
    return " ".join(b.get("text", "") for b in (content or []) if isinstance(b, dict) and b.get("type") == "text").strip()


def run_brain(req_messages):
    user_msg = _latest_user(req_messages) or "(no input)"
    hist = _load_history()
    messages = hist[-(2 * TURNS):] + [{"role": "user", "content": user_msg}]
    try:
        resp = _messages_call(messages, SYS_DEFAULT)
    except Exception as e:
        return f"My GLM brain hiccuped: {str(e)[:90]}"

    content = resp.get("content") or []
    tool_uses = [b for b in content if isinstance(b, dict) and b.get("type") == "tool_use"]
    if tool_uses:
        # Run the chosen capabilities, feed the results back, let her speak the outcome.
        results = [{"type": "tool_result", "tool_use_id": b.get("id"),
                    "content": _exec_tool(b.get("name", ""), b.get("input") or {})} for b in tool_uses]
        followup = messages + [{"role": "assistant", "content": content}, {"role": "user", "content": results}]
        try:
            resp = _messages_call(followup, SYS_DEFAULT)
        except Exception:
            resp = {"content": [{"type": "text", "text": "Done."}]}

    reply = _strip_think(_text_of(resp.get("content"))) or "Okay."
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
            self.wfile.write(json.dumps({"ok": True, "brain": "z.ai-glm", "model": MODEL,
                                         "haskey": bool(_zai_key())}).encode())
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
    print(f"[yuri-z-brain] :{PORT} -> z.ai {MODEL} (Anthropic Messages, Bearer, $0 on the plan)", flush=True)
    ThreadingHTTPServer(("127.0.0.1", PORT), H).serve_forever()
