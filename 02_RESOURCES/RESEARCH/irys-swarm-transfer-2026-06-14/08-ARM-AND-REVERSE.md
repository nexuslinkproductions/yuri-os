# MOVE 1b — ARM / OBSERVE / REVERSE (ops note)

> The recursive nanoswarm is BUILT + TESTED but **DISARMED**. Nothing recurses until the owner arms it.
> Everything here is reversible by unsetting an env var + deleting a flag file. No protected-path writes.

## What's shipped (all DISARMED, 51/51 tests green)

| module | role | armed by |
|---|---|---|
| `nano-tree.mjs` | path identity · spawn manifest · atomic node budget · `inflightDescendants` | always-on (pure mechanism, no dispatch) |
| `nano-barrier.mjs` | `canFinalize` — INV-1 in-flight + INV-2 forced drain + orphan/contested → CRITICAL | safety always-on; quality via `YURI_SWARM_CONVERGENCE` |
| `nano-eot.mjs` | per-nano closeout: claims → EOT marker → release lease LAST | n/a (called by a running nano) |
| `nano-spawn.mjs` | governed `spawnNano` + `SPAWN_NANO_TOOL` descriptor | `YURI_NANOSWARM_SPAWN=1` + flag file |
| `nano-dispatch.mjs` | dispatch seam + cross-process ctx (`YURI_NANO_*` env) | n/a (called by spawnNano) |
| `nano-external.mjs` | `governedFireDecision` CLI bypass guard + `env` passthrough | CLI fire via `YURI_NANO_CLI_FIRE=1` |

## The three independent arms (arm in this order)

```bash
# 1. BARRIER QUALITY (observe the convergence gate first; safety invariants are already on)
export YURI_SWARM_CONVERGENCE=1

# 2. SPAWN (two-factor: env AND flag file — both required)
export YURI_NANOSWARM_SPAWN=1
touch _SYSTEM/state/nanoswarm-spawn.enabled

# 3. COST enforcement (independent; advisory-pass until armed)
export YURI_COST_ADMISSION_ENFORCE=1   # + a real cap in the pool's arm config
```

## Reverse (full, instant)

```bash
unset YURI_SWARM_CONVERGENCE YURI_NANOSWARM_SPAWN YURI_COST_ADMISSION_ENFORCE YURI_NANO_CLI_FIRE
rm -f _SYSTEM/state/nanoswarm-spawn.enabled
# nuclear: delete the modules — they have ZERO live callers until the live-wire step below.
```

## NOT done — the live-wire (deliberate, owner-gated, the actual ARM)

The mechanism is complete + proven DISARMED. Turning it ON in a live lane is ONE remaining wiring step,
intentionally left out of the DISARMED build (it touches `llm-lane.mjs`, a hot shared file):

1. **Register the tool:** add `SPAWN_NANO_TOOL` (from `nano-spawn.mjs`) to the `llm-lane` TOOLS array, and
   in the tool-dispatch handler call `spawnNano({ ctx: nanoCtxFromEnv(), args, opts:{ deps:{ dispatch: dispatchNano } } })`.
   `nanoCtxFromEnv()` (from `nano-dispatch.mjs`) recovers the caller's tree position from `YURI_NANO_*` env.
2. **Seed the root tree:** at the top of an armed swarm session, `initTree(rootRunId, { budget:64, f0:4, decay:0.5 })`
   and acquire the root lease `nanotree:<rootRunId>:r`.
3. **Async execution model (the one open design call):** `defaultLlmLaneRunner` is `spawnSync` (BLOCKING) — a
   parent waits for each child. For true concurrent fan-out (the barrier's whole rationale), the dispatch must
   be async (non-blocking spawn) OR children run as scheduled `nano-tick` wakes. Pick one before arming wide.
   Until then, blocking dispatch is sound but serial (the barrier still holds; it just rarely sees true races).

## Defaults (owner-confirmed 2026-06-14)

`B=64` · `F0=4` · `decay=0.5` · depth tier `heavy>200B=5 / light=10`. `minimax-m3` + `mimo-v2.5-pro`
classified **heavy** (conservative; VERIFY exact params and adjust `LANE_PARAMS_B` in `nano-spawn.mjs`).

## Residual risks (honest)

- **Bash bypass hard-stop is DEFERRED** — the lane-proof hook deny (`inc5-bash-guard-deny.patch.md`) is not
  applied (the hook file was dirty with another session). The mechanism-layer guard is shipped; apply the hook
  patch before arming spawn for an untrusted lane.
- **Async execution model unresolved** (see live-wire #3) — arm narrow/shallow first.
- **Sim values are geometry-dependent** (05-QUANTUM-SIM-FINDINGS caveat) — the STRUCTURE (barrier required,
  depth couples to soundness) is proven; promote off advisory only after a live logged-sequence test.
