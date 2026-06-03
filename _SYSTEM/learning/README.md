# Self-Evolving Learning System

**Status:** Live  
**Last updated:** 2026-04-19  
**Maintainers:** Marcel

---

## How It Works

### Three-Hook Pipeline

1. **`subagent-start.js`** (SessionStart)
   - Loads all domain rules from `.md` files
   - Prepends them as `<mnemosyne>` block before Claude executes
   - Agent sees your previous corrections before answering

2. **`session-capture.js`** (Stop/session end)
   - Captures your corrections: "no, fix this" or "yes, exactly"
   - Stores signals in `sessions.jsonl` for pattern analysis

3. **`dream.js`** (Scheduled/hourly)
   - Analyzes accumulated signals
   - When same correction appears 2+ times across sessions, writes a rule
   - Rules go into domain-specific `.md` files

### The Learning Loop

```
Session 1: You correct Claude on invoice formatting
  ↓ [SessionCapture stores signal]
  ↓
Session 2: Another invoice formatting correction
  ↓ [SessionCapture stores signal]
  ↓
Dream Worker (after 4h idle + 3 sessions): "Same pattern 2x — write rule"
  ↓ [Rule added to finance.md]
  ↓
Session 3+: Claude starts every session with learned rule in <mnemosyne>
  ↓ [Fewer corrections needed]
```

---

## Configuration

Edit `config.json` to adjust:

| Setting | Default | Meaning |
|---------|---------|---------|
| `enabled` | true | Master on/off |
| `minSessionsForRule` | 2 | How many corrections = write rule |
| `minHoursForDreamWorker` | 4 | Idle time before analyzer runs |
| `minNewSessionsForDream` | 3 | New sessions needed to trigger |

---

## Rule Files (Domains)

Rules live in these `.md` files:

| File | Domain |
|------|--------|
| `global.md` | Cross-cutting behaviors |
| `finance.md` | Invoices, expenses, accounting |
| `briefs.md` | Client proposals, specs, briefs |
| `client-comms.md` | Email tone, meeting notes, updates |

Each file has a "Rules" section where new rules appear.

---

## Manual Adjustments

You can **directly edit rule files**:

1. Open any `.md` file
2. Add rules manually under "## Rules"
3. System treats them exactly like auto-learned rules

---

## Metadata

Each `.md` tracks:
- `Last updated`: When rules were written
- `Total rules`: Current count
- `Sessions contributing`: How many sessions fed this domain
- `Last dream worker run`: When analyzer last fired

---

## Signals Log

Session signals stored in `sessions.jsonl` (one JSON object per line):

```json
{
  "timestamp": "2026-04-19T22:45:33Z",
  "type": "correction",
  "isCorrective": true,
  "snippet": "no, don't add em-dashes..."
}
```

Used by Dream Worker for pattern detection. Safe to clean up if it grows too large.

---

## Troubleshooting

**Rules not appearing?**
- Check `enabled: true` in config.json
- Verify your corrections match regex patterns
- Inspect `sessions.jsonl` for captured signals

**Dream Worker not running?**
- Check if 4+ hours have passed since last run
- Check if 3+ new sessions have occurred
- Look at `.last-dream` file to see last execution time

**Rules too aggressive?**
- Increase `minSessionsForRule` to 3–4
- Manually delete rules from `.md` files

---

## Technical Details

- **Hook entry points:** `/Users/marcelspatz/.claude/settings.json`
- **Token tracking:** Separate system in `.claude/hooks/` (machine-local)

