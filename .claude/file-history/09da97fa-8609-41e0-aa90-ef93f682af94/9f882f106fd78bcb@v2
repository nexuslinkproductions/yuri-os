---
name: Wake Word Daemon Architecture
description: SpeechRecognition single-instance constraint, isSpeechActive flag, __resumeWakeWord global, oracle-mic-toggle ID contract
type: project
originSessionId: 50a8f57a-159a-4cbc-b7d1-42b0054fbcb1
---
## Core Constraint

Web `SpeechRecognition` is a single-instance API. Only one `.start()` can be active at a time. Starting a second instance while one is running throws `InvalidStateError` and silently kills both.

## Architecture

### Wake Word Daemon (main.ts)
- Runs continuously listening for "oracle"
- Lives in vanilla JS / main thread
- Must PAUSE when Oracle page mic is active

### React OraclePage Mic
- Activates when Oracle page opens
- Handles voice commands / auto-submit
- Must RESUME wake word daemon when deactivated

## Race Condition Fix (this session)

**Problem:** Wake word daemon restarted immediately after Oracle page opened, colliding with React mic activation.

**Solution — three interlocking parts:**

1. **`isSpeechActive = true`** set in `triggerVoiceCommand()` BEFORE calling `.start()` — prevents daemon from restarting while React mount is in flight

2. **`window.__resumeWakeWord`** global exposed by main.ts daemon — React calls this on mic deactivate/unmount to hand control back

3. **`oracle-mic-toggle` ID contract** — the mic button in OraclePage MUST have `id="oracle-mic-toggle"`. main.ts wake word handler checks for this element's existence to know if Oracle page is mounted before attempting resume

4. **~~450ms timeout + retry loop~~ → REPLACED 2026-04-25** — old polling retry removed. Now uses `oracle:ready` DOM event: OraclePage dispatches `window.dispatchEvent(new Event('oracle:ready'))` on mount; `triggerVoiceCommand()` listens for it with a 2s fallback timeout. No polling, no hardcoded delays.

## Auto-Submit Flow
- `rec.onresult` → extract transcript → call `handleSubmit(transcript)` directly
- Do NOT pass `MouseEvent` to `handleSubmit` — wrapper needed: `onClick={() => handleSubmit()}`
- Bug: `onClick={handleSubmit}` passes `SyntheticMouseEvent` as `cmdOverride` argument

## Files
- `main.ts` — wake word daemon, `isSpeechActive` flag, `__resumeWakeWord` exposure
- `src/pages/OraclePage.tsx` — `oracle-mic-toggle` ID, `activateMic` retry loop, `handleSubmit` wrapper
