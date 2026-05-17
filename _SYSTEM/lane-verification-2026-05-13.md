# YURI Offload Contract — Lane Callability Matrix

**Verification date:** 2026-05-13
**Source:** `_SYSTEM/Scripts/offload-contract.mjs` (15 lane surfaces), `_SYSTEM/Scripts/offload.sh --list`, smoke tests run today.
**Drafted by:** DeepSeek V4 (reasoning=medium); root-cause verified by Claude.

## Matrix

| # | Lane | Alias | Description | Status | Last verified | Reason / blocker |
|---|------|-------|-------------|--------|---------------|------------------|
| 1 | `code-local` | codeLocal | Qwen-backed local code gen (Ollama) | BLOCKED | 2026-05-13 | Ollama scheme bug (shared adapter) |
| 2 | `triage-local` | triageLocal | Qwen-backed local triage (Ollama) | BLOCKED | 2026-05-13 | Ollama scheme bug |
| 3 | `summarize-local` | summarizeLocal | Qwen-backed local summarization (Ollama) | BLOCKED | 2026-05-13 | Ollama scheme bug |
| 4 | `ollama-local` | ollamaLocal | Ollama local inference (127.0.0.1:11434) | BLOCKED | 2026-05-13 | `ERR_INVALID_URL 127.0.0.1:11434/api/chat` — `OLLAMA_HOST` env lacks `http://` scheme; adapter at `_SYSTEM/Scripts/ollama-adapter.mjs:88` does not coerce |
| 5 | `ollama-cloud` | ollamaCloud | Ollama cloud inference | BLOCKED | 2026-05-13 | Same scheme bug (shared adapter) |
| 6 | `ollama` | ollama | Auto local-first, cloud fallback | BLOCKED | 2026-05-13 | Same scheme bug |
| 7 | `gpt-oss` | gptOss | Formatting/synthesis (Ollama path) | BLOCKED | 2026-05-13 | Same scheme bug |
| 8 | `deepseek` | deepseek | V4 family (V4-pro + V4-flash workhorse) | **LIVE** | 2026-05-13 | Proven by Phase 1 verification-doc generation |
| 9 | `codex-spark` | codexSpark | Bounded Codex CLI sandbox lane | **LIVE** | 2026-05-13 | Smoke test replied `OK codex-spark` |
| 10 | `codex` | codex | OpenAI Responses gpt-5.5 | BLOCKED | 2026-05-13 | `Missing API key for lane: codex` (config gap, not code bug) |
| 11 | `kimi` | kimi | Cloud high-grade reasoning | NOT EXERCISED | — | Requires `KIMI_API_KEY` / `MOONSHOT_API_KEY` |
| 12 | `claude` | claude | Bounded Claude advisory lane | NOT EXERCISED | — | Violates "no Anthropic-model agents" memory rule; not used by policy |
| 13 | `comet` | comet | Browser interaction lane | NOT EXERCISED | — | Requires computer-use grant |
| 14 | `perplexity` | perplexity | Browser research lane (chat-driven) | NOT EXERCISED | — | Spec at `_SYSTEM/PERPLEXITY-COMPUTER-USE-WORKFLOW.md`; requires computer-use grant |
| 15 | `swarm` | swarm | Ruflo-backed orchestration (deepseek V4-pro + flash) | LIVE (inherited) | 2026-05-13 | Inherits deepseek live status |

## Summary

| Status | Count | Lanes |
|---|---|---|
| LIVE | 3 | deepseek, codex-spark, swarm (inherited) |
| BLOCKED | 8 | 6 ollama-family + gpt-oss + codex |
| NOT EXERCISED | 4 | kimi, claude, comet, perplexity |

## Root Cause (single fix unblocks the most lanes)

`OLLAMA_HOST=127.0.0.1:11434` is set in shell env without the `http://` scheme. `_SYSTEM/Scripts/ollama-adapter.mjs:88` builds:

```js
const host = (process.env.OLLAMA_HOST || process.env.OLLAMA_BASE_URL || 'http://127.0.0.1:11434').replace(/\/$/, '');
const endpoint = `${host}/api/chat`;
```

The default is correct but the env var without scheme propagates verbatim, producing `127.0.0.1:11434/api/chat` which Node's `fetch()` rejects (`ERR_INVALID_URL`).

**Two valid fixes:**
1. **Env (cheap, brittle):** add `export OLLAMA_HOST=http://127.0.0.1:11434` to `~/.zshrc`.
2. **Code (durable, recommended):** defensive scheme coercion in `ollama-adapter.mjs` — if `OLLAMA_HOST` lacks `://`, prepend `http://`. Single-line change. Codex-spark candidate.

Applying the code fix unblocks **7 lanes** (code-local, triage-local, summarize-local, ollama-local, ollama-cloud, ollama, gpt-oss) in one patch.

## Codex Task Spec (for follow-up campaign)

Per `CODEX_PROTOCOL.md`:

```
## CODEX TASK SPEC

**Goal:** Defensively coerce OLLAMA_HOST/OLLAMA_BASE_URL to include http:// scheme when missing, restoring 7 blocked offload lanes.

**Target files:**
- _SYSTEM/Scripts/ollama-adapter.mjs — line 88 host construction

**Constraints:**
- Do not touch any other line.
- Preserve trailing-slash strip.
- Keep default `http://127.0.0.1:11434` behavior unchanged.

**Acceptance criteria:**
- [ ] `OLLAMA_HOST=127.0.0.1:11434 bash _SYSTEM/Scripts/offload.sh -m ollama-local "say hi"` returns a model response (not ERR_INVALID_URL).
- [ ] `OLLAMA_HOST=http://127.0.0.1:11434` continues to work unchanged.
- [ ] No other lane regresses.

**Test command:** `bash _SYSTEM/Scripts/offload.sh -m ollama-local "Reply exactly: OK"`

**Rollback boundary:** `git diff` shows only _SYSTEM/Scripts/ollama-adapter.mjs changed.

**Prohibited:** No auto-commit, no git push, no new dependencies.
```

This spec is ready to hand to Codex (CLI) in a follow-up. Not executed in-campaign per scope discipline (touching adapter risks unintended fallout in a token-zero state where regression isn't observable).
