---
name: claude-remote-control-not-cowork
description: "CORRECTED — Claude COWORK (Desktop-app agentic file work; Jun 5–Jul 5 2026 promo DOUBLES the 5h limit) and REMOTE CONTROL (steer local Claude Code from phone, live on CLI v2.1.158) are BOTH real + complementary. Cowork SKIPS folders overlapping protected locations / home-root → that's why YURI-OS-MUSUBI was refused."
metadata: 
  node_type: memory
  type: reference
  tier: high
  scope: workflow
  trig: 
    - cowork
    - remote control
    - phone
    - mobile
    - continuous
    - desktop app
    - protected
    - skipped folder
  refs: 
    - claude-remote-control-2026-06-06
    - feedback-standing-fleet-default-orchestration
  originSessionId: fd6806d3-8e56-47d5-ac11-51d2752c5091
---

FACTS: Two complementary features. (1) Claude COWORK = Desktop-app agentic work across local files/folders (paid plans); June promo Jun5–Jul5 2026 DOUBLES the 5-hour Cowork limit (auto). It is what Boris referenced. Cowork SKIPS folders that overlap a protected location or are the home/root directory + advises a dedicated scoped working folder. (2) REMOTE CONTROL = `claude remote-control --name "..."`, verified live on this CLI (v2.1.158) — steer a local Claude Code session from claude.ai/code or the Claude mobile app; work runs on the MacBook.

IMPLICATION: Cowork REFUSED to open /Users/marcelspatz/YURI-OS-MUSUBI because it's a direct home child packed with protected/sensitive surfaces (.env, .claude/state, backend/data, secrets) — correct/safe behavior. FIX: for the YURI build/fleet/git → use REMOTE CONTROL on the full repo (phone-steered, MacBook-continuous; YURI's own settings.json deny still guards). For Cowork specifically → point it at a clean SCOPED subfolder, not the protected-laden repo root. (Earlier note wrongly said "it's Remote Control not cowork" — both are real; this is the correction.)

LAUNCH-TIME CONSTRAINT (verified 2026-06-06, in-session): Remote Control is a LAUNCH-TIME wrapper — a session ALREADY running (esp. the VS Code extension session) CANNOT be retrofitted into Remote Control from inside it. `claude remote-control` starts a SEPARATE persistent server with its OWN sessions (new threads in the same dir), and prompts an interactive `Enable Remote Control? (y/n)` on a TTY. `remoteControlAtStartup:true` in settings did NOT auto-register the extension session. So to make YOUR working session phone-steerable, LAUNCH it via `claude remote-control` from a terminal from the start + answer y once. Do NOT promise to make the current extension chat appear on the phone — it can't. Continuity to a phone-launched session is via repo+memory+handoff, not the transcript. (A backgrounded `echo y | claude remote-control --name "..."` DID connect + show on the phone, but it's a separate workspace, not this thread, and dies with the parent session.)

SEE: [[claude-remote-control-2026-06-06]] (full brief + the skip fix + sources), [[feedback-standing-fleet-default-orchestration]].
