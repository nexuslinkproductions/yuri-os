# Self-Evolving Hooks — Test Plan

**Date:** 2026-04-19  
**Status:** Ready for live testing  
**Tester:** Marcel

---

## System Verification ✓

| Component | Status | Notes |
|-----------|--------|-------|
| Config loaded | ✓ | `config.json` valid JSON, 5 domains, thresholds set |
| Hook scripts | ✓ | All 3 hooks: syntax valid, no runtime errors |
| Settings wired | ✓ | `settings.json` SessionStart + Stop hooks configured |
| Learning files | ✓ | 5 domain files + README in place |

---

## Live Testing Protocol

### Test 1: Session Start Hook (Now)

1. Start a new Claude Code session
2. Check status message: "Initializing session tracking... learning rules..."
3. No rules yet expected (empty output)
4. ✓ If no errors: hook is firing correctly

### Test 2: Correction Capture (This Session)

1. Make 1-2 corrections to Claude (e.g., "no, don't do that")
2. End session normally (Ctrl+D or /stop)
3. Watch status: "Finalizing session and updating learning rules..."
4. Check `sessions.jsonl` was created:
   ```bash
   ```
5. ✓ If file exists: capture is working

### Test 3: Dream Worker Trigger (After 3+ Sessions)

**Prerequisite:** Complete at least 3 sessions with corrections

1. Wait 4+ hours idle, OR manually trigger:
   ```bash
   ```
2. Check if `finance.md` (or other domain) was updated:
   ```bash
   ```
3. ✓ If rules appear: dream worker is learning

### Test 4: Rule Prepend (Session After Learning)

1. After a rule is written, start a new session
2. Check for `<mnemosyne>` block in the session start output
3. Claude should include your learned rules in every response preamble
4. ✓ If rules appear at top of responses: loop is complete

---

## What to Correct (Test Domains)

To bootstrap learning, intentionally correct Claude on:

### Finance Corrections
- "no, don't use em-dashes in invoice notes"
- "fix the invoice number format"
- "don't include EUR in Austrian invoices"

### Brief Corrections
- "no, that brief is missing the location"
- "add the shoot date to proposals"
- "don't use jargon Claudio won't understand"

### On-Set Corrections
- "include equipment manufacturer in call sheets"
- "never forget the location address"
- "add weather notes to shot lists"

### Client Communications
- "too formal, use Claudio's tone instead"
- "clarify the timeline"
- "don't assume they know our jargon"

---

## Monitoring

### Check Session Signals
```bash
```

### Check Learning Rules
```bash
```

### Check Dream Worker State
```bash
```

---

## Adjustments (Post-Claudio Sync)

Once Claudio reviews:

1. **Too many false positives?** Increase `minSessionsForRule` to 3–4 in `config.json`
2. **Rules too generic?** Mark domain-specific rules with `[ONSITE]` prefix
3. **Need shared rules?** Edit `client-comms.md` together
4. **Want to disable learning?** Set `enabled: false` in `config.json`

---

## Troubleshooting

| Problem | Diagnosis | Fix |
|---------|-----------|-----|
| No mnemosyne block | No rules written yet | Complete 3+ sessions with corrections |
| sessions.jsonl not growing | Corrections not detected | Check regex patterns in `session-capture.js` |
| Dream worker silent | Not meeting thresholds | Needs 4h idle + 3 sessions + 2 same corrections |
| Rules not appearing | Dream worker error | Check file permissions on learning files |

---

## Timeline Expectation

- **Day 1:** System armed, hooks firing
- **Day 1–2:** Capture 3–5 sessions with corrections
- **Day 2–3:** Dream worker detects patterns, writes 2–3 rules
- **Day 3+:** Rules prepend automatically, correction frequency drops
- **Week 1:** 15–20 domain-specific rules learned

Once you and Claudio sync (Week 2+): tune thresholds, merge shared rules, lock in your house style.
