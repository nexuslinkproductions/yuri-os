# D4 / live-wire — SPAWN_NANO_TOOL into llm-lane (READY, owner-gated, NOT applied)

**Status: prepared, HELD.** `llm-lane.mjs` is clean (not contended), so this is mechanically applicable.
It is held because it is the gateway that makes arming a one-flag flip AND it edits the hot shared lane
dispatch loop (a wrong wiring breaks every lane's tool dispatch — integration blast-radius HIGH even while
the feature is DISARMED-inert). Apply as a deliberate, watched step when arming the swarm.

## The wiring (3 edits to `_SYSTEM/Scripts/llm-lane.mjs`)

### 1. import (top, with the other Scripts imports)
```js
import { spawnNano } from './nano-spawn.mjs';
import { dispatchNano, nanoCtxFromEnv } from './nano-dispatch.mjs';
```

### 2. TOOLS array (after the `edit_file` entry, ~line 229)
```js
  { type: 'function', function: { name: 'spawn_nano', description: 'Spawn a YURI-exoskeleton sub-lane (nano) for a scoped sub-task, governed by depth/fan-out/node-budget/cost caps. Returns spawned children or a refusal reason (do the work yourself if refused). DISARMED unless the swarm is armed.', parameters: { type: 'object', properties: { task: { type: 'string' }, lane: { type: 'string' }, count: { type: 'number' }, reasoning: { type: 'string' } }, required: ['task', 'lane'] } } },
```

### 3. executeTool dispatch block (inside `executeTool`, alongside the other `if (name === ...)` blocks)
```js
    if (name === 'spawn_nano') {
      const ctx = nanoCtxFromEnv();                       // tree position from YURI_NANO_* env (null at top level)
      if (!ctx) return 'REFUSED: spawn_nano only inside a tree-ctx nano (no YURI_NANO_* env). Top-level sessions seed a tree first.';
      const r = await spawnNano({ ctx, args, opts: { deps: { dispatch: dispatchNano } } });
      if (r.degrade) return `spawn disabled (DISARMED) — do the work yourself. ${r.reason}`;
      if (!r.spawned?.length) return `spawn refused: ${r.reason}${r.cap ? ` (cap ${r.cap}, tier ${r.tier})` : ''}`;
      return `spawned ${r.spawned.length}: ${r.spawned.map((s) => `${s.path}@${s.lane}`).join(', ')}${r.rejected ? ` | rejected ${JSON.stringify(r.rejected)}` : ''}`;
    }
```

## Required at arm-time (NOT in this patch)
1. **Async dispatch (D1)** — `dispatchNano` runs through `nano-tick`→`externalNanoWork`→`spawnSync` (BLOCKING).
   Either accept serial dispatch (~1.6x slower, barrier dormant) for first arm, OR build the non-blocking
   runner variant before wide arm. Decide per the D1 ruling.
2. **Root tree seed** — at an armed session start: `initTree(rootRunId, {budget:64,f0:4,decay:0.5})` +
   acquire the root lease `nanotree:<rootRunId>:r`, and export `YURI_NANO_ROOT_RUN_ID/PATH=r/DEPTH=0`
   for the top-level session so its `spawn_nano` calls carry ctx.
3. **Bash-guard hook deny (D3)** — apply `inc5-bash-guard-deny.patch.md` (hard bypass-stop) before arming
   for an untrusted lane.
4. **Arm flags** — `YURI_NANOSWARM_SPAWN=1` + `touch _SYSTEM/state/nanoswarm-spawn.enabled`.

## Reverse
Delete the 3 edits (or `git revert`); unset the arm flags; `rm` the flag file. Zero residue.

## Verify after applying (DISARMED)
```
node --test _SYSTEM/Scripts/llm-lane*.test.mjs            # lane dispatch still green
node -e "import('./_SYSTEM/Scripts/llm-lane.mjs').then(m=>console.log(typeof m.executeTool))"  # loads clean
# a lane calling spawn_nano with no YURI_NANO_* env → REFUSED (top-level guard); DISARMED → 'spawn disabled'
```
