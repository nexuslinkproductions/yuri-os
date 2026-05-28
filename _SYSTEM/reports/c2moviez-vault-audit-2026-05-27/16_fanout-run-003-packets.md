# Fanout Run 003 Packets

Date: 2026-05-27
Purpose: first micro-batch burn-down after Run 002 proved corrected fanout
Target repo: `c2moviezfpv/c2moviez-vault`
Repo URL: `https://github.com/c2moviezfpv/c2moviez-vault`
Canonical clone: `/tmp/yuri-c2moviez-vault-full.b1RopZ/repo`
Commit: `8103286e1abc63fa9490cb1375ecde4f340aa2bb`
Tracked files: `1505`
Mode: read-only, no target mutation, no live-service calls, no credential use

## Clean Lane Launch Rule

Run 003 lanes must be launched from YURI root, without adding the target repo as a Claude project directory. The target repo is read only through:

```bash
git -C /tmp/yuri-c2moviez-vault-full.b1RopZ/repo show HEAD:<path>
git -C /tmp/yuri-c2moviez-vault-full.b1RopZ/repo grep ...
git -C /tmp/yuri-c2moviez-vault-full.b1RopZ/repo ls-files ...
```

This avoids target `.claude` hook ingestion while preserving repo truth.

## Universal Repo-Truth Contract

Every lane must start with:

```text
REPO_PROOF lane=<lane> repo_url=https://github.com/c2moviezfpv/c2moviez-vault repo_origin=<origin-url> canonical_repo_path=/tmp/yuri-c2moviez-vault-full.b1RopZ/repo rev_parse=<sha> clean_status=<clean|dirty> tracked_file_count=1505 status=ok|fail
```

For every assigned file:

```text
PATH_PROOF path=<path> command="git -C /tmp/yuri-c2moviez-vault-full.b1RopZ/repo cat-file -e HEAD:<path>" status=exists|missing
READ_PROOF path=<path> command="git -C /tmp/yuri-c2moviez-vault-full.b1RopZ/repo show HEAD:<path> | nl -ba" first_line=<short> last_line=<short>
FILE_COVERAGE path=<path> method=git_object_show status=covered|partial|deferred lines=<n> words=<n> notes=<short>
```

No lane may broaden scope beyond assigned files except for bounded caller/import searches needed to explain wiring.

## Required Output Rows

```text
BATCH_OPEN lane=<lane> batch=<id> scope=<short>
REPO_PROOF ...
PATH_PROOF ...
READ_PROOF ...
FILE_COVERAGE ...
ARCH_MAP item=<component> path=<path:line> role=<role> connects_to=<other> confidence=<high|medium|low>
WIRING_FINDING id=<temp> path=<path:line> class=<broken|unclear|duplicated|stale|unsafe|strong> evidence=<short> impact=<short>
LLM_NAV_FINDING id=<temp> path=<path:line|dir> class=<good|bad|missing|stale|ambiguous> evidence=<short> impact_for_llm=<short>
SECURITY_CANDIDATE id=<temp> path=<path:line> class=<risk> evidence=<redacted> impact=<short> needs=<validation>
SUPPRESSION path=<path:line|file> hypothesis=<risk_or_wiring_issue> counterevidence=<exact>
DEFERRED path=<path|surface> reason=<blocker> next=<bounded_next>
BATCH_CLOSE lane=<lane> batch=<id> files_covered=<n> candidates=<n> suppressions=<n> deferred=<n>
```

## QUANTUM_RICK_OPUS - API-PERIM-001

Scope: dashboard public/API function perimeter.

Files:

- `Dashboard-v2/functions/chat.js`
- `Dashboard-v2/functions/config-public.js`
- `Dashboard-v2/functions/context-engine.js`
- `Dashboard-v2/functions/nex-rag-query.js`
- `Dashboard-v2/functions/health.js`
- `Dashboard-v2/functions/token-usage.js`

Questions:

- Which functions are externally callable and which auth/control gates do they use?
- Do any functions expose sensitive config, provider state, embeddings, logs, tokens, or usage metadata?
- Is the public/API boundary documented and enforced consistently?

## PRIME_RICK_OPUS - GUARDRAILS-001

Scope: NEX guardrail enforcement and bypass analysis.

Files:

- `Scripts/nex-guardrails/index.js`
- `Scripts/nex-guardrails/inject-event.js`
- `Scripts/nex-guardrails/rails/email-gate-rail.js`
- `Scripts/nex-guardrails/rails/infra-rail.js`
- `Scripts/nex-guardrails/rails/language-rail.js`
- `Scripts/nex-guardrails/rails/output-sanitize-rail.js`
- `Scripts/nex-guardrails/rails/retrieval-confidence-rail.js`
- `Scripts/nex-guardrails/rails/role-scope-rail.js`

Questions:

- Are guardrails enforced in code or mostly described?
- Which inbound/outbound paths bypass guardrails?
- Are any rails fail-open, pattern-only, stale, duplicated, or prompt-injection fragile?

## MAXIMUMS_RICKIMUS_OPUS - DAEMON-LIB-001

Scope: daemon helper libraries used by Telegram/Claude/NEX workflows.

Files:

- `Scripts/lib/agent-registry.js`
- `Scripts/lib/group-broadcaster.js`
- `Scripts/lib/reasoning-chain.js`
- `Scripts/lib/plane-client.js`
- `Scripts/lib/tenant.js`
- `Scripts/lib/infomaniak-ai.js`
- `Scripts/lib/sync-customer-to-plane.js`

Questions:

- Which helpers create provider calls, state changes, broadcasts, or memory/context injection?
- Are helpers safe to expose to a high-authority Claude session?
- Where do retries, logging, tenant resolution, and provider authority create hidden coupling?

## ZETA_ALPHA_RICK_OPUS - PROVIDER-AUTH-001

Scope: provider/auth/webhook wiring and external service assumptions.

Files:

- `Dashboard-v2/functions/auth.js`
- `Dashboard-v2/functions/shared-plane.js`
- `Dashboard-v2/functions/shared-plane-client.js`
- `Dashboard-v2/functions/plane.js`
- `Dashboard-v2/functions/plane-webhook.js`
- `Dashboard-v2/functions/outlook-webhook.js`
- `Dashboard-v2/functions/outlook-sync.js`
- `Dashboard-v2/functions/outlook-subscribe.js`

Questions:

- Are provider calls separated by read/write authority?
- Are webhook receivers authenticated, idempotent, and bounded?
- Are session tokens, internal keys, and provider tokens handled consistently?

## RIQ_IV_OPUS - PROCESS-003

Scope: coverage ledger and report lifecycle QA.

Files:

- `_SYSTEM/reports/c2moviez-vault-audit-2026-05-27/01_repo-truth-inventory.md`
- `_SYSTEM/reports/c2moviez-vault-audit-2026-05-27/06_security-findings.md`
- `_SYSTEM/reports/c2moviez-vault-audit-2026-05-27/10_exhaustive-coverage-ledger.md`
- `_SYSTEM/reports/c2moviez-vault-audit-2026-05-27/15_fanout-run-002-results.md`
- `_SYSTEM/reports/c2moviez-vault-audit-2026-05-27/16_fanout-run-003-packets.md`

Questions:

- Does the inventory align with the canonical clone and Run 002 findings?
- Are security findings lifecycle-tagged and redacted correctly?
- Does the exhaustive coverage ledger actually support micro-batch burn-down?
- What must be fixed before Run 003 results are integrated?
