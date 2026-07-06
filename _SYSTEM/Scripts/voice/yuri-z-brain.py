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
import os, json, re, subprocess, urllib.request, urllib.error
import pathlib
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
import jarvis_memory as jm   # persistent episodic store — model-driven `remember` + per-turn FTS5 recall
try:
    import jarvis_xref as jx   # YURI-OS navigation seam — canonical truth at startup + native `xref` tool
except Exception:              # guarded: the brain must NEVER fail to start on an import fault
    jx = None

PORT = int(os.environ.get("YURI_Z_BRAIN_PORT", "8014"))
MODEL = os.environ.get("ZAI_MODEL", "glm-5.2")   # glm-5.2 = the flagship in-plan model; RELIABLY emits
#   model-driven tool_use (glm-5-turbo narrated/fabricated instead of calling tools — owner 2026-06-19).
ZAI_URL = os.environ.get("ZAI_BASE_URL", "https://api.z.ai/api/anthropic").rstrip("/")
# Provider abstraction — the brain routes to ANY model, switchable at runtime. Default for testing:
# deepseek-v4-flash:cloud via Ollama Cloud (YURI_BRAIN_PROVIDER/YURI_BRAIN_MODEL override). State
# persists to disk so a switch_brain_model tool call survives the process — the NEXT turn re-reads it.
_BRAIN_STATE = pathlib.Path(os.environ.get("YURI_Z_STATE", os.path.join(os.path.dirname(__file__), "..", "..", "state", "voice", "brain-model.json")))
_DEFAULT_PROVIDER = os.environ.get("YURI_BRAIN_PROVIDER", "ollama")
_DEFAULT_BRAIN_MODEL = os.environ.get("YURI_BRAIN_MODEL", "deepseek-v4-flash:cloud")
OLLAMA_URL = os.environ.get("OLLAMA_BASE_URL", "https://ollama.com").rstrip("/")


def _brain_config():
    """Live brain config from disk (falls back to env defaults). Read fresh each call so a
    switch_brain_model write takes effect on the very next turn without a restart."""
    try:
        st = json.loads(_BRAIN_STATE.read_text())
        return {"provider": st.get("provider", _DEFAULT_PROVIDER), "model": st.get("model", _DEFAULT_BRAIN_MODEL)}
    except Exception:
        return {"provider": _DEFAULT_PROVIDER, "model": _DEFAULT_BRAIN_MODEL}
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
WORK_STATE_FILE = os.path.join(os.path.dirname(__file__), "..", "..", "state", "runtime", "work-state.json")
MEM_CAP = int(os.environ.get("YURI_Z_MEM_CAP", "20000"))  # bound the memory injection so a turn stays snappy
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
             "## SESSION CONDUCTOR — you can manage parallel work sessions BY VOICE\n"
             "You have hands on YURI's runtime session conductor — a registry of tmux-backed worker "
             "sessions Marcel can watch. You can create worker sessions, draft prompts into them, and "
             "SEND those drafts only after Marcel confirms:\n"
             "- `conductor_list` — see what sessions exist and their status.\n"
             "- `conductor_create` — open a new named worker session (optionally with a start command).\n"
             "- `conductor_draft` — stage a prompt into a session's pending draft. This is SAFE and never "
             "sends by itself — it's the crown-scenario staging step (discuss with Marcel -> you draft).\n"
             "- `conductor_send` — actually dispatch the pending draft into the session. This is CRITICAL "
             "(confirm-gated, like git push) — always speak the intent and hold for Marcel's yes first.\n"
             "- `conductor_peek` — read back recent output from a session's pane.\n"
             "- `morning_brief` — re-read Marcel the daily system brief on request.\n"
             "- `usage_status` — summarize current per-provider usage/budget pace aloud.\n\n"
             "## EXECUTE — NEVER FABRICATE OR JUST NARRATE\n"
             "You ACT by CALLING tools. If you did not call a tool, the action did NOT happen — so never say a "
             "command out loud and stop; emit the tool call and actually run it. NEVER guess or invent what's on "
             "the screen, a file's contents, or a command's result. To answer 'what's on my screen' you MUST call "
             "`screenshot` first and describe ONLY what it returns — never imagine a screen. To close, quit, or "
             "terminate something you MUST call the tool that does it (open_app quit / bash kill / tmux), not "
             "describe how. If a tool errors, report the real error — don't pretend it worked.\n\n"
             "## CONFIRM-GATE (your safety model — NARROW)\n"
             "You have FULL execution authority. Routine work just RUNS — read, write, edit, run ANY shell command, "
             "git add/commit (local), open apps, search, navigate, play, check mail/calendar. Do NOT pre-announce these "
             "and do NOT ask to confirm them; just DO them and speak the outcome. Most of what Marcel asks is routine.\n"
             "Confirm (speak the intent in plain words + hold) ONLY for genuinely OUTWARD-FACING or IRREVERSIBLE "
             "actions: sending an email or message to someone, git push to a remote, publishing, or deleting something "
             "permanently. Even then, say the INTENT ('I'll send that to Atilla', 'I'll push to main'), NEVER the raw "
             "command. Writing/editing files and local commits are NOT critical — they are reversible, normal work.\n"
             "- If Marcel says 'verify', 'ask me first', or 'double-check' a SPECIFIC action — confirm THAT one only.\n\n"
             "## MEMORY — you remember across restarts\n"
             "You have a PERSISTENT episodic memory. Two things happen automatically:\n"
             "1. RECALL: each turn, relevant past episodes are injected above — USE them if they fit what Marcel "
             "just said (continue a thread, recall a preference/commitment, don't re-ask what you already know).\n"
             "2. WRITE: call `remember` when Marcel states a durable FACT, PREFERENCE, COMMITMENT, or a noteworthy "
             "episode worth recalling later — NOT routine commands, chit-chat, or things you merely looked up. You "
             "are the judge of what's worth keeping; supply sharp cue words Marcel would later say. This is how you "
             "stay continuous with him across restarts.\n\n"
             "## VOICE DISCIPLINE — outcomes only, NEVER narration\n"
             "You are TALKING to Marcel, not reading a terminal aloud. The rule: ACT first, then say the "
             "OUTCOME in plain speech — never the process.\n"
             "- NEVER announce a command before or while running it. No 'let me check', 'I'll run <command>', "
             "'running that now', 'let me see', 'hold on while I…'. Call the tool silently and speak only the RESULT.\n"
             "- NEVER speak literal command text, code, long file paths, or raw tool output. Translate everything "
             "into plain speech — 'the build's green', not 'npm test exited 0 with 79 passing'.\n"
             "- Your spoken answer is the RESULT in one or two sentences: what it MEANS, what you DID (in plain "
             "words), what's next. Not what you typed, not the output dump, not a play-by-play.\n"
             "- The ONLY time you speak BEFORE acting is a CRITICAL confirm (send an email/message, git push, "
             "publish, or delete-permanently) — and even then, plain intent ('I'll send the email to Atilla'), NEVER "
             "the raw command. Writing/editing files, running shell commands, and local git add/commit are ROUTINE — "
             "NO pre-speech, NO confirm; just run them and report the result.\n"
             "- A long multi-step task earns ONE brief progress line at most ('on it' / 'still working') — never a "
             "narration of each step.\n"
             "- Refusal (protected path / catastrophic command): one short line why, then move on.\n"
             "- Pure questions or chit-chat: just talk — no tools, no narration.")


def _work_state_block() -> str:
    """Read work-state.json (if present) and render a compact 'WHERE WE LEFT OFF' block for the
    system prompt. Fail-open: missing file, malformed JSON, or an empty/example-only 'open' list
    all degrade to "" silently — this must never crash brain startup. Turns the greeting from
    'what happened while I was gone?' into 'we left off on X, next step Y'."""
    try:
        with open(WORK_STATE_FILE, encoding="utf-8") as f:
            data = json.load(f)
        items = data.get("open") if isinstance(data, dict) else None
        if not isinstance(items, list) or not items:
            return ""
        lines = []
        for it in items:
            if not isinstance(it, dict):
                continue
            item = str(it.get("item", "")).strip()
            if not item or item.lower().startswith("example:"):
                continue
            step = str(it.get("nextStep", "")).strip()
            lines.append(f"- {item}" + (f" — next: {step}" if step else ""))
        if not lines:
            return ""
        return ("## WHERE WE LEFT OFF — open threads from prior sessions\n"
                "Use this to greet with continuity ('we left off on X, next step Y — want me to start?') "
                "instead of asking what happened while you were gone.\n" + "\n".join(lines))
    except Exception:
        return ""


def _set_work_state(item: str, next_step: str = "") -> str:
    """Tiny helper to update the carryover file — NOT a config engine, just a read-modify-write
    onto the same schema _work_state_block reads. Replaces any existing entry for the same item
    (case-insensitive) so re-stating progress on a thread updates it in place instead of piling up
    duplicates. Wired into the 'remember' tool handler for kind='commitment' so it's reachable
    through EXISTING plumbing; also callable directly (e.g. from tests or future tools).
    Fail-open: any error is swallowed and reported back as a string, never raised."""
    item = (item or "").strip()
    if not item:
        return "no item given"
    try:
        try:
            with open(WORK_STATE_FILE, encoding="utf-8") as f:
                data = json.load(f)
        except Exception:
            data = {}
        if not isinstance(data, dict):
            data = {}
        open_items = data.get("open")
        if not isinstance(open_items, list):
            open_items = []
        open_items = [it for it in open_items
                      if not (isinstance(it, dict) and str(it.get("item", "")).strip().lower() == item.lower())
                      and not (isinstance(it, dict) and str(it.get("item", "")).strip().lower().startswith("example:"))]
        open_items.append({"item": item, "nextStep": (next_step or "").strip()})
        data["open"] = open_items
        data["updated"] = __import__("datetime").datetime.utcnow().isoformat() + "Z"
        os.makedirs(os.path.dirname(WORK_STATE_FILE), exist_ok=True)
        tmp = WORK_STATE_FILE + ".tmp"
        with open(tmp, "w", encoding="utf-8") as f:
            json.dump(data, f, indent=2)
        os.replace(tmp, WORK_STATE_FILE)
        return f"work-state updated: {item}"
    except Exception as e:
        return f"work-state update failed: {str(e)[:80]}"


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
    ws_block = _work_state_block()
    if ws_block:
        parts.append(ws_block)
    # T3 SEAM: inject the system's canonical truth (peer-open readView from memory-canonical-store.mjs,
    # cached via a one-shot node call at jarvis_xref import). Degrades to "" when the store is absent /
    # disabled — startup stays node-free in that case. The brain draws on the SAME operator-grade truth
    # every other YURI lane reads.
    if jx is not None:
        try:
            canon = jx.canonical_block()
            if canon:
                parts.append(canon)
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

# ---- SESSION CONDUCTOR + RUNTIME TOOLS (owner directive: voice-Yuri gets hands on parallel sessions) ----
# Runtime CLIs live at _SYSTEM/runtime/*.mjs (repo-root relative; REPO is defined below). All calls are
# `node <script> <args>` via the SAME bounded subprocess.run pattern as every other tool — 20s timeout,
# fail-open readable error string (a broken CLI must never crash the brain, it just tells Marcel it failed).
RUNTIME_DIR = os.path.join(os.path.dirname(__file__), "..", "..", "runtime")
CONDUCTOR_CLI = os.path.join(RUNTIME_DIR, "session-conductor.mjs")
MORNING_BRIEF_CLI = os.path.join(RUNTIME_DIR, "morning-brief.mjs")
USAGE_METERS_CLI = os.path.join(RUNTIME_DIR, "usage-meters.mjs")
RUNTIME_TOOL_TIMEOUT = float(os.environ.get("YURI_Z_RUNTIME_TIMEOUT", "20"))


def _run_runtime_cli(args) -> str:
    """Run a node runtime CLI with a bounded timeout and a fail-open, readable error string on any
    failure (missing node, missing script, non-zero exit, timeout). Never raises — the brain must
    stay up even if a runtime CLI is broken or absent."""
    try:
        r = subprocess.run(["node"] + args, cwd=REPO, capture_output=True, text=True,
                           timeout=RUNTIME_TOOL_TIMEOUT)
        out = ((r.stdout or "") + (r.stderr or "")).strip()
        if r.returncode != 0:
            return f"runtime command failed (exit {r.returncode}): {_cap(out) if out else '(no output)'}"
        return _cap(out) if out else "(no output)"
    except subprocess.TimeoutExpired:
        return f"runtime command timed out after {int(RUNTIME_TOOL_TIMEOUT)}s"
    except Exception as e:
        return f"runtime command error: {str(e)[:120]}"

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
READ_DOC_CHAR_CAP = int(os.environ.get("YURI_Z_READ_DOC_CAP", "20000"))  # bound doc text like OUTPUT_CAP bounds bash output
READ_DOC_TIMEOUT = float(os.environ.get("YURI_Z_READ_DOC_TIMEOUT", "60"))  # soffice headless conversion can be slow to spin up

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
# SEC-4 (2026-07-06): added HOME-relative credential stores, macOS Keychain, and .git/hooks — this is
# the brain's IMMEDIATE hardening (fail-closed substring match) even before SEC-1's unified gate arms.
# Phase 6 (2026-07-06): residual credential-path additions — gcloud, kube, GPG, 1Password, gh CLI
# tokens, and private-key material (id_ed25519/ecdsa/dsa, *.pem, *.p12) ANYWHERE by name, not just
# under ~/.ssh/ — a backup/download copy of a key outside that directory must still refuse.
PROTECTED = (".env", "backend/data/", ".claude/state/", ".claude/history/", ".claude/file-history/",
             ".claude/projects/", "node_modules/", ".amp/",
             "id_rsa", "id_ed25519", "id_ecdsa", "id_dsa", ".pem", ".p12",
             ".ssh/", "credentials", "secret",
             ".git/hooks/", os.path.join(os.path.expanduser("~"), ".aws"),
             os.path.join(os.path.expanduser("~"), ".npmrc"),
             os.path.join(os.path.expanduser("~"), ".docker"),
             os.path.join(os.path.expanduser("~"), ".gitconfig"),
             os.path.join(os.path.expanduser("~"), ".zsh_history"),
             os.path.join(os.path.expanduser("~"), "Library/Keychains"),
             os.path.join(os.path.expanduser("~"), ".claude/settings"),
             os.path.join(os.path.expanduser("~"), ".config/gcloud"),
             os.path.join(os.path.expanduser("~"), ".kube"),
             os.path.join(os.path.expanduser("~"), ".gnupg"),
             os.path.join(os.path.expanduser("~"), ".config/op"),
             os.path.join(os.path.expanduser("~"), ".config/1Password"),
             os.path.join(os.path.expanduser("~"), ".config/gh/hosts.yml"))
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


# ---- SEC-1 UNIFIED GATE (2026-07-06, DISARMED-first) ----
# Owner-gated ARM: set YURI_Z_UNIFIED_GATE=1 to route bash/write_file/edit_file through the SAME
# evaluateToolCall gate the fleet lanes use (_SYSTEM/Scripts/policy/yuri-safety-core.mjs), instead of
# only this file's own inline PROTECTED/_DESTRUCTIVE regexes. DEFAULT OFF: with the flag unset (or any
# non-"1" value) the brain behaves EXACTLY as before this change — the inline gate (now SEC-4-hardened)
# is the sole enforcement path. This is a BUILD behind a disarmed flag (self-governable); arming the
# flag as the live default is owner-gated per the Self-Governance Charter.
UNIFIED_GATE = os.environ.get("YURI_Z_UNIFIED_GATE", "0") == "1"
_SAFETY_CORE_CLI = os.path.join(REPO, "_SYSTEM", "Scripts", "policy", "yuri-safety-core.mjs")
_UNIFIED_GATE_TIMEOUT = float(os.environ.get("YURI_Z_UNIFIED_GATE_TIMEOUT", "10"))


def _unified_gate_check(tool_name: str, tool_input: dict):
    """Shell out to the shared yuri-safety-core.mjs --check-tool CLI and return (allowed: bool,
    reason: str|None, degraded: bool). ANY failure (missing node, missing script, timeout, bad JSON,
    non-0/2 exit) DEGRADES to the inline gate rather than fail-open-to-execution — degraded=True tells
    the caller to fall back to _bash_block_reason/_is_protected instead of trusting this result."""
    try:
        payload = json.dumps({"toolName": tool_name, "toolInput": tool_input, "opts": {"cwd": REPO}})
        r = subprocess.run(
            ["node", _SAFETY_CORE_CLI, "--check-tool"],
            input=payload, cwd=REPO, capture_output=True, text=True, timeout=_UNIFIED_GATE_TIMEOUT,
        )
        if r.returncode not in (0, 2):
            return (False, None, True)   # unexpected exit — degrade, don't trust
        try:
            decision = json.loads((r.stdout or "").strip() or "{}")
        except Exception:
            return (False, None, True)  # unparseable stdout — degrade
        return (bool(decision.get("allowed")), decision.get("reason"), False)
    except Exception:
        return (False, None, True)      # timeout / missing node / any other fault — degrade


def _gate_bash(cmd: str):
    """Return a refusal string if bash `cmd` should be blocked, else None. Layers the unified gate
    (when armed) ON TOP of the inline floor: the inline _DESTRUCTIVE/_is_protected checks ALWAYS run
    first regardless of UNIFIED_GATE (never weaken an existing block); the unified gate can ONLY add
    an additional refusal, never lift one the inline floor already raised."""
    inline = _bash_block_reason(cmd)
    if inline:
        return inline
    if not UNIFIED_GATE:
        return None
    allowed, reason, degraded = _unified_gate_check("bash", {"command": cmd})
    if degraded:
        return None   # inline floor already passed above; degrade to that verdict, never fail-open further
    if not allowed:
        return f"refused: {reason or 'blocked by unified safety gate'}"
    return None


def _gate_write(tool_name: str, path_arg: str):
    """Return a refusal string if a write_file/edit_file target should be blocked, else None. Same
    layering as _gate_bash: inline _is_protected floor first (never weakened), unified gate only adds."""
    inline = "refused: protected path (safety floor)" if _is_protected(path_arg) else None
    if inline:
        return inline
    if not UNIFIED_GATE:
        return None
    allowed, reason, degraded = _unified_gate_check(tool_name, {"path": path_arg})
    if degraded:
        return None
    if not allowed:
        return f"refused: {reason or 'blocked by unified safety gate'}"
    return None


# ---- CONFIRM-GATE (the safety model — supervised bypass via spoken human-in-the-loop) ----
# CRITICAL ops: destructive (delete/rm/overwrite/move-over-existing), outward-facing (send email,
# post, git push, git commit, publish), OR anything the model itself flags as risky. Instead of
# executing, we store a PENDING action + speak the confirmation and HOLD. On the next voice turn,
# if Marcel affirms (yes/confirm/do it/go ahead/correct) → execute the stored action. If he
# negates/corrects → drop or adjust. This is Marcel's explicit model (2026-06-19): full authority,
# but a spoken confirm gate on critical actions — her backstop since she has no interactive prompt.
PENDING_FILE = os.path.join(os.path.dirname(__file__), "..", "..", "state", "voice", "yuri-pending-action.json")

# Bash command patterns that escalate to CRITICAL (confirm-gated). NARROWED (owner 2026-06-19): the old
# set matched bare `rm`, ANY `>` redirect, `git commit`, `trash`/`srm` — so the gate fired on nearly every
# routine step and Yuri read out + confirmed each bash command. Now ONLY genuinely outward-facing or
# irreversible-external bash escalates: `git push` (to a remote), sending email (sendmail / mail -s), and
# Mail trash/delete via osascript. Catastrophic commands (rm -rf /, sudo, dd, mkfs, --force push, curl|sh…)
# are still hard-BLOCKED by _DESTRUCTIVE regardless of this soft gate. Local rm/mv/redirects/commits run free.
_CRITICAL_BASH = re.compile(
    r"\bgit\s+push\b|\bsendmail\b|\bmail\s+-s\b|"
    r"osascript.*\b(send|delete|empty\s+trash)\b|"
    # Package installs — Marcel's never-list rule "never download/install without clearance".
    r"\b(brew|pip3?|npm|pnpm|yarn|cargo|gem|go|apt(?:-get)?)\s+install\b|"
    # Downloads that write to disk: curl only writes on -O/-o/redirect (streams to stdout otherwise);
    # wget writes to disk BY DEFAULT (no flag needed) unless explicitly piped to stdout via -O-/-qO-.
    r"\bwget\b(?!.*-[A-Za-z]*O-)|\bcurl\b[^\n|]*(-[A-Za-z]*[oO][A-Za-z]*\b|\s>>?\s)|"
    # git clone of a NON-local remote (http/https/ssh/git@) — local-path clones stay routine.
    r"\bgit\s+clone\b[^\n]*(https?://|git@|ssh://)",
    re.IGNORECASE)
# AppleScript keywords that are critical (send/create/delete/trash in Mail, Calendar, Messages).
_CRITICAL_APPLESCRIPT = re.compile(
    r"\b(send|delete|empty\s+trash|move\b.*to\s+trash|create\s+new\s+(event|message|reminder)|"
    r"make\s+new\s+(outgoing\s+)?message|reply\s+with)",
    re.IGNORECASE)

_AFFIRM = re.compile(r"\b(yes|yeah|yep|confirm|do it|go ahead|go for it|correct|affirmative|sure|please do|that'?s right|proceed|make it so)\b", re.IGNORECASE)
_NEGATE = re.compile(r"\b(no|nope|cancel|stop|don'?t|never\s+mind|forget it|wait|hold on|abort|actually\s+no|wrong)\b", re.IGNORECASE)
_AFFIRM_MAX_WORDS = 3  # a real confirm IS a short reply ("yes", "do it", "yes do it") — a longer


def _affirms_early(msg: str, max_words: int = _AFFIRM_MAX_WORDS) -> bool:
    """True only when the WHOLE message is short (<= max_words) and matches _AFFIRM within it. A
    long sentence that merely STARTS with an affirm word ('yeah, but also check my calendar') is
    NOT a confirm — it's Marcel redirecting, and the old bare _AFFIRM.search() wrongly fired the
    pending action on it. Real confirms don't carry a trailing clause; length-capping the WHOLE
    message (not just a prefix window) is what actually excludes that case."""
    msg = (msg or "").strip()
    words = msg.split()
    if not words or len(words) > max_words:
        return False
    return bool(_AFFIRM.search(msg))


# SEC-3: sensitive-new-file targets — a write_file/edit_file to any of these is CRITICAL even when the
# target doesn't already exist (persistence / credential-injection paths: SSH auth, LaunchAgents that
# survive reboot + re-execute, shell rc that runs on every new shell, cron, git hooks that fire on the
# next commit). Substring match against the RESOLVED absolute path, same spirit as _is_protected.
_SENSITIVE_NEW_FILE_SEGMENTS = (
    os.path.join(os.path.expanduser("~"), ".ssh") + os.sep,
    os.path.join(os.path.expanduser("~"), "Library/LaunchAgents") + os.sep,
    os.path.join(os.path.expanduser("~"), ".zshrc"),
    os.path.join(os.path.expanduser("~"), ".bashrc"),
    os.path.join(os.path.expanduser("~"), ".bash_profile"),
    os.path.join(os.path.expanduser("~"), ".profile"),
    "/etc/cron", os.path.join(os.path.expanduser("~"), "crontab"),
    ".git/hooks" + os.sep,
)


def _resolve_tool_path(p: str) -> str:
    """Resolve a tool-supplied path the SAME way _exec_tool does: os.path.join(REPO, p) — which,
    per Python semantics, returns `p` unchanged when `p` is already absolute (REPO is discarded).
    This mirrors the write_file/edit_file/read_file resolution exactly so the critical-call
    classifier and the actual executor never disagree on what a path resolves to."""
    return os.path.normpath(os.path.join(REPO, (p or "").strip()))


def _is_write_target_critical(p: str) -> bool:
    """SEC-3: a write_file/edit_file target is CRITICAL when it (a) already exists (overwrite —
    original behavior), (b) resolves OUTSIDE the repo root (an absolute path like ~/.ssh/... makes
    os.path.join discard REPO — this is the exact escape the audit flagged), or (c) matches a
    sensitive-new-file segment (SSH, LaunchAgents, shell rc, cron, git hooks) regardless of whether
    it already exists. Fail-closed: any match gates."""
    p = (p or "").strip()
    if not p:
        return False
    resolved = _resolve_tool_path(p)
    if os.path.exists(resolved):
        return True
    repo_with_sep = os.path.normpath(REPO) + os.sep
    if not (resolved + os.sep).startswith(repo_with_sep) and resolved != os.path.normpath(REPO):
        return True   # outside repo root entirely
    if any(seg in resolved for seg in _SENSITIVE_NEW_FILE_SEGMENTS):
        return True
    return False


def _is_critical_call(name: str, args: dict) -> bool:
    """Classify a tool call as routine vs critical. Only OUTWARD-FACING or genuinely IRREVERSIBLE
    actions confirm-gate (owner 2026-06-19: stop gating every routine step — she was reading out +
    confirming each bash/edit/write before running it). Routine work just RUNS; the _DESTRUCTIVE hard
    block still refuses catastrophic commands regardless of this soft gate.

    Not gated (routine): edit_file, spawn_worker, read_file, open_app, screenshot, remember, xref, and
    bash/applescript whose content misses the critical patterns. write_file/edit_file gate when they
    would OVERWRITE an existing file, OR (SEC-3, 2026-07-06) when the resolved target is outside the
    repo root or under a sensitive-new-file path (~/.ssh/, LaunchAgents, shell rc, cron, git hooks) —
    a brand-new file is only "routine" when it lands inside the repo and isn't one of those.

    conductor_send is ALWAYS critical — it is the exact git-push-class action for the session conductor
    (drafting is safe/reversible staging; SENDING dispatches the draft into a live worker session, so it
    confirm-gates unconditionally, same tier as an outward-facing git push)."""
    if name in ("write_file", "edit_file"):
        p = (args.get("path") or "").strip()
        return bool(p) and _is_write_target_critical(p)
    if name == "bash":
        return bool(_CRITICAL_BASH.search(args.get("command", "")))
    if name in ("applescript", "gui_script"):
        return bool(_CRITICAL_APPLESCRIPT.search(args.get("script", "")))
    if name == "conductor_send":
        return True
    return False


# ---- SEC-2 TAINT TRACKING (2026-07-06) ----
# read_doc (and any future fetch_url/web/screen-reader tool) returns UNTRUSTED content — text a
# crafted PDF/doc could plant an injected instruction inside. _is_critical_call above classifies by
# regex over the MODEL'S OWN command string; it has no notion of "did this command's intent originate
# from something the model just read, not from Marcel." An indirect-prompt-injection payload that
# reads as benign (no rm/curl|sh/git push token) sails through unclassified. This is a MINIMAL
# session-level taint window, not a provenance graph: a counter + a set-membership check.
#
# In-process only (module-level state, one brain process = one voice session) — mirrors the existing
# PENDING_FILE pattern's scope, but taint deliberately does NOT persist to disk: it should not survive
# a restart (a fresh process has read nothing yet), and it must decay on its own after N tool-call
# slots so an unrelated later action isn't punished forever for an old read.
_TAINT_WINDOW = int(os.environ.get("YURI_Z_TAINT_WINDOW", "3"))  # N tool-call slots the taint covers
_TAINT_SOURCE_TOOLS = ("read_doc",)          # tools whose OUTPUT is untrusted content
_TAINT_ADJACENT_TOOLS = ("bash", "write_file", "edit_file", "applescript", "gui_script", "conductor_send")
_taint_remaining = 0   # counts down; > 0 means "the next critical-adjacent call escalates"


def _taint_mark():
    """Called right after a taint-source tool (read_doc) executes: (re)arm the taint window."""
    global _taint_remaining
    _taint_remaining = _TAINT_WINDOW


def _taint_consume_if_adjacent(name: str) -> bool:
    """Called once per dispatched tool call, IN MODEL-EMITTED ORDER, for the tool actually about to
    run. Returns True (and decays the window) if `name` is a critical-adjacent tool consumed while
    taint is active — this is the signal _is_critical_call folds in to force confirm-gating regardless
    of the regex verdict. Non-adjacent tools (read_file, xref, remember, screenshot, morning_brief,
    usage_status, spawn_worker, open_app, conductor_list/create/draft/peek) do NOT consume the window —
    only a genuinely critical-adjacent tool should spend it, so Marcel asking a read-only follow-up
    question in between doesn't burn the window before the actually-risky call arrives."""
    global _taint_remaining
    if _taint_remaining <= 0:
        return False
    if name not in _TAINT_ADJACENT_TOOLS:
        return False
    _taint_remaining -= 1
    return True


def _taint_active() -> bool:
    return _taint_remaining > 0


# ---- SEC-5 UNATTENDED PROFILE (2026-07-06, DISARMED-first) ----
# Overnight/unattended runs have the SAME tool access as attended today but lose the human spoken-
# confirm backstop entirely (there's no one to say "yes" to the CONFIRM-GATE), so a critical call just
# sits PENDING forever with no harm — but a call the regex classifier MISSES runs immediately, same as
# attended, with no human watching. Structurally safer-than-attended means: reduce capability instead
# of relying on a confirm no one will answer. DEFAULT OFF — arming is owner-gated (Self-Governance
# Charter: this changes live tool availability, not a passive telemetry read).
UNATTENDED = os.environ.get("YURI_Z_UNATTENDED", "0") == "1"
# Mutating/outward-facing tools: denied by default when unattended. spawn_worker is included — it
# opens a new terminal that itself gets full capability, which is exactly the kind of unattended
# capability-expansion SEC-5 is meant to prevent.
_UNATTENDED_DENY_BY_DEFAULT = (
    "bash", "write_file", "edit_file", "applescript", "gui_script", "conductor_send", "spawn_worker",
)
# Read/query tools stay allowed even in unattended mode — they can't mutate or reach outward.
_UNATTENDED_ALWAYS_ALLOWED = (
    "read_file", "read_doc", "xref", "remember", "screenshot", "morning_brief", "usage_status",
)


def _unattended_allowlist() -> set:
    """Parse YURI_Z_UNATTENDED_ALLOW (comma-separated tool names) into an explicit override set —
    lets the owner permit specific overnight tasks (e.g. 'bash,write_file' for a scoped batch job)
    without disarming the whole reduced-capability profile."""
    raw = os.environ.get("YURI_Z_UNATTENDED_ALLOW", "")
    return {t.strip() for t in raw.split(",") if t.strip()}


def _unattended_block_reason(name: str):
    """Return a refusal string if `name` should be denied under the unattended profile, else None.
    Fail-closed shape: a tool not in either named list (future tool added without updating this
    function) is NOT auto-denied — see residual-gap note in the build report; this scopes exactly to
    the tools SEC-5 named. Checked in _exec_tool BEFORE any other gate, so it denies before the inline
    safety-floor gate even runs — cheapest possible refusal, no subprocess/IO cost."""
    if not UNATTENDED:
        return None
    if name not in _UNATTENDED_DENY_BY_DEFAULT:
        return None
    if name in _unattended_allowlist():
        return None
    return (f"refused: '{name}' is disabled in unattended mode (YURI_Z_UNATTENDED=1) — set "
            f"YURI_Z_UNATTENDED_ALLOW to include '{name}' to permit it for this overnight run")


# ---- SEC-5 CUMULATIVE-RISK COUNTER (2026-07-06) ----
# Per-call classification is STATELESS — a multi-step persistence chain (new file -> chmod +x ->
# LaunchAgent) can reach persistence with zero SINGLE step tripping _is_critical_call, because each
# step individually looks routine. This tracks a decaying per-session risk score across "notable"
# routine-but-worth-watching actions; once it crosses a threshold within the window, the NEXT action
# escalates to confirm-gated even in attended mode, even though that action alone wouldn't gate.
# Minimal by design: an integer + decay + threshold, in-process, reset per session (module state, same
# scope as the taint window above — does not persist across restarts).
_RISK_THRESHOLD = int(os.environ.get("YURI_Z_RISK_THRESHOLD", "4"))   # score at/above this escalates
_RISK_DECAY_CALLS = int(os.environ.get("YURI_Z_RISK_DECAY_CALLS", "10"))  # tool calls before full decay
_risk_score = 0.0
_risk_calls_since_last = 0

# Points added per notable action kind. new_file/chmod/out_of_repo_read are the concrete chain steps
# named in the packet (new file -> chmod +x -> LaunchAgent); "critical_passed" covers a confirm-gated
# action that WAS approved — approved-but-notable actions still compound risk across a session.
_RISK_WEIGHTS = {
    "new_file": 1.0,
    "chmod": 1.5,
    "out_of_repo_read": 1.0,
    "critical_passed": 1.0,
}


def _risk_decay():
    """Linear decay proportional to calls elapsed since the last risk-affecting event — a session
    that goes quiet (or does only unrelated routine work) cools back down instead of staying primed
    on an old, unrelated action forever."""
    global _risk_score, _risk_calls_since_last
    if _risk_calls_since_last <= 0 or _risk_score <= 0:
        return
    decay = _risk_score * min(1.0, _risk_calls_since_last / max(1, _RISK_DECAY_CALLS))
    _risk_score = max(0.0, _risk_score - decay)
    _risk_calls_since_last = 0


def _risk_bump(kind: str):
    """Record a notable action and advance the per-call decay clock. Called from _exec_tool at the
    point each notable action actually happens (not at classification time) — mirrors _taint_mark's
    placement so risk reflects what RAN, not what was merely proposed."""
    global _risk_score, _risk_calls_since_last
    _risk_decay()
    _risk_score += _RISK_WEIGHTS.get(kind, 0.0)
    _risk_calls_since_last = 0


def _risk_tick():
    """Called once per dispatched tool call (any kind) so the decay clock advances even on calls that
    don't themselves bump risk — otherwise a session that only ever bumps risk would never decay."""
    global _risk_calls_since_last
    _risk_calls_since_last += 1
    _risk_decay()


def _risk_escalated() -> bool:
    return _risk_score >= _RISK_THRESHOLD


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
    """A short PLAIN-LANGUAGE description of what a pending tool call will do — Marcel hears the INTENT
    of what he's confirming, never a raw command/script read aloud. Truncated so a long pipeline or
    AppleScript isn't narrated verbatim (owner 2026-06-19: stop speaking commands out loud)."""
    if name == "bash":
        cmd = (args.get("command") or "").strip().replace("\n", " ")
        tail = cmd[:70] + ("…" if len(cmd) > 70 else "")
        return f"run a shell command ({tail})" if cmd else "run a shell command"
    if name == "write_file":
        return f"write to {args.get('path', '')}"
    if name == "edit_file":
        return f"edit {args.get('path', '')}"
    if name == "applescript":
        s = (args.get("script") or "").replace("\n", " ").strip()
        tail = s[:50] + ("…" if len(s) > 50 else "")
        return f"run an AppleScript ({tail})" if s else "run an AppleScript"
    if name == "gui_script":
        s = (args.get("script") or "").replace("\n", " ").strip()
        tail = s[:50] + ("…" if len(s) > 50 else "")
        return f"run a GUI script ({tail})" if s else "run a GUI script"
    if name == "open_app":
        return f"{args.get('action', '')} {args.get('app', '')}".strip()
    if name == "conductor_send":
        return f"send the draft to {args.get('name', '')}"
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
    {
        "name": "xref",
        "description": ("Navigate YURI's own knowledge the way every other lane does — search the code/docs "
                        "corpus (FTS5), the circuitry graph, and mechanism evidence for a query. Use when Marcel "
                        "asks how something in YURI works, where a capability lives, whether we already have X, "
                        "or for prior art. READ-ONLY; returns compact ranked evidence. This is you navigating "
                        "your own system, not the web."),
        "input_schema": {"type": "object", "required": ["query"],
                         "properties": {"query": {"type": "string", "description": "What to navigate YURI's knowledge for."}}},
    },
    {
        "name": "read_doc",
        "description": ("Extract plain TEXT from a document Marcel points you at — PDF (.pdf) or Office "
                        "files (.doc/.docx/.xls/.xlsx). Use when Marcel asks you to read, summarize, or pull "
                        "info from a document file. TEXT ONLY — no layout fidelity, no images/vision, no OCR "
                        "of scanned pages. Bounded to a reasonable read length. Fails clearly if the file type "
                        "is unsupported or the extraction CLI is missing."),
        "input_schema": {"type": "object", "required": ["path"],
                         "properties": {"path": {"type": "string", "description": "Document path, relative to the repo root or absolute."}}},
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
    # ---- SESSION CONDUCTOR (parallel work-session management by voice) ----
    {
        "name": "conductor_list",
        "description": ("List all registered tmux worker sessions (the session conductor's registry) with "
                        "their status and last activity. Use this to answer 'what sessions do I have running' "
                        "or before creating/drafting/sending to check what already exists. Voice discipline: "
                        "SPEAK a one-two sentence summary of what's running, never read the raw list aloud."),
        "input_schema": {"type": "object", "properties": {}},
    },
    {
        "name": "conductor_create",
        "description": ("Create a NEW tmux-backed worker session Marcel can watch, registered in the session "
                        "conductor. Routine — creating a session is reversible (it can be killed). Optionally "
                        "give it a start command (e.g. launch Claude Code, Codex, or a shell tool in it)."),
        "input_schema": {"type": "object", "required": ["name"],
                         "properties": {"name": {"type": "string", "description": "Session name to register, e.g. 'worker2' or 'research-lane'."},
                                        "cmd": {"type": "string", "description": "Optional shell command to start in the session, e.g. 'claude' or 'ai claude-zai'. Omit for a plain shell."}}},
    },
    {
        "name": "conductor_draft",
        "description": ("Stage a prompt as a PENDING draft into a session — the crown-scenario staging step: "
                        "discuss with Marcel, then draft the prompt into the target session. This NEVER sends "
                        "by itself and is completely safe/reversible; it only becomes live when conductor_send "
                        "is called and confirmed. Routine — no confirm needed to draft."),
        "input_schema": {"type": "object", "required": ["name", "text"],
                         "properties": {"name": {"type": "string", "description": "Target session name (must already exist — create it first if needed)."},
                                        "text": {"type": "string", "description": "The full prompt text to stage for that session."}}},
    },
    {
        "name": "conductor_send",
        "description": ("Dispatch the PENDING draft into its session via tmux send-keys — this is the moment "
                        "the drafted prompt actually goes live and the worker starts acting on it. CRITICAL: "
                        "this is confirm-gated exactly like a git push — you must speak the intent ('I'm about "
                        "to send the draft to <name>. Confirm?') and HOLD for Marcel's explicit yes before it "
                        "fires. Never call this expecting it to run silently."),
        "input_schema": {"type": "object", "required": ["name"],
                         "properties": {"name": {"type": "string", "description": "Session name whose pending draft should be sent."}}},
    },
    {
        "name": "conductor_peek",
        "description": ("Read back recent terminal output from a worker session's pane — use this to check "
                        "progress or see what a session is doing/said. Routine, read-only. Voice discipline: "
                        "SUMMARIZE what you see in one or two spoken sentences, never read raw terminal output aloud."),
        "input_schema": {"type": "object", "required": ["name"],
                         "properties": {"name": {"type": "string", "description": "Session name to peek at."},
                                        "lines": {"type": "integer", "default": 10, "description": "How many recent lines of pane output to capture. Default 10."}}},
    },
    # ---- DAILY BRIEF + USAGE (read-only status tools) ----
    {
        "name": "morning_brief",
        "description": ("Get the current daily system brief — commits since last session, system health, "
                        "queued work, memory freshness — in spoken-ready form. Use when Marcel asks 'what's "
                        "the brief', 'catch me up', or wants the daily rundown re-read. Voice discipline: this "
                        "already comes back spoken-ready; deliver it close to verbatim, don't further compress "
                        "it into something less informative."),
        "input_schema": {"type": "object", "properties": {}},
    },
    {
        "name": "usage_status",
        "description": ("Get current per-provider (Z.ai / Ollama / Anthropic) token usage, budget, and pace "
                        "status. Use when Marcel asks about usage, budget, quota, or 'how much have we burned'. "
                        "Voice discipline: this returns a compact multi-line status block — SUMMARIZE it "
                        "aloud in one or two sentences (which pools are near budget, any HOLD/warn pace), "
                        "never read the raw block verbatim."),
        "input_schema": {"type": "object", "properties": {}},
    },
    {
        "name": "switch_brain_model",
        "description": ("Switch the live brain model by writing {provider, model} to the brain-state "
                        "file. Takes effect on the NEXT voice turn (each turn re-reads the config, no "
                        "restart). Use when Marcel asks to switch/change the brain, try a different "
                        "model, use Ollama or z.ai, or test a new brain. provider: 'ollama' or 'zai'. "
                        "model: the model id (e.g. 'deepseek-v4-flash:cloud' or 'glm-5.2')."),
        "input_schema": {"type": "object", "required": ["provider", "model"],
                         "properties": {"provider": {"type": "string", "description": "'ollama' or 'zai'."},
                                        "model": {"type": "string", "description": "The model id to route to."}}},
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


_PDFTOTEXT_BIN = "/opt/homebrew/bin/pdftotext"   # verified present (poppler); PATH fallback if the absolute path moves
_SOFFICE_BIN = "/opt/homebrew/bin/soffice"       # verified present (libreoffice); PATH fallback if the absolute path moves
_OFFICE_EXTS = (".doc", ".docx", ".xls", ".xlsx")


def _extract_doc_text(path: str) -> str:
    """Extract plain TEXT from a document — .pdf via pdftotext, .doc/.docx/.xls/.xlsx via a headless
    LibreOffice (soffice) convert-to-txt round trip. TEXT ONLY: no layout fidelity, no vision/OCR of
    scanned pages. Fail-open: a missing CLI, unsupported extension, or any subprocess error returns a
    clear message string — never raises, matching every other tool in this file."""
    ext = os.path.splitext(path)[1].lower()
    if not os.path.exists(path):
        return f"read_doc failed: file not found: {path}"

    if ext == ".pdf":
        pdftotext = _PDFTOTEXT_BIN if os.path.exists(_PDFTOTEXT_BIN) else "pdftotext"
        try:
            r = subprocess.run([pdftotext, "-layout", path, "-"], capture_output=True, text=True,
                               timeout=READ_DOC_TIMEOUT)
        except FileNotFoundError:
            return "read_doc failed: pdftotext is not installed (brew install poppler)"
        except subprocess.TimeoutExpired:
            return f"read_doc failed: pdftotext timed out after {int(READ_DOC_TIMEOUT)}s"
        except Exception as e:
            return f"read_doc failed: {str(e)[:100]}"
        if r.returncode != 0:
            return f"read_doc failed: pdftotext error: {(r.stderr or '').strip()[:150]}"
        text = (r.stdout or "").strip()
        return (text[:READ_DOC_CHAR_CAP] + "\n…(truncated)") if len(text) > READ_DOC_CHAR_CAP else (text or "(no extractable text — the PDF may be scanned/image-only)")

    if ext in _OFFICE_EXTS:
        soffice = _SOFFICE_BIN if os.path.exists(_SOFFICE_BIN) else "soffice"
        import tempfile
        tmpdir = tempfile.mkdtemp(prefix="yuri-read-doc-")
        try:
            r = subprocess.run([soffice, "--headless", "--convert-to", "txt", "--outdir", tmpdir, path],
                               capture_output=True, text=True, timeout=READ_DOC_TIMEOUT)
        except FileNotFoundError:
            return "read_doc failed: soffice (LibreOffice) is not installed"
        except subprocess.TimeoutExpired:
            return f"read_doc failed: soffice timed out after {int(READ_DOC_TIMEOUT)}s"
        except Exception as e:
            return f"read_doc failed: {str(e)[:100]}"
        finally:
            pass  # tmpdir cleaned below after read, so soffice has time to write it
        if r.returncode != 0:
            return f"read_doc failed: soffice error: {(r.stderr or '').strip()[:150]}"
        base = os.path.splitext(os.path.basename(path))[0]
        txt_path = os.path.join(tmpdir, base + ".txt")
        try:
            with open(txt_path, encoding="utf-8", errors="replace") as f:
                text = f.read().strip()
        except Exception as e:
            return f"read_doc failed: soffice did not produce output ({str(e)[:80]})"
        finally:
            import shutil
            shutil.rmtree(tmpdir, ignore_errors=True)
        return (text[:READ_DOC_CHAR_CAP] + "\n…(truncated)") if len(text) > READ_DOC_CHAR_CAP else (text or "(no extractable text)")

    return f"read_doc failed: unsupported file type '{ext}' (supported: .pdf, .doc, .docx, .xls, .xlsx)"


def _exec_tool(name, args):
    """Run a capability the model chose. Full worker-grade toolset behind the safety floor."""
    args = args or {}
    _risk_tick()   # SEC-5: advance the decay clock on every dispatched call, gated or not
    unattended_block = _unattended_block_reason(name)   # SEC-5: cheapest possible check, before any IO
    if unattended_block:
        return unattended_block
    try:
        if name == "bash":
            cmd = (args.get("command") or "").strip()
            if not cmd:
                return "no command given"
            if not BASH_ENABLED:
                return "bash is disabled (YURI_Z_NO_BASH=1)"
            blocked = _gate_bash(cmd)   # SEC-1: inline floor ALWAYS runs; unified gate layers on top when armed
            if blocked:
                return blocked
            if re.search(r"\bchmod\b", cmd, re.IGNORECASE):
                _risk_bump("chmod")   # SEC-5: chmod is a named step in the persistence-chain example
            r = subprocess.run(cmd, shell=True, cwd=REPO, capture_output=True, text=True, timeout=BASH_TIMEOUT)
            out = ((r.stdout or "") + (r.stderr or "")).strip()
            return _cap(out) if out else f"(no output, exit {r.returncode})"
        if name == "read_file":
            p = (args.get("path") or "").strip()
            if _is_protected(p):
                return "refused: protected path (safety floor)"
            resolved = os.path.normpath(os.path.join(REPO, p))
            repo_norm = os.path.normpath(REPO) + os.sep
            if not (resolved + os.sep).startswith(repo_norm) and resolved != os.path.normpath(REPO):
                _risk_bump("out_of_repo_read")   # SEC-5: reading outside the repo root is notable
            with open(os.path.join(REPO, p), encoding="utf-8", errors="replace") as f:
                return _cap(f.read())
        if name == "write_file":
            p = (args.get("path") or "").strip()
            blocked = _gate_write("write_file", p)   # SEC-1: inline floor first, unified gate on top when armed
            if blocked:
                return blocked
            full = os.path.join(REPO, p)
            if not os.path.exists(full):
                _risk_bump("new_file")   # SEC-5: brand-new file is the first named persistence-chain step
            os.makedirs(os.path.dirname(full) or ".", exist_ok=True)
            content = _fix_mojibake(args.get("content") or "")
            with open(full, "w", encoding="utf-8") as f:
                f.write(content)
            return f"wrote {p}"
        if name == "edit_file":
            p = (args.get("path") or "").strip()
            blocked = _gate_write("edit_file", p)   # SEC-1: inline floor first, unified gate on top when armed
            if blocked:
                return blocked
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
            result = jm.remember(args.get("summary"), cues=args.get("cues", ""), kind=args.get("kind", "episode"),
                                 tags=args.get("tags", ""), weight=args.get("weight", 1.0))
            # A 'commitment' is exactly an open thread/next-step — also surface it in the
            # WHERE WE LEFT OFF carryover block (existing plumbing, not a new tool).
            if (args.get("kind") or "").strip().lower() == "commitment":
                _set_work_state(args.get("summary") or "", args.get("cues") or "")
            return result
        if name == "xref":
            q = (args.get("query") or "").strip()
            if not q:
                return "no query given"
            if jx is None:
                return "xref unavailable (navigation seam not loaded)"
            return _cap(jx.xref(q))
        if name == "read_doc":
            p = (args.get("path") or "").strip()
            if not p:
                return "no document path given"
            if _is_protected(p):
                return "refused: protected path (safety floor)"
            full = p if os.path.isabs(p) else os.path.join(REPO, p)
            result = _extract_doc_text(full)
            # SEC-2: read_doc returns UNTRUSTED content (a crafted PDF/doc could carry an injected
            # instruction) — arm the taint window so the NEXT critical-adjacent tool call confirm-gates
            # regardless of what its own command string looks like.
            _taint_mark()
            return result
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
        # ---- SESSION CONDUCTOR ----
        if name == "conductor_list":
            return _run_runtime_cli([CONDUCTOR_CLI, "list"])
        if name == "conductor_create":
            sess_name = (args.get("name") or "").strip()
            if not sess_name:
                return "no session name given"
            argv = [CONDUCTOR_CLI, "create", sess_name]
            cmd = (args.get("cmd") or "").strip()
            if cmd:
                argv += ["--cmd", cmd]
            return _run_runtime_cli(argv)
        if name == "conductor_draft":
            sess_name = (args.get("name") or "").strip()
            text = args.get("text") or ""
            if not sess_name:
                return "no session name given"
            if not text.strip():
                return "no draft text given"
            return _run_runtime_cli([CONDUCTOR_CLI, "draft", sess_name, "--text", text])
        if name == "conductor_send":
            sess_name = (args.get("name") or "").strip()
            if not sess_name:
                return "no session name given"
            return _run_runtime_cli([CONDUCTOR_CLI, "send", sess_name])
        if name == "conductor_peek":
            sess_name = (args.get("name") or "").strip()
            if not sess_name:
                return "no session name given"
            lines = args.get("lines", 10)
            try:
                lines = int(lines)
            except (TypeError, ValueError):
                lines = 10
            return _run_runtime_cli([CONDUCTOR_CLI, "peek", sess_name, "--lines", str(lines)])
        # ---- DAILY BRIEF + USAGE ----
        if name == "morning_brief":
            return _run_runtime_cli([MORNING_BRIEF_CLI, "--spoken"])
        if name == "usage_status":
            return _run_runtime_cli([USAGE_METERS_CLI, "status"])
        if name == "switch_brain_model":
            provider = (args.get("provider") or "").strip()
            model = (args.get("model") or "").strip()
            if not provider or not model:
                return "switch_brain_model needs both provider and model"
            try:
                _BRAIN_STATE.parent.mkdir(parents=True, exist_ok=True)
                _BRAIN_STATE.write_text(json.dumps({"provider": provider, "model": model}))
                return f"brain switched to {provider}/{model} — takes effect on your next turn"
            except Exception as e:
                return f"failed to switch brain model: {str(e)[:80]}"
    except subprocess.TimeoutExpired:
        return f"command timed out after {int(BASH_TIMEOUT)}s"
    except Exception as e:
        return f"tool error: {str(e)[:80]}"
    return f"unknown tool: {name}"


def _zai_messages_call(messages, system, with_tools=True):
    """One call to Z.ai's Anthropic Messages endpoint (the original brain path). Returns the parsed
    message dict {content:[blocks], stop_reason}. Bearer auth (the GLM Coding Plan convention).
    Logic unchanged — renamed so _messages_call can route here or to the Ollama adapter."""
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

def _messages_call(messages, system, with_tools=True):
    """Provider router. Reads the live brain config and dispatches to the matching adapter. Both
    adapters return the SAME Anthropic content-block shape {content:[blocks], stop_reason}, so
    _run_agent_loop and the tool loop stay provider-agnostic. Pipecat's external /v1/chat/completions
    surface is untouched — only the upstream provider call is swapped."""
    cfg = _brain_config()
    if cfg["provider"] == "ollama":
        return _ollama_messages_call(messages, system, with_tools=with_tools, model=cfg["model"])
    return _zai_messages_call(messages, system, with_tools)


def _ollama_messages_call(messages, system, with_tools=True, model=None):
    """One call to Ollama's /api/chat endpoint, translated to/from the Anthropic content-block shape
    the brain uses internally. Native Ollama format, Bearer auth (OLLAMA_API_KEY). Returns
    {content:[blocks], stop_reason}. No new deps — stdlib urllib only.
    GOTCHA: Ollama returns tool_call arguments as an OBJECT (not a JSON string); we defendively
    handle both forms on the way back, and emit a JSON string (json.dumps) on the way out."""
    cfg_model = model or _brain_config()["model"]

    def _to_ollama_msg(m):
        """Anthropic message → Ollama message (or a LIST of messages when a single user turn carries
        multiple tool_result blocks, which Ollama models as separate role:'tool' messages)."""
        role = m.get("role", "user")
        content = m.get("content")
        if isinstance(content, str):
            return {"role": role, "content": content}
        texts, tool_results, tool_calls = [], [], []
        for b in (content or []):
            if not isinstance(b, dict):
                continue
            bt = b.get("type")
            if bt == "text":
                texts.append(b.get("text", ""))
            elif bt == "tool_use":
                tool_calls.append({"id": b.get("id", ""), "type": "function",
                                   "function": {"name": b.get("name", ""),
                                                "arguments": json.dumps(b.get("input") or {})}})
            elif bt == "tool_result":
                tool_results.append({"role": "tool",
                                     "tool_call_id": b.get("tool_use_id", ""),
                                     "content": b.get("content", "")})
        if role == "assistant":
            msg = {"role": "assistant", "content": "\n".join(t for t in texts if t)}
            if tool_calls:
                msg["tool_calls"] = tool_calls
            return msg
        if tool_results:
            # user turn carrying tool results → the text (if any) stays a user message, results
            # fan out into separate role:'tool' messages (Ollama convention).
            out = []
            if texts:
                out.append({"role": "user", "content": "\n".join(texts)})
            out.extend(tool_results)
            return out
        return {"role": role, "content": "\n".join(texts)}

    ollama_messages = ([{"role": "system", "content": system}] if system else [])
    for m in messages:
        conv = _to_ollama_msg(m)
        ollama_messages.extend(conv if isinstance(conv, list) else [conv])

    payload = {"model": cfg_model, "messages": ollama_messages, "stream": False}
    if with_tools:
        payload["tools"] = [{"type": "function",
                             "function": {"name": t.get("name", ""),
                                          "description": t.get("description", ""),
                                          "parameters": t.get("input_schema", {"type": "object"})}}
                            for t in TOOLS]

    def _post(p):
        body = json.dumps(p).encode()
        req = urllib.request.Request(f"{OLLAMA_URL}/api/chat", data=body, headers={
            "Content-Type": "application/json",
            "Authorization": f"Bearer {os.environ.get('OLLAMA_API_KEY', '').strip()}",
        })
        with urllib.request.urlopen(req, timeout=TIMEOUT) as r:
            return json.loads(r.read())

    try:
        data = _post(payload)
    except urllib.error.HTTPError as e:
        # 4xx — frequently "model doesn't support tools" — retry once without tools.
        if with_tools and 400 <= e.code < 500:
            payload.pop("tools", None)
            data = _post(payload)
        else:
            raise

    # ---- Ollama response → Anthropic content-block shape ----
    msg = data.get("message") or {}
    blocks = []
    txt = msg.get("content")
    if isinstance(txt, str) and txt.strip():
        blocks.append({"type": "text", "text": txt})
    elif isinstance(txt, list):
        for b in txt:
            if isinstance(b, dict) and b.get("type") == "text" and b.get("text"):
                blocks.append({"type": "text", "text": b.get("text", "")})
    for tc in (msg.get("tool_calls") or []):
        fn = tc.get("function") or {}
        raw = fn.get("arguments")
        if isinstance(raw, str):
            try:
                inp = json.loads(raw)
            except Exception:
                inp = {}
        elif isinstance(raw, dict):
            inp = raw
        else:
            inp = {}
        blocks.append({"type": "tool_use", "id": tc.get("id", f"call_{len(blocks)}"),
                       "name": fn.get("name", ""), "input": inp})
    if not blocks:
        blocks.append({"type": "text", "text": ""})
    finish = data.get("finish_reason") or ""
    stop_reason = "tool_use" if (finish == "tool_calls" or msg.get("tool_calls")) else "end_turn"
    return {"content": blocks, "stop_reason": stop_reason}


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
    if pending and _affirms_early(user_msg) and not _NEGATE.search(user_msg):
        # Marcel affirmed — execute the stored action, then continue the normal loop with its result.
        _clear_pending()
        p_name, p_args = pending.get("name", ""), pending.get("args") or {}
        gate_result = _exec_tool(p_name, p_args)
        _risk_bump("critical_passed")  # SEC-5: an approved critical action still compounds session risk
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
        # SEC-2 taint: consume the window IN MODEL-EMITTED ORDER (same order tool_uses already is) so
        # the FIRST critical-adjacent tool after a read_doc is the one that gets escalated, mirroring
        # how the tools will actually be dispatched below if this iteration proceeds. Track WHY each
        # call escalated (regex vs taint vs cumulative-risk) so the spoken confirm can give Marcel the
        # real reason instead of a generic line — short-circuiting on `regex_crit` means taint/risk are
        # only consumed when the regex verdict alone would NOT already have gated the call (preserves
        # the window/score for the genuinely-invisible case instead of spending it on a call that was
        # gated anyway). SEC-5 cumulative-risk: a chain of individually-routine actions (new file ->
        # chmod -> ...) can cross the threshold; the NEXT dispatched call then escalates even though it
        # alone looks routine — this is what catches the multi-step persistence chain SEC-5 names.
        #
        # SAME-BATCH LOOK-AHEAD (adversarial self-check fix, 2026-07-06): a model can emit read_doc
        # AND a critical-adjacent tool in the SAME response (one iteration, one tool_uses batch).
        # _taint_mark() only fires when read_doc actually EXECUTES — which happens AFTER this whole
        # batch is classified — so the cross-iteration counter alone never sees the taint in time for
        # a same-batch companion call. Fix: if a taint-SOURCE tool appears earlier in THIS SAME batch
        # (before an adjacent tool, in emitted order), treat that adjacent tool as tainted too, in
        # addition to the persistent cross-iteration window below.
        batch_taint_source_seen = False
        critical_calls = []
        for b in tool_uses:
            nm = b.get("name", "")
            regex_crit = _is_critical_call(nm, b.get("input") or {})
            same_batch_taint = (not regex_crit) and batch_taint_source_seen and nm in _TAINT_ADJACENT_TOOLS
            taint_crit = (not regex_crit) and (same_batch_taint or _taint_consume_if_adjacent(nm))
            risk_crit = (not regex_crit) and (not taint_crit) and _risk_escalated()
            critical_calls.append((b, regex_crit or taint_crit or risk_crit, taint_crit, risk_crit))
            if nm in _TAINT_SOURCE_TOOLS:
                batch_taint_source_seen = True
        if any(crit for _, crit, _, _ in critical_calls) and not _load_pending():
            # A critical call was chosen — DON'T execute. Store the first critical one as pending,
            # speak the confirmation, and HOLD for Marcel's next voice turn.
            first_critical, _, first_via_taint, first_via_risk = next(
                (b, c, t, rk) for b, c, t, rk in critical_calls if c)
            _save_pending({
                "name": first_critical.get("name", ""),
                "args": first_critical.get("input") or {},
                "original_request": user_msg,
                "confirm_text": "",  # filled below
            })
            desc = _describe_action(first_critical.get("name", ""), first_critical.get("input") or {})
            if first_via_taint:
                extra_note = " That follows reading an external document, so I'm confirming first."
            elif first_via_risk:
                extra_note = " A few notable things have stacked up this session, so I'm confirming this one first."
            else:
                extra_note = ""
            final = (f"I'm about to {desc}.{extra_note} That right? Confirm and I'll do it.")
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
            bc = _brain_config()
            self.wfile.write(json.dumps({"ok": True, "brain": "z.ai-glm", "model": MODEL,
                                         "provider": bc["provider"], "active_model": bc["model"],
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
    bc = _brain_config()
    print(f"[yuri-z-brain] :{PORT} -> {bc['provider']}/{bc['model']} (provider-abstraction: Z.ai + Ollama, $0 on the plan)", flush=True)
    ThreadingHTTPServer(("127.0.0.1", PORT), H).serve_forever()
