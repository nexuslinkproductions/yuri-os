# ICM Methodology — Interpretable Context Methodology

> The file system is memory. Structure is thinking. Version history is growth.

## What Is ICM

Interpretable Context Methodology (Jake Van Clief) is a personal knowledge and productivity architecture that treats **file structure as cognitive architecture**. It's not about organizing information — it's about designing the thought patterns the structure itself enforces.

Core principles:

1. **Folders are thinking patterns.** A folder named `DECISIONS` forces a decision mindset. A folder named `REFERENCES` encourages passive consumption. The name and structure *cause* behavior.

2. **Memory = file system.** Externalize everything. Your brain is for processing, not for holding state. If it's not in a file, it doesn't exist.

3. **Version history is learning.** The difference between `draft.md` and `final.md` contains more signal than either file alone. Track iterations, not just outputs.

4. **Architecture over category.** Categories just sort things. Architecture *routes thinking* through a designed sequence of mental operations. Example: `GOALS/` is a category; `01_VISION → 02_PRIORITIES → 03_ACTIONS` is an architecture.

## How Folders Enforce Thinking

Bad folder: `Templates/` — a dumping ground. Nothing enforces a thought process.

Good folder: `01_FRAMEWORKS/icm-methodology.md` — naming tells you this is a template to be *applied*, not just stored.

**The naming convention matters:**
- `01_` prefix = ordered sequence (think before you act)
- `README.md` in every directory = the map, read before entering
- Verb-heavy names (`DECIDE`, `APPROVE`, `REVIEW`) = action orientation
- Noun-heavy names (`NOTES`, `REFERENCES`, `ARCHIVE`) = passive orientation

## The 3-Layer Architecture

ICM organizes all content into three processing layers:

### Layer 1: RAW (Inbox / Capture)
```
/SELF-IMPROVEMENT/02_EXTRACT/          ← failure events as they happen
/KNOWLEDGE-BASE/00_INBOX/               ← anything interesting, unsorted
```
- No structure. No categories. Just timestamped files.
- Purpose: get it out of your head, fast.
- Rule: Anything that stays in RAW > 7 days is either DONE or LOST.

### Layer 2: PROCESSED (Structured / Sorted)
```
/SELF-IMPROVEMENT/00_VESSEL/           ← mental models, encoded (Layer 2)
/SELF-IMPROVEMENT/01_RHYTHM/           ← practices & protocols (Layer 1/2 hybrid)
/SELF-IMPROVEMENT/02_EXTRACT/          ← processed learnings (Layer 2)
/SELF-IMPROVEMENT/03_GAZE/             ← metrics & vision (Layer 3)
```
- Structure is added: categorization, cross-referencing, metadata.
- Purpose: make it retrievable. Make it usable.
- Rule: If it can't help you make a decision in < 2 minutes, it's not processed — it's just stored.

### Layer 3: SYNTHESIZED (Integrated / Applied)
```
/_SYSTEM/OS_KERNEL/memory.db            ← cross-domain integration
/KNOWLEDGE-BASE/04_SYNTHESIS/           ← domain-spanning insights
```
- Connections between previously separate domains.
- Emergent patterns. New frameworks.
- Purpose: compound insight. The value of the whole system exceeds the sum of its parts.
- Rule: Synthesis only counts if it changes behavior. If it doesn't affect a decision, it's decoration.

```
RAW ──→ PROCESSED ──→ SYNTHESIZED
↓                        ↓
capture                 behavior change
(low effort)            (highest value)
```

## When to Use ICM

| Use ICM For | Use Other Frameworks For |
|-------------|-------------------------|
| Personal knowledge architecture | Team-wide knowledge systems |
| Solo agent-human collaboration | Scaling to multiple humans |
| High-context, pattern-rich domains | Low-context, high-volume data |
| Creative + technical hybrid work | Pure data management (databases) |
| Iterative improvement over time | One-time publishing |

## When Not to Use ICM

- **Large teams:** The architecture works best with one or two agents. Too many contributors creates architecture drift.
- **Regulated environments:** ICM doesn't have audit trails or access control built in. Use a proper DMS.
- **Pure storage:** If you never revisit or process inputs, you just have a well-organized junk drawer. Use a search tool instead.

## ICM and NUDIMMUD

This SELF-IMPROVEMENT directory is an ICM-systems directory — it's designed as an architecture, not an archive.

```
00_VESSEL/    ← Layer 2 (processed mental models)
01_RHYTHM/    ← Layer 1/2 (practices & protocols)
02_EXTRACT/   ← Layer 2 (processed learnings & failures)
03_GAZE/      ← Layer 3 (synthesis — metrics, vision, quarterly review)
```

Each subdirectory has a README that explains the thought pattern it enforces. Walk through them in order. The architecture is the process.

## Key Practice: File First, Act Second

Before any decision:
1. Open the relevant framework file in `00_VESSEL/`
2. Run the process it describes
3. File the outcome in the appropriate location (01_RHYTHM/ for practices, 02_EXTRACT/ for learnings, 03_GAZE/ for tracking)

The file system is memory. If it's not filed, it didn't happen — and it can't compound.
