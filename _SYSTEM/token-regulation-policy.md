# TOKEN REGULATION POLICY — Governance & Enforcement
**Effective:** 2026-04-17 | **Review cycle:** Quarterly

---

## Policy Statement

Token efficiency is a **system parameter**, not a nice-to-have. Unregulated token burn wastes ~4M tokens/year and creates noise in signal-to-noise ratio. This policy establishes boundaries, enforcement mechanisms, and continuous improvement cycles.

---

## Regulation 1: Activation/Deactivation Protocol

### MCP Servers — Selective Loading

**Status quo (inefficient):** All MCPs load at session start.

**New rule:** MCPs load only when needed.

| MCP | Loading Trigger | Deactivation Trigger | Tokens/Session |
|-----|-----------------|----------------------|-----------------|
| **General-purpose Agent** | Always (core reasoning) | Never | 1K |
| **File I/O (Read/Write/Glob/Grep)** | User requests file work OR code execution requires it | Task complete | 2K |
| **Computer-use** | User requests desktop automation OR browser work via system | Task complete | 3K |
| **Claude-in-Chrome** | User requests web browsing or web form filling | Task complete | 2K |
| **Web search / WebFetch** | User requests "search" or "fetch URL" | Task complete | 1.5K |
| **Bash execution** | User requests shell commands OR code execution | Task complete | 1K |
| **Image tools** | User requests image generation/analysis | Task complete | 2K |
| **N8n / advanced integrations** | User explicitly requests API/workflow work | Task complete | 3K |

**Enforcement:** 
- Session starts with ONLY general-purpose reasoning active (1K load)
- All others activated on-demand per user request or code execution need
- Once task (not session) completes, deactivate immediately
- If session contains 3+ independent tasks, deactivate between tasks

**Expected impact:** 6.5K → 2K baseline session load = **69% reduction**

---

### Skills — Usage-Based Activation

**Status quo (inefficient):** 150+ skills loaded upfront, 90% never invoked.

**New rule:** Skills load only when explicitly invoked by name or task requires them.

| Skill Category | Loading Rule | Tokens/Session |
|----------------|--------------|-----------------|
| **Production-domain** | Load when user mentions projects/shoots/clients | 1.5K |
| **Business-domain** | Load when user mentions invoicing/proposals/contracts | 1K |
| **Finance-domain** | Load when user mentions budget/reconciliation/tracking | 1K |
| **Learning-domain** | Load when user mentions research/synthesis/extraction | 0.8K |
| **Ops-domain** | Load when user mentions workflow/systems/automation | 0.8K |
| **All others** | Do not load unless explicitly requested | 0K |

**Enforcement:**
- Default: No skills loaded (0K overhead)
- User requests "use [skill-name] skill" → load that skill only
- Context analysis: If user message mentions "shoot" or "client", activate production-domain skills
- Deactivate immediately after skill execution completes
- Track which skills are never used; deprecate them quarterly

**Expected impact:** 4K → 0–1.5K skill overhead = **62% reduction**

---

## Regulation 2: Context Block Compression

### Current Context Overhead
```
CLAUDE.md (global)              0.8K
CLAUDE.local.md (private)       0.3K
token-efficiency.md             0.6K
content-workflow.md             0.5K
skill-expansion.md              0.7K
brand-standards.md              0.4K
persona.md                      0.5K
---
Total:                          4.3K tokens per session
```

### Compression Rules

**Rule 1: Consolidate overlapping rules**
- Move redundant directives to single master file
- Remove "avoid doing X" if it's stated elsewhere
- Keep one source of truth per concept

**Action:** Consolidate 6 files into 2 master files:
1. `CLAUDE-MASTER.md` (global directives, identity, working style) — ~2K
2. `CLAUDE-RULES.md` (token efficiency, brand, content standards) — ~1.5K

**Expected reduction:** 4.3K → 3.5K = **19% reduction**

**Rule 2: Lazy-load memory modules**
- Don't load all memory files at session start
- Load memory only when user says "remember" or "check memory"
- Cache frequently-accessed memory (palace system reference) only

**Action:** Move non-core memory to vault; reference by query instead of auto-load.

**Expected reduction:** 1.5K → 0.3K per session = **80% reduction on memory overhead**

**Rule 3: MCP server instructions are read on-demand**
- MCP instructions currently load at tool-search time
- Don't pre-parse server docs unless user is about to use that tool

**Action:** Defer MCP instruction parsing until tool invocation.

**Expected reduction:** 2K → 0.2K per session = **90% reduction**

---

## Regulation 3: Budget Caps & Alerts

### Approved Budget per Session Type

| Task Type | Budget | Hard Cap | Alert @ |
|-----------|--------|----------|---------|
| **Text/writing** | 15K | 25K | 20K |
| **Code generation** | 20K | 35K | 28K |
| **File I/O (small <5 files)** | 10K | 18K | 15K |
| **File I/O (large >10 files)** | 25K | 45K | 35K |
| **Web research** | 18K | 30K | 25K |
| **Browser automation** | 22K | 40K | 30K |
| **Complex synthesis** | 40K | 65K | 55K |
| **System design (arch/audit)** | 70K | 110K | 90K |

### Alert Mechanism

**When session cost approaches cap:**
1. Stop and report: "Approaching token budget [X]/[Y]K. Proceed (Y/N)?"
2. If yes: continue, document reason in session log
3. If no: defer to next session
4. At session end: log actual cost + reason if over budget

### Hard Cap Enforcement

If session **exceeds hard cap:**
1. DO NOT continue
2. Log the incident (what was being attempted, why it overran)
3. File incident in token-tracking.md
4. Retroactively analyze in next quarterly review
5. Adjust approach for similar tasks next time

---

## Regulation 4: Continuous Improvement Cycle

### Monthly Review (Last day of month)
- Compile session logs
- Calculate monthly actuals vs. budget
- Flag any category that exceeded cap 3+ times
- Recommend adjustments to next month's approach

### Quarterly Deep Dive (EOQ)
- Analyze top 3 cost drivers from 3 months of data
- Identify patterns (specific task types, specific workflows, specific mistakes)
- Update token-audit.md with actual vs. projected savings
- Adjust budget caps based on reality
- Deactivate unused skills
- Consolidate any new context blocks

### Annual Review (Dec 31)
- Full cost analysis: actual vs. 4.08M annual savings target
- Report progress
- Adjust policy for next year
- Celebrate wins
- Plan next year's optimizations

---

## Regulation 5: Deactivation Cascades

### Automatic Cleanup Triggers

**Weekly:**
- Deactivate MCPs not used in past 7 days
- Deactivate skills not invoked in past 7 days

**Monthly:**
- Remove context blocks loaded but never referenced
- Archive memory files older than 90 days (move to vault)
- Consolidate duplicate rules

**Quarterly:**
- Full skill audit — mark unused skills as "deprecation candidate"
- Review MCP loading patterns — renegotiate baseline load
- Consolidate new context blocks that emerged

---

## Regulation 6: Exception Process

### When to Request Budget Increase

**Allowed exceptions:**
1. **New project types** — requires 1.5x normal budget until workflow is established
2. **Exploratory work** — research/learning can use up to 2x budget
3. **Emergency/incident response** — no budget limit, document afterward
4. **System refactoring** — can use 3x budget for one-time rewrites

**Exception request format:**
- Explain why normal budget is insufficient
- Estimate tokens needed
- Document expected ROI (time savings, quality improvement, etc.)
- Get explicit approval before starting
- Log outcome in token-tracking.md

**Approval rule:** Marcel approves exceptions. If unclear, ask before starting.

---

## Regulation 7: Reporting & Transparency

### Public Reports

**Monthly rollup:** File in `04_FINANCE/2026/token-tracking/[month]-summary.md`

Contains:
- Total tokens used
- Cost by category
- Variance from budget
- Key wins / blockers
- Next month priority

**Quarterly summary:** File in `00_COMMAND-CENTER/QUARTERLY-REPORTS/2026-Q[X]-TOKEN-REPORT.md`

Contains:
- YTD actual vs. projected 4.08M savings
- Trend analysis
- Recommended policy adjustments
- Next quarter focus

**Annual report:** Part of 2026 year-end retrospective

---

## Regulation 8: Non-Compliance & Correction

### What Happens if Policy is Violated?

1. **Accidental overspend (1–2x per quarter):** Document and move on
2. **Repeated violations (3+ times in a month):** Flag in session notes, discuss in next review
3. **Systematic violation (policy routinely ignored):** Revise policy (too strict) or adjust working style (too loose)

**No punitive action.** Goal is learning, not enforcement. If policy isn't working, fix the policy.

---

## Regulation 9: Escalation Paths

### When to Flag Issues

| Issue | Escalation | Action |
|-------|-----------|--------|
| Single session way over budget | Log it | Document reason in token-tracking.md |
| Same task type consistently over budget | Monthly review | Adjust budget cap for that task type |
| MCP/skill never used | Quarterly audit | Deprecate or redesign activation trigger |
| Policy too restrictive | Quarterly review | Loosen caps or adjust activation rules |
| Policy not enforced | Monthly check | Rebuild enforcement mechanism |

---

## Implementation Checklist

- [x] Create token-audit.md (baseline analysis)
- [x] Create token-tracker.md (logging infrastructure)
- [x] Create token-regulation-policy.md (this file)
- [ ] **Next:** Consolidate CLAUDE.md files (this week)
- [ ] Set up session logging (today — Marcel starts next session)
- [ ] File first monthly summary (May 1)
- [ ] Quarterly deep dive (June 30)

---

## Quick Reference

**For Marcel:** At the start of each session, check token budget based on task type (see table above). If work will likely exceed budget, note it upfront.

**For Claude:** Before loading an MCP or skill, verify it's needed for the current task. Deactivate immediately after task completes.

**For audits:** Run quarterly review on last day of quarter. Update all three files (token-audit.md, token-tracker.md, this policy) with new data and lessons learned.

---

## Questions?

This policy is living. If it doesn't work, adjust it. If there's ambiguity, document the ambiguity and resolve in next quarterly review.

**Effective date:** 2026-04-17
**Next review:** 2026-06-30 (quarterly)
