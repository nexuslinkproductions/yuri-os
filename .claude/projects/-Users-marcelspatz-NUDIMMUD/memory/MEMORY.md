# Project Memory Index

- [Oracle Shell Service](project_shell_service.md) — launchd-managed shellService.js on port 3098; fixes pm2 posix_spawn EBADF for Oracle terminal

- [Reasoning mode default](feedback_reasoning_mode.md) — Reasoning always on auto; only MAX if explicitly requested in session

- [Nexus Link Document Template](document_template_nexus_link.md) — Brand-aligned legal letter + equipment schedule template (HTML→PDF via Puppeteer)
- [HUD OS Revamp Apr 2026](project_hud_revamp.md) — Oracle rebuilt as React + SSE streaming, token bars, pixel logo, design-master skill, VSCode primary IDE
- [Claude launch stack](project_claude_launch_stack.md) — boot.zsh → wrapper (~/NUDIMMUD/bin/claude) → Scripts/ai → splash; VSCode login shell profile; no tui:fullscreen
- [tui:fullscreen kills HUD](feedback_tui_fullscreen.md) — tui:fullscreen clears terminal on launch, destroys boot HUD and splash; must be absent
- [Session Journal](session-journal.md) — dated session entries, skills used, compact hints (auto-generated)
- [Session Lifecycle System](project_session_lifecycle.md) — 4-tier compact hooks, session-reflect.js, skill notes, /reflect command (Apr 2026)
- [Oracle Voice / TTS](project_oracle_voice.md) — Web Speech API sentence-buffer streaming, voice priority order, no-cancel-mid-stream pattern, React OraclePage
- [Wake Word Daemon](project_wake_word_system.md) — SpeechRecognition single-instance constraint, isSpeechActive flag, __resumeWakeWord global, oracle-mic-toggle ID, 450ms retry
- [session-state.json Wipe Bug](project_session_state_bug.md) — token-session-init.js subagent-wipe fix; 4h active guard preserves session state across subagent spawns
- [End of Transmission Command](project_eot_command.md) — global session-close; triggers on "end of transmission"/eot; 9-phase evidence reflection → skill patches → boot packet → Sonnet finalisation
