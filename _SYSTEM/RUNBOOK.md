# YURI Operational Runbook

**Last updated:** 2026-05-13
**Owner:** Marcel Spatz
**Scope:** Daily operations, weekly maintenance, emergency procedures.

---

## Daily Health Checks

| Check | Command | Healthy when |
|---|---|---|
| Cwd + branch guard | `pwd && git branch --show-current` | `/Users/marcelspatz/YURI-OS-MUSUBI` on `main` |
| Memory core present | `[ -s memory-core.md ] && echo OK` | prints `OK` |
| Palace index parseable | `grep -q '^#\+ ' claude-palace-out/palace-index.md && echo OK` | prints `OK` |
| Session state schema | `jq -e .schema_version .claude/state/session-state.json` | non-zero exit means corruption |
| Active launchd agents | `launchctl list \| grep yuri` | shows 4+ entries (ollama-kv, shellservice, wiki-rag, yuri-session-runtime) |
| DeepSeek lane live | `bash _SYSTEM/Scripts/offload.sh -m deepseek --no-tools "OK?"` | returns a model reply |
| Codex-spark lane live | `bash _SYSTEM/Scripts/offload.sh -m codex-spark "OK?"` | returns a model reply |

## Weekly Maintenance

- Review `.claude/state/scout-errors.log` size and tail. Should not be growing rapidly. If >1 MB and growing, see Emergency / Scout below.
- `du -sh .claude/state/ memory/ claude-palace-out/` — capture footprint trend.
- `cat .claude/state/token-weekly.json` — token roll-up sanity check.
- Inspect `_SYSTEM/audit-archive/` — confirm no recent deep-research audits sit unactioned.




## Lane Routing Discipline

- Main session = control plane only. Routes, verifies, merges. Never the researcher or implementer.
- Routing priority: `@code-local → @deepseek → @triage-local → @summarize-local → @ollama-local → @gpt-oss → @swarm → @kimi → @claude`.
- **Live lanes as of 2026-05-13:** `deepseek`, `codex-spark`. All Ollama-family + `gpt-oss` BLOCKED on a single env/adapter bug — see `_SYSTEM/lane-verification-2026-05-13.md`.
- Never call `Agent()` with a Claude/Haiku/Sonnet/Opus model (memory rule, banned).
- All `_SYSTEM/Scripts/offload.sh` Bash invocations: `timeout: 600000`.

## Emergency Procedures

### Scout-runner spamming errors
**Symptom:** `.claude/state/scout-errors.log` growing rapidly, mostly `claude -p ... failed` entries.
**Root cause:** Scout-runner uses banned `claude -p --model claude-haiku-4-5-20251001` pattern. See `_SYSTEM/scout-errors-2026-05-13-triage.md`.
**Action:**
1. Do NOT install `com.yuri.eot-refresh.plist` (deferred until scout is rebuilt).
2. Apply the Codex spec from the triage doc to migrate scout to `_SYSTEM/Scripts/offload.sh -m deepseek`.
3. Add size-based rotation (1 MB ring) as the second spec.

### Context stale or palace corruption
**Symptom:** Session-start warns `PALACE: STALE`, or palace-index.md fails `grep -q '^#\+ '` check.
**Action:**
1. `./_SYSTEM/Scripts/ai eot` to regenerate enki_state + palace.
2. If still broken, restore from git: `git checkout HEAD -- claude-palace-out/palace-index.md`.

### MCP server unresponsive
**Symptom:** Obsidian-vault, nexus-core, or ollama-bridge tools time out.
**Action:**
1. `ps aux | grep mcp-server` — confirm process is alive.
2. Restart via the relevant `~/Library/LaunchAgents/com.yuri.*.plist`:
   `launchctl unload ~/Library/LaunchAgents/com.yuri.<name>.plist && launchctl load ~/Library/LaunchAgents/com.yuri.<name>.plist`
3. Tail the corresponding `.err.log` for cause.

### Ollama lanes returning ERR_INVALID_URL
**Symptom:** Any Ollama-family lane fails with `ERR_INVALID_URL 127.0.0.1:11434/api/chat`.
**Root cause:** `OLLAMA_HOST` env var lacks `http://` scheme.
**Quick fix:** `export OLLAMA_HOST=http://127.0.0.1:11434` (and add to `~/.zshrc`).
**Durable fix:** Apply Codex spec in `_SYSTEM/lane-verification-2026-05-13.md` to add defensive scheme coercion in `_SYSTEM/Scripts/ollama-adapter.mjs:88`.

### Memory core lost or corrupted
**Symptom:** `memory-core.md` empty, truncated, or missing.
**Action:**
1. `git log --oneline -- memory-core.md | head` — find last good commit.
2. `git checkout <sha> -- memory-core.md` — restore.

## Long-Operation Progress

Long-running scripts (palace rebuild, EOT, memory eviction, etc.) should emit progress via `_SYSTEM/Scripts/_lib/progress.mjs`:

```js
import { emitProgress } from './_lib/progress.mjs';
emitProgress('palace-rebuild', 'scan', 0.0, 'starting file scan');
// ... work ...
emitProgress('palace-rebuild', 'finalize', 1.0, 'palace index rebuilt');
```

Watch live: `tail -f .claude/state/progress.log`.

## Pre-Session Quick Check

```bash
pwd                                              # /Users/marcelspatz/YURI-OS-MUSUBI
git branch --show-current                        # main
git status --short                               # not blocking, but inspect
launchctl list | grep yuri | wc -l           # >= 4
bash _SYSTEM/Scripts/offload.sh -m deepseek --no-tools "OK?" 2>&1 | tail -1
```

If any line fails, stop and reconcile before starting work. Do not switch directories or branches automatically; report and ask.

## Related Documents

- `_SYSTEM/yuri-origin.md` — canonical authority hierarchy
- `_SYSTEM/security-2026-05-13-remediation.md` — ADR-061 closure evidence
- `_SYSTEM/lane-verification-2026-05-13.md` — full 15-lane matrix
- `_SYSTEM/scout-errors-2026-05-13-triage.md` — scout failure root cause + Codex specs
- `_SYSTEM/memory-layer-spec.md` — five-tier memory model
- `_SYSTEM/audit-archive/perplexity-2026-05-13-original.md` — archived audit (DO-NOT-EXECUTE-AS-WRITTEN)
- `CODEX_PROTOCOL.md` — Codex task spec format
