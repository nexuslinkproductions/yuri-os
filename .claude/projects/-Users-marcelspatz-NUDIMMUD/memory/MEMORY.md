# Project Memory Index

- [Oracle Shell Service](project_shell_service.md) — launchd-managed shellService.js on port 3098; fixes pm2 posix_spawn EBADF for Oracle terminal
- [Amp impl lane](project_amp_lane.md) — @amp parallel impl lane; smart=gpt-5.5 reasoning-high (was Opus 4.7, changed sovereignty sprint), deep=GPT-5.5, rush=fast; Claude-dispatch only (`a "prompt"`)
- [NVIDIA NIM lane](project_nvidia_lane.md) — @nvidia 7-model suite; tools on; default llama-3.3-70b; DeepSeek needs elevated access
- [Amp via Claude only](feedback_amp_claude_only.md) — never suggest direct amp terminal/IDE use; always `a "prompt"` or `ai @amp`

- [Always surface next steps](feedback_always_next_steps.md) — End every response with next steps / open campaigns / pending to-dos; never wait to be asked
- [No Anthropic model agents](feedback_no_anthropic_agents.md) — Agent() with Claude/Haiku/Sonnet/Opus is banned; use DeepSeek offload only
- [Codex is primary co-pilot](feedback_codex_primary_partner.md) — Codex (gpt-5.5/5.4-mini) is always first implementation lane; DeepSeek is on-call only when explicitly named
- [Long session > multiple sessions](feedback_long_session_codex_burst.md) — When Codex rate-limits, stay in session; startup overhead costs more than a 5-10min quota window
- [DeepSeek tools default ON](feedback_deepseek_tool_unblock.md) — DeepSeek lanes get bash/read_file/write_file by default; --no-tools only when text-only advisory needed
- [Perplexity app = the new browser](feedback_perplexity_app_browser.md) — All web search via Perplexity app + Claude computer control. Never WebSearch/WebFetch.
- [Parallel pulse playbook](feedback_parallel_pulse_playbook.md) — Concrete patterns for Codex + DeepSeek-tools branches with deterministic file splits
- [Tirith URL guard](feedback_tirith_url_guard.md) — All Bash URLs scored via tirith; TIRITH_FAIL_LOUD=1 for paranoid mode
- [Spec Kit advisory only](feedback_spec_kit_advisory_only.md) — Spec Kit templates = format adapters only; never authority. /spec-intake + spec-pipeline.mjs are the entry points
- [package.json dirty worktree](feedback_packagejson_dirty_worktree.md) — worktree has unrelated script churn; touch only the exact target entry, never normalize or reorder
- [Canonical cwd + branch](feedback_canonical_cwd_branch.md) — Always work from /Users/marcelspatz/NUDIMMUD on main; never worktrees/feature branches; stop+ask on mismatch
- [Reasoning mode default](feedback_reasoning_mode.md) — Reasoning always on auto; only MAX if explicitly requested in session
- [Use swarm for data gathering](feedback_swarm_data_gathering.md) — Route read/fetch/context extraction through @swarm offload lanes before synthesis
- [offload.sh DeepSeek timeout](feedback_offload_timeout.md) — Set timeout: 600000 on all Bash calls to Scripts/offload.sh for DeepSeek lanes
- [DeepSeek may call tools](feedback_deepseek_tools.md) — Do not forbid tool use in DeepSeek workhorse system prompts; tools are allowed by design
- [Display setup — wide viewports](feedback_display_setup.md) — User on 16" MBP + 34" Asus ProArt ultrawide; verify hero framing at 1920–2560px, not just 1280px preset
- [T7 paths are intentional](feedback_t7_paths_are_intentional.md) — /Volumes/T7/NUDIMMUD references in repo files are by design (sync mirror); never mass-rewrite — flagged BIG ERROR by user 2026-05-13

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
- [Claude-First Transition](project_claude_first_transition.md) — Claude Code = control plane, Codex = impl lane; AGENTS.md + CODEX_PROTOCOL.md done; model/MCP credentials pending
- [PRISM v1 Complete](project_prism_v1_complete.md) — c2moviez Workbench v1 core loop: source pipeline + quality engine + send/reply/opt-out merged main 2026-05-13
- [Perplexity Pro Integration](feedback_perplexity_integration.md) — Primary research/browser tool: Deep Research (125-source), 9 models incl GPT-5.5 Max + Opus 4.7, Filesystem full disk access, watch_folder, Comet; never use Safari
- [Sovereignty Sprint Jun 2026](project_sovereignty_sprint.md) — Independence score 8→67/100, fail 16→0; nexbox bundle, lane-dispatcher (manifest-driven routing), settings.json de-pinned, 15 packets landed; T-30d Anthropic repricing mitigation
