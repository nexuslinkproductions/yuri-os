# H4: Yuri Memory Policy — Minimal Ship-Ready (2026-07-05)

**Synthesis task:** Reconcile Marcel's "org/safety/security + quirks permanent" + René's "nothing expires, remember conversations" into ONE minimal, ship-ready memory policy for Yuri. Operational, not research.

---

## Core Principle

Yuri's episodic store (jarvis-memory.db, SQLite + FTS5) is the primary human-facing memory. It must be:
1. **Minimal** — no power-law decay loops, no homeostatic renormalization, no global salience matrix. Ship with a simple tagging scheme.
2. **Persistent** — permanent tier never decays; conversational facts live one week by default; decay is advisory (Yuri can recall older if asked).
3. **Write-gated** — the model judges salience (via `remember` tool); humans can also write directly to the DB via CLI.
4. **Recall-on-trigger** — at startup + mid-turn on FTS5 semantic match; no passive background scanning.

---

## Three Tiers (Simple Classification)

| Tier | Definition | Retention | Example | Writer |
|------|-----------|-----------|---------|--------|
| **PERMANENT** | Never decays. Operating truth: names, birthdays, allergies, work setup, IP constraints, safety rules. | Forever | Lilly's birthday 2010-11-15; Marcel uses teal; muse-port 8014; René's email rene@custom-gear.ch | Marcel (explicit tagging) + Yuri (on first-mention pattern) |
| **CONVERSATION** | Conversational facts, decisions, context from current session or recent past. Lives ~7 days (soft cap, not enforced). | 7 days (advisory) | "Marcel is researching Yuri memory design"; "we decided to ship voice first"; "last call output was X" | Yuri (model judges via `remember` tool) + transcript replay |
| **TRANSIENT** | Scratch facts, temporary context, tool output, search results. Lives ~1 day or until session end. | 1 session / 1 day | Bash command output; "last search for X returned Y"; temporary bearings | Implicit (session cache, not persisted) |

---

## Write Gate (What Earns a Memory Write)

Yuri writes to episodic store ONLY on:

1. **First-mention anchor** — Marcel says something novel + load-bearing (name, date, constraint, trait, preference). Example: "My sister's name is Lilly, birthday November 15."
2. **Convergent decision** — After discussion, Yuri writes the LANDED decision, not the process. Example: "Decided: voice loop ship first, vision feedback later."
3. **Repeated pattern** — Marcel does X three+ times in one session; Yuri tags as emerging preference. Example: "Pattern: Marcus tends to verbose-then-distill; prefers dense final answers."
4. **Operator explicit request** — `remember X` command or "write this down."

Yuri does NOT write:
- Every utterance (spam). 
- Speculation or model hedging ("maybe," "probably"). 
- Transient task output (Bash logs, search results, tool replies).
- Facts already tagged (no duplicates).

---

## Recall Trigger

| Trigger | When | Scope |
|---------|------|-------|
| **Startup** | Brain boots; FTS5 recalls permanent tier only. Quick context refresh. | ~10 entries (top recent permanent facts) |
| **Mid-turn semantic match** | Model asks for context; Yuri runs FTS5 on conversation topic. | Top 5–10 results ranked by recency + relevance |
| **Explicit recall** | "What do you remember about X?" or `recall <query>`. | User-scoped search |
| **Conversation checkpoint** | Periodically (e.g., every 10 turns or on long sessions), Yuri summarizes + asks "did I miss anything?" | Confirmation loop |

---

## Retention Rules (Simple Math)

**PERMANENT tier:**
- Never auto-expire.
- Manually pruned only by Marcel (e.g., "forget X").
- Searchable at startup + always available on recall.

**CONVERSATION tier:**
- Write timestamp at entry.
- Soft cap: 7 days (after 7 days, entry moves to "archive" view but still searchable).
- Can be manually promoted to PERMANENT (e.g., "remember this forever").
- No background pruning daemon (advisory retention, not enforced).

**TRANSIENT tier:**
- Session-local cache, no DB write.
- Lost on restart.
- Can be manually saved to CONVERSATION if valuable ("save that").

---

## Verbatim vs. Distilled Fact

| Form | When | Example |
|------|------|---------|
| **Distilled fact** | Default. Yuri extracts the semantic core. | Input: "My sister Lilly was born November 15, 2010, and she loves coding." → Stored: `PERMANENT: lilly_sibling {name: Lilly, dob: 2010-11-15, interest: coding}` |
| **Verbatim snippet** | Only if exact wording is *operationally* load-bearing (code, commands, exact phrases, contracts). | Input: "Always greet me with: 'Good morning, Marcel. What's the move today?'" → Stored verbatim under greeting rule. |
| **Timestamp + source** | Always. Tags entry with session date, provenance (spoken, written, pattern-detected). | `{timestamp: 2026-07-05T09:00Z, source: voice, tier: permanent}` |

---

## THE ONE THING TO BUILD FIRST

**Ship a tagged episodic store schema + minimal recall loop (LIVE in 3–4 hours):**

```
# jarvis_memory.db — Three-tier schema (MINIMAL)

CREATE TABLE episodes (
  id INTEGER PRIMARY KEY,
  timestamp TEXT NOT NULL,  -- ISO 8601
  summary TEXT NOT NULL,    -- 1–2 sentences, semantic core
  tier TEXT NOT NULL,       -- PERMANENT | CONVERSATION | TRANSIENT
  cues TEXT,                -- comma-separated FTS5 keywords
  transcript_ref TEXT,      -- link to conversation ID (optional)
  source TEXT,              -- voice | written | pattern_detected
  tags TEXT                 -- JSON array of labels
);

CREATE VIRTUAL TABLE episodes_fts USING fts5(summary, cues, content=episodes);
```

**Recall loop at startup:**
```python
# yuri-z-brain.py startup (lines 140–170)
permanent_facts = query_db("SELECT summary FROM episodes WHERE tier='PERMANENT' ORDER BY timestamp DESC LIMIT 10")
inject_into_system_prompt(permanent_facts)
```

**Write gate (model tool: `remember`):**
```python
def remember(summary: str, cues: str, tier: str = "CONVERSATION", source: str = "voice") -> str:
    """Commit to memory. Tier: PERMANENT | CONVERSATION | TRANSIENT."""
    if not summary.strip():
        return "Summary cannot be empty."
    if tier not in ["PERMANENT", "CONVERSATION", "TRANSIENT"]:
        return f"Invalid tier: {tier}. Use PERMANENT, CONVERSATION, or TRANSIENT."
    
    db.execute(
        "INSERT INTO episodes (timestamp, summary, tier, cues, source) VALUES (?, ?, ?, ?, ?)",
        (datetime.utcnow().isoformat(), summary, tier, cues, source)
    )
    return f"Remembered: {summary} [{tier}]"
```

**No arming required.** This is reversible, local, read-only at boot, and safe.

---

## What to Defer (Not Yet)

1. **Power-law decay engine** — Overkill for day 1. Soft 7-day advisory is enough; iterate on what actually gets forgotten.
2. **Automatic preference learning** — No pattern-scanner. Yuri writes only on explicit salience or 3+ repetitions.
3. **Homeostatic renormalization** — No. Keep write_strength simple: salience binary (write or don't).
4. **Global semantic graph** — No cross-conversation link analysis. Stay FTS5-scoped.
5. **Episodic→semantic transition** — No overnight consolidation loop. Run semantic compression only if a specific use case demands it.
6. **Multi-turn conversational threading** — Memory stores facts, not full transcripts. Transcript archiving is separate (REPL logs to events.jsonl; searchable but not auto-injected).

---

## Over-Engineering Traps (Explicit Non-Actions)

| Trap | Why Not Now | Trade |
|------|-------------|-------|
| **Full power-law decay** | "Nothing expires" (René) conflicts with "advisory retention." Simple tagging enough for operator judgement. | Iterate after 2 weeks of real use; exact decay curve will emerge from actual forgetting patterns. |
| **Automatic CTR-like scoring** | Tempting but requires click logs + behavioral data we don't have. Yuri's "importance" is human intent, not engagement. | Let Marcel tag PERMANENT manually; Yuri suggests (not auto-decides) for CONVERSATION→PERMANENT promotion. |
| **Vector embeddings + semantic dedup** | Makes search elegant; overkill for <500 episodes. FTS5 wins on simplicity + cost. | Only upgrade if FTS5 starts returning low-quality results (unlikely with <1 year of data). |
| **Distributed memory (YURI+Claude+Codex)** | Yuri needs LOCAL episodic store for voice latency. Track A canonical memory is separate (YURI-wide facts). Don't conflate. | Yuri's jarvis-memory.db is HER episodic store; Track A memory (at `_SYSTEM/memory`) is shared operating truth. Cross-link, don't duplicate. |

---

## Implementation Checklist (Ship Ready)

- [ ] Add three-tier schema to jarvis_memory.py
- [ ] Wire permanent-tier recall into yuri-z-brain.py startup (inject top 10 into system prompt)
- [ ] Update `remember` tool signature: add `tier` + `source` params
- [ ] CLI tool: `yuri recall <query>` for interactive search
- [ ] CLI tool: `yuri tag <id> PERMANENT` for manual promotion
- [ ] Write startup log: "Loaded X permanent facts, Y conversation facts from memory"
- [ ] Test on 2 real sessions: verify write gate (no spam), recall (no false positives)
- [ ] Document in yuri-z-brain.py tool notes: "remember(summary, cues, tier) — write to episodic store"

---

## Summary

**Yuri's memory is three-tiered, writes on salience, and recalls on trigger.** PERMANENT facts (names, rules, constraints) never decay and boot at startup. CONVERSATION facts live ~7 days (advisory). TRANSIENT facts are session-local. The model judges salience via `remember`; no power-law or homeostatic loops. First build: schema + recall loop (3–4 hours). Iterate decay curve + patterns after real use. This ships Yuri as a *remembered* assistant, not a forgetful one, while staying operationally minimal.
