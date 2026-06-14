# INC-5 DEFERRED — bash-security-guard hook deny for ungoverned nano spawn

**Status: NOT APPLIED.** `.claude/hooks/bash-security-guard.js` was dirty with another session's uncommitted
work at build time (last commit `5f5b048c`, a +12/-2 change not mine). Per the mutation contract I will not
sweep a parallel session's changes into my commit. Apply this when the hook is clean (its own commit).

## Why this is the HARD stop (the mechanism guard is only the soft one)

The mechanism-layer guard shipped in `nano-external.mjs` (`governedFireDecision`) refuses an ungoverned CLI
fire unless `YURI_NANO_CLI_FIRE=1`. A *cooperative* lane is stopped; an *adversarial* lane can set that env in
its own bash sub-shell. The bash-security-guard hook intercepts the lane's bash command string BEFORE
execution, so it is the only layer a lane-controlled process cannot defeat. The two together = defense in depth.

## The patch (adapt to the file's current structure when applying)

Add the matcher near the other `isBlocked*` functions:

```js
// Ungoverned nano-swarm spawn bypass (Move 1b INC-5, 07-ARCHITECTURE.md §13 #7). A lane must spawn ONLY
// through the governed spawn_nano tool (depth/fan-out/budget/cost caps). Running nano-external / nano-tick
// as a raw process from a lane's bash skips all governance. Deny direct `node .../nano-external.mjs` and
// `node .../nano-tick.mjs` invocation; --dry (routing proof) is allowed. The operator escape hatch
// YURI_NANO_CLI_FIRE is INTENTIONALLY NOT honored here — the hook is the lane-proof layer.
function isBlockedUngovernedNanoSpawn(cmd) {
  const c = String(cmd || '');
  // node (optionally with flags/path) executing nano-external.mjs or nano-tick.mjs
  if (!/\bnode\b[^|;&]*\bnano-(?:external|tick)\.mjs\b/.test(c)) return false;
  if (/\s--dry(?:\s|$)/.test(c)) return false;            // dry routing proof is safe
  return true;
}
```

Wire it into the deny dispatcher (currently `isBlockedInner`, line ~234):

```js
function isBlockedInner(cmd) {
  return isBlockedEnvRead(cmd) || isBlockedSensitiveClaudeRead(cmd) ||
    isBlockedEnvWrite(cmd) || isBlockedEnvMutate(cmd) || isBlockedEnvRemove(cmd) ||
    isBlockedClaudeFileWrite(cmd) || isBlockedClaudeRemove(cmd) ||
    isBlockedBroadGitAdd(cmd) || isBlockedGitRm(cmd) ||
    isBlockedUngovernedNanoSpawn(cmd);                    // <-- ADD
}
```

`isBlockedInner` is already reached through `isBlockedShellWrapper` (covers `bash -c "..."` wrapping), so the
deny also catches the wrapped form for free.

## Test to add (bash-security-guard.test or matrix)

```js
// blocked: raw lane spawn of either module
assert.ok(isBlocked('node _SYSTEM/Scripts/nano-external.mjs deepseek-v4-pro "do work"'));
assert.ok(isBlocked('node /abs/_SYSTEM/Scripts/nano-tick.mjs nano-x'));
assert.ok(isBlocked('bash -c "node _SYSTEM/Scripts/nano-external.mjs gemma4:31b task"'));
// allowed: dry routing proof + unrelated node
assert.ok(!isBlocked('node _SYSTEM/Scripts/nano-external.mjs deepseek-v4-pro x --dry'));
assert.ok(!isBlocked('node _SYSTEM/Scripts/swarm-convergence.mjs'));
```

## Verify after applying
```
node --test .claude/hooks/bash-security-guard.test.js   # or the matrix runner
echo 'node _SYSTEM/Scripts/nano-external.mjs deepseek "x"' | <hook entrypoint>   # expect DENY
```
