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


PERSONA_FILE = os.path.join(os.path.dirname(__file__), "yuri-voice-brain.md")
MEMORY_FILE = os.path.join(os.path.dirname(__file__), "..", "..", "..", ".claude", "memory", "MEMORY.md")
MEM_CAP = int(os.environ.get("YURI_Z_MEM_CAP", "14000"))  # bound the memory injection so a turn stays snappy
TOOL_NOTE = ("You are a FULL-CAPABILITY assistant — you can run shell commands and read/write/edit files "
             "(bash, read_file, write_file, edit_file) and spawn or delegate worker terminals. When Marcel "
             "asks you to DO something on the machine — run it, check it, inspect it, fix it — USE the tools "
             "and actually do it; don't just describe it. Chain tools as needed. Delegate heavy or long-running "
             "jobs to a spawned worker so it runs in parallel. For pure questions or chit-chat, just talk. "
             "ALWAYS summarize tool results in one or two spoken sentences — never read raw command output or "
             "file contents aloud. If a protected path or destructive command is refused, say so briefly.")


def _build_system():
    """Yuri's brain = her voice persona + YURI's ACTUAL curated memory (the Track-B index), loaded
    from the real files at startup. Wired into the existing system, not a new memory type."""
    parts = []
    try:
        with open(PERSONA_FILE) as f:
            parts.append(f.read().strip())
    except Exception:
        parts.append("You are Yuri, Marcel's adversarial-ally voice assistant — reply in one or two "
                     "natural spoken sentences, full personality, no filler.")
    try:
        with open(MEMORY_FILE) as f:
            mem = f.read().strip()
        if len(mem) > MEM_CAP:
            mem = mem[:MEM_CAP].rsplit("\n", 1)[0] + "\n…(more in the memory system)"
        parts.append("## YURI MEMORY — what you already know about Marcel and the work "
                     "(recall and use it; don't re-ask what's here)\n" + mem)
    except Exception:
        pass
    parts.append(TOOL_NOTE)
    return "\n\n".join(parts)


# Built once at startup (stable across turns). Override wholesale with YURI_Z_SYSTEM if ever needed.
SYSTEM = os.environ.get("YURI_Z_SYSTEM") or _build_system()

HIST_FILE = os.path.join(os.path.dirname(__file__), "..", "..", "state", "voice", "yuri-z-history.json")
_THINK = re.compile(r"<think>.*?</think>", re.DOTALL | re.IGNORECASE)

SPAWN_HELPER = os.path.join(os.path.dirname(__file__), "yuri-spawn-worker.sh")
WORKER_NAME = os.environ.get("YURI_WORKER_NAME", "worker1")

# Full-capability execution (like a spawned worker): bash + file ops, run in the repo root.
REPO = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", ".."))
MAX_TOOL_ITERS = int(os.environ.get("YURI_Z_MAX_TOOL_ITERS", "10"))   # agent-loop cap per voice turn
BASH_TIMEOUT = float(os.environ.get("YURI_Z_BASH_TIMEOUT", "90"))
OUTPUT_CAP = int(os.environ.get("YURI_Z_OUTPUT_CAP", "4000"))         # cap tool output fed back to GLM
BASH_ENABLED = os.environ.get("YURI_Z_NO_BASH", "0") != "1"

# Safety FLOOR — same spirit as a worker's PreToolUse guards. She is otherwise unrestricted (owner
# 2026-06-19): protected surfaces are off-limits and catastrophic commands are refused. Not adversary-
# proof (Marcel's voice drives it, not an attacker) — it stops the misheard/model catastrophe.
PROTECTED = (".env", "backend/data/", ".claude/state/", ".claude/history/", ".claude/file-history/",
             ".claude/projects/", "node_modules/", ".amp/", "id_rsa", ".ssh/", "credentials", "secret")
_DESTRUCTIVE = re.compile(
    r"\brm\s+-[a-z]*[rf][a-z]*\s+(/|~|\$home|\*|\.\s*$)"
    r"|\bsudo\b|\bdd\b[^|]*\bof=|\bmkfs|:\(\)\s*\{\s*:\s*\|"
    r"|>\s*/dev/[sh]d|\bshutdown\b|\breboot\b|\bdiskutil\s+erase"
    r"|\bchmod\s+-R\s+777\s+/|(curl|wget)[^|]*\|\s*(sh|bash|zsh)|\bgit\s+push\b[^\n]*--force",
    re.IGNORECASE)


def _is_protected(p: str) -> bool:
    return any(seg in (p or "") for seg in PROTECTED)


def _bash_block_reason(cmd: str):
    if _DESTRUCTIVE.search(cmd or ""):
        return "refused: catastrophic/destructive command (safety floor)"
    if _is_protected(cmd):
        return "refused: command touches a protected path (safety floor)"
    return None

# Capabilities the model CHOOSES to call (Anthropic tool schema: name/description/input_schema).
TOOLS = [
    {
        "name": "bash",
        "description": ("Run a shell command in the YURI repo and get its output. Use this for anything "
                        "Marcel asks you to DO on the machine — run tests, git status, grep, build, inspect "
                        "files, etc. Runs in the repo root. Destructive commands + protected paths are refused."),
        "input_schema": {"type": "object", "required": ["command"],
                         "properties": {"command": {"type": "string", "description": "The shell command to run."}}},
    },
    {
        "name": "read_file",
        "description": "Read a file's contents (path relative to the repo root). Inspect code/docs before acting.",
        "input_schema": {"type": "object", "required": ["path"],
                         "properties": {"path": {"type": "string", "description": "File path relative to repo root."}}},
    },
    {
        "name": "write_file",
        "description": "Create or overwrite a file with content (path relative to repo root).",
        "input_schema": {"type": "object", "required": ["path", "content"],
                         "properties": {"path": {"type": "string"}, "content": {"type": "string"}}},
    },
    {
        "name": "edit_file",
        "description": "Replace an exact unique string in a file with a new string (path relative to repo root).",
        "input_schema": {"type": "object", "required": ["path", "old_string", "new_string"],
                         "properties": {"path": {"type": "string"}, "old_string": {"type": "string"}, "new_string": {"type": "string"}}},
    },
    {
        "name": "spawn_worker",
        "description": ("Open a NEW worker terminal (a visible Terminal Claude Code session Marcel can watch). "
                        "Use for HEAVY or long-running work to delegate + run in parallel, or when Marcel asks to "
                        "open/spawn/launch a terminal or worker. For quick actions, just use bash yourself."),
        "input_schema": {"type": "object",
                         "properties": {"task": {"type": "string", "description": "Optional first task to send the worker."}}},
    },
]


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


def _cap(s):
    s = s or ""
    return s[:OUTPUT_CAP] + ("\n…(truncated)" if len(s) > OUTPUT_CAP else "")


def _exec_tool(name, args):
    """Run a capability the model chose. Full worker-grade toolset behind the safety floor."""
    args = args or {}
    try:
        if name == "bash":
            cmd = (args.get("command") or "").strip()
            if not cmd:
                return "no command given"
            if not BASH_ENABLED:
                return "bash is disabled (YURI_Z_NO_BASH=1)"
            blocked = _bash_block_reason(cmd)
            if blocked:
                return blocked
            r = subprocess.run(cmd, shell=True, cwd=REPO, capture_output=True, text=True, timeout=BASH_TIMEOUT)
            out = ((r.stdout or "") + (r.stderr or "")).strip()
            return _cap(out) if out else f"(no output, exit {r.returncode})"
        if name == "read_file":
            p = (args.get("path") or "").strip()
            if _is_protected(p):
                return "refused: protected path (safety floor)"
            with open(os.path.join(REPO, p), encoding="utf-8", errors="replace") as f:
                return _cap(f.read())
        if name == "write_file":
            p = (args.get("path") or "").strip()
            if _is_protected(p):
                return "refused: protected path (safety floor)"
            full = os.path.join(REPO, p)
            os.makedirs(os.path.dirname(full) or ".", exist_ok=True)
            with open(full, "w", encoding="utf-8") as f:
                f.write(args.get("content") or "")
            return f"wrote {p}"
        if name == "edit_file":
            p = (args.get("path") or "").strip()
            if _is_protected(p):
                return "refused: protected path (safety floor)"
            full = os.path.join(REPO, p)
            with open(full, encoding="utf-8") as f:
                data = f.read()
            old = args.get("old_string") or ""
            c = data.count(old)
            if c != 1:
                return f"edit failed: old_string occurs {c}x (must be exactly 1)"
            with open(full, "w", encoding="utf-8") as f:
                f.write(data.replace(old, args.get("new_string") or "", 1))
            return f"edited {p}"
        if name == "spawn_worker":
            task = (args.get("task") or "").strip()
            cmd = ["bash", SPAWN_HELPER, WORKER_NAME] + ([task] if task else [])
            subprocess.Popen(cmd, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)  # non-blocking
            return f"worker '{WORKER_NAME}' terminal is opening" + (f" with task: {task}" if task else "")
    except subprocess.TimeoutExpired:
        return f"command timed out after {int(BASH_TIMEOUT)}s"
    except Exception as e:
        return f"tool error: {str(e)[:80]}"
    return f"unknown tool: {name}"


def _messages_call(messages, system, with_tools=True):
    """One call to Z.ai's Anthropic Messages endpoint. Returns the parsed message dict
    {content:[blocks], stop_reason}. Bearer auth (the GLM Coding Plan convention)."""
    payload = {"model": MODEL, "max_tokens": MAX_TOKENS, "system": system,
               "messages": messages, "stream": False}
    if with_tools:
        payload["tools"] = TOOLS
    body = json.dumps(payload).encode()
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
        resp = _messages_call(messages, SYSTEM)
    except Exception as e:
        return f"My GLM brain hiccuped: {str(e)[:90]}"

    final = ""
    for _ in range(MAX_TOOL_ITERS):                       # multi-step agent loop (chain tools until done)
        try:
            resp = _messages_call(messages, SYSTEM)
        except Exception as e:
            final = f"My GLM brain hiccuped: {str(e)[:90]}"
            break
        content = resp.get("content") or []
        tool_uses = [b for b in content if isinstance(b, dict) and b.get("type") == "tool_use"]
        if not tool_uses:
            final = _text_of(content)
            break
        # Run the capabilities she chose, feed results back, loop until she's done.
        messages.append({"role": "assistant", "content": content})
        messages.append({"role": "user", "content": [
            {"type": "tool_result", "tool_use_id": b.get("id"),
             "content": _exec_tool(b.get("name", ""), b.get("input") or {})} for b in tool_uses]})
    else:
        # hit the tool-iteration cap — force a spoken wrap-up with no more tools
        try:
            final = _text_of(_messages_call(
                messages + [{"role": "user", "content": "Stop and tell me in one or two spoken sentences what you did or found."}],
                SYSTEM, with_tools=False).get("content"))
        except Exception:
            final = "That ran long — ask me what happened."

    reply = _strip_think(final) or "Okay."
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
