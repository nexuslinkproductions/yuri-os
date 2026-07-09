# Advisor Note Schema — v1.0 (2026-07-09)

**Status:** Critical-path artifact for the mure-advisor harness. Binding for both Tier 1 (cheap watcher) and Tier 2 (heavy advisor) emissions.

**Author:** YURI orchestrator (MiniMax-M3 lane), per grill round + Opus 4.8 adversarial review (HV03).

---

## 1. Schema (binding)

Every emitted note MUST conform to this JSON shape:

```json
{
  "id":         "<uuid v4>",
  "turnId":     "<chat turn id>",
  "laneId":     "<dispatched lane id>",
  "model":      "<model string that emitted this note>",
  "tier":       "watcher|heavy",
  "severity":   "info|watch|warn|block",
  "summary":    "<one-line, plain language, <=140 chars>",
  "nextMove":   "<concrete suggested action, plain language>",
  "confidence": 0.0,
  "evidenceRef": [],
  "scope":      "this-turn|next-turn|both"
}
```

### Field contract

| Field | Type | Required | Contract |
|---|---|---|---|
| `id` | UUIDv4 | yes | unique per emission |
| `turnId` | string | yes | identifies the main-session turn this note annotates |
| `laneId` | string | yes | identifies the dispatch lane if the turn ran through mure |
| `model` | string | yes | exact model string (e.g. `anthropic/claude-sonnet-5`) |
| `tier` | enum | yes | `watcher` (always-on Tier 1) or `heavy` (escalation Tier 2) |
| `severity` | enum | yes | `info` → neutral, `watch` → heads-up, `warn` → likely problem, `block` → would have blocked if authority allowed |
| `summary` | string ≤140 | yes | one-liner the operator can scan in a list |
| `nextMove` | string | yes | concrete next action; empty string only if `severity=info` |
| `confidence` | float | yes | 0.0 (wild guess) – 1.0 (verified). Use 3 decimals. |
| `evidenceRef` | array | yes | array of `{kind: "file:line" \| "url" \| "trace", value: "..."}`; empty if no citation |
| `scope` | enum | yes | where this note applies |

### Scope semantics

- `this-turn` — visible annotation only (operator sees it; chat model already replied).
- `next-turn` — injected into chat-model context for the next turn (via additionalContext, like `directive-guard.mjs`).
- `both` — visible + injected.

The annotation is post-hoc by default (the chat model has already responded). The injection is one-turn-lagged (the chat model sees it on its NEXT turn, not this one).

---

## 2. Severity ladder

- `info` — quiet observation; no `nextMove`.
- `watch` — heads-up; minor issue; `nextMove` optional.
- `warn` — likely problem; `nextMove` required.
- `block` — would have blocked if A.3 authority allowed; `nextMove` required; always `scope: both`.

`block` is purely declarative for the operator's record; the chat model has already replied. The advisor never actually blocks.

---

## 3. Worked examples

### Example A — watcher, info (cheap tier)

```json
{
  "id": "9e2c...",
  "turnId": "t-2026-07-09T11:30:00Z-001",
  "laneId": "main",
  "model": "anthropic/claude-sonnet-5",
  "tier": "watcher",
  "severity": "info",
  "summary": "Conventions cited correctly; no checks warranted this turn.",
  "nextMove": "",
  "confidence": 0.94,
  "evidenceRef": [],
  "scope": "this-turn"
}
```

### Example B — watcher escalation, warn (cheap tier → routes to heavy)

```json
{
  "id": "f1a8...",
  "turnId": "t-2026-07-09T11:42:00Z-003",
  "laneId": "main",
  "model": "anthropic/claude-sonnet-5",
  "tier": "watcher",
  "severity": "warn",
  "summary": "Draft reply claims Fable-5 is available; export-control risk flagged in model-audit.",
  "nextMove": "Escalate to heavy advisor (Opus 4.8) — verify current access before finalizing.",
  "confidence": 0.81,
  "evidenceRef": [{"kind":"file:line","value":"_SYSTEM/research/model-audit-2026-07-09.md:L8-L12"}],
  "scope": "next-turn"
}
```

### Example C — heavy advisor, block-equivalent (declarative)

```json
{
  "id": "0bc7...",
  "turnId": "t-2026-07-09T11:42:00Z-003",
  "laneId": "main",
  "model": "anthropic/claude-opus-4-8",
  "tier": "heavy",
  "severity": "block",
  "summary": "Draft claims to write to .env while main session had an unprotected edit-bypass hook last week. Path is on the protected list.",
  "nextMove": "Operator: confirm scope of intended write before issuing follow-up turn.",
  "confidence": 0.97,
  "evidenceRef": [
    {"kind":"file:line","value":".claude/hooks/pre-tool-use.js:L42-L58"},
    {"kind":"file:line","value":"SOUL.md:Core Truths #4"}
  ],
  "scope": "both"
}
```

---

## 4. Integration contract

### 4.1 Emission (production runtime)

The `post-assistant-turn` hook (item 2 in the sequencing) writes each emission to:
- `memory/advisor-notes/<turnId>-<noteId>.json` (one file per note)
- `memory/advisor-notes/index.jsonl` (one line per emission for fast scan)
- The `prediction-ledger` (`_SYSTEM/state/prediction-ledger.jsonl`) at the path `_SYSTEM/research/...` or wherever the existing ledger lives.

### 4.2 Visualization (operator UX)

The mure status command (`mure.mjs --advisor-status`) and a future GUI both consume `memory/advisor-notes/index.jsonl` and present:
- Last N notes per turn, in reverse-chronological
- Filterable by severity, tier, scope
- Confidence distribution (simple histogram)
- Per-model note-rate + escalation-rate

### 4.3 Injection (next-turn context)

For every note with `scope: next-turn` or `scope: both`, the next chat-model turn's `additionalContext` field gets a deterministic block:

```
<advisor-context turn="<turnId>" model="<model>" severity="<sev>" confidence="<conf>">
<summary>
</summary>
<nextMove>
</nextMove>
<evidence>
- file:line
- url
</evidence>
</advisor-context>
```

Notes with `confidence < 0.5` are NOT injected (operator signal-too-noisy). Threshold lives in `mure-advisor` config as `injectionFloor` (default 0.5).

### 4.4 Calibration (long-running)

Every note feeds the calibrator (`mure-calibrator`) — see Brier scoring in opus-fleet doctrine. The calibrator tracks:
- Watcher escalation rate (should be 5-15% of turns; > 30% = over-conservative, < 3% = under-skeptical)
- Heavy advisor note acceptance rate (operator adopts the `nextMove`?)
- Per-model precision/recall over time
- Confidence calibration (notes with `confidence=0.9` should be right 90% of the time)

Outputs feed the role-variant matrix's MLP re-ranker.

---

## 5. Anti-patterns (the schema rejects these)

- **No free-form prose notes.** If the advisor model wants to write a paragraph, it must structure it into summary/nextMove/evidenceRef first.
- **No severity inflation.** `block` is for "actually dangerous if uncaught"; misuse degrades the operator's trust.
- **No zero-evidence `warn` or higher.** Every `warn` and `block` note must cite at least one `evidenceRef`. `info` and `watch` may omit.
- **No duplicate `nextMove` across notes on the same turn.** If two notes on one turn say "add citations", consolidate into the highest-severity one.
- **No silent failures.** Every emission is logged; every log line has a parseable schema.

---

## 6. Versioning

- v1.0.0 — published 2026-07-09; current.
- v1.0.x — bug-fix releases; backwards-compatible.
- v1.1+ — additive (new optional fields like `tags[]`, `relatedTurns[]`); breaking changes bump major.

Each emission should record the schema version used (`schemaVersion` field — to be added in v1.1).

---

## 7. Budget governance (advisory, 2026-07-09)

Cross-references the `mure-advisor` skill §Budget.

### 7.1 DeepSeek direct API daily cap

**Max $1.0–1.5 USD per day** combined across DeepSeek V4-Pro Think Max and V4-Flash direct dispatches (owner directive 2026-07-09).

Default cap: **$1.25/day**. The dispatcher enforces this at the dispatch layer:
- **80% of cap:** dispatch continues, but emits a `deepseek-cap-warning` event and surfaces a `watch`-severity advisor note (model="<eligible>", scope=this-turn, nextMove="consider capping or downgrading").
- **100% of cap:** refuses new DeepSeek dispatches; falls back to next eligible model in the chain (GLM-5.2 → M3 for heavy; Haiku → M3 for watcher cheap).

Per-dispatch row in `_SYSTEM/state/deepseek-burn.jsonl`:

```json
{
  "ts":             "<iso>",
  "model":          "<model>",
  "tokens_in":      N,
  "tokens_out":     N,
  "usd":            X.NN,
  "balance_usd":    X.NN,
  "cap_usd":        1.25,
  "action":         "dispatch|fallback|refuse"
}
```

### 7.2 Per-tier burn reporting

| Tier | Models | Default daily cap | Default weekly cap |
|---|---|---|---|
| Heavy / apex | Opus 4.8, DVP-Think, GLM-5.2, M3 | operator-tuned | operator-tuned |
| Direct-deepseek | DVP-Pro, DVF via `api.deepseek.com/v1` | **$1.25 (hard)** | operator-tuned |
| Medium | Sonnet 5, GLM-5.1, M2.7 | operator-tuned | operator-tuned |
| Cheap | Haiku, DVF (when uncapped), GLM-5-turbo, M2.7-highspeed | operator-tuned | operator-tuned |

Burn totals surfaced via `mure.mjs --burn-report` and the operator GUI dashboard.

## 8. Source of truth

The schema is canonicalized by the `mure-advisor` skill once it is applied. Until then, this document is the source of truth and any disagreement resolves here.
