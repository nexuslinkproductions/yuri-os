---
name: Oracle Voice / TTS Architecture
description: Web Speech API TTS integration in React OraclePage — sentence-buffer streaming, voice priority, no-cancel pattern
type: project
originSessionId: 50a8f57a-159a-4cbc-b7d1-42b0054fbcb1
---
## Source Migration

- Vanilla JS implementation: `main.ts` lines 891–1056 (`speakText`, `flushSentences`)
- React target: `OraclePage.tsx`

## Core Architecture

### speakText (sentence-buffer streaming)
- Buffers incoming text by sentence boundary (`.`, `?`, `!` + space)
- Flushes each complete sentence as a separate `SpeechSynthesisUtterance`
- **NO cancel before queuing** — sentences accumulate naturally in the SR queue
- Previous implementation incorrectly called `speechSynthesis.cancel()` before each new utterance, destroying queued speech

### Voice Priority Order (canonical — `src/lib/voiceSelector.ts`)
1. Samantha
2. Victoria
3. Google UK English Female
4. Premium (any)
5. Female + en-*
6. Any en-* voice
7. System default fallback

Both `main.ts:initVoice()` and `OraclePage.tsx` voice effect import from `src/lib/voiceSelector.ts`. Do not add inline voice logic elsewhere.

### Neural Pulse Pre-flight
- Before speaking, trigger visual "neural pulse" animation on Oracle avatar
- Animation fires on `utterance.onstart`, stops on `utterance.onend`

### Key Constraints
- `speechSynthesis.getVoices()` is async on first call — must await `voiceschanged` event or poll
- Never cancel mid-stream; let queue drain naturally
- Voice selection runs once and caches result

## Files
- `src/pages/OraclePage.tsx` — React implementation
- `main.ts:891-1056` — original vanilla JS reference (do not modify)
