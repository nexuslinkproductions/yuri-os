# TOKEN TRACKER — Session Log & Monthly Rollup
**Started:** 2026-04-17 | **Last updated:** 2026-04-17

---

## How This Works

**Every session, log:**
1. Session ID (timestamp)
2. Task category (text, code, file I/O, web, browser, etc.)
3. Estimated tokens used
4. MCP/skills loaded
5. Context blocks active
6. Anomalies (unusual spikes, wasted effort, errors)

**Monthly aggregation:**
- Roll up into summary by task type
- Identify trends
- Flag if any category exceeds budget
- Recommend adjustments

**Quarterly review:**
- Deep analysis of cost drivers
- Update optimization strategies
- Report progress toward 4.08M annual savings goal

---

## Session Log Template

Copy this template at the end of each session and fill in actual numbers:

```markdown
### SESSION [YYYY-MM-DD HH:MM] — [Task Type]
- **Estimated tokens:** [X]K
- **MCP loaded:** [list or "none"]
- **Skills activated:** [list or "none"]
- **Context blocks:** [core only / full / custom]
- **Primary files read:** [list]
- **Anomalies:** [none / describe spike or inefficiency]
- **Notes:** [anything useful for optimization]
```

---

## 2026-04 Session Log
### SESSION 2026-04-17 15:01:30 — file-io
- **Estimated tokens:** 8K
- **MCP loaded:** Unknown, Read, Unknown, Unknown, Unknown
- **Skills activated:** none
- **Context blocks:** [custom - auto-detected]
- **Primary files read:** [auto-logged]
- **Anomalies:** none
- **Notes:** Auto-logged session, duration 0m, tokens: 8K


### SESSION 2026-04-17 22:15 — Token Audit + System Design
- **Estimated tokens:** 78K
- **MCP loaded:** General-purpose agent, file I/O, write tools
- **Skills activated:** None (audit task doesn't need skills)
- **Context blocks:** Full (needed to understand current state)
- **Primary files read:** memory/MEMORY.md, palace-index.md, enki_state.md, token-efficiency.md
- **Anomalies:** Large context load for audit analysis (78K is expected for comprehensive analysis)
- **Notes:** This is the baseline audit session — intentionally detailed. Future sessions should be 30–45K for typical work.

---

## Monthly Summary Template

Fill this in on the last day of each month. Replace [MONTH] with actual month.

```markdown
## 2026-[MONTH] Summary

### Metrics
| Metric | Target | Actual | Variance |
|--------|--------|--------|----------|
| **Avg session cost** | 28K | [X]K | [+/–]X% |
| **Sessions logged** | 20 | [X] | [+/–]X |
| **Total tokens** | 560K | [X]K | [+/–]X% |
| **Cost per task** | varies | [see below] | — |

### By Task Type
| Type | Sessions | Avg Cost | Total | Notes |
|------|----------|----------|-------|-------|
| Text/writing | [X] | [Y]K | [Z]K | |
| Code | [X] | [Y]K | [Z]K | |
| File I/O | [X] | [Y]K | [Z]K | |
| Web/research | [X] | [Y]K | [Z]K | |
| Browser work | [X] | [Y]K | [Z]K | |

### Top Anomalies
| Session | Cost | Reason | Avoidable? |
|---------|------|--------|-----------|
| [date] | [X]K | [reason] | Yes/No |

### Wins This Month
- [What worked well? Cost reductions realized?]

### Blockers
- [What's still wasting tokens? What needs fixing?]

### Next Month Priority
- [1–2 actions to reduce token burn further]
```

---

## Budget Caps (Provisional)

Based on audit, setting initial caps:

| Task Type | Budget per Session | Alert Threshold |
|-----------|-------------------|-----------------|
| Text/writing | 15K | 20K |
| Code generation | 20K | 28K |
| File I/O (small) | 10K | 15K |
| File I/O (large) | 25K | 35K |
| Web research | 18K | 25K |
| Browser work | 22K | 30K |
| Complex synthesis | 40K | 55K |
| System design | 70K | 90K (this session was necessary) |

**Alert rule:** If any session exceeds alert threshold, flag it in notes. Review root cause in next retroactive session.

---

## Rules for Tracking Accuracy

1. **Estimate tokens used, don't guess**
   - If reading 3 files (~2K each): estimate 6K
   - If loading full MCP ecosystem: add 13K
   - If complex synthesis: add 15–20K
   - Use audit report benchmarks as reference

2. **Log at session end** (take 60 seconds)
   - Don't let sessions pile up untracked
   - Accumulation makes trends invisible

3. **Flag anomalies immediately**
   - Spike > 50% above budget? Note the reason
   - Wasted tokens on failed approach? Document it
   - Successful optimization? Document it too

4. **Don't optimize for low numbers**
   - Some work legitimately costs 60K+ (complex projects, new system design)
   - Goal is to eliminate *unnecessary* token burn, not do shallow work
   - Quality > penny-pinching

---

## Quarterly Review Checklist

Run this at end of each quarter (March 31, June 30, Sept 30, Dec 31):

- [ ] Compile all monthly summaries
- [ ] Calculate actual vs. target cost
- [ ] Identify top 3 cost drivers (should change month to month)
- [ ] Identify top 3 successful optimizations
- [ ] Update token-audit.md with actual data
- [ ] Adjust budget caps based on new patterns
- [ ] Recommend changes for next quarter
- [ ] Report to Marcel with concise summary

---

## Current Month Target

**April 2026 (partial):**
- Sessions to log: 20 (assuming 2–3/week)
- Target total: 560K tokens (28K average)
- Projected actual (audit session included): ~580K (spike due to system design work)
- **Target variance:** ±10% acceptable

---

## Deactivation Triggers (Auto-Cleanup)

If token usage exceeds budgets consistently, auto-disable:

1. **MCPs not used in past 2 weeks** → deactivate
2. **Skills never invoked in session** → don't load next time
3. **Context blocks redundant** → consolidate and remove
4. **Verification rounds >3** → redesign to reduce iterations

---

## Integration with System

- **Monthly rollups:** File in `04_FINANCE/2026/token-tracking/`
- **Quarterly reports:** Reference in `00_COMMAND-CENTER/SESSION-REPORTS/`
- **Anomaly alerts:** Mention in session notes if spike is noticed
- **Annual summary:** Input for 2026 year-end retrospective
| 2026-04-18T15:03 | 2m | 12 | ~4,800 | Bash×8, Read×2, TodoWrite×1 |
| 2026-04-18T17:32 | 0m | 0 | ~0 | none |
| 2026-04-18T20:11 | 0m | 1 | ~400 | mcp__Claude_in_Chrome__computer×1 |
| 2026-04-19T09:30 | 1m | 19 | ~9,200 | Bash×12, Read×7 |
| 2026-04-19T09:41 | 0m | 0 | ~0 | none |
| 2026-04-19T09:52 | 0m | 0 | ~0 | none |
| 2026-04-19T09:55 | 1m | 10 | ~12,800 | WebFetch×8, ToolSearch×1, mcp__ccd_session__mark_chapter×1 |
| 2026-04-19T10:05 | 0m | 1 | ~300 | Bash×1 |
| 2026-04-19T10:19 | 0m | 0 | ~0 | none |
| 2026-04-19T11:25 | 40m | 0 | ~0 | none |
| 2026-04-19T12:22 | 0m | 3 | ~1,400 | Bash×2, Read×1 |
| 2026-04-19T12:54 | 0m | 5 | ~2,000 | Shell×5 |
| 2026-04-19T15:06 | 0m | 0 | ~0 | none |
| 2026-04-19T15:07 | 0m | 0 | ~0 | none |
| 2026-04-21T01:24 | 4m | 17 | ~6,800 | Grep×9, Read×4, Shell×3 |
| 2026-04-21T01:53 | 0m | 1 | ~400 | Shell×1 |
