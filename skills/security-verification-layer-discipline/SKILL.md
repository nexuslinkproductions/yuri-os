---
name: security-verification-layer-discipline
description: "When verifying security/enforcement/safety claims — each layer needs its own evidence; don't over-extend a verified claim to the next unverified layer"
---

# Security Verification Layer Discipline

## The Pattern

When verifying whether a guard/safety mechanism works, each LAYER of the claim requires its OWN evidence. Proving layer N does NOT prove layer N+1.

## Common layer gaps (where overclaims hide)

1. **Config-wired ≠ runtime-firing** — a hook existing in `.codex/config.toml` or `.claude/settings.json` doesn't prove it EXECUTES at runtime. Different harnesses (Claude Code vs Codex vs OMP) invoke hooks differently; each needs its own live E2E test.
2. **Code-routing ≠ hook-invokes-at-runtime** — tracing `functionA() → functionB() → evaluateToolCall()` in HEAD code proves the ROUTING, not that the harness actually calls `functionA()` when a tool runs.
3. **Catches-accidental ≠ adversarial-boundary** — a JS monkeypatch (`--require` shim) that stops accidental `fs.rmSync` is NOT a sandbox against adversarial in-process code (`process.binding`, cache-bust, native binaries).
4. **HEAD-committed ≠ on-disk-live** — `git show HEAD:path` proves committed content; it does NOT prove the file exists on disk in the working tree. When the tool filesystem view is partial/sandboxed, use multiple verification methods.

## Evidence standards (name them explicitly)

- **HEAD code-trace** (`git show HEAD:path | sed -n`) — proves committed code logic, nothing about runtime.
- **Live E2E test** (real tool event → observe block/allow) — proves the hook fires AND reaches the guard for a specific harness.
- **Runtime block-test under bypass flag** — proves the guard survives the specific bypass mechanism (e.g., `--dangerously-bypass-approvals-and-sandbox`).
- **On-disk check** (`test -f`, `ls`, NOT `git show`) — proves the file exists in the working tree.

## Rules

- Don't transfer evidence between harnesses (Claude Code live block ≠ Codex live block).
- Don't collapse tiers — state each harness/path separately with its own evidence standard.
- The conservative default for any unverified safety layer: assume UNGUARDED until the exact test that settles it passes.
- For destructive-op boundaries specifically: removing a safety precaution carries the burden of proof; the reversible default wins.

## Verification methodology

- `git grep` searches the WORKING TREE; when the working tree is unresolved (sandbox/partial view), it returns false negatives. Use `git show HEAD:path | sed -n` for reliable HEAD-content verification.
- `git ls-files --deleted` = empty means git considers the tree intact; if your `ls`/`find`/`test -f` disagree, YOUR tool view is the suspect, not the tree.
- When concluding 'fabrication' or 'does not exist': verify with MULTIPLE methods (git show, git ls-files, test -f) before drawing the negative conclusion. A wrong file extension in your search path produces a false negative that looks like a fabrication.
