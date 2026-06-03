# Distribution Agents — Automated Operations

**Status:** Framework complete, ready for scheduling  
**Purpose:** Automate recurring operational reporting for Nexus Link  
**Time Commitment:** Agents run on a schedule; you review outputs

---

## What It Does

Agents run on a schedule, each handling a recurring operational task:

| Agent | Schedule | Output | Purpose |
|-------|----------|--------|---------|
| **Finance Digest** | Monday 8am | 1 weekly report | Cash flow tracking + action items |

---

## How It Works

### Finance Digest

**Input:** Finance folder (`04_FINANCE/2026/`)  
**Process:** Reads all invoices, expenses, due dates → creates summary  
**Output:** Email-ready markdown with action items  
**Result:** Weekly cash flow visibility + invoice follow-up reminders

**Example:**
- Monday 8am: Agent reviews all outstanding invoices
- Digest includes:
  - What's paid, what's pending, what's overdue
  - Upcoming payments next 2 weeks
  - Action items ("Chase Client A, they're 32 days overdue")
- You get clarity on cash position before your week starts

---

## Architecture

```
├── config.json                           [Schedule, brand voice, outputs]
├── AGENT-finance-digest.md               [Finance reporting protocol]
├── README.md                             [This file]
├── QUICK-START.md                        [Usage guide]
└── outputs/
    └── finance/                          [Weekly digests]
```

---

## Scheduling

### How to Activate

**Option A: Claude Code Scheduled Tasks**

```bash
# Create scheduled task for each agent
  --task finance-digest \
  --cron "0 8 * * 1" \
  --script AGENT-finance-digest.md
```

**Option B: System Cron**

```bash
# Add to ~/.crontab or /etc/cron.d
0 8 * * 1  /usr/bin/node /path/to/agent.js finance-digest
```

### Schedules (Vienna Timezone)

| Agent | Time | Frequency | Notes |
|-------|------|-----------|-------|
| Finance Digest | 8:00 AM | Mondays | First thing: plan your week with cash clarity |

---

## What You Must Do

**Minimal effort needed from you:**

1. **Review generated outputs** (optional)
   - Digests before acting on them

2. **Act on Finance Digest** (once per week)
   - Chase overdue invoices (digest highlights them)
   - Plan expenses for the week
   - Keep cash flow healthy

**What agents do:**
- Curate, report
- Everything else

---

## Configuration

All adjustable in `config.json`:

- **Schedule times:** Change cron expressions
- **Output directories:** Where files are saved
- **Brand voice:** Your tagline, mission, audience definition
- **Agent toggles:** Enable/disable any agent
- **Frequency:** Run daily, weekly, or on-demand

---

## Next Steps

1. **Confirm agent protocols** — Read each AGENT file, verify they match your vision
2. **Set up schedules** — Activate via Claude Code tasks or system cron
3. **Review first outputs** — Check the digest
4. **Iterate** — Adjust config or protocols based on results

---

## Integration with Other Systems

### Self-Evolving Hooks
- Agents' outputs are reviewed by you
- Your corrections are captured by Hooks
- Over time, Hooks learn "what Marcel approves"
- Future agents prepend those learned rules

### Autonomous Swarm
- Swarm uses these agents as part of overnight processing
- While you sleep: reports created + delivered
- You wake to ready outputs

---

## Quality Notes

- **Finance Digest:** Only as accurate as your bookkeeping
  - Ensure invoices are properly dated and filed
  - Digests are only as good as the data
