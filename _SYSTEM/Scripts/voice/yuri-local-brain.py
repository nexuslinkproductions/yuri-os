#!/usr/bin/env python3
# @capability: voice-local-slm-brain
# @serves: free local brain for voice | ollama openai endpoint for yuri | snappy on-device voice brain | local slm becomes yuri with memory | slm tool calling capabilities
# @does: OpenAI-compatible /v1/chat/completions that drives a LOCAL Ollama model (default llama3.2) as
#        Yuri's brain. On-device, $0, private, snappy. Keeps a rolling conversation transcript persisted
#        to disk (memory across turns AND restarts — the local-SLM equivalent of `claude -p --resume`),
#        caps num_ctx LOW so it stays light, strips any <think> CoT, and exposes CAPABILITIES as
#        model-driven tools (the model itself decides when to call them — e.g. spawn a worker terminal).
# @use: the snappy local brain stage of the Pipecat voice loop. `python yuri-local-brain.py` then point
#        bot.py at http://127.0.0.1:8013/v1 (yuri-local.sh does this). Add capabilities to TOOLS +
#        _exec_tool. Swap the model with YURI_LOCAL_MODEL.
# @exports: (http server :8013)
import os, json, uuid, re, subprocess, urllib.request
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

PORT = int(os.environ.get("YURI_LOCAL_BRAIN_PORT", "8013"))

# ── Operator-aware selection — mirrors .claude/operator.json `persona.overlay` (the same per-machine
# identity brain-inject.js + yuri-z-brain.py read). "Jeffrey" = René's LOCAL Windows lane (COO for
# Custom Gear Solution, on the RTX 5060 Ti); anything else keeps Marcel's Yuri default byte-identical.
# Force with env YURI_VOICE_OPERATOR=jeffrey|marcel.
def _detect_operator():
    op = os.environ.get("YURI_VOICE_OPERATOR", "").strip().lower()
    if op:
        return op
    try:
        _prof = os.path.join(os.path.dirname(__file__), "..", "..", "..", ".claude", "operator.json")
        with open(_prof, encoding="utf-8") as _f:
            overlay = (json.load(_f).get("persona", {}).get("overlay") or "").strip().lower()
        if overlay:
            return overlay
    except Exception:
        pass
    return "marcel"

_OPERATOR = _detect_operator()
_JEFFREY = _OPERATOR == "jeffrey"

# Model default: Jeffrey -> qwen3:14b (the research-recommended local tool-caller for voice —
# jeffrey-voice-stack-2026-07-04.md: "Qwen3 14B or 8B, best local tool-callers; avoid think-mode for
# voice"; René has it pulled and it runs 100% GPU on the 5060 Ti 16GB). Marcel -> the snappy
# non-reasoning llama3.2. Any <think> CoT is stripped below regardless, so a thinking-capable model is
# still safe for voice (never spoken); disabling thinking for lower latency is a tuning follow-up.
MODEL = os.environ.get("YURI_LOCAL_MODEL", "qwen3:14b" if _JEFFREY else "llama3.2:latest")
OLLAMA = os.environ.get("OLLAMA_HOST", "http://localhost:11434").rstrip("/")
if not OLLAMA.startswith(("http://", "https://")):  # OLLAMA_HOST is often bare host:port
    OLLAMA = "http://" + OLLAMA
NUM_CTX = int(os.environ.get("YURI_LOCAL_NUM_CTX", "4096"))   # cap LOW — the 128k default ballooned to 10GB
TEMP = float(os.environ.get("YURI_LOCAL_TEMP", "0.7"))
TIMEOUT = float(os.environ.get("YURI_LOCAL_TIMEOUT", "120"))  # headroom for a reasoning model's cold load + CoT
TURNS = int(os.environ.get("YURI_LOCAL_CONTEXT_TURNS", "12"))  # rolling history depth (each turn = 2 msgs)
SYS_DEFAULT = os.environ.get(
    "YURI_LOCAL_SYSTEM",
    "You are Yuri, a spoken voice assistant talking out loud to Marcel. Reply in ONE or two natural, "
    "conversational sentences — no markdown, no lists, no headings, no reasoning aloud. Be concise, "
    "direct, warm, and human. You run fully on-device. You have tools, but call a tool ONLY when Marcel "
    "EXPLICITLY asks for that exact action (e.g. he literally says to open or spawn a terminal or worker). "
    "For questions, chit-chat, acknowledgements, or anything else, just talk — do NOT call any tool. "
    "After a tool runs, tell him briefly what you did.",
)

# ── Jeffrey (local Windows) system prompt — load the spoken brain doc + an honest Windows tool note.
# Single-sourced at jeffrey-voice-brain.md (the same file yuri-z-brain.py loads for the cloud lane), so
# Jeffrey's identity is defined in ONE place across both brains. The macOS spawn_worker tool is NOT
# offered in Jeffrey mode (its bash/tmux helper doesn't run on Windows); app-control is the roadmap.
# Marcel keeps SYS_DEFAULT byte-identical.
JEFFREY_BRAIN_FILE = os.path.join(os.path.dirname(__file__), "jeffrey-voice-brain.md")
JEFFREY_TOOL_NOTE = (
    "\n\n## YOUR HANDS (Windows — honest)\n"
    "You run fully on-device via Ollama. You reason, converse, summarise, and draft. Full voice-driven "
    "Windows app control (launching apps, typing, clicking, navigating) is the ROADMAP — not wired yet. "
    "Do NOT claim to open apps, click, or see the screen; when a task needs that, say so plainly and "
    "offer what you CAN do. Never fabricate a result. CONFIRM-GATE: you organise, remind, propose, and "
    "draft; René decides and executes. Speak your intent and HOLD for his spoken yes before anything "
    "decision-bearing or outward-facing — sending, ordering, quoting a price, deleting, changing a shop "
    "order. Company internals and personal customer data never leave the machine unmasked.")


def _build_local_system():
    """Marcel -> the existing SYS_DEFAULT (already honors YURI_LOCAL_SYSTEM). Jeffrey -> the spoken brain
    doc + honest Windows tool note, unless YURI_LOCAL_SYSTEM explicitly overrides."""
    if not _JEFFREY:
        return SYS_DEFAULT
    override = os.environ.get("YURI_LOCAL_SYSTEM")
    if override:
        return override
    try:
        with open(JEFFREY_BRAIN_FILE, encoding="utf-8") as f:
            return f.read().strip() + JEFFREY_TOOL_NOTE
    except Exception:
        return ("You are Jeffrey, René's COO voice assistant for Custom Gear Solution — reply in one or "
                "two natural spoken sentences, British-butler 'Sir', no filler." + JEFFREY_TOOL_NOTE)


SYSTEM = _build_local_system()

# Persisted rolling transcript = Yuri's memory across turns AND restarts (the local-SLM stand-in for
# claude -p --resume). One source of truth lives here in the brain, independent of the client.
HIST_FILE = os.path.join(os.path.dirname(__file__), "..", "..", "state", "voice", "yuri-local-history.json")

_THINK = re.compile(r"<think>.*?</think>", re.DOTALL | re.IGNORECASE)

SPAWN_HELPER = os.path.join(os.path.dirname(__file__), "yuri-spawn-worker.sh")
WORKER_NAME = os.environ.get("YURI_WORKER_NAME", "worker1")

# CAPABILITIES — the model CHOOSES to call these (real tool calling, not a wrapper regex). This is the
# surface to grow: add a tool schema here + a branch in _exec_tool. Marcel tests how reliably she uses them.
TOOLS = [{
    "type": "function",
    "function": {
        "name": "spawn_worker",
        "description": ("Open a NEW worker terminal (a visible Terminal window running a Claude Code "
                        "session). Call this ONLY when Marcel EXPLICITLY asks to open/spawn/launch/start a "
                        "terminal, worker, or session. Do NOT call it for questions, acknowledgements, or talk."),
        "parameters": {
            "type": "object",
            "properties": {
                "task": {"type": "string",
                         "description": "Optional first task/prompt to send the worker. Omit if he only wants it opened."}
            },
        },
    },
}]

# Jeffrey's tools (Windows-safe, read-only): search René's OWN local files so he knows what's on the
# machine (his second brain). spawn_worker stays Marcel-only (its bash/tmux helper is macOS). Full
# voice-driven app-control is still roadmap.
JEFFREY_TOOLS = [{
    "type": "function",
    "function": {
        "name": "search_files",
        "description": ("Search René's OWN local files — CGS CAD / holster designs, laser projects, blocking "
                        "SVGs, business docs — by keyword. Call this when he asks what he has, whether a "
                        "design/product/document exists, or to find a file (e.g. 'do I have a Glock 17 TLR-1 "
                        "design?'). Returns matching file names + paths. Read-only, on-device."),
        "parameters": {
            "type": "object",
            "properties": {
                "query": {"type": "string", "description": "Keywords, e.g. 'glock 17 tlr1' or 'kydex black' or 'p320 blocking'."}
            },
            "required": ["query"],
        },
    },
}]
TOOLS_ACTIVE = JEFFREY_TOOLS if _JEFFREY else TOOLS


def _strip_think(t: str) -> str:
    """Remove a reasoning model's <think> CoT so it's never spoken (llama3.2 emits none; future-proofs a swap)."""
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
    """Run a capability the model chose to call; return a short result string fed back to the model."""
    if name == "spawn_worker":
        task = ((args or {}).get("task") or "").strip()
        try:
            cmd = ["bash", SPAWN_HELPER, WORKER_NAME] + ([task] if task else [])
            subprocess.Popen(cmd, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)  # non-blocking (4s boot)
            return f"worker '{WORKER_NAME}' terminal is opening" + (f" with task: {task}" if task else "")
        except Exception as e:
            return f"failed to open worker: {str(e)[:60]}"
    if name == "search_files":
        q = ((args or {}).get("query") or "").strip()
        if not q:
            return "no search query given"
        try:
            idx = os.path.join(os.path.dirname(__file__), "..", "jeffrey-file-index.mjs")
            out = subprocess.run(["node", idx, "--query", q, "--limit", "8"],
                                 capture_output=True, text=True, timeout=30)
            data = json.loads(out.stdout or "{}")
            hits = data.get("hits", [])
            if not hits:
                return f"No local files matched '{q}'."
            return "Found these local files:\n" + "\n".join(f"- {h['name']}  ({h['path']})" for h in hits[:8])
        except Exception as e:
            return f"file search failed: {str(e)[:80]}"
    return f"unknown tool: {name}"


def _ollama_chat(messages, tools=None):
    """Call Ollama native /api/chat (honors options.num_ctx). Returns the assistant message dict
    (may carry tool_calls)."""
    payload = {"model": MODEL, "messages": messages, "stream": False,
               "options": {"num_ctx": NUM_CTX, "temperature": TEMP}}
    if tools:
        payload["tools"] = tools
    req = urllib.request.Request(f"{OLLAMA}/api/chat", data=json.dumps(payload).encode(),
                                 headers={"Content-Type": "application/json"})
    with urllib.request.urlopen(req, timeout=TIMEOUT) as r:
        d = json.loads(r.read())
    return d.get("message", {}) or {}


def run_brain(req_messages):
    user_msg = _latest_user(req_messages) or "(no input)"
    hist = _load_history()
    send = [{"role": "system", "content": SYSTEM}] + hist[-(2 * TURNS):] + [
        {"role": "user", "content": user_msg}]

    try:
        msg = _ollama_chat(send, tools=TOOLS_ACTIVE)
    except Exception:
        try:                                  # model without tool support -> still let her talk
            msg = _ollama_chat(send)
        except Exception as e:
            return f"My local brain hiccuped: {str(e)[:80]}"

    # She chose a capability: run it, feed the result back, let her speak the outcome.
    tool_calls = msg.get("tool_calls") or []
    if tool_calls:
        send.append(msg)
        for tc in tool_calls:
            fn = tc.get("function") or {}
            send.append({"role": "tool", "content": _exec_tool(fn.get("name", ""), fn.get("arguments") or {})})
        try:
            msg = _ollama_chat(send)   # NO tools on the confirm pass -> she just speaks, can't re-spawn in a loop
        except Exception:
            msg = {"content": "Done."}

    reply = _strip_think(msg.get("content", "")) or "Okay."
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
            self.wfile.write(json.dumps({"ok": True, "brain": "ollama-local", "operator": _OPERATOR,
                                         "model": MODEL,
                                         "tools": [t["function"]["name"] for t in TOOLS_ACTIVE]}).encode())
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
    print(f"[yuri-local-brain] :{PORT} operator={_OPERATOR} -> ollama {MODEL} (on-device, free, "
          f"num_ctx={NUM_CTX}, tools={[t['function']['name'] for t in TOOLS_ACTIVE]})", flush=True)
    ThreadingHTTPServer(("127.0.0.1", PORT), H).serve_forever()
