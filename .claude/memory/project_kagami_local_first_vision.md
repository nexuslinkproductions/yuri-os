---
name: Kagami local-first vision
description: Marcel's target architecture — local model triage first, cloud dispatch only when needed, own terminal CLI independent of Claude Code
type: project
originSessionId: a25a2f2f-3aa5-4be4-a52c-3799ebe85490
---
Local-first preprocessing intent: user inputs hit a local model (Ollama) for triage/intent, dispatched to cloud lanes only when complexity demands it.

**Why:** Privacy (inputs stay local), latency reduction on simple queries, independence from Claude Code CLI.

**Current blocker:** M2 Pro can only run llama3.2:latest and needle safely. All other models freeze the machine. Local-first requires Mac Mini M4 Pro or equivalent hardware upgrade.

**What's already ready when hardware arrives:**
- Kagami Router supports lane extension — add `ollama-local` as defaultLane with `deepseek-flash` fallback
- YuriOffloadAdapter spawns `offload.sh -m <lane>` — ollama lane already wired in offload.sh
- kagami CLI (`_SYSTEM/Scripts/kagami`) is the user-facing interface — zero changes needed at CLI layer

**How to apply:** When user asks about local models or Kagami routing improvements, frame as "add ollama-local as defaultLane in Router when M4 Pro arrives, not before."
