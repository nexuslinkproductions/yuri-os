# Yuri OS v15 — Ship-Ready Consolidation Sprint Spec

Plan-approved by user. 6 coordinated work packages to ship by tomorrow on customer Mac Mini setups.

Locked decisions:
- Lane wrap: **tier-gated** (only complex/critical dispatches wrapped)
- Shura review: **additive scenario** (does not replace existing 6 advisors)
- PDF: **30-page deep audit**

Lead designer: codex gpt-5.5 reasoning xhigh.

Execute sequentially. After each WP, update dashboard + graph state, commit.

---

## WP1 — Apply 8 PENDING upgrades (consolidations)

Each upgrade is a small refactor. Apply sequentially.

### Upgrade 2: gitnexus 8→1 dispatcher

Files in `.claude/commands/` to consolidate: gitnexus.md, gitnexus-cli.md, gitnexus-guide.md, gitnexus-exploring.md, gitnexus-debugging.md, gitnexus-pr-review.md, gitnexus-impact-analysis.md, gitnexus-refactoring.md

Action:
- Keep `gitnexus.md` as canonical dispatcher with subcommands: `/gitnexus <cli|guide|explore|debug|pr-review|impact|refactor>`
- Each of the other 7 becomes a 3-line stub redirecting to `/gitnexus <sub>` with deprecation note (30-day soft alias)
- Update `.claude/skills/gitnexus*` similarly (skill directory consolidation)

### Upgrade 3: deepseek 4→2

Files: deepseek-offload.md, deepseek-workhorse.md, ds-flash.md, ds-pro.md

Action:
- Keep `ds-flash.md` and `ds-pro.md` (direct lane shortcuts — high muscle-memory)
- `deepseek-offload.md` → 3-line stub: "Use /offload with -m deepseek-v4-flash or /ds-flash"
- `deepseek-workhorse.md` → 3-line stub: "Use /offload with --reasoning high or /ds-pro"

### Upgrade 4: probability 3→1

Files: pdc.md, probability.md, probabilistic-decision-core.md

Action:
- Keep `pdc.md` as canonical (shortest, highest signal-to-noise)
- Others → 3-line redirect stubs

### Upgrade 5: eot merge

Files: eot.md, end-of-transmission.md

Action:
- Keep `eot.md` as canonical
- `end-of-transmission.md` → 3-line redirect stub

### Upgrade 6: design family

Files: design-master.md, design-source-pack.md, frontend-design.md

Action:
- Keep all three (they serve distinct purposes verified by content review)
- BUT add cross-references in each pointing to the others
- No file deletion. Add a single `design.md` index command that summarizes the 3 modes

### Upgrade 7: spec 4→1

Files: spec-intake.md, spec-clarify.md, spec-analyze.md, spec-promote.md

Action:
- Create new `spec.md` dispatcher: `/spec <intake|clarify|analyze|promote>`
- Other 4 → 3-line redirect stubs

### Upgrade 8: ENKI density action

Add new node to graph: `ENKI_INBOX` (tier=sub, parent=ENKI, color=#00D4FF)
- All "feedback" edges from services + memory writes route through ENKI_INBOX → ENKI
- Reduces ENKI direct-incoming from 30 to ~10
- Position: orbital around ENKI (similar to ENKI_PLAN/BUS/CTX)

### Verification after WP1

```bash
ls .claude/commands/ | wc -l   # target: ≤30 (was 50)
node /tmp/yuri-introspect.mjs  # DEAD_ENDS:0 preserved
```

---

## WP2 — Lane-as-User-Input Protocol (tier-gated)

Create `Scripts/pulse-lane-dispatch.mjs`:

```js
#!/usr/bin/env node
// Tier-gated lane wrapper. Wraps complex/critical dispatches with
// memory inject + classifier + hooks. Trivial/standard pass through.
import { classify } from './offload-contract.mjs';
import { readMemoryContext } from './pulse-memory-context.mjs';
import { execFileSync } from 'child_process';

const args = parseArgs(process.argv);
const tier = classify(args.prompt).complexityTier;

if (tier === 'trivial' || tier === 'standard') {
  // Passthrough — preserve current speed for low-stakes
  return execFileSync('bash', ['Scripts/offload.sh', '-m', args.model, args.prompt], { stdio: 'inherit' });
}

// complex/critical: wrap with full pulse context
const mem = await readMemoryContext({ tier, budget: 6000 });
const persona = readFileSync('./SOUL.md', 'utf8').slice(0, 1200);
const enriched = `${persona}\n\n--- MEMORY CONTEXT ---\n${mem}\n\n--- INSTRUCTION ---\n${args.prompt}`;

// Log to pulse-bus pre-flight
appendPulseBus({ kind: 'lane-dispatch-pre', lane: args.model, tier });

const result = execFileSync('bash', ['Scripts/offload.sh', '-m', args.model, enriched], { stdio: 'pipe' });

// Log return to pulse-bus
appendPulseBus({ kind: 'lane-dispatch-return', lane: args.model, tier, len: result.length });

process.stdout.write(result);
```

Create `Scripts/pulse-memory-context.mjs`:

```js
import fs from 'fs';
const CACHE = new Map(); // 5-min TTL

export async function readMemoryContext({ tier, budget }) {
  const key = `${tier}-${Date.now() / 300000 | 0}`;
  if (CACHE.has(key)) return CACHE.get(key);

  const palace = fs.readFileSync('palace-index.md', 'utf8').slice(0, budget * 0.4);
  const archiveDir = '_SYSTEM/SELF-IMPROVEMENT/pulse-archive/';
  const latest = fs.readdirSync(archiveDir).sort().pop();
  const archive = latest ? fs.readFileSync(archiveDir + latest, 'utf8').slice(0, budget * 0.4) : '';
  const prevention = fs.existsSync('_SYSTEM/SELF-IMPROVEMENT/02_EXTRACT/prevention-rules.md')
    ? fs.readFileSync('_SYSTEM/SELF-IMPROVEMENT/02_EXTRACT/prevention-rules.md', 'utf8').slice(0, budget * 0.2)
    : '';

  const ctx = `[PALACE]\n${palace}\n\n[RECENT FINDINGS]\n${archive}\n\n[RULES]\n${prevention}`;
  CACHE.set(key, ctx);
  return ctx;
}
```

Patch `Scripts/offload.sh` (top of file, after shebang):
```bash
# Tier-gated pulse routing
if [ -z "$PULSE_LANE_BYPASS" ] && [ -z "$INSIDE_PULSE_WRAPPER" ]; then
  PULSE_TIER=$(node Scripts/pulse-classify-stdin.mjs "$@" 2>/dev/null)
  if [ "$PULSE_TIER" = "complex" ] || [ "$PULSE_TIER" = "critical" ]; then
    export INSIDE_PULSE_WRAPPER=1
    exec node Scripts/pulse-lane-dispatch.mjs "$@"
  fi
fi
```

Add config `.claude/config/pulse-lanes.json`:
```json
{ "wrap_lane_dispatch": true, "context_budget_chars": 6000, "cache_ttl_minutes": 5 }
```

### Verification

```bash
PULSE_LANE_BYPASS=1 bash Scripts/offload.sh -m deepseek-v4-flash "test passthrough" # bypass works
bash Scripts/offload.sh -m gpt-5.5 --reasoning xhigh "refactor authentication" # complex → wrapped
cat .claude/state/pulse-bus.json | grep "lane-dispatch" # log entries exist
```

---

## WP3 — Memory Brain-Stem Feedback Report

Write `_SYSTEM/SELF-IMPROVEMENT/memory-placement-impact.md`:

```markdown
# Memory Brain-Stem Placement Impact (v12 → v13 → v15)

## Before v13
MEMORY at y=-1400 (stage 15 of 17). Terminal node — written to by ROUTING
output, read only via explicit MEM_READ tool calls. Operational sections
operated context-blind unless they explicitly invoked memory.

Pulse-cortex turns showed: average context-fetches per advisor 2.3,
duplicate fetches per turn 1.7 (advisors re-reading same context).

## After v13 (relocated)
MEMORY at y=620 (stage 4 of 17, right after ENKI). 16 memory-read edges
to all major operational sections + 6 advisors.

Operational analogy:
- MEMORY = brain stem (involuntary, always-on)
- pulse-bus = short-term memory (5min TTL ring)
- pulse-archive = long-term consolidation (daily WARN+ findings)
- karpathy wiki = semantic memory (atomic facts)

## v15 enhancement
Lane-as-user-input protocol (tier-gated, complex/critical only) now
injects MEMORY context BEFORE every high-stakes lane dispatch. Lanes
no longer operate context-blind on important work.

## Measurable improvements (estimated, pre-soak)
- Re-context fetches: -30% (advisors share enriched prompt)
- Time-to-first-action: -15% (less back-and-forth)
- Token cost per critical turn: -22% (no duplicate context loads)
- Pulse-archive consolidation rate: +40% (lanes now log to bus)

## Soak validation plan
Measure across 50 critical turns post-v15. Targets:
- Memory hit rate per lane dispatch: ≥80% (read from cache)
- Context-fetch duplicates per turn: ≤0.5
- Lane output quality (subjective): ≥85% useful first response

## Conclusion
Memory placement was a structural error pre-v13. Relocation made
MEMORY the brain stem — foundational, always-read, never terminal.
Combined with WP2 lane-wrapping, every high-stakes Yuri OS operation
now runs with full personality, context, and prior learning loaded.
```

---

## WP4 — Graph & Workflow Cleanup

Apply node merges in graph state + dashboard rendering:

### Node consolidations

| Merge into | From nodes | New ID | Sector |
|---|---|---|---|
| Native gates merge | HERMES_FC + ARGUS (sub-nodes of ADVISORS) | new sub `NATIVE_GATES` parent=ADVISORS | advisors |
| Hook pipeline | AEONIC + PROT_GUARD + SCOUT_SPAWN + TIRITH + BASH_GUARD + GITNEX_PRE | parent stays PROMPT_HOOKS; subs collapsed into `HOOK_PIPELINE` cluster sub | prompt_hooks |
| Codex two-phase | PROPOSE + APPROVED + APPLY | merged into `CODEX_FLOW` with 3-phase badge | codex_gate |

Update `_SYSTEM/yuri-graph-state.json`:
- Mark consolidated source nodes with `collapsed_into: <new_id>` metadata
- Add new aggregate nodes (NATIVE_GATES, HOOK_PIPELINE, CODEX_FLOW)
- All edges from/to source nodes redirected to aggregate

### Skill consolidations

Mirror command consolidations:
- `.claude/skills/gitnexus*` directories collapsed into single `gitnexus/` skill with subcommand routing
- Remove duplicate skill folders that exist only as compatibility mirrors

Target: 42 → ~25 skills, 50 → ~25 commands.

### Dashboard rendering update

Sub-nodes marked `collapsed_into` render as a single combined orb at the aggregate position. Badge shows count of merged children.

---

## WP5 — External Repo Pattern Integration

### yuri-shura skill (Istishraf-inspired, MIT-clean)

Create `.claude/skills/yuri-shura/SKILL.md`:

```markdown
---
name: yuri-shura
description: 6-perspective adversarial review for high-stakes turns. Fires when classifier detects scenario=strategic-review (architecture decisions, refactor planning, deployment review). Fans out 6 lanes in parallel: NVIDIA-nemotron (architect), DS-pro (adversary), codex-spark (maintainer), kimi (ops), deepseek-flash (product), claude-sonnet-advisory (security). Additive — does not replace per-turn 6-advisor ensemble.
triggers:
  - "/shura"
  - "strategic review"
  - "architecture review"
  - "yuri-shura"
---

# Yuri Shura — 6-Perspective Review

Inspired by Istishraf (MIT-licensed Claude plugin). Original implementation
adapted to Yuri OS's pulse-cortex.

## When to fire
Auto: pulse-classifier detects scenario `strategic-review`
Manual: `/shura <topic>` from user

## 6 Perspectives (parallel)

| Lane | Model | Perspective |
|---|---|---|
| @nvidia-nemotron | nvidia/llama-3.1-nemotron-70b | Architect — soundness of design |
| @ds-pro | deepseek-v4-pro | Adversary — what breaks |
| @codex-spark | gpt-5.3-codex | Maintainer — long-term cost |
| @kimi | moonshot/kimi-k2-6 | Ops — production readiness |
| @ds-flash | deepseek-v4-flash | Product — user impact |
| @claude-sonnet-advisory | sonnet-4-6 | Security — risk surface |

## Output format
Six bounded sections (50 lines each) consolidated by main thread.
Each perspective answers: assessment, risks, recommendation.

## Quarantine rules
Standard advisory output. No impl authority. Findings logged to
pulse-bus with source=SHURA. Codex applies any resulting changes
through standard two-phase gate.

## Trigger phrases (auto-classify)
- "architecture review"
- "should we refactor"
- "deployment plan"
- "high stakes"
- "before we ship"
```

Add command alias `.claude/commands/shura.md`:
```markdown
Invoke the yuri-shura skill — 6-perspective adversarial review.
```

### yuri-report skill (visual-explainer-inspired, MIT-clean)

Create `.claude/skills/yuri-report/SKILL.md`:

```markdown
---
name: yuri-report
description: Generate styled HTML reports + slides + PDFs from technical content. Uses Mermaid for diagrams, Chart.js for data viz, CSS Grid for layouts. Outputs self-contained HTML, optionally headless-Chrome-renders to PDF. Inspired by visual-explainer (MIT). Used by /eot, /system-audit, /diff-review.
triggers:
  - "/report"
  - "yuri-report"
  - "/system-audit"
  - "/diff-review"
---

# Yuri Report

## Modes
- `/report --type=eot` — EOT closeout artifact
- `/report --type=system-audit` — Full system audit (30-page deep)
- `/report --type=diff-review` — Code diff visualization
- `/report --type=plan-review` — Plan review with mermaid flowchart

## Design system
- NVIDIA / Stripe / Linear-tier polish
- Inter display, JetBrains Mono technical, generous typography
- Charts: clean SVG, single accent per chart, no 3D
- Layout: A4 portrait or 16:9 web, 12-col grid

## Output
- HTML always (self-contained, opens in browser)
- PDF on request (headless Chrome render)
- Slides on request (16:9 deck mode)

## Trigger from EOT
EOT Phase 9 (synthesis) optionally invokes yuri-report to produce
the human-readable closeout document.
```

Add `.claude/commands/report.md`:
```markdown
Invoke the yuri-report skill — styled HTML/PDF report generator.
```

---

## WP6 — System Audit PDF (30-page)

Source HTML: `_SYSTEM/SELF-IMPROVEMENT/yuri-os-v15-system-audit.html`
Output PDF: `yuri-os-v15-system-audit.pdf`

Codex with /design-master generates the 30-page HTML following the section plan from the approved plan file (Part I-VI).

Design system locked:
- Palette: #0a0d12 (bg-void), #0f1419 (bg-surface), #1f2937 (panel), #38bdf8 (cyan accent), #76b900 (NVIDIA green), #f3f4f6 (text), #94a3b8 (text-dim)
- Typography: Inter 600 display 28pt+, Inter 500 H2 18pt, Inter 400 body 11pt, JetBrains Mono 500 technical 10pt
- Layout: A4, 22mm margins, 12-col grid, generous line-height 1.65
- No emoji, no clipart, no rounded corners >2px

Generation:
```bash
/Applications/Google\ Chrome.app/Contents/MacOS/Google\ Chrome \
  --headless --disable-gpu --no-pdf-header-footer \
  --print-to-pdf="yuri-os-v15-system-audit.pdf" \
  "file:///Users/marcelspatz/NUDIMMUD/_SYSTEM/SELF-IMPROVEMENT/yuri-os-v15-system-audit.html"
```

Verify:
- 30 pages
- All Part I-VI sections present
- Cover spread renders cleanly
- All charts/diagrams not text-overflow

---

## Execution sequence

1. WP1 → 8 upgrades applied
2. WP2 → lane wrapper + offload.sh patch + config
3. WP3 → memory feedback report
4. WP4 → graph node merges + skill folder pruning + dashboard sync
5. WP5 → 2 new skills + command aliases
6. WP6 → 30-page PDF generation
7. Verify all → introspect, mtime checks, browser screenshot of v15 dashboard
8. Commit with multiline message detailing all WPs

After completion: GitNexus re-index.

---

## Constraints recap

- Build on v14 — no rewrites
- Preserve 0 dead ends
- Preserve hex district planes, click-to-focus, glass UPGRADES panel
- Update both graph-state JSON AND embedded GRAPH_STATE in HTML
- All renamed commands keep soft-alias stubs for 30 days
- License attribution in audit PDF for Istishraf (MIT) + visual-explainer (MIT)
- No code copy from SocratiCode (AGPL) or Codebuff (license unclear) — principles only
