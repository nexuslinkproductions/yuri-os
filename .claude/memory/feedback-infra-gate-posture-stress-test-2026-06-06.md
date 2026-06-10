---
name: feedback-infra-gate-posture-stress-test-2026-06-06
description: "Codex A2 infra stress-test verdict — the HARD boundary held (settings.json deny + operator-write-guard); the bash/protocol guards are fail-open lexical layer-2 (documented-not-chased); 2 real queued improvements (block commit --no-verify of protected/secret, upgrade secret-scan for concatenation/base64)"
metadata: 
  node_type: memory
  type: feedback
  tier: high
  scope: security
  trig: 
    - gate
    - guard
    - protected path
    - sandbox
    - commit
    - secret scan
    - fail-open
    - stress test
  refs: 
    - bash-guard-role-matcher-lexical-bypass
    - feedback-codex-lane-not-truly-read-only
    - feedback-gate-hardening-fail-closed
  originSessionId: fd6806d3-8e56-47d5-ac11-51d2752c5091
---

VERDICT (Codex A2 adversarial stress-test, 2026-06-06): the YURI security posture is layered + the HARD boundary HELD; the soft layers are fail-open by design and documented-not-chased.

HELD (the real boundary):
- `.claude/settings.json` deny of direct Read/Write/Edit on relative protected paths — the hard wall.
- `operator-write-guard.js` — held for role/credential/hook surfaces incl. traversal, absolute path, symlink-canonicalization, case-folding.
- `base64 -d | sh` decode-to-shell — denied by bash-security-guard.
- energy gate — intentionally metrics-only/fail-open unless armed (correctly documented, not a boundary).

FAIL-OPEN (known layer-2 conscience — documented, NOT chased, per [[bash-guard-role-matcher-lexical-bypass]]):
- bash-security-guard is lexical/fail-open: `cat .env`, `mv .env /tmp`, `X=cat;$X .env`, `.claude/state/../state/...`, `cat backend/data/...` returned allow. It's a static command-string matcher, not a sandbox. The READ boundary gap (it blocks mutation more than reads) is in this class.
- Codex sandbox = danger-full-access (`.codex/config.toml`) — confirms [[feedback-codex-lane-not-truly-read-only]]; the true boundary is the Codex hook + OS perms + model obedience, not the sandbox flag.
- claude-protocol-guard mostly WARNS in normal mode (soft gate).

QUEUED REAL IMPROVEMENTS (owner-gated, not blocking — the machine is the owner-trust-root so `--no-verify` is the owner's prerogative, but for the OSS release these matter):
1. Block `git commit --no-verify` / committing protected tracked files at the gate.
2. Upgrade secret-leak-scan: staged-diff + concatenation detection (`"sk-AAAA"+"AAAA"`) + base64/hex decode candidates + entropy, fail on protected files entering the index.
3. Centralize ONE canonical protected-path detector (normalize abs/.. /case-fold/quote-strip/glob/realpath) shared by all guards; make the Claude bash guard block reads+mutations for ALL protected prefixes.

How to apply: these are real defense-in-depth for the OSS release; the layer-1 settings deny + operator-write-guard remain the enforcement floor. Don't over-invest chasing the lexical bash guard (it's a conscience, not a wall) — invest in the canonical detector + the commit/secret gate before going public.
