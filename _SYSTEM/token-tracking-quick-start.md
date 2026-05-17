# Token Tracking — Quick Start (Print This)
**Updated:** 2026-04-17

---

## At Session End (60 seconds)


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

**Estimate guide:**
- Reading 1 file (~2K each) + response = 4K total
- Loading MCP = +2–6K
- Loading skill = +0.8–1.5K
- Complex synthesis/analysis = +15–20K

---

## Budget Check (Before Starting)

| Task | Budget | Alert @ |
|------|--------|---------|
| Text/writing | 15K | 20K |
| Code | 20K | 28K |
| File I/O (small) | 10K | 15K |
| File I/O (large) | 25K | 35K |
| Web research | 18K | 25K |
| Browser work | 22K | 30K |
| Complex synthesis | 40K | 55K |
| System design | 70K | 90K |

If task will likely exceed budget → note it before starting.

---

## Monthly Summary (Last Day of Month)

1. Copy `monthly-token-summary-template.md`
2. Paste as `04_FINANCE/2026/token-tracking/2026-[MM]-summary.md`
3. Fill in metrics from session logs
4. Calculate variance from budget
5. Note wins + blockers

**Time:** 30 minutes

---

## What NOT to Do

- ❌ Don't pre-load all MCPs at session start
- ❌ Don't activate skills you won't use
- ❌ Don't load memory modules unless you need them
- ❌ Don't exceed hard cap without approval

---

## Support

**Files:**
- token-audit.md — Baseline numbers and benchmarks
- token-tracker.md — All session logs live here
- token-regulation-policy.md — Full rules and governance

**Quarterly review:** June 30, Sept 30, Dec 31
