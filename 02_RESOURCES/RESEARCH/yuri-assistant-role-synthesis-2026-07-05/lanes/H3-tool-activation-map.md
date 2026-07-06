# H3 — Yuri Tool-Surface & Activation Map (synthesis 2026-07-05)

**GROUND:** Yuri = GLM-5.2 LIVE at :8014 (yuri-z-brain.py); screen-context.mjs :8015 DISARMED (AX-tree reader + OmniParser fallback stub); runtimed.mjs supervises voice brain + future children. Marcel wants FULL macOS control + YURI dispatch surface. René needs doc TEXT ingestion (PDF/Word/Excel), one-word launcher.

---

## 1. CONTROL MATRIX — What Exists vs Missing

| Surface | TODAY (cite) | CONTROL CAPABILITY | STATUS | GAP |
|---------|----------|------|--------|-----|
| **Bash/Shell** | yuri-z-brain.py L676–687 | full `bash` tool (repo-root, 600s timeout, safety floor: PROTECTED paths + `_DESTRUCTIVE` regex) | LIVE | none |
| **File ops** | yuri-z-brain.py L688–718 | `read_file`, `write_file`, `edit_file` (protected-path checked, safe overwrite gate) | LIVE | none |
| **AppleScript** | yuri-z-brain.py L735–739 | `applescript` (Spotify, Mail, Calendar, Safari, Finder, Notes, Reminders, Messages + ANY app with dictionary) + `gui_script` (System Events fallback) | LIVE | vision-only apps (Electron/canvas: OmniParser fallback STUB in screen-context.mjs L77–79, wired A2.3) |
| **macOS apps** | yuri-z-brain.py L745–758, screen-context.mjs L89–107 | `open_app` (launch/activate/quit) + `screenshot` (with vision description via GLM-4.6v) | LIVE | limited menu click (screen-context.mjs L95–107: `click_menu` A2.1 minimal, only basic of-chain menu paths; `press_button`, `scroll`, `verify` deferred A2.2) |
| **Session dispatch** | yuri-z-brain.py L463–508 | `conductor_list`, `conductor_create`, `conductor_draft`, `conductor_send`, `conductor_peek` (tmux-backed worker sessions; send CRITICAL confirm-gated) | LIVE | none |
| **YURI navigation** | yuri-z-brain.py L727–733 | `xref` (FTS5 search + circuitry graph + mechanism evidence) | LIVE | none |
| **Memory** | yuri-z-brain.py L724–726 | `remember` (episodic store; persistent across restarts; YURI memory auto-injected via jarvis_memory.py) | LIVE | none |
| **Daily briefing** | yuri-z-brain.py L805–806, 520–527 | `morning_brief` (commits, health, queued work, memory freshness) + `usage_status` (token budget pace per provider) | LIVE | none |
| **Parallel worker** | yuri-z-brain.py L719–723 | `spawn_worker` (opens visible Terminal Claude Code session; Marcel watches + steers) | LIVE | none |
| **Real-doc ingestion** | (NONE) | PDF/Word/Excel TEXT extraction, not raw bytes | MISSING | **SEE §3** |

---

## 2. ACTIVATION OPTIONS — Wakeword / Hotkey / Launcher

**TODAY:**

- **Launcher:** `bash _SYSTEM/Scripts/voice/yuri.sh` (alias `yuri`) — cleans stale process set, spawns Z.ai brain :8014 + pipecat bot (mic/speaker loop), foreground + trap cleanup (yuri.sh L29–49)
- **Activation:** always-on mic loop (pipecat bot.py, listening in foreground)
- **Stop:** Ctrl-C or close terminal (trap cleanup L37)
- **No wakeword:** bot.py wakes on speech + silence (VAD-driven, not "hey Yuri")
- **No hotkey:** none today; runtimed.mjs DISARMED (template at L29–61, not auto-installed)

**VIABLE MINIMAL PATHS (ranked by effort):**

| Option | Effort | Setup | How | Daily use | Notes |
|--------|--------|-------|-----|-----------|-------|
| **One-word launcher (shell alias)** | 5min | alias `yuri` → `bash _SYSTEM/Scripts/voice/yuri.sh` in `~/.zshrc` | source ~/.zshrc; run `yuri` | `yuri` from terminal | LIVE (works NOW) |
| **Hotkey → one-liner** | 30min | Hammerspoon or Karabiner-Elements: rebind key → `open yuri-launcher.app` (shell script app via Automator) | create Automator shell app wrapping yuri.sh; bind hotkey in Hammerspoon | global hotkey, e.g. Cmd+Opt+Y | needs Hammerspoon (free macOS scripting) or Karabiner |
| **Wakeword ("Hey Yuri")** | 2h | replace VAD-only with wakeword keyword spotting (e.g. PorcupineAI, ~10MB model, inference in bot.py) | integrate porcupine SDK into pipecat bot.py; detect "yuri" phrase before VAD silence-gate | voice-first, never off | adds latency (~100ms wakeword detect); needs API key or $99 one-time license |
| **Menubar launcher + status** | 1h | SwiftBar or BitBar + shell script: poll yuri-runtimed.mjs heartbeat, show status icon + "Start Yuri" / "Stop Yuri" | read _SYSTEM/state/runtime/heartbeat.json; `click menu → start/stop` | always accessible, shows live status | needs SwiftBar macOS app (free) |
| **launchd autostart (background supervisor)** | 2h + GATED | install launchd plist (runtimed.mjs template L29–61); arm via `yuri-session-launchd.mjs` | owner approval → write plist → launchctl bootstrap | Yuri always running (Cmd-Tab focus) | **OWNER-GATED** (per Self-Governance Charter: ARMING is never self-governable) |

---

## 3. REAL-DOC INGESTION GAP — PDF/Word/Excel TEXT

**STATUS:** MISSING (critical for René + daily PDFs).

**TODAY's surface:** none.
- yuri-z-brain.py: no doc ingestion tools
- screen-context.mjs: handles macOS AX tree + vision (screenshots only)
- xref: navigates YURI's own code/docs, not user files

**MINIMAL VIABLE PATH (ranked):**

| Approach | Effort | Quality | Latency | Daily use | Notes |
|----------|--------|---------|---------|-----------|-------|
| **CLI wrapper: pdftotext + libreoffice CLI** | 2h | text extraction (lossy: no layout, no tables well) | 2–5s per file | `read_doc <path>` tool | native macOS (no deps); reliable; fast |
| **Mineru (Microsoft doc layout parser)** | 1h + API | high-quality layout + tables + structure | 10–30s per page (cloud) | `read_doc <path>` tool → Mineru SaaS → return MD | requires account; per-page cost (~$0.10) but ACCURATE |
| **Python textract or Tika** | 4h | good multi-format (PDF/Word/Excel) | 2–10s per file | `read_doc <path>` tool | heavyweight; Java (Tika) or many deps (textract) |
| **Claude API vision on PDF (expensive)** | 1h | perfect (reads everything) | 5–30s per page | `read_doc <path>` tool | high token cost (~0.1–0.5 tokens/page + 2-3 input images) |

**RECOMMENDATION (minimal + defensible):**

Build a `read_doc` tool (yuri-z-brain.py) that wraps:
1. **pdftotext** (Homebrew: `brew install poppler`, ships with macOS) → plain text extract
2. **libreoffice --headless** (Homebrew: `brew install libreoffice`) → Word/Excel → TXT/PDF
3. **Mineru fallback** (optional, gated, for ~high-fidelity tables) when CLI extraction is text-only

Total CLI build: ~2h. Add `read_doc` tool to Yuri's tool list. Bind to voice: "read the document file:///path" or "summarize the PDF".

---

## EXECUTIVE SUMMARY — Minimal Daily Driver

**IMMEDIATE (0 effort):**
- Alias: `yuri` → voice loop NOW
- Control: Yuri has full bash/file/app/dispatch LIVE (gaps: canvas-only apps, menu click edge-cases, doc ingestion)

**WEEK 1 (1h):**
- Add hotkey launcher (Hammerspoon) for Cmd+Opt+Y → start yuri.sh
- Add `read_doc` tool: pdftotext + libreoffice CLI wrapper (2h build, add to yuri-z-brain.py)

**OPTIONAL (2–4h, no gating):**
- SwiftBar menubar status + click-to-start
- Wakeword detection (porcupine, ~100ms latency added)

**OWNER-GATED (later):**
- launchd autostart (arming decision)

---

## EVIDENCE CITATIONS

- Brain tools: `/Users/marcelspatz/YURI-OS-MUSUBI/_SYSTEM/Scripts/voice/yuri-z-brain.py` L354–528 (TOOLS table)
- Screen context: `/Users/marcelspatz/YURI-OS-MUSUBI/_SYSTEM/runtime/screen-context.mjs` L21–107 (AX reader + executor A2.1)
- Launcher: `/Users/marcelspatz/YURI-OS-MUSUBI/_SYSTEM/Scripts/voice/yuri.sh` (one-command voice start)
- Runtime: `/Users/marcelspatz/YURI-OS-MUSUBI/_SYSTEM/runtime/yuri-runtimed.mjs` L29–61 (launchd template, DISARMED)
