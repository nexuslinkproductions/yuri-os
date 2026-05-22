# YURI Kagami Claude/Codex Control Domain

Date: 2026-05-22  
Status: domain contract v1  
Scope: Kagami as the operator control plane for Codex, Claude Code, Shintai, NIM lanes, memory, automation, and AI cybersecurity proof work.

## Thesis

YURI is not trying to become a louder terminal. The useful shape is a symbiotic cybersecurity operating system where Kagami owns the operating loop:

`user intent -> goal binding -> evidence gate -> authorization -> lane dispatch -> streamed work -> Codex verification -> proof -> memory proposal`

That loop is the missing domain. Rick is the operator surface. Claude Code and Codex are high-power implementation units. Shintai and NIM lanes challenge, critique, and specialize. Kagami must be the ownerless control plane that keeps them from becoming scattered tools.

## Boundary

The domain name is `kagami-control`.

Kagami owns:
- Intake, goal binding, evidence gates, and task-tier classification.
- Lane selection across Codex, Claude Opus, DeepSeek, Shintai, and NIM.
- Authorization state for cybersecurity work.
- YURI-owned event history, decision ledger, session registry, and proof promotion.
- Verification orchestration and handoff.

Kagami does not own:
- Claude's private runtime files.
- Raw protected data.
- Final unverified code trust.
- Blind external cyber activity.
- Git pushes.

Claude Code can become a real co-main coding partner, but not an unchecked owner. Codex/main still verifies every mutation before it becomes trusted YURI state.

## Role Split

| Unit | Authority | Work |
| --- | --- | --- |
| Kagami | operator kernel | Route, gate, record, authorize, verify, hand off |
| Codex/main | final implementation arbiter | Apply reviewed changes, run tests, resolve contradictions, commit when authorized |
| Claude Opus co-main | long-context architect/coder | Deep architecture, scoped code, contradiction synthesis, patch proposals |
| DeepSeek | synthesis/EOT workhorse | Root-cause synthesis, micro-EOT, threat-intel compression, cheap deep reasoning |
| Shintai/NIM | advisory council | Specialist fan-out, adversarial critique, regional intel, guardrail pressure tests |
| Memory kernel | retrieval broker | Recall with provenance, propose memory writes, promote only after verification |
| Automation kernel | lifecycle spine | launchd health, tmux workers, PONG probes, stale-agent repair |

## Canonical State

Canonical state moves to YURI-owned runtime paths:

`_SYSTEM/state/kagami-control/`

Expected files:
- `events.jsonl`
- `sessions.json`
- `findings.jsonl`
- `decision-ledger.jsonl`
- `cost-ledger.jsonl`
- `lane-health.json`
- `engagements/index.json`
- `proofs/index.json`

The important rule: `.claude/state/` is compatibility runtime only. It can be mirrored for Claude Code if an old hook still needs it, but it must not be the canonical YURI event bus.

## Claude Code Bridge

Claude should be wired as a continuous lane, not as a one-shot novelty.

The bridge should:
- Attach to the existing Claude Code lane through tmux or a PTY supervisor.
- Reuse a named session such as `yuri-opus-comain`.
- Wake cheaply, then escalate to Opus only when tier, budget, and context justify it.
- Send structured control packets containing objective, allowed files, forbidden paths, acceptance criteria, and verification owner.
- Stream deltas back into Kagami events.
- Track cost and freeze escalation when budget thresholds are hit.
- Require Codex/main verification before any Claude-produced code is trusted.

The stable packet rule:

```text
Claude Opus may co-build. Codex/main verifies. Kagami records. Protected runtime stays sealed.
```

## Cybersecurity Operating Model

Cyber work needs a harder route than normal product work.

Pipeline:

`intake -> classify -> authorize -> scope-bind -> evidence-gate -> dispatch -> lab-or-scan -> verify -> proof-package -> client-ready-output -> memory-proposal`

Defensive research and owned labs can run locally. Anything involving a third-party system, client asset, scan, exploit, phishing simulation, DDoS/load test, malware behavior, or red-team style action needs an engagement record first.

The engagement record should capture:
- Target and asset scope.
- Authorization source.
- Expiry.
- Allowed techniques.
- Explicit exclusions.
- Reporting recipient.
- Safe rollback or stop condition.

This is not bureaucracy. It is how YURI becomes credible to serious cybersecurity people without drifting into folklore or uncontrolled action.

## Event Model

Core event kinds:
- `INTAKE_RECORDED`
- `GOAL_BOUND`
- `EVIDENCE_GATE_PASSED`
- `AUTHORIZATION_REQUIRED`
- `ENGAGEMENT_SCOPE_BOUND`
- `LANE_HEALTH_PREFLIGHT`
- `CONTEXT_PACKET_BUILT`
- `LANE_DISPATCHED`
- `LANE_OUTPUT_DELTA`
- `PATCH_PROPOSED`
- `CODEX_VERIFICATION_STARTED`
- `CODEX_VERIFICATION_PASSED`
- `CODEX_VERIFICATION_FAILED`
- `MEMORY_CANDIDATE_PROPOSED`
- `PROOF_ARTIFACT_PROMOTED`
- `COST_GOVERNOR_TRIPPED`
- `HANDOFF_RECORDED`

Minimum event shape:

```json
{
  "id": "evt_...",
  "ts": "2026-05-22T00:00:00.000Z",
  "kind": "LANE_DISPATCHED",
  "goalId": "goal_...",
  "lane": "claude-opus-comain",
  "sessionId": "yuri-opus-comain",
  "parentId": "evt_...",
  "evidenceRefs": ["_SYSTEM/docs/..."],
  "signedBy": "kagami"
}
```

## Commands

| Command | Purpose |
| --- | --- |
| `/goal` | Bind the active objective, evidence, and exit criteria |
| `/claude wake` | Attach or resume Claude Code without heavy escalation |
| `/claude opus` | Escalate a scoped packet to Opus co-main when budget allows |
| `/claude send` | Send a bounded packet and stream events back |
| `/codex review` | Force Codex/main verification of an advisor or Claude output |
| `/shintai deploy` | Assemble task-fit council from roster, health, and evidence |
| `/verify` | Run the current goal's verification gate |
| `/release` | Promote verified artifacts and optionally commit |
| `/eot` | Run DeepSeek-backed reflection and memory proposal |
| `/handoff` | Record continuation state |
| `/cost` | Show token and lane-budget state |

## Implementation Waves

1. Event bus: add append-only YURI event bus and session registry.
2. Claude bridge: attach Claude Code through reusable PTY/tmux sessions and stream deltas.
3. Session controller: make Kagami the entry point for `/goal`, dispatch, handoff, and verification.
4. Worker migration: move worker bridge writes away from `.claude/state/` as canonical state.
5. Rick/Kagami UI: show phase, first-token wait, cost, and verification state.
6. Cost governor: gate Opus, Codex, and paid routes by tier and budget.
7. Cyber pilot mode: connect Security Lens, Cyber Lab Harness, Guardrail Proof, and client reporting.
8. Release and memory: promote source, proof, and memory candidates through one gate.

## Immediate Contradictions To Resolve

- `worker-bridge.mjs` still writes pulse events to `.claude/state/pulse-bus.jsonl`; Kagami needs a YURI-owned event bus first.
- `claude-opus-audit` is a stale name for a co-main lane; keep it as an alias, make `claude-opus-comain` canonical.
- Rick, worker tmux, and `Scripts/ai` are three dispatch surfaces; Kagami must become the arbiter over all three.
- DeepSeek dispatch should not force CLI `--tools`; prompts should mention expected tools and skills instead.
- Cybersecurity work needs explicit engagement scope before touching external assets.

## Tests To Lock The Domain

- Canonical Kagami state rejects `.claude/state/`, `.claude/history/`, `backend/data/`, `.env`, `node_modules/`, and `.amp/`.
- A Claude control packet always carries forbidden paths, no-commit, no-push, cost-governor, and Codex verification rails.
- A critical cybersecurity task returns `engagement-required` before execution.
- A structural control-plane task can route to Claude Opus co-main, but still requires Codex verification.
- The prompt summary contains no ENKI alias and no `codex-spark` fallback.
- Worker migration tests prove no new canonical runtime state is written under Claude runtime paths.

## Next Move

Build the event bus first. Without it, every other improvement stays aesthetic. With it, Kagami can finally see the whole loop: who asked, what evidence loaded, which lane moved, what changed, what passed verification, what became memory, and what is safe to show a client.
