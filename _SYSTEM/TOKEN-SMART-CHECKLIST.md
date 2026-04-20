# TOKEN-SMART WORK CHECKLIST
**Deployed:** 2026-04-19 | **Status:** Active until subscription upgrade

---

## Before Every Session

- [ ] **Know your budget.** Token warning at 80K, critical at 150K. Watch status line.
- [ ] **Disable graphify.** Vault rebuilds are disabled by default (save 2–3K/session). Enable only for major reorganizations.

---

## Vault Navigation (MOST IMPORTANT)

**Rule: Palace-index.md first, raw reads second.**

### ❌ Expensive Pattern (OLD)
```
→ "What's in the C2MOVIEZ projects?"
→ Read 01_PROJECTS/C2MOVIEZ/README.md (2K tokens)
→ Read 06_NETWORK-SYNC/C2MOVIEZ/_SYNC-STATUS.md (2K tokens)
→ Read enki_state.md (3K tokens)
→ Total: 7K+ tokens for what I need
```

### ✅ Token-Smart Pattern (NEW)
```
→ Query palace-index.md (400 tokens) — shows CTI (Claudio Tinner), Revenue Tracker, Service Modules as hubs
→ "Ah, C2MovieZ work centers on CTI + Project files"
→ Read only 1–2 specific files if needed (2K max)
→ Total: 2.4K tokens saved per navigation
```

**When you ask me for vault info:**
- I will query palace-index.md first
- Tell you what structure shows
- Read only 1–2 targeted files
- If you need more depth, ask explicitly (I'll fetch it)

---

## Browser & Computer Tool Usage

**Rule: Batch your clicks. One round-trip beats five.**

### ❌ Expensive Pattern (OLD)
```
→ screenshot (400 tokens)
→ click button (400 tokens)  
→ screenshot (400 tokens)
→ type text (400 tokens)
→ screenshot (400 tokens)
= 2K tokens for one interaction
```

### ✅ Token-Smart Pattern (NEW)
```
→ computer_batch([screenshot, left_click, type]) 
= 600 tokens for same interaction
= 3.3× cheaper
```

**Applies to:**
- `mcp__Claude_in_Chrome__*` tools
- `mcp__computer-use__*` tools
- Browser automation

---

## File Operations

| Task | Expensive | Token-Smart |
|------|-----------|-------------|
| **Search vault** | Glob 15 files (6K) | Query palace-index (400), then specific files (2K) = 2.4K |
| **Read project brief** | Read 3 files sequentially (6K) | Grep for keyword (1K) |
| **Check finance status** | Read entire 04_FINANCE/ (8K) | Read one monthly summary (2K) |

---

## Session Structure (To Maximize Runway)

**Good:**
- 1 deep session (40K tokens, 90 min) — complex work, high output
- 2 medium sessions (20K tokens, 45 min each) — focused tasks

**Wasteful:**
- 5 shallow sessions (10K tokens, 15 min each) — context reloads, repeated navigation = 50K total

**Rule of thumb:** One focused session beats four scattered ones.

---

## When You Hit Budget Warnings

🟠 **80K warning:** You're using this session heavily.
- Finish current task
- Start fresh session for next work
- Don't push to 150K if avoidable

🔴 **150K critical:** Stop, finalize, new session.
- Token efficiency drops above 150K (diminishing returns on context)
- Auto-calculated in status line

---

## Emergency Mode (Token Crunch)

If you need to save tokens *right now*:

1. **Use text-only.** No screenshots unless essential.
2. **Use Grep instead of Read.** Pattern matching = 1K, full file read = 3K.
3. **Query palace-index.md instead of exploring.** 400 tokens vs. 5K+.
4. **Skip verification loops.** Trust the work; only verify if user asks.
5. **Use Bash for file operations.** Cheaper than Read + Edit chains.

---

## Tracking Your Progress

Every session end, the system logs:
- **Estimated tokens used**
- **Tool calls made**
- **Top tools by frequency**
- **Duration**

Review `_SYSTEM/token-tracker.md` weekly to spot patterns.

**First monthly summary:** Apr 28 (automatic)

---

## Your Runway (Estimated)

With these changes applied:
- **Before:** ~5K tokens/session average → ~3.65M tokens/year
- **After:** ~2K tokens/session average → ~1.46M tokens/year
- **Savings:** ~2.2M tokens/year (60% reduction)

**Translation:** You can work 2–3× longer on your current token budget.

---

## Questions?

Before each session, ask yourself:
1. Do I need to read raw vault files, or can palace-index.md answer this?
2. Am I clicking sequentially, or can I batch these actions?
3. Is this token spend solving a real problem, or debugging something that doesn't matter?

When in doubt, ask: *"What's the cheapest way to get this answer?"*
