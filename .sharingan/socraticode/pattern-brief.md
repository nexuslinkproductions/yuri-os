# Sharingan Brief — SocratiCode
**Repo:** ignaciogh33/SocratiCode (primary: giancarloerra/SocratiCode is 2.6k⭐ but is a different product — codebase intelligence, not Socratic tutor)
**Date:** 2026-05-16
**License:** Not specified — no license file found. Treat as all-rights-reserved until confirmed.
**Language:** Python/Django backend + JS frontend

---

## Core Pattern: Session-Backed Socratic Loop

**What it does:** LLM as Socratic programming tutor. Student asks questions; system guides discovery rather than giving direct answers. Supports streaming responses and isolated code execution.

### Multi-Turn State Management
Sessions initialized via `POST /api/chat/sessions/create/` → empty session record in DB.
Each turn carries:
```json
{
  "session_id": 1,
  "prompt": "question",
  "code_context": "student's current code",
  "last_output": "runtime errors/output",
  "language": "c"
}
```
Messages paginated at 50 per page, most-recent first. Context window built from DB-retrieved history, not in-memory state.

### Streaming Pattern
Responses stream token-by-token via **Server-Sent Events (SSE)**. Matches NUDIMMUD Oracle voice streaming architecture exactly (sentence-buffer + SSE). No new pattern here — confirms existing approach.

### Pedagogical Logic (Gap)
Decision logic for ask-vs-tell is not documented in the repo. The architecture has input moderation (`moderación de input`) but no explicit "when to ask vs explain" heuristic. This is the interesting part that's missing from the public repo.

---

## Claude-Specific Dependencies
None observed. The LLM call is abstracted behind a service layer. Model-agnostic design.

---

## Yuri OS Applicability

Maps to **`codebase-to-course` skill**. The `code_context` + `last_output` per-turn pattern is directly applicable for course quizzes and interactive exercises — student submits code attempt, context carries both the attempt and its runtime result, tutor can respond to the actual error rather than a description of it.

**Session-backed history pattern** is also applicable to long-running teaching sessions that survive page reloads.

---

## Recommendation

Extract the `code_context` + `last_output` per-turn message schema into codebase-to-course interactive exercises. Do NOT import any code (no license). The ask-vs-tell heuristic needs to be designed from scratch — the repo doesn't expose it.
