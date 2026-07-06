---
name: regenerative-nexus-guard-2026-06-06
description: ADVISORY design memo (Codex NG1) for the Regenerative Nexus Guard — detects built-but-unwired YURI artifacts (orphan exports/modules, uncovered tests, unregistered math modules, alias-without-command, unwired hooks, missing circuitry nodes), computes the unwired delta, safely pre-wires deterministic cases, queues the rest for owner review. Wraps circuitry-auto-register.mjs + GitNexus.
metadata: { node_type: research, date: 2026-06-06, status: advisory-design, owner_directive: regenerative-nexus-guard }
tags: nexus_guard, unwired, conformance, regen, wiring_contracts, orphan_detection
---

> Lane: NG1 (Codex xhigh). Feeds [[regenerative-nexus-guard-vision]]. Build phasing: read-only detector first (JSON + review memo), ONE safe write in phase 2 (missing command-alias shims), everything else → owner review packet until precision proven.

**REGENERATIVE NEXUS GUARD — Research + Design Memo**

**Purpose**
A standing conformance mechanism that detects “built but not wired” YURI artifacts, computes the unwired delta, safely pre-wires deterministic cases, and queues the ambiguous/risky rest for owner review. It is not a runtime behavior mutator. It is a regeneration trigger over the circuitry/control-plane map.

**Core Definition**
An artifact is **unwired** when it exists in the built set but has no required edge in the declared wiring set.

Formal model:

```text
BuiltSet(domain)      = artifacts discovered on disk
WiredSet(domain)      = artifacts present in registries/config/manuals/graphs
ExpectedEdges(domain) = wiring contracts for that artifact class
ActualEdges(domain)   = edges found in imports, settings, graph, tests, manuals
UnwiredDelta          = BuiltSet - WiredSet OR ExpectedEdges - ActualEdges
```

Math grounding:
Graph theory: reachability, degree, connected components, entrypoint-rooted traversal.
Set theory: deterministic set difference between disk facts and registry facts.
Architecture conformance checking: expected architecture graph versus recovered architecture graph.
Control/Lyapunov framing: define wiring tension `T`; new unwired artifacts raise `T`, regeneration lowers `T`.

---

**1. Detection Taxonomy**

**A. Orphan Export**
Operational meaning: exported symbol exists but no internal module imports/calls it, no CLI/hook/test references it, and it is not declared intentionally standalone.

Detection:
Use GitNexus structural edges for imports/calls.
Use `circuitry-auto-register.mjs` symbol records for complete symbol inventory.
Compute exported symbol set minus referenced symbol set.
Flag if symbol has zero in-degree from non-test code and no contract exemption.

Math:
Directed graph in-degree.
Zero-degree symbol node.
Set difference: `Exports - ReferencedExports`.

Risk:
Some exports are public library API. Require `intentionalStandalone: true` or `publicApi: true` contract escape hatch.

**B. Orphan Module**
Operational meaning: module exists but is unreachable from known entrypoints: CLI facade, hook settings, tests, imports, package scripts, launch agents, or circuitry graph node files.

Detection:
Build module graph from imports plus GitNexus structural edges.
Seed entrypoints: `.claude/settings.json` hooks, `_SYSTEM/Scripts/ai`, CLI scripts, tests, launchd plists, package scripts, known manual entrypoints.
Run reachability.
Flag modules outside reachable component unless registered as library-only, experiment, fixture, or parked research.

Math:
Reachability from root set.
Weak/strong connected components.
Zero reachable path from entrypoint roots.

**C. Test With No `tests-cover` Edge**
Operational meaning: `.test.mjs` exists but cannot be resolved to a module by import, filename, or matcher confirmation.

Detection:
Use `resolveTestsCover(tests, modules)`.
Flag `confidence: NONE`.
Flag `MEDIUM` with mismatch separately: test claims one module but fingerprint points elsewhere.

Math:
Expected-vs-actual edge diff: every test must map to at least one covered module.
Prefix-filter matcher gives complete candidate set above threshold, so low/no confidence is meaningful.

**D. Math Module Not Registered**
Operational meaning: `_SYSTEM/Scripts/math/*.mjs` exists but is absent from `MATH-SCIENCE-MANUAL.md` and absent from `yuri-circuitry-graph.json`.

Detection:
Built set: math modules on disk, excluding tests/fixtures/private helpers if configured.
Wired set: manual registry code references plus circuitry node file references.
Flag disk math modules not mentioned in either.
Escalate if tests exist but registry/manual absent: that means implementation was promoted locally but not documented.

Math:
Set difference over normalized repo paths.
Architecture conformance: math substrate requires manual + graph registration.

**E. `/alias` Trigger With No Command File**
Operational meaning: skill frontmatter declares `/alias` in `triggers`, but `.claude/commands/<alias>.md` is absent.

Detection:
Parse skill frontmatter under `.claude/skills/` and `.agents/skills/`.
For every trigger matching `/[a-z0-9-]+`, require corresponding command file.
This is directly grounded in `skill-creation.md`.

Math:
Declared trigger set minus command file set.

Safe auto-wire:
Create minimal command shim only if the skill exists, trigger name is normalized, and target command file is absent.

Owner-gated:
If multiple skills claim the same alias, notify only.

**F. Hook Not Referenced In Settings**
Operational meaning: hook file exists under hook directories but is not referenced in `.claude/settings.json`, nor explicitly marked retired/library-only.

Detection:
Built set: `.claude/hooks/*.{js,mjs,cjs}`.
Wired set: hook paths referenced in settings.
Flag difference.
Classify as:
`unwired-new`, `retired-but-present`, `library-hook-helper`, `settings-missing`.

Math:
Set difference over canonical paths.

Owner-gated:
Never auto-add a hook to settings. Hook registration mutates behavior.

**G. New Node Absent From Circuitry Graph**
Operational meaning: source artifact appears in auto-register records or GitNexus graph but no node in `yuri-circuitry-graph.json` references its file.

Detection:
Built set: modules from `extractCircuitryRecords`.
Wired set: all `nodes[].files[]`.
Candidate new nodes: modules not represented by any node and not excluded by contract.
Similarity edges suggest layer/family, but do not authorize behavior wiring.

Math:
Set difference plus similarity-family clustering.
Prefix-filter completeness means the mechanism-family candidate set above threshold is complete.

Safe auto-wire:
Generate proposed node stubs into a review delta, not directly into canonical graph unless owner approves an add-only graph regen mode.

---

**2. Wiring Contracts**

Use a declarative contract file, likely registry-owned, not random top-level:

```json
{
  "version": 1,
  "domains": {
    "skill": {
      "discover": [".claude/skills/*/SKILL.md", ".agents/skills/*/SKILL.md"],
      "requires": [
        {"edge": "skill -> command", "when": "trigger startsWith /", "target": ".claude/commands/<alias>.md"},
        {"edge": "skill -> memory-index", "when": "significant", "target": "memory/MEMORY.md"}
      ],
      "autoWire": ["missing-command-shim"],
      "ownerGated": ["memory-index-claim", "alias-conflict"]
    },
    "mathModule": {
      "discover": ["_SYSTEM/Scripts/math/*.mjs"],
      "requires": [
        {"edge": "module -> math-manual"},
        {"edge": "module -> circuitry-node"},
        {"edge": "module -> test", "unless": "pure-data-or-helper"}
      ]
    },
    "hook": {
      "discover": [".claude/hooks/*"],
      "requires": [{"edge": "hook -> settings"}],
      "autoWire": [],
      "ownerGated": ["settings-registration"]
    },
    "test": {
      "discover": ["**/*.test.mjs"],
      "requires": [{"edge": "test -> covered-module"}]
    },
    "module": {
      "discover": ["_SYSTEM/Scripts/**/*.mjs"],
      "requires": [{"edge": "reachable-from-entrypoint OR declared-standalone"}]
    }
  }
}
```

Each contract has:
`discover`, `normalize`, `expectedEdges`, `actualEdges`, `exemptions`, `safeAutoWire`, `ownerGated`, `severity`.

This makes “should be wired” auditable instead of implicit.

---

**3. Trigger → Detect → Regen → Notify Cascade**

Recommended trigger stack:

1. **Pre-commit advisory check**
   Runs fast detection only.
   Blocks only on high-confidence contract violations that are cheap and deterministic, such as `/alias` missing command file if the commit touches that skill.

2. **Post-commit or CI regen job**
   Runs full detector:
   `circuitry-auto-register` + GitNexus structural graph + contract checks + manual/graph diff.

3. **File-watch optional local daemon**
   Useful but not root authority. It can queue checks, not mutate canonical files directly.

Cascade:

```text
change observed
→ collect built sets
→ collect wired sets
→ compute unwired delta
→ classify safe / gated / exempt / uncertain
→ apply safe pre-wires to generated delta or scaffold files
→ run verification
→ notify owner with review packet
```

Safe pre-wire boundary:
Safe:
- Scaffold missing `.claude/commands/<alias>.md` shim for an existing skill.
- Generate proposed circuitry node records into a review artifact.
- Add missing tests-cover report edges into a generated report.
- Create notification packet.
- Mark confidence/severity.

Owner-gated:
- Adding hooks to `.claude/settings.json`.
- Changing live dispatch, enforcement, routing, memory, energy, or protected-surface behavior.
- Editing canonical `yuri-circuitry-graph.json` unless explicit add-only regen approval is active.
- Declaring a module public API.
- Writing manual claims that imply proof/promotion.

Notification format:
- New artifacts detected.
- Missing required edges.
- Safe pre-wires applied.
- Owner-gated actions needed.
- False-positive candidates.
- Verification commands and results.
- Tension before/after.

---

**4. Wiring Tension Scalar**

Define:

```text
T = Σ severity(class) * confidence * ageWeight * centralityWeight * riskWeight
```

Examples:
- Missing hook settings edge: high risk, owner-gated.
- Missing command alias: low risk, safe auto-wire.
- Math module missing manual+circuitry: medium/high, documentation and graph debt.
- Orphan export: medium, depends on centrality and public API exemption.
- Test mismatch: medium/high, because proof may be attached to wrong organ.

Energy framing:
A new unwired artifact increases `T`.
A safe regen lowers `T`.
Owner review lowers `T` by wiring, exempting, retiring, or deleting.
This can feed the existing energy gate as a non-blocking observability term first, not enforcement.

---

**5. Integration Map**

**Circuitry auto-regen**
`circuitry-auto-register.mjs` supplies complete similarity/test/orphan detection over `{id,text}` records.
The guard wraps it with contracts and structural truth.

**GitNexus**
GitNexus owns structural edges: imports, calls, reads, writes.
The guard uses GitNexus for reachability and impact, while auto-register supplies similarity-family edges.

**Energy gate**
The guard emits `wiring_tension` telemetry.
Initial mode: observe only.
Later mode: warn when tension crosses threshold; never deny tool use without owner-approved enforcement policy.

**Propagation-continuity law**
Every new mechanism must propagate into:
manual/registry, circuitry graph, tests, commands/hooks if applicable, and review memory if durable.
The guard turns this from a norm into a measurable contract.

**Full-prerequisite-closure principle**
A mechanism is not “done” when the file exists.
It is done when all prerequisite edges exist or are explicitly parked.
The guard enforces closure by detecting dangling prerequisites.

---

**Hard Risks**

False positives:
Intentionally standalone experiments, fixtures, public APIs, retired relics, and libraries will look unwired.
Mitigation: explicit exemption contract with reason, owner, expiry/review date.

Auto-wiring breaks behavior:
Especially hooks/settings/routing. Mitigation: safe auto-wire excludes behavior-changing surfaces.

Notification fatigue:
If every helper becomes a warning, the owner stops reading.
Mitigation: severity scoring, batching, age threshold, and “same root cause” grouping.

Graph drift:
Auto-generated graph nodes can pollute canonical architecture.
Mitigation: generated delta first; canonical merge is owner-gated and add-only.

Matcher overconfidence:
Similarity is not structural truth.
Mitigation: similarity suggests candidate wiring; GitNexus/import/settings/manual facts decide actual wiring.

Strongest objection:
This can become another registry bureaucracy layer that reports debt faster than the system can resolve it. If the guard is noisy, it worsens the exact tension it measures. The design only works if “unwired” is contract-based, suppressible with explicit intent, and safe auto-wiring is narrow. The guard should start as a report generator plus one safe scaffold action, then earn more authority through measured precision.

**Build Recommendation**
Implement `regenerative-nexus-guard.mjs` as a read-only detector first, with JSON output and a human review memo. Add only one safe write in phase 2: missing command shims for verified skill aliases. Everything else should produce an owner review packet until precision is proven on real YURI commits.