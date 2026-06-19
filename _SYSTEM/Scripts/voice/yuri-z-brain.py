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
import jarvis_memory as jm   # persistent episodic store — model-driven `remember` + per-turn FTS5 recall

PORT = int(os.environ.get("YURI_Z_BRAIN_PORT", "8014"))
MODEL = os.environ.get("ZAI_MODEL", "glm-5.2")   # glm-5.2 = the flagship in-plan model; RELIABLY emits
#   model-driven tool_use (glm-5-turbo narrated/fabricated instead of calling tools — owner 2026-06-19).
ZAI_URL = os.environ.get("ZAI_BASE_URL", "https://api.z.ai/api/anthropic").rstrip("/")
# Reasoning: glm-5.2 supports the Anthropic `thinking` param on z.ai (verified 2026-06-19: returns a
# thinking block then the tool_use). Highest reasoning for the JARVIS goal — `high` default, `max` deepest.
REASONING = os.environ.get("YURI_Z_REASONING", "high").lower()      # off | low | high | max
_THINK_BUDGET = {"off": 0, "low": 1024, "high": 4096, "max": 8192}.get(REASONING, 4096)
# max_tokens MUST exceed the thinking budget (it counts thinking + tool_use + spoken text). The OLD 1024
# truncated reasoning/tool_use → she'd "narrate" without executing. The spoken reply stays short via the
# system prompt; this headroom is for the thinking + tool blocks (which are never spoken).
MAX_TOKENS = int(os.environ.get("YURI_Z_MAX_TOKENS", str(_THINK_BUDGET + 2048 if _THINK_BUDGET else 1500)))
TIMEOUT = float(os.environ.get("YURI_Z_TIMEOUT", "120"))   # thinking + multi-step tool loop can exceed 60s
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
             "(bash, read_file, write_file, edit_file), spawn worker terminals, AND CONTROL THE ENTIRE MAC "
             "by voice. You are Marcel's JARVIS — his voice and his hands on this MacBook. Anything he'd do "
             "with mouse + keyboard, you do for him via your tools.\n\n"
             "## macOS CONTROL TOOLS (compose these per request — she chooses, no hardcoded intents)\n"
             "- `applescript` — the HIGH-LEVEL path for most apps. Run arbitrary AppleScript via osascript. "
             "Unlocks Spotify (play/pause/search/next/track info), Mail (read unread/compose/send), Calendar "
             "(today's events), Music, Safari/Chrome (open URLs, read page, navigate tabs), Finder, Notes, "
             "Reminders, Messages. PREFER this when the app has a scripting dictionary.\n"
             "- `gui_script` — the UNIVERSAL FALLBACK. Drive any app's GUI via System Events: keystrokes, key "
             "combos, menu-bar navigation, clicks. Use for apps WITHOUT a dictionary, or when you need to click "
             "a button or fill a field.\n"
             "- `open_app` — launch/focus/quit any app. Usually the FIRST step before gui_script.\n"
             "- `screenshot` — capture the screen and get a text description of what's on it. Use when scripting "
             "isn't enough — to read a web page, locate a UI element, see a dialog, or answer 'what's on screen'.\n"
             "- `spawn_worker` — delegate heavy or long-running work to a visible worker terminal.\n\n"
             "## EXECUTE — NEVER FABRICATE OR JUST NARRATE\n"
             "You ACT by CALLING tools. If you did not call a tool, the action did NOT happen — so never say a "
             "command out loud and stop; emit the tool call and actually run it. NEVER guess or invent what's on "
             "the screen, a file's contents, or a command's result. To answer 'what's on my screen' you MUST call "
             "`screenshot` first and describe ONLY what it returns — never imagine a screen. To close, quit, or "
             "terminate something you MUST call the tool that does it (open_app quit / bash kill / tmux), not "
             "describe how. If a tool errors, report the real error — don't pretend it worked.\n\n"
             "## CONFIRM-GATE (your safety model)\n"
             "You have FULL execution authority, but on CRITICAL actions you must SPEAK your understanding and "
             "HOLD — do NOT execute yet. Say 'I'm about to <action> — that right? Confirm and I'll do it.' Then "
             "wait for Marcel's next voice turn.\n"
             "- ROUTINE (execute directly): read, open app, play music, navigate, query, search, check mail/calendar.\n"
             "- CRITICAL (speak + hold): delete, overwrite, move-over-existing, send email/message, git push/commit, "
             "publish, or anything you're uncertain about. When in doubt, confirm.\n"
             "- If Marcel says 'verify', 'ask me first', or 'double-check' — treat the action as CRITICAL.\n\n"
             "## MEMORY — you remember across restarts\n"
             "You have a PERSISTENT episodic memory. Two things happen automatically:\n"
             "1. RECALL: each turn, relevant past episodes are injected above — USE them if they fit what Marcel "
             "just said (continue a thread, recall a preference/commitment, don't re-ask what you already know).\n"
             "2. WRITE: call `remember` when Marcel states a durable FACT, PREFERENCE, COMMITMENT, or a noteworthy "
             "episode worth recalling later — NOT routine commands, chit-chat, or things you merely looked up. You "
             "are the judge of what's worth keeping; supply sharp cue words Marcel would later say. This is how you "
             "stay continuous with him across restarts.\n\n"
             "## VOICE DISCIPLINE\n"
             "ALWAYS summarize tool results in one or two spoken sentences — never read raw output or file contents "
             "aloud. If a protected path or catastrophic command is refused, say so briefly. Chain tools as needed "
             "for complex multi-step operations. For pure questions or chit-chat, just talk.")


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

# ---- WORKER DISPATCH (JARVIS mode) ----
# When YURI_DISPATCH=1, Yuri can inject prompts into a SEPARATE watched worker terminal (tmux)
# alongside her inline tools. The model emits a 'DISPATCH:' line in its reply; we extract it,
# inject it into the worker pane via tmux send-keys, and speak only the remaining text.
DISPATCH = os.environ.get("YURI_DISPATCH", "0") == "1"
WORKER_TARGET = os.environ.get("YURI_WORKER_TARGET", "yuri-worker:0.0")  # tmux session:window.pane

# Full-capability execution (like a spawned worker): bash + file ops, run in the repo root.
REPO = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", ".."))
MAX_TOOL_ITERS = int(os.environ.get("YURI_Z_MAX_TOOL_ITERS", "50"))   # agent-loop cap per voice turn — main-session-grade headroom (real sessions have no per-turn cap)
BASH_TIMEOUT = float(os.environ.get("YURI_Z_BASH_TIMEOUT", "600"))    # let builds/tests/long jobs finish like a real session, not a 90s cut-off
OUTPUT_CAP = int(os.environ.get("YURI_Z_OUTPUT_CAP", "40000"))        # she sees full command output (summarizes for voice); only the spoken reply stays short
BASH_ENABLED = os.environ.get("YURI_Z_NO_BASH", "0") != "1"

# When dispatch is on, append the dispatch instruction to the system prompt so the model knows it
# can delegate to the watched worker terminal.
_DISPATCH_NOTE = (
    "\n\n## WORKER DISPATCH (JARVIS mode is ON)\n"
    "You ALSO command a separate 'worker' Claude Code terminal running GLM-5.2 that Marcel watches. "
    "When Marcel clearly wants the worker to DO development work (build, edit, run, fix, or investigate "
    "code), emit EXACTLY one line beginning 'DISPATCH:' followed by a complete, self-contained prompt for "
    "the worker, then a separate ONE short spoken sentence telling Marcel what you sent it. If he is only "
    "talking with you or asking a question, do NOT dispatch — just reply normally. For quick actions, use "
    "your own bash tool directly — only DISPATCH for heavy or long-running work."
)
if DISPATCH:
    SYSTEM = SYSTEM + _DISPATCH_NOTE

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

# ---- CONFIRM-GATE (the safety model — supervised bypass via spoken human-in-the-loop) ----
# CRITICAL ops: destructive (delete/rm/overwrite/move-over-existing), outward-facing (send email,
# post, git push, git commit, publish), OR anything the model itself flags as risky. Instead of
# executing, we store a PENDING action + speak the confirmation and HOLD. On the next voice turn,
# if Marcel affirms (yes/confirm/do it/go ahead/correct) → execute the stored action. If he
# negates/corrects → drop or adjust. This is Marcel's explicit model (2026-06-19): full authority,
# but a spoken confirm gate on critical actions — her backstop since she has no interactive prompt.
PENDING_FILE = os.path.join(os.path.dirname(__file__), "..", "..", "state", "voice", "yuri-pending-action.json")

# Bash command patterns that escalate a routine-ish tool to CRITICAL (confirm-gated).
_CRITICAL_BASH = re.compile(
    r"\b(rm\b|mv\b.*-f|>\s*[^|&\s]|git\s+(push|commit|tag)|\btrash\b|srm\b|"
    r"sendmail|mail\s+-s|osascript.*send|osascript.*delete|osascript.*empty)",
    re.IGNORECASE)
# AppleScript keywords that are critical (send/create/delete/trash in Mail, Calendar, Messages).
_CRITICAL_APPLESCRIPT = re.compile(
    r"\b(send|delete|empty\s+trash|move\b.*to\s+trash|create\s+new\s+(event|message|reminder)|"
    r"make\s+new\s+(outgoing\s+)?message|reply\s+with)",
    re.IGNORECASE)

_AFFIRM = re.compile(r"\b(yes|yeah|yep|confirm|do it|go ahead|go for it|correct|affirmative|sure|please do|that'?s right|proceed|make it so)\b", re.IGNORECASE)
_NEGATE = re.compile(r"\b(no|nope|cancel|stop|don'?t|never\s+mind|forget it|wait|hold on|abort|actually\s+no|wrong)\b", re.IGNORECASE)


def _is_critical_call(name: str, args: dict) -> bool:
    """Classify a tool call as routine vs critical. write_file/edit_file/spawn_worker with action
    are inherently mutating → critical. bash/applescript/gui_script escalate on content patterns."""
    if name in ("write_file", "edit_file"):
        return True
    if name == "spawn_worker":
        return False  # spawning a watched terminal is routine; the worker itself has its own prompts
    if name == "bash":
        return bool(_CRITICAL_BASH.search(args.get("command", "")))
    if name in ("applescript", "gui_script"):
        return bool(_CRITICAL_APPLESCRIPT.search(args.get("script", "")))
    return False


def _load_pending():
    try:
        with open(PENDING_FILE) as f:
            return json.load(f)
    except Exception:
        return None


def _save_pending(p):
    try:
        os.makedirs(os.path.dirname(PENDING_FILE), exist_ok=True)
        tmp = PENDING_FILE + ".tmp"
        with open(tmp, "w") as f:
            json.dump(p, f)
        os.replace(tmp, PENDING_FILE)
    except Exception:
        pass


def _clear_pending():
    try:
        os.remove(PENDING_FILE)
    except FileNotFoundError:
        pass
    except Exception:
        pass


def _describe_action(name: str, args: dict) -> str:
    """A short human-spoken description of what a pending tool call will do — so Marcel hears what
    he's confirming, not a JSON blob."""
    if name == "bash":
        return f"run the command: {args.get('command', '')}"
    if name == "write_file":
        return f"write to {args.get('path', '')}"
    if name == "edit_file":
        return f"edit {args.get('path', '')}"
    if name == "applescript":
        s = args.get("script", "").replace("\n", " ")
        return f"run an AppleScript: {s[:120]}"
    if name == "gui_script":
        s = args.get("script", "").replace("\n", " ")
        return f"run a GUI script: {s[:120]}"
    if name == "open_app":
        return f"{args.get('action', '')} {args.get('app', '')}"
    return f"run {name}"

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
    {
        "name": "remember",
        "description": ("Commit a memory to your PERSISTENT episodic store so you recall it across restarts. "
                        "Call this when Marcel states a durable FACT, PREFERENCE, COMMITMENT, or a noteworthy "
                        "episode worth recalling later — NOT routine commands, chit-chat, or things you just looked "
                        "up and can re-fetch. You are the judge of what's worth keeping. Be concise and specific."),
        "input_schema": {"type": "object", "required": ["summary"],
                         "properties": {
                             "summary": {"type": "string",
                                 "description": "One self-contained sentence stating the fact/preference/commitment/episode. e.g. 'Marcel's favorite color is teal.' or 'Marcel wants Nexus Link launched before July.'"},
                             "cues": {"type": "string",
                                 "description": "Space-separated cue words/phrases Marcel would later say that should trigger recall of this. e.g. 'favorite color teal preference'"},
                             "kind": {"type": "string", "enum": ["fact", "preference", "commitment", "episode"],
                                 "description": "fact = durable truth; preference = how Marcel likes things; commitment = a goal/deadline/promise; episode = a noteworthy event. Default episode."},
                             "tags": {"type": "string", "description": "Optional space-separated tags for grouping."},
                             "weight": {"type": "number",
                                 "description": "Salience 0.1–5; higher = more likely to surface in recall. Default 1; use 2–3 for core preferences/commitments, <1 for minor notes."},
                         }},
    },
    # ---- macOS CONTROL PRIMITIVES (general computer use — she composes these per request) ----
    {
        "name": "applescript",
        "description": ("Run arbitrary AppleScript via osascript and get the result. This is the HIGH-LEVEL reliable "
                        "path for most apps — Spotify (play/pause/search/next), Mail (read/compose/send), Calendar "
                        "(events/today), Music, Safari/Chrome (tabs/URLs/navigation), Finder, Notes, Reminders, "
                        "Messages, and any app with a scripting dictionary. PREFER this over GUI scripting when the "
                        "app has a dictionary. Returns the script's text result or any error from osascript."),
        "input_schema": {"type": "object", "required": ["script"],
                         "properties": {"script": {"type": "string",
                             "description": "The AppleScript source to execute. e.g. 'tell application \"Spotify\" to play'. "
                                            "Multiple statements OK. Do not wrap in 'on run' — osascript -e handles raw scripts."}}},
    },
    {
        "name": "gui_script",
        "description": ("Drive the GUI directly via System Events for apps WITHOUT a scripting dictionary, or when you "
                        "need to click buttons, navigate menus, type into fields, or press key combos. This is the "
                        "UNIVERSAL FALLBACK — it works on ANY app by simulating the keyboard and mouse. Provide raw "
                        "AppleScript that uses 'tell application \"System Events\"' (keystroke, key code, click, "
                        "select menu item, etc.). The target app must be frontmost — use open_app or activate first."),
        "input_schema": {"type": "object", "required": ["script"],
                         "properties": {"script": {"type": "string",
                             "description": "System Events AppleScript. e.g. 'tell application \"System Events\" to keystroke \"c\" using {command down}'."}}},
    },
    {
        "name": "open_app",
        "description": ("Launch, focus (activate), or quit a macOS application by name. Use 'open' to launch/focus, "
                        "'activate' to bring to front without launching if not running, 'quit' to close it. This is "
                        "the prerequisite before gui_script on most apps."),
        "input_schema": {"type": "object", "required": ["app", "action"],
                         "properties": {"app": {"type": "string", "description": "App name as macOS knows it, e.g. 'Spotify', 'Safari', 'Mail', 'Google Chrome'."},
                                        "action": {"type": "string", "enum": ["open", "activate", "quit"],
                                                   "description": "open = launch+focus, activate = bring to front, quit = close the app"}}},
    },
    {
        "name": "screenshot",
        "description": ("Capture the screen and optionally DESCRIBE what's on it (what UI is visible, where things are). "
                        "Use this when scripting isn't enough — to read a web page, locate a button, see a dialog, or "
                        "answer 'what's on screen'. Returns a text description of the screenshot. If you just need a "
                        "raw file path without a description, set describe=false."),
        "input_schema": {"type": "object",
                         "properties": {"describe": {"type": "boolean", "default": True,
                                      "description": "If true (default), feed the screenshot to a vision model and return a text description. If false, just save the PNG and return the file path."}}},
    },
]


def _strip_think(t: str) -> str:
    t = _THINK.sub("", t)
    i = t.lower().find("<think>")
    if i != -1:
        t = t[:i]
    return t.strip()


def _fix_mojibake(s):
    """Repair UTF-8-as-latin1 mojibake in model-emitted content. Some GLM responses double-encode
    UTF-8 (em-dash to a-circumblle, arrow to a-dagger, smart quotes) because the model emits the
    UTF-8 bytes as if they were latin-1 characters. This round-trips: encode("latin-1") gives back
    the original UTF-8 bytes, decode("utf-8") gives the correct character. CLEAN text is unchanged
    (the round-trip is identity for valid UTF-8); mojibake is repaired; legitimate latin-1 accents
    survive because they do not form valid UTF-8 sequences when re-encoded. ASCII is a no-op."""
    if not s or not isinstance(s, str) or not any(ord(c) > 127 for c in s):
        return s
    try:
        repaired = s.encode("latin-1").decode("utf-8")
        if repaired != s:
            return repaired
    except (UnicodeEncodeError, UnicodeDecodeError):
        pass
    return s


def _handle_dispatch(reply):
    """Extract 'DISPATCH:' lines from the reply, inject them into the worker tmux pane, and return
    only the spoken remainder. Headless dispatch: Yuri (GLM) composes the worker prompt, this wrapper
    does the deterministic tmux send-keys injection (no focus war). If dispatch is off, pass through."""
    if not DISPATCH or "DISPATCH:" not in (reply or "").upper():
        return reply
    spoken, tasks = [], []
    for line in (reply or "").splitlines():
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


def _run_osascript(script: str) -> str:
    """Execute AppleScript via osascript -e, return text result. On permission failure, return a
    human-helpful message telling Marcel exactly what to grant."""
    r = subprocess.run(["osascript", "-e", script], capture_output=True, text=True, timeout=30)
    if r.returncode == 0:
        out = (r.stdout or "").strip()
        return _cap(out) if out else "(AppleScript ran, no output)"
    err = (r.stderr or "").strip()
    # Detect the common permission failures and guide Marcel to the fix.
    el = err.lower()
    if "not allowed to send apple events" in el or "not authorized" in el or "automat" in el:
        return (f"⚠ macOS Automation permission needed: open System Settings → Privacy & Security → "
                f"Automation, and allow this Terminal to control the target app. Error: {err[:100]}")
    if "assistive" in el or "accessibility" in el or "system events" in el and "not allowed" in el:
        return (f"⚠ macOS Accessibility permission needed: open System Settings → Privacy & Security → "
                f"Accessibility, and add Terminal (or whichever app runs the brain). Error: {err[:100]}")
    return f"osascript error: {_cap(err)}"


def _describe_screenshot(path: str) -> str:
    """Feed a screenshot to a vision-capable model for a text description. Uses Z.ai GLM-4.6V — the
    in-plan vision model (verified working on the $0 GLM Coding-Plan surface); degrades gracefully if not."""
    import base64, time
    try:
        with open(path, "rb") as f:
            img_b64 = base64.b64encode(f.read()).decode()
    except Exception:
        return f"couldn't read screenshot {path}"

    # GLM-4.6V — the newest VISION model INCLUDED in Marcel's GLM Coding Plan ($0 flat-rate surface).
    # Verified 2026-06-19: glm-4v is an INVALID id (400 Unknown Model — the old silent-fail default);
    # glm-4.6v + glm-4.5v are the in-plan vision models; glm-5v-turbo/glm-ocr need a metered balance.
    # Override with YURI_Z_VISION_MODEL (e.g. glm-4.5v).
    payload = {
        "model": os.environ.get("YURI_Z_VISION_MODEL", "glm-4.6v"),
        "max_tokens": 512,
        "messages": [{"role": "user", "content": [
            {"type": "text", "text": "Describe what's visible on this screenshot — the app, the UI elements, any "
             "text, dialogs, buttons, and what state the screen is in. Be concise but specific enough to drive "
             "GUI automation. Respond in ENGLISH only."},
            {"type": "image", "source": {"type": "base64", "media_type": "image/png", "data": img_b64}},
        ]}],
        "stream": False,
    }
    try:
        req = urllib.request.Request(f"{ZAI_URL}/v1/messages", data=json.dumps(payload).encode(), headers={
            "Content-Type": "application/json",
            "Authorization": f"Bearer {_zai_key()}",
            "anthropic-version": "2023-06-01",
        })
        with urllib.request.urlopen(req, timeout=TIMEOUT) as r:
            resp = json.loads(r.read())
        return _text_of(resp.get("content"))
    except Exception as e:
        return f"screenshot saved to {path} (vision description failed: {str(e)[:60]})"


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
            content = _fix_mojibake(args.get("content") or "")
            with open(full, "w", encoding="utf-8") as f:
                f.write(content)
            return f"wrote {p}"
        if name == "edit_file":
            p = (args.get("path") or "").strip()
            if _is_protected(p):
                return "refused: protected path (safety floor)"
            full = os.path.join(REPO, p)
            with open(full, encoding="utf-8") as f:
                data = f.read()
            old = _fix_mojibake(args.get("old_string") or "")
            new = _fix_mojibake(args.get("new_string") or "")
            c = data.count(old)
            if c != 1:
                return f"edit failed: old_string occurs {c}x (must be exactly 1)"
            with open(full, "w", encoding="utf-8") as f:
                f.write(data.replace(old, new, 1))
            return f"edited {p}"
        if name == "spawn_worker":
            task = (args.get("task") or "").strip()
            cmd = ["bash", SPAWN_HELPER, WORKER_NAME] + ([task] if task else [])
            subprocess.Popen(cmd, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)  # non-blocking
            return f"worker '{WORKER_NAME}' terminal is opening" + (f" with task: {task}" if task else "")
        if name == "remember":
            return jm.remember(args.get("summary"), cues=args.get("cues", ""), kind=args.get("kind", "episode"),
                               tags=args.get("tags", ""), weight=args.get("weight", 1.0))
        # ---- macOS CONTROL PRIMITIVES ----
        if name == "applescript":
            script = (args.get("script") or "").strip()
            if not script:
                return "no AppleScript given"
            return _run_osascript(script)
        if name == "gui_script":
            script = (args.get("script") or "").strip()
            if not script:
                return "no GUI script given"
            return _run_osascript(script)
        if name == "open_app":
            app = (args.get("app") or "").strip()
            action = (args.get("action") or "open").strip()
            if not app:
                return "no app name given"
            if action == "quit":
                return _run_osascript(f'tell application "{app}" to quit')
            elif action == "activate":
                return _run_osascript(f'tell application "{app}" to activate')
            else:  # open = launch + focus (open -a handles both)
                r = subprocess.run(["open", "-a", app], capture_output=True, text=True, timeout=15)
                if r.returncode != 0:
                    return f"couldn't open {app}: {(r.stderr or '').strip()[:80]}"
                return f"opened {app}"
        if name == "screenshot":
            describe = args.get("describe", True)
            path = f"/tmp/yuri-screenshot-{int(__import__('time').time())}.png"
            r = subprocess.run(["screencapture", "-x", path], capture_output=True, text=True, timeout=15)
            if r.returncode != 0 or not os.path.exists(path):
                return f"screenshot failed: {(r.stderr or '').strip()[:80]}"
            if not describe:
                return f"saved screenshot to {path}"
            desc = _describe_screenshot(path)
            return desc
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
    if _THINK_BUDGET > 0:        # extended reasoning (glm-5.2): a thinking block precedes the answer/tool_use
        payload["thinking"] = {"type": "enabled", "budget_tokens": _THINK_BUDGET}
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

    # ---- CONFIRM-GATE: check if there's a pending action and this turn is a response to it ----
    pending = _load_pending()
    if pending and _AFFIRM.search(user_msg) and not _NEGATE.search(user_msg):
        # Marcel affirmed — execute the stored action, then continue the normal loop with its result.
        _clear_pending()
        p_name, p_args = pending.get("name", ""), pending.get("args") or {}
        gate_result = _exec_tool(p_name, p_args)
        messages = hist[-(2 * TURNS):] + [
            {"role": "user", "content": pending.get("original_request", "")},
            {"role": "assistant", "content": pending.get("confirm_text", "")},
            {"role": "user", "content": user_msg},
            {"role": "user", "content": f"(CONFIRMED action executed — result: {gate_result})"},
        ]
        return _run_agent_loop(messages, user_msg, hist)
    elif pending and _NEGATE.search(user_msg):
        # Marcel cancelled — drop the pending action.
        _clear_pending()
        reply = "Okay, cancelled."
        hist.append({"role": "user", "content": user_msg})
        hist.append({"role": "assistant", "content": reply})
        _save_history(hist)
        return reply

    # ---- NORMAL TURN ----
    # A pending action the user neither affirmed nor negated is ABANDONED — clear it. Otherwise a
    # stale pending makes _run_agent_loop's `not _load_pending()` guard silently SKIP the gate on
    # this turn's critical calls (gate-bypass hole). Clearing re-arms the gate every fresh turn.
    if pending:
        _clear_pending()
    messages = hist[-(2 * TURNS):] + [{"role": "user", "content": user_msg}]
    return _run_agent_loop(messages, user_msg, hist)


def _run_agent_loop(messages, user_msg, hist):
    """The model-driven multi-step agent loop. Chains tools until the model emits a final spoken
    answer. Critical tool calls are intercepted by the CONFIRM-GATE: instead of executing, we store
    the pending action and force a spoken confirmation. Fixes the original double-call bug (the first
    _messages_call was wasted — overwritten by the loop's first iteration)."""
    # Per-turn RECALL: surface relevant past episodes into the system prompt. The frozen startup
    # MEMORY.md is static across the process; this is what makes Yuri CONTINUOUS across restarts.
    # recall() is non-fatal — empty/none means no recall block, brain runs normally.
    recalled = jm.recall(user_msg)
    sys_prompt = SYSTEM + ("\n\n" + recalled if recalled else "")
    final = ""
    for _ in range(MAX_TOOL_ITERS):
        try:
            resp = _messages_call(messages, sys_prompt)
        except Exception as e:
            final = f"My GLM brain hiccuped: {str(e)[:90]}"
            break
        content = resp.get("content") or []
        tool_uses = [b for b in content if isinstance(b, dict) and b.get("type") == "tool_use"]
        if not tool_uses:
            final = _text_of(content)
            break

        # ---- CONFIRM-GATE: check each tool call for critical classification ----
        critical_calls = [(b, _is_critical_call(b.get("name", ""), b.get("input") or {})) for b in tool_uses]
        if any(crit for _, crit in critical_calls) and not _load_pending():
            # A critical call was chosen — DON'T execute. Store the first critical one as pending,
            # speak the confirmation, and HOLD for Marcel's next voice turn.
            first_critical = next(b for b, crit in critical_calls if crit)
            _save_pending({
                "name": first_critical.get("name", ""),
                "args": first_critical.get("input") or {},
                "original_request": user_msg,
                "confirm_text": "",  # filled below
            })
            desc = _describe_action(first_critical.get("name", ""), first_critical.get("input") or {})
            final = (f"I'm about to {desc}. That right? Confirm and I'll do it.")
            _save_pending({  # re-save with the confirm_text included
                "name": first_critical.get("name", ""),
                "args": first_critical.get("input") or {},
                "original_request": user_msg,
                "confirm_text": final,
            })
            break  # HOLD — return the confirmation, wait for the next voice turn

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
                sys_prompt, with_tools=False).get("content"))
        except Exception:
            final = "That ran long — ask me what happened."

    reply = _strip_think(final) or "Okay."
    # In dispatch mode, extract DISPATCH: lines and inject into the worker tmux pane; reply becomes
    # only the spoken remainder. Out of dispatch mode, _handle_dispatch is a pass-through.
    reply = _handle_dispatch(reply)
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
