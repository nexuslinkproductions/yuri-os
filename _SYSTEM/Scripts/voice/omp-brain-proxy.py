#!/usr/bin/env python3
# @capability: voice-omp-brain-proxy
# @serves: openai-compatible omp cli proxy | voice to omp terminal session | drive detached omp session | invisible voice brain bridge
# @does: exposes /v1/chat/completions (OpenAI streaming + non-streaming shape) for Pipecat's LLM
#        stage (bot.py), but drives a BACKGROUND OMP (Oh My Pi) CLI session running detached inside tmux
#        — injects the user turn via `tmux send-keys`, captures the reply, returns it. The OMP session IS
#        the brain engine: it runs invisibly in the background; Marcel talks by voice and hears voice back
#        and never looks at the terminal day-to-day. It is only `tmux attach`-able to verify/debug when
#        needed. Model switching is a CLI command in that (background) session. No headless spawn, no SDK.
# @use: drop-in brain for the Pipecat voice loop. SAME PORT as yuri-z-brain.py (:8014) so bot.py needs
#        no change — start ONE brain, not both. Stdlib only (http.server + subprocess + threading).
# @exports: (http server :8014)
#
# ===================================================================================================
# SETUP — read this before running (3 steps, in order)
# ===================================================================================================
#
# The brain is a BACKGROUND OMP session — Marcel never watches it. It runs detached inside tmux; this
# proxy is a silent dumb pipe: text in (voice → OMP), text out (OMP reply → TTS). OMP keeps its own
# tools, context, and model — the proxy translates NOTHING. `tmux attach -t omp` opens it only to debug.
#
#   STEP 1 — Start OMP inside a DETACHED tmux session (it MUST be a tmux pane; the proxy drives it by
#             keystrokes whether attached or not). It runs in the background — invisible during normal use:
#
#       tmux new -ds omp            # -d = detached (background); OMP runs invisibly, no terminal opens
#       tmux send-keys -t omp "omp" Enter   # or however you launch OMP; it lands idle at its prompt
#       # (optional, to debug)  tmux attach -t omp   — detach again with Ctrl-b d
#
#     The default target auto-detects a tmux session named "omp" and addresses "omp:0.0" (window 0,
#     pane 0). Override with the env var if your session/window/pane differs:
#
#       OMP_TMUX_TARGET="omp:1.0"    # e.g. window 1, pane 0
#
#   STEP 2 — (RECOMMENDED, optional) Arm the reply hook for rock-solid capture.
#
#     The capture-pane fallback (below) works with zero config, but tool-calling turns can make pane
#     output pause mid-turn, which a pure "pane went quiet" heuristic can misread as "done". For
#     reliable capture during long tool loops, give OMP a hook that drops each finished reply into a
#     file via ATOMIC rename (write to a temp, then `mv` onto the reply path — rename is atomic on
#     POSIX, so the proxy never reads a half-written file). Point OMP's post-response hook at, e.g.:
#
#       _SYSTEM/state/voice/omp-reply.json     # shape: {"text": "the spoken reply"}  (or plain JSON string)
#
#     The proxy watches this path (OMP_REPLY_FILE), reads + deletes it the instant it appears. This is
#     the PRIMARY capture path; when armed it always wins and returns the clean response text.
#
#   STEP 3 — Start this proxy, THEN start the voice loop:
#
#       python3 _SYSTEM/Scripts/voice/omp-brain-proxy.py     # :8014, drop-in for yuri-z-brain.py
#       # then bot.py (the Pipecat loop) exactly as before — it already targets http://127.0.0.1:8014/v1
#
#   Verify:  curl http://127.0.0.1:8014/health   →  {"ok": true, "brain": "omp-cli", ...}
#
# HOW CAPTURE WORKS (two paths, raced each poll — whichever fires first wins):
#   (a) File-drop (PRIMARY): OMP's reply hook atomically writes omp-reply.json → proxy reads + deletes.
#       Race-free: the writer needs no reader, rename is atomic, a per-turn drain prevents stale cross-talk.
#   (b) capture-pane (FALLBACK, zero-config): snapshots the pane before injection, polls until OMP's idle
#       prompt SIGNATURE returns at the pane tail AND output has been stable — then extracts the lines that
#       appeared between the pre-injection prompt and the returned prompt. The signature is captured
#       dynamically (whatever the idle prompt line is), so it matches OMP's actual prompt with no hardcoded
#       string. A slower pure-stability threshold is the final backstop if prompt detection misfires.
# ===================================================================================================
import os
import re
import json
import time
import threading
import subprocess
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

# ---- configuration (env-overridable) ------------------------------------------------------------
REPO = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", ".."))
PORT = int(os.environ.get("OMP_BRAIN_PORT", "8014"))                       # SAME port as yuri-z-brain.py
TIMEOUT = float(os.environ.get("OMP_BRAIN_TIMEOUT", "120"))               # OMP tool loops can run long
REPLY_FILE = os.environ.get(
    "OMP_REPLY_FILE", os.path.join(REPO, "_SYSTEM", "state", "voice", "omp-reply.json"))
# TARGET is resolved BELOW (after _autodetect_target) — override auto-detect with OMP_TMUX_TARGET.

POLL = float(os.environ.get("OMP_POLL", "0.3"))                            # capture-pane poll interval (s)
SETTLE = float(os.environ.get("OMP_SETTLE", "0.4"))                        # let tmux deliver keystrokes
STABLE_PROMPT = int(os.environ.get("OMP_STABLE_PROMPT", "2"))              # stable polls WITH prompt returned
STABLE_MAX = int(os.environ.get("OMP_STABLE_MAX", "12"))                   # stable polls as final backstop
CAPTURE_LINES = int(os.environ.get("OMP_CAPTURE_LINES", "300"))            # scrollback lines to diff
# Optional explicit prompt regex (matched against the pane's last non-empty line). Empty → use the
# dynamic signature captured at injection time (recommended). Set only if the signature proves unstable.
PROMPT_RE = re.compile(os.environ.get("OMP_PROMPT_RE", "")) if os.environ.get("OMP_PROMPT_RE") else None

# Serialize turns: the voice loop is serial, and two concurrent injects into one OMP pane would corrupt
# each other. One turn fully completes (inject → capture) before the next begins.
_TURN_LOCK = threading.Lock()


def _autodetect_target():
    """Find a tmux session named 'omp' (exact, then substring) and address its window 0 / pane 0.
    Falls back to 'omp:0.0' when nothing is found so the error surface is explicit at request time."""
    try:
        out = subprocess.run(["tmux", "list-sessions", "-F", "#{session_name}"],
                             capture_output=True, text=True, timeout=3)
        names = [n.strip() for n in out.stdout.splitlines() if n.strip()]
    except Exception:
        names = []
    for n in names:
        if n == "omp":
            return f"{n}:0.0"
    for n in names:
        if "omp" in n.lower():
            return f"{n}:0.0"
    return "omp:0.0"


TARGET = os.environ.get("OMP_TMUX_TARGET", "") or _autodetect_target()


def _tmux_ok():
    """True iff the configured tmux target resolves to a live pane."""
    try:
        r = subprocess.run(["tmux", "list-panes", "-t", TARGET], capture_output=True, timeout=2)
        return r.returncode == 0
    except Exception:
        return False


def _ensure_reply_dir():
    d = os.path.dirname(REPLY_FILE)
    try:
        os.makedirs(d, exist_ok=True)
    except OSError:
        pass


def _drain_reply_file():
    """Remove a stale reply file BEFORE injecting, so this turn consumes only OMP's NEW reply."""
    try:
        os.unlink(REPLY_FILE)
    except FileNotFoundError:
        pass
    except OSError:
        pass


def _inject(text):
    """Drive the LIVE interactive OMP session by keystrokes — never headless. `-l` sends the text
    literally (no tmux key-name interpretation); a separate Enter submits it. Newlines collapse to
    spaces so a multi-line transcription is one input, one submit."""
    text = " ".join((text or "").split())
    if not text:
        return False
    subprocess.run(["tmux", "send-keys", "-t", TARGET, "-l", text], check=False)
    subprocess.run(["tmux", "send-keys", "-t", TARGET, "Enter"], check=False)
    return True


def _capture_pane():
    """Return the pane text (CAPTURE_LINES of scrollback + current screen) as a string."""
    try:
        out = subprocess.run(
            ["tmux", "capture-pane", "-t", TARGET, "-p", "-S", f"-{CAPTURE_LINES}", "-E", "-"],
            capture_output=True, text=True, timeout=3)
        return out.stdout or ""
    except Exception:
        return ""


def _last_nonempty(text):
    """The right-stripped last non-empty line of a pane snapshot — used as the idle-prompt signature."""
    for line in reversed((text or "").splitlines()):
        s = line.rstrip()
        if s:
            return s
    return ""


def _read_reply_file():
    """PRIMARY capture: read + delete the atomic reply drop. Returns the reply text, or None if no
    complete drop is present yet. A failed JSON parse is treated as not-yet-ready (the rename is atomic,
    so a parse failure means the writer's schema differs — keep polling rather than crashing)."""
    try:
        with open(REPLY_FILE) as f:
            obj = json.load(f)
    except FileNotFoundError:
        return None
    except (json.JSONDecodeError, OSError):
        return None
    try:
        os.unlink(REPLY_FILE)
    except OSError:
        pass
    if isinstance(obj, dict):
        return (obj.get("text") or obj.get("content") or obj.get("reply") or "").strip()
    return str(obj).strip()


def _strip_echo(text, injected, prompt=None):
    """Drop leading lines that merely echo the injected input (OMP renders the typed text on its prompt
    line). BOUNDED so a real response that happens to QUOTE the user is never eaten: a leading line is
    stripped only when it (1) equals the input verbatim, (2) is the prompt signature + the input, or
    (3) is the input prefixed by a SHORT (<=8 char) prompt glyph. A full sentence quoting the input is
    far longer than input+8 and survives intact."""
    if not injected:
        return (text or "").strip()
    inj = " ".join(injected.split())
    prompt = (prompt or "").rstrip()
    lines = (text or "").splitlines()
    out = 0
    while out < len(lines):
        first = " ".join(lines[out].split())
        if not first:
            out += 1
            continue
        if first == inj:
            out += 1
            continue
        if prompt and first.startswith(prompt) and first[len(prompt):].strip() == inj:
            out += 1
            continue
        if inj in first and len(first) <= len(inj) + 8:
            out += 1
            continue
        break
    return "\n".join(lines[out:]).strip()


def _first_index(lines, target):
    for j in range(len(lines)):
        if lines[j] == target:
            return j
    return -1


def _last_index(lines, target):
    for j in range(len(lines) - 1, -1, -1):
        if lines[j] == target:
            return j
    return -1


def _pane_response(before, now, injected):
    """Extract OMP's reply from the pane diff. The idle prompt (captured in `before`) appears twice in
    `now` after a turn: once where it was before injection (pre-injection prompt), once where it
    returned when OMP finished. The reply is the lines strictly between those two occurrences. Robust to
    scrollback scroll as long as both occurrences remain inside the capture window; degrades to a
    common-prefix diff if the pre-injection prompt scrolled out of view."""
    bl = before.splitlines()
    nl = now.splitlines()
    anchor = _last_nonempty(before)
    if anchor:
        first = _first_index(nl, anchor)
        last = _last_index(nl, anchor)
        if first >= 0 and last > first:
            resp = nl[first + 1:last]
        elif last >= 0:
            resp = nl[:last]
        else:
            i = 0
            while i < len(bl) and i < len(nl) and bl[i] == nl[i]:
                i += 1
            resp = nl[i:]
    else:
        resp = nl
    return _strip_echo("\n".join(resp), injected, prompt=anchor)


def wait_for_response(injected, keepalive=None):
    """Poll until OMP finishes its turn. Each poll races the file-drop (PRIMARY) against capture-pane
    completion detection (FALLBACK). `keepalive` (streaming SSE) is called every poll and must return
    True to keep waiting — returning False means the client disconnected, so we stop. Returns "" on
    timeout/disconnect (caller renders a spoken fallback)."""
    deadline = time.time() + TIMEOUT
    before = _capture_pane()                       # pane state + idle prompt signature at injection time
    prompt_sig = _last_nonempty(before)
    time.sleep(SETTLE)                             # let tmux deliver the keystrokes
    last = _capture_pane()
    stable = 0
    changed = False
    while time.time() < deadline:
        if keepalive is not None and not keepalive():
            return ""
        # (a) PRIMARY — atomic file-drop from the OMP reply hook
        drop = _read_reply_file()
        if drop:
            return drop
        # (b) FALLBACK — capture-pane completion detection
        now = _capture_pane()
        if now != last:
            changed = True
            stable = 0
            last = now
        else:
            stable += 1
        tail = _last_nonempty(now)
        prompt_back = bool(prompt_sig and tail == prompt_sig) or bool(PROMPT_RE and PROMPT_RE.search(tail or ""))
        if changed and stable >= STABLE_PROMPT and prompt_back:
            return _pane_response(before, now, injected)
        if changed and stable >= STABLE_MAX:
            return _pane_response(before, now, injected)
        time.sleep(POLL)
    return ""


def _latest_user(messages):
    """Extract the LAST user message's text from the OpenAI messages array. OMP keeps its own context,
    so we inject only this turn's user text — never replay history (replaying would double-context OMP)."""
    for m in reversed(messages or []):
        if m.get("role") == "user":
            c = m.get("content")
            if isinstance(c, str):
                return c
            if isinstance(c, list):
                return " ".join(p.get("text", "") for p in c if isinstance(p, dict))
            return ""
    return ""


def _completion_payload(content):
    return {
        "id": f"omp-{int(time.time() * 1000)}",
        "object": "chat.completion",
        "created": int(time.time()),
        "model": "omp-session",
        "choices": [{"index": 0, "message": {"role": "assistant", "content": content},
                     "finish_reason": "stop"}],
    }


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
            self._json(200, {"ok": True, "brain": "omp-cli", "target": TARGET,
                             "model": "omp-session", "reachable": _tmux_ok(),
                             "reply_file": REPLY_FILE})
        else:
            self.send_response(404)
            self.end_headers()

    def _sse(self, d):
        """Write one Server-Sent-Event data frame."""
        self.wfile.write(f"data: {json.dumps(d)}\n\n".encode())
        self.wfile.flush()

    def _stream_keepalive(self):
        """Flush an SSE comment to keep the HTTP connection alive while OMP thinks. Valid ONLY after the
        SSE response headers are sent. Returns False if the client disconnected."""
        try:
            self.wfile.write(b": keepalive\n\n")
            self.wfile.flush()
            return True
        except (BrokenPipeError, ConnectionResetError, OSError):
            return False

    def _run_turn(self, user, keepalive=None):
        """Inject the user text into the OMP pane and wait for the reply. Serialized per turn so two
        concurrent requests can't interleave keystrokes in the single OMP pane."""
        with _TURN_LOCK:
            _ensure_reply_dir()
            _drain_reply_file()
            injected = (user or "").strip()
            if injected:
                _inject(injected)
            return wait_for_response(injected, keepalive=keepalive) or \
                "Sorry, I didn't catch a reply from the OMP session."

    def do_POST(self):
        if not self.path.startswith("/v1/chat/completions"):
            self.send_response(404); self.end_headers(); return
        n = int(self.headers.get("Content-Length", "0"))
        try:
            body = json.loads(self.rfile.read(n) or b"{}")
        except Exception:
            body = {}
        user = _latest_user(body.get("messages", []))
        streaming = bool(body.get("stream"))

        # Fail fast with a spoken, actionable error instead of hanging for the full timeout.
        if not _tmux_ok():
            err = (f"The OMP tmux session isn't reachable at {TARGET}. Start OMP in a tmux session "
                   f"named 'omp' (or set OMP_TMUX_TARGET), then retry.")
            self._emit(streaming, err)
            return

        if streaming:
            # CRITICAL ORDERING: send the SSE status line + headers + role delta BEFORE the wait, so the
            # keepalive comments flushed during OMP's thinking are valid SSE frames. Writing them before
            # the headers would emit raw bytes ahead of the HTTP status line and corrupt the stream.
            try:
                self.send_response(200)
                self.send_header("Content-Type", "text/event-stream")
                self.send_header("Cache-Control", "no-cache")
                self.end_headers()
                self._sse({"choices": [{"delta": {"role": "assistant"}, "index": 0}]})
                reply = self._run_turn(user, keepalive=self._stream_keepalive)
                self._sse({"choices": [{"delta": {"content": reply}, "index": 0}]})
                self._sse({"choices": [{"delta": {}, "index": 0, "finish_reason": "stop"}]})
                self.wfile.write(b"data: [DONE]\n\n")
                self.wfile.flush()
            except (BrokenPipeError, ConnectionResetError):
                pass
        else:
            reply = self._run_turn(user)
            try:
                self._json(200, _completion_payload(reply))
            except (BrokenPipeError, ConnectionResetError):
                pass

    def _emit(self, streaming, reply):
        """Emit one reply as SSE (streaming) or JSON (non-streaming) — used for fail-fast errors that
        bypass the normal inject+wait turn flow."""
        if streaming:
            try:
                self.send_response(200)
                self.send_header("Content-Type", "text/event-stream")
                self.send_header("Cache-Control", "no-cache")
                self.end_headers()
                self._sse({"choices": [{"delta": {"role": "assistant"}, "index": 0}]})
                self._sse({"choices": [{"delta": {"content": reply}, "index": 0}]})
                self._sse({"choices": [{"delta": {}, "index": 0, "finish_reason": "stop"}]})
                self.wfile.write(b"data: [DONE]\n\n")
                self.wfile.flush()
            except (BrokenPipeError, ConnectionResetError):
                pass
        else:
            try:
                self._json(200, _completion_payload(reply))
            except (BrokenPipeError, ConnectionResetError):
                pass


if __name__ == "__main__":
    _ensure_reply_dir()
    print(f"[omp-brain-proxy] :{PORT} -> tmux {TARGET} (reachable={_tmux_ok()}), "
          f"reply-drop {REPLY_FILE}, timeout {TIMEOUT}s", flush=True)
    print("    brain = a BACKGROUND OMP session (detached tmux). Start OMP in tmux first, then this proxy, then bot.py.",
          flush=True)
    if not _tmux_ok():
        print(f"    WARNING: no live pane at {TARGET} yet — start OMP in a tmux session named 'omp'.",
              flush=True)
    ThreadingHTTPServer(("127.0.0.1", PORT), H).serve_forever()
