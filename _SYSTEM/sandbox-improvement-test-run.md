# Yuri Sandbox Improvement Test Run

This file is the canonical report surface for the first Yuri sandbox operational trial.

## Objective

Create and operate a sandbox loop that improves velocity without polluting canonical state.

## Research Basis

- Codex read-only ephemeral sandbox for the first implementation.
- AgentBound-style least privilege for filesystem, network, environment, and tool capability boundaries.
- SWE-agent ACI guidance: compact feedback, simple actions, saved trajectories, and guardrails.
- Memory-poisoning research: raw agent output is tainted until verified and sanitized.
- OWASP Agent Memory Guard pattern: hash, policy, snapshot, rollback, and anomaly-aware memory handling.

## Operational Boundary

- Sandbox artifacts are non-canonical.
- Raw output must remain in per-run artifact directories.
- Canonical learning receives only sanitized summaries and raw-output hashes.
- Existing lesson review and promotion gates remain authoritative.
- Protected paths remain untouched: token-state files, `.claude/state`, `.claude/history`, `.env`, `backend/data`, secrets, and `node_modules`.

## Live Run Report

### 2026-05-09 First Operational Trial

**Result:** PASS
**Run ID:** `sandbox-20260509223540-2c2aaa`
**Mode:** `live`
**Prompt:** `first Yuri sandbox operational proving run`
**Final report:** `/Users/marcelspatz/.nudimmud/sandbox-runs/sandbox-20260509223540-2c2aaa/final-report.md`

#### Route

- Scenario: `sandbox-improvement`
- Lane: `codex-spark`
- Lifecycle verified: detect -> isolate -> self-probe -> run -> verify -> sanitize -> log -> promote-check

#### Sandbox Probe

- `probe_ok`: true
- `runner_dry_run_exit`: 0
- `dry_run_artifact_exists`: true
- `repo_status_unchanged`: true
- `probe_failures`: none

#### Verification

- `verification_ok`: true
- `route-plan-present`: PASS
- `sandbox-scenario`: PASS
- `codex-spark-lane`: PASS
- `self-probe-pass`: PASS
- `raw-output-artifact`: PASS
- `repo-status-unchanged`: PASS
- `protected-clean-after`: PASS
- `runner-not-degraded`: PASS
- `raw-output-present`: PASS

#### Learning Capture

- Learning session: `sandbox-20260509223557`
- Raw output hash: `7deb1409986a32a0d8a4ecc45d44c6c1c9fab7b55c63768174cfa8f1ca863eff`
- Raw output chars: 1604
- Raw output artifact-only: true
- Pending lesson candidates after promote-check: 2

#### Artifacts

- `run.json`
- `route-plan.json`
- `preflight.json`
- `sandbox-probe.json`
- `raw-output.md`
- `verification.json`
- `learning-summary.json`
- `live-action-report.md`
- `final-report.md`

#### Observations

- The first live run passed after tightening degradation detection to use runner status instead of scanning raw task content.
- A prior live attempt failed closed because the raw Codex transcript contained the word `unavailable`, proving the controller's failure path worked but the degradation detector was too broad.
- Raw model output did not enter canonical learning content; only the hash, artifact path, and sanitized summary were logged.
- The next safe upgrade is copied-worktree Docker or microVM execution with network policy logs and patch export, not direct host mutation.

## Validation Commands

```bash
npm test
npm run test:learning-loop
npm run test:memory-governor
node Scripts/yuri-guarded-executor.mjs --selftest --artifact-root /tmp/nudimmud-yuri-sandbox-selftest
node Scripts/yuri-sandbox-loop.mjs --selftest
node Scripts/yuri-sandbox-loop.mjs --dry-run --prompt "first Yuri sandbox operational proving run"
node Scripts/yuri-sandbox-loop.mjs --live --prompt "first Yuri sandbox operational proving run"
```
