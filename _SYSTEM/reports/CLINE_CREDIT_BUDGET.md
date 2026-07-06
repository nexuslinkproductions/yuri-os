# ClinePass Credit Budget — Owner Template

**Owner:** Marcel  
**Subscription:** ClinePass ($9.99/mo) · renews **2026-07-29**  
**Current balance (2026-06-29):** 0.5 credits (usage-billing window)

Fill live numbers before arming `cline-fleet` for company dispatch.

---

## Monthly ceiling

| Window | Limit | Alert at |
|--------|-------|----------|
| 5-hour burst | _(fill from Cline dashboard)_ | 80% |
| Weekly | _(fill)_ | 80% |
| Monthly | _(fill)_ | 80% |

## Routing rules (quartermaster)

1. **Prefer z.ai GLM** when Coding Plan healthy and task is already on `runSwarm`.
2. **Route to ClinePass** when `quotaPressure > 0.7` or z.ai rate-limited — scout/artificer/engineer/mechanic bulk only.
3. **Never Cline** for native-only (MCP/browser), owner-gated, or finalize subtasks.
4. **HOLD** all Cline live dispatch while balance &lt; 0.2 credits unless owner override.

## Arm ceremony

```bash
# After auth: cline auth clinepass
touch _SYSTEM/state/cline-fleet.enabled   # owner-gated
# Disarm:
rm -f _SYSTEM/state/cline-fleet.enabled
```

## Smoke

```bash
node _SYSTEM/Scripts/cline-fleet.mjs --dry-run --tasks-file .claude/jobs/<runId>/cline-tasks.json
YURI_CLINE_FLEET=1 node _SYSTEM/Scripts/cline-fleet.mjs --smoke
```

## Held register

- `cline-live-dispatch` — cleared when this doc has live ceilings + steward gate pass
