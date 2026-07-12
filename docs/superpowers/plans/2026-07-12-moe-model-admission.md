# YURI MoE Model Admission Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Repair the native MURE dispatch boundary, canary and admit seven exact provider routes, and resolve the GPT-5.6 context-window discrepancy without falsifying transport capability.

**Architecture:** The parent-only MURE reducer compiles one current-schema OMP TaskTool unit at a time. Catalog-candidate routes receive temporary, evidence-only bootstrap variants while their normal role cards remain fail-closed; R2 producer and independent-verifier completions create admissible registry evidence, after which normal cards are regenerated and bootstrap variants removed. GPT-5.6 context metadata is changed only if the `openai-codex` transport itself is proven beyond the current 372K cap.

**Tech Stack:** Node.js ESM, `node:test`, JSON registries, generated Markdown agent cards, YAML OMP configuration, OMP TaskTool, GitNexus, SQLite model cache, OpenAI/Codex model metadata.

---

## File Map

### Native dispatch boundary

- Modify: `_SYSTEM/mure/sol-moe-native-dispatch.mjs` — worker allowlist and TaskTool payload compiler.
- Modify: `_SYSTEM/mure/sol-moe-native-dispatch.test.mjs` — compiler shape, worker-binding, verifier, and canary-purpose contracts.
- Modify: `_SYSTEM/mure/sol-moe-parent-adapter.mjs` — accepted-receipt agent lookup against the per-task schema.
- Modify: `_SYSTEM/mure/sol-moe-parent-adapter.test.mjs` — parent admission and pushed-completion fixtures.
- Verify: `_SYSTEM/mure/sol-moe-native-boundary.test.mjs` — no subprocess/fake runtime boundary.
- Verify: `_SYSTEM/mure/omp-task-adapter.test.mjs` — receipt/result/transcript parser invariants.

### Canary bootstrap and projection

- Modify: `_SYSTEM/mure/omp-model-resolver.mjs` — explicit `catalog-candidate`/bootstrap-only resolution.
- Modify: `_SYSTEM/mure/omp-model-resolver.test.mjs` — normal candidate fail-close and bootstrap-variant execution tests.
- Modify: `_SYSTEM/Scripts/mure-omp-sync.mjs` — pass variant eligibility metadata into model resolution.
- Modify: `_SYSTEM/Scripts/mure-fleet-validate.mjs` — reject stale, ordinary-use, or non-candidate bootstrap variants.
- Modify: `_SYSTEM/Scripts/mure-fleet-validate.test.mjs` — bootstrap lifecycle and current registry evidence tests.
- Modify: `_SYSTEM/mure/agent-catalog.json` — exact route mappings, role variants, and temporary bootstrap variants.
- Modify: `_SYSTEM/config/provider-route-registry.json` — candidate routes, live canary evidence, and final admission statuses.
- Generated: `.omp/agents/*.md` — bootstrap and normal role cards.
- Generated: `.omp/config.yml` — startup-loaded `disabledAgents` projection.
- Generated: `_SYSTEM/state/mure-omp-projection.json` — executable/disabled card manifest.

### GPT-5.6 context investigation

- Inspect: `/Users/marcelspatz/.omp/agent/models.db` — active OMP cached model metadata.
- Inspect: installed `@oh-my-pi/pi-catalog` package metadata/source — provenance of 372K.
- Conditionally create: `/Users/marcelspatz/.omp/agent/models.yml` — `openai-codex` model overrides only after transport proof.
- No Cursor routing changes are permitted for Sol, Terra, or Luna.

---

### Task 1: Establish impact and failing baseline

**Files:**
- Read: `_SYSTEM/mure/sol-moe-native-dispatch.mjs`
- Read: `_SYSTEM/mure/sol-moe-native-dispatch.test.mjs`
- Read: `_SYSTEM/mure/sol-moe-parent-adapter.mjs`
- Read: `_SYSTEM/mure/sol-moe-parent-adapter.test.mjs`
- Read: `_SYSTEM/mure/sol-moe-native-boundary.test.mjs`
- Read: `_SYSTEM/mure/omp-task-adapter.test.mjs`

- [ ] **Step 1: Recall the existing parent-adapter capability**

Run:

```bash
node _SYSTEM/Scripts/capability-recall.mjs "omp task adapter parent adapter"
```

Expected: the result identifies the existing Sol/MURE parent adapter and compiler; no new dispatcher primitive is justified.

- [ ] **Step 2: Run GitNexus impact on the two exported symbols**

Use GitNexus impact analysis for:

```text
compileOmpSpawn
admitOmpSpawn
```

Expected: a dependency map naming the adjacent native-dispatch, parent-adapter, and boundary tests. If either impact is HIGH or CRITICAL, report the blast radius before editing and retain the approved narrow scope.

- [ ] **Step 3: Run the current focused tests**

Run:

```bash
node --test \
  _SYSTEM/mure/sol-moe-native-dispatch.test.mjs \
  _SYSTEM/mure/native-dispatch-shadow.test.mjs \
  _SYSTEM/mure/sol-moe-parent-adapter.test.mjs \
  _SYSTEM/mure/sol-moe-native-boundary.test.mjs \
  _SYSTEM/mure/omp-task-adapter.test.mjs
```

Expected: current tests pass, proving they encode the stale compiler shape rather than the active TaskTool contract.

- [ ] **Step 4: Record the external contract mismatch as the red test target**

The active TaskTool contract is:

```javascript
{
  i: 'MURE evidence route-canary',
  context: '# Goal\n...\n# Constraints\n...\n# Contract\n...',
  tasks: [{
    task: '# Target\n...\n# Change\n...\n# Acceptance\n...',
    name: 'route-canary-producer',
    agent: 'route-canary-card'
  }]
}
```

The implementation must not retain a top-level `agent`, `assignment`, `id`, `description`, or `role` field.

---

### Task 2: Repair the native TaskTool compiler contract

**Files:**
- Modify: `_SYSTEM/mure/sol-moe-native-dispatch.test.mjs`
- Modify: `_SYSTEM/mure/sol-moe-native-dispatch.mjs`
- Modify: `_SYSTEM/mure/sol-moe-parent-adapter.test.mjs`
- Modify: `_SYSTEM/mure/sol-moe-parent-adapter.mjs`

- [ ] **Step 1: Rewrite the compiler output-shape test to fail**

In `compiler emits exactly the OMP TaskTool dispatch shape and deterministic task ID`, assert:

```javascript
assert.deepEqual(Object.keys(compiled).sort(), ['context', 'i', 'tasks']);
assert.equal(compiled.tasks.length, 1);
assert.deepEqual(Object.keys(compiled.tasks[0]).sort(), ['agent', 'name', 'task']);
assert.equal(compiled.tasks[0].agent, entry.agentId);
assert.equal(compiled.tasks[0].name, deterministicOmpTaskId(entry));
assert.equal(typeof compiled.tasks[0].task, 'string');
assert.ok(!('agent' in compiled));
```

Update verifier-prompt assertions from `tasks[0].assignment` to `tasks[0].task`.

- [ ] **Step 2: Add a failing parent-admission test for the nested agent path**

Construct an action whose arguments match the current TaskTool schema:

```javascript
const action = {
  type: 'omp-task-spawn',
  taskId: 'task-a',
  args: {
    i: 'MURE producer task-a',
    context: '# Goal\nTest',
    tasks: [{ task: 'Complete task-a.', name: 'task-a-producer', agent: 'mure-synthesist' }]
  }
};
```

Assert that `admitOmpSpawn` accepts `{jobId: 'run-a', agent: 'mure-synthesist'}` and rejects a receipt whose agent differs from `action.args.tasks[0].agent`.

- [ ] **Step 3: Run the two tests and confirm red**

Run:

```bash
node --test \
  _SYSTEM/mure/sol-moe-native-dispatch.test.mjs \
  _SYSTEM/mure/sol-moe-parent-adapter.test.mjs
```

Expected: failures reference the legacy output keys and `action.args.agent` lookup.

- [ ] **Step 4: Implement the minimal compiler rewrite**

Make `compileOmpSpawn` return:

```javascript
return Object.freeze({
  i: `MURE ${normalized.purpose} ${safeToken(normalized.taskId, 20)}`,
  context: buildOmpContext(normalized),
  tasks: [Object.freeze({
    task,
    name: ompTaskId,
    agent: normalized.agentId,
  })],
});
```

Do not add a compatibility alias for the old shape.

- [ ] **Step 5: Update parent admission to use the nested agent**

Replace every comparison/read of `action.args.agent` with a guarded read of the one allowed unit:

```javascript
const dispatchedAgent = action?.args?.tasks?.[0]?.agent;
if (typeof dispatchedAgent !== 'string' || !dispatchedAgent) {
  throw new TypeError('OMP spawn action is missing tasks[0].agent');
}
if (receipt.agent !== dispatchedAgent) {
  throw new TypeError(`OMP receipt agent ${receipt.agent} does not match dispatched card ${dispatchedAgent}`);
}
```

- [ ] **Step 6: Run the focused boundary suite**

Run the five-test command from Task 1.

Expected: all five suites pass; the subprocess/fake-runtime boundary remains green.

- [ ] **Step 7: Commit the boundary repair**

```bash
git add _SYSTEM/mure/sol-moe-native-dispatch.mjs \
  _SYSTEM/mure/sol-moe-native-dispatch.test.mjs \
  _SYSTEM/mure/sol-moe-parent-adapter.mjs \
  _SYSTEM/mure/sol-moe-parent-adapter.test.mjs
git commit -m "fix: align native dispatch with TaskTool schema" -- \
  _SYSTEM/mure/sol-moe-native-dispatch.mjs \
  _SYSTEM/mure/sol-moe-native-dispatch.test.mjs \
  _SYSTEM/mure/sol-moe-parent-adapter.mjs \
  _SYSTEM/mure/sol-moe-parent-adapter.test.mjs
```

---

### Task 3: Add a deterministic canary-only bootstrap gate

**Files:**
- Modify: `_SYSTEM/mure/omp-model-resolver.test.mjs`
- Modify: `_SYSTEM/mure/omp-model-resolver.mjs`
- Modify: `_SYSTEM/Scripts/mure-fleet-validate.test.mjs`
- Modify: `_SYSTEM/Scripts/mure-fleet-validate.mjs`
- Modify: `_SYSTEM/Scripts/mure-omp-sync.mjs`

- [ ] **Step 1: Add resolver tests for dual projection**

Add fixtures with a registry route whose status is `catalog-candidate`.

Normal variant expectation:

```javascript
const normal = resolveOmpModel('ollama-cloud/deepseek-v4-flash:cloud', 'low', {
  eligibilityFlags: []
});
assert.equal(normal.status, 'FAIL_CLOSED');
assert.equal(normal.failClass, 'canary_pending');
```

Bootstrap variant expectation:

```javascript
const bootstrap = resolveOmpModel('ollama-cloud/deepseek-v4-flash:cloud', 'low', {
  eligibilityFlags: ['canary-bootstrap']
});
assert.equal(bootstrap.status, 'OK');
assert.equal(bootstrap.selector, 'ollama-cloud/deepseek-v4-flash:cloud');
```

A bootstrap variant for a `quota-blocked`, `blocked-schema`, `unresolved`, `owner-excluded`, or unknown route must remain `FAIL_CLOSED`.

A bootstrap variant on the same route after promotion must fail closed:

```javascript
const expired = resolveOmpModel('ollama-cloud/deepseek-v4-flash:cloud', 'low', {
  eligibilityFlags: ['canary-bootstrap']
});
assert.equal(expired.status, 'FAIL_CLOSED');
assert.equal(expired.failClass, 'bootstrap_expired');
```

- [ ] **Step 2: Add validation tests for bootstrap scope**

Add a `validateCanaryBootstrapVariants(catalog, registry)` test matrix:

```javascript
assert.deepEqual(validateCanaryBootstrapVariants(validCatalog, candidateRegistry), []);
assert.deepEqual(validateCanaryBootstrapVariants(expiredCatalog, provenRegistry), []);
assert.match(
  validateCanaryBootstrapVariants(ordinaryRouteCatalog, blockedRegistry)[0],
  /bootstrap variant requires catalog-candidate or canary-proven/
);
assert.match(
  validateCanaryBootstrapVariants(writeCapableBootstrap, candidateRegistry)[0],
  /bootstrap variant tools must be read-only/
);
```

Allowed bootstrap variant tools are exactly `['read']`. Variants must include only the single `canary-bootstrap` eligibility flag and a description containing `evidence-only`. Projection must force bootstrap cards to `task: true`, `spawns: null`, and `tools: ['read']` rather than inheriting the base agent's wider capabilities.

- [ ] **Step 3: Run resolver and validation tests and confirm red**

Run:

```bash
node --test \
  _SYSTEM/mure/omp-model-resolver.test.mjs \
  _SYSTEM/Scripts/mure-fleet-validate.test.mjs
```

Expected: failures show that resolver does not accept variant metadata and no bootstrap validator exists.

- [ ] **Step 4: Add the explicit resolver state**

Add:

```javascript
CANARY_PENDING: 'canary_pending',
BOOTSTRAP_EXPIRED: 'bootstrap_expired'
```

to `FAIL_CLASSES`. Change the signature to:

```javascript
export function resolveOmpModel(catalogModel, thinkingLevel, variant = null)
```

Before the ordinary non-proven-route gate, allow only:

```javascript
const isBootstrap = variant?.eligibilityFlags?.includes('canary-bootstrap') === true;
if (registryEntry?.status === 'catalog-candidate' && isBootstrap) {
  return Object.freeze({
    status: 'OK',
    selector: normalizedSelector,
    thinkingLevel: clampedLevel,
    failClass: null,
    reason: null,
    bootstrapOnly: true,
  });
}
```

A normal `catalog-candidate` returns `FAIL_CLOSED` with `failClass: 'canary_pending'`. No other non-proven status may use the exception.

When `registryEntry.status === 'canary-proven' && isBootstrap`, return `FAIL_CLOSED` with `failClass: 'bootstrap_expired'`. This retains the historical evidence-agent card as a disabled tombstone. Bootstrap variants on every other status remain fail-closed under the existing blocked/unresolved class.

- [ ] **Step 5: Pass variant metadata from projection to the resolver**

In `buildOmpProjection`, change the resolver call to:

```javascript
const resolution = resolveOmpModel(catalogModel, thinkingLevel, variant);
```

Include `bootstrapOnly` in projection state so validation can prove why the card is executable.

When constructing the projected card, force the bootstrap-only capability envelope:

```javascript
const projectedTools = resolution.bootstrapOnly ? ['read'] : resolveTools(agent, variant);
const projectedSpawns = resolution.bootstrapOnly ? null : resolveSpawns(agent, variant);
const projectedTask = resolution.bootstrapOnly ? true : resolveTask(agent, variant);
```

- [ ] **Step 6: Implement bootstrap validation**

Export and call `validateCanaryBootstrapVariants`. Reject a bootstrap variant unless:

```javascript
['catalog-candidate', 'canary-proven'].includes(route.status) &&
variant.eligibilityFlags.length === 1 &&
variant.eligibilityFlags[0] === 'canary-bootstrap' &&
JSON.stringify(variant.tools) === JSON.stringify(['read']) &&
variant.description.toLowerCase().includes('evidence-only')
```

Validation of the built projection must additionally require `bootstrapOnly === true`, `tools: ['read']`, `spawns: null`, and `task: true`.

For a catalog-candidate route, projection must show the bootstrap card `OK` and the base card `FAIL_CLOSED`. For a canary-proven route, projection must show the base card `OK` and the bootstrap card `FAIL_CLOSED` with `bootstrap_expired`.

While the route is catalog-candidate, the normal base card must remain `FAIL_CLOSED` and listed in `disabledAgents`.

- [ ] **Step 7: Run the resolver, projection, and validation tests**

Run:

```bash
node --test \
  _SYSTEM/mure/omp-model-resolver.test.mjs \
  _SYSTEM/Scripts/mure-fleet-validate.test.mjs
node _SYSTEM/Scripts/mure-omp-sync.mjs --check
```

Expected: unit tests pass; `--check` may report expected drift only after Task 4 adds candidate variants.

- [ ] **Step 8: Commit the bootstrap mechanism**

```bash
git add _SYSTEM/mure/omp-model-resolver.mjs \
  _SYSTEM/mure/omp-model-resolver.test.mjs \
  _SYSTEM/Scripts/mure-omp-sync.mjs \
  _SYSTEM/Scripts/mure-fleet-validate.mjs \
  _SYSTEM/Scripts/mure-fleet-validate.test.mjs
git commit -m "feat: add evidence-only route bootstrap" -- \
  _SYSTEM/mure/omp-model-resolver.mjs \
  _SYSTEM/mure/omp-model-resolver.test.mjs \
  _SYSTEM/Scripts/mure-omp-sync.mjs \
  _SYSTEM/Scripts/mure-fleet-validate.mjs \
  _SYSTEM/Scripts/mure-fleet-validate.test.mjs
```

---

### Task 4: Register the seven candidates and bootstrap cards

**Files:**
- Modify: `_SYSTEM/mure/agent-catalog.json`
- Modify: `_SYSTEM/config/provider-route-registry.json`
- Modify: `_SYSTEM/mure/sol-moe-native-dispatch.mjs`
- Modify: `_SYSTEM/mure/sol-moe-native-dispatch.test.mjs`
- Generated: `.omp/agents/*.md`
- Generated: `.omp/config.yml`
- Generated: `_SYSTEM/state/mure-omp-projection.json`

- [ ] **Step 1: Preflight all seven exact model IDs without substituting models**

Run the supported OMP model listings:

```bash
omp models list --provider ollama-cloud --json
omp models list --provider openai-codex --json
omp models list --provider zai --json
omp models list --provider cursor --json
```

Acceptance:

- Ollama Cloud contains `deepseek-v4-flash:cloud`, `kimi-k2.7-code:cloud`, and `nemotron-3-ultra:cloud`.
- OpenAI Codex contains `gpt-5.6-luna`.
- z.ai contains `glm-5.1`.
- Cursor Composer resolves to `composer-2.5` or `composer-2.5-fast`; record the exact provider ID.
- Cursor Grok resolves to `grok-4.5` or `grok-4.5-eu`; record the exact provider ID.
- If any accepted ID is absent, stop this task with `MODEL_NOT_IN_PROVIDER_CATALOG`; do not spend a session restart to discover an ID typo and do not substitute a nearby model.

- [ ] **Step 2: Add catalog-candidate route objects**

Add one model identity and route per exact selector. Use these stable role/card bindings:

| Selector | Normal agent/card | Bootstrap card |
|---|---|---|
| `ollama-cloud/deepseek-v4-flash:cloud` | `deepseek-flash` | `deepseek-flash-bootstrap` |
| `ollama-cloud/kimi-k2.7-code:cloud` | `mure-engineer` | `mure-engineer-kimi-bootstrap` |
| `ollama-cloud/nemotron-3-ultra:cloud` | `mure-deliberator` | `mure-deliberator-nemotron-bootstrap` |
| `openai-codex/gpt-5.6-luna` | `mure-adjudicator-luna` | `mure-adjudicator-luna-bootstrap` |
| `zai/glm-5.1` | `mure-helmsman-glm-glm51` | `mure-helmsman-glm51-bootstrap` |
| `cursor/composer-2.5` or live-listed `cursor/composer-2.5-fast` | `composer-fast` | `composer-25-bootstrap` |
| `cursor/grok-4.5` or live-listed `cursor/grok-4.5-eu` | `mure-ideator-grok45` | `mure-ideator-grok45-bootstrap` |

The registry route `agentId` is the bootstrap card that actually produces the canary transcript. It remains the historical evidence identity after promotion; the normal production card is selected separately through `WORKER_BINDINGS`.

Add these route records, using the live-listed Cursor alternative only when the exact unsuffixed ID is absent:

```json
[
  {
    "id": "deepseek-v4-flash.ollama-cloud",
    "provider": "ollama-cloud",
    "surface": "omp-native",
    "model": "ollama-cloud/deepseek-v4-flash:cloud",
    "agentId": "deepseek-flash-bootstrap",
    "status": "catalog-candidate",
    "source": "mure-agent-catalog"
  },
  {
    "id": "kimi-k2.7-code.ollama-cloud",
    "provider": "ollama-cloud",
    "surface": "omp-native",
    "model": "ollama-cloud/kimi-k2.7-code:cloud",
    "agentId": "mure-engineer-kimi-bootstrap",
    "status": "catalog-candidate",
    "source": "mure-agent-catalog"
  },
  {
    "id": "nemotron-3-ultra.ollama-cloud",
    "provider": "ollama-cloud",
    "surface": "omp-native",
    "model": "ollama-cloud/nemotron-3-ultra:cloud",
    "agentId": "mure-deliberator-nemotron-bootstrap",
    "status": "catalog-candidate",
    "source": "mure-agent-catalog"
  },
  {
    "id": "gpt-5.6-luna.openai-codex",
    "provider": "openai-codex",
    "surface": "omp-native",
    "model": "openai-codex/gpt-5.6-luna",
    "agentId": "mure-adjudicator-luna-bootstrap",
    "status": "catalog-candidate",
    "source": "mure-agent-catalog"
  },
  {
    "id": "glm-5.1.zai",
    "provider": "zai",
    "surface": "omp-native",
    "model": "zai/glm-5.1",
    "agentId": "mure-helmsman-glm51-bootstrap",
    "status": "catalog-candidate",
    "source": "mure-agent-catalog"
  },
  {
    "id": "composer-2.5.cursor",
    "provider": "cursor",
    "surface": "omp-native",
    "model": "cursor/composer-2.5",
    "agentId": "composer-25-bootstrap",
    "status": "catalog-candidate",
    "source": "mure-agent-catalog"
  },
  {
    "id": "grok-4.5.cursor",
    "provider": "cursor",
    "surface": "omp-native",
    "model": "cursor/grok-4.5",
    "agentId": "mure-ideator-grok45-bootstrap",
    "status": "catalog-candidate",
    "source": "mure-agent-catalog"
  }
]
```

- [ ] **Step 3: Add temporary bootstrap variants**

Each bootstrap variant must follow this exact catalog shape, changing only `id`, `model`, `thinkingLevel`, and description model name:

```json
{
  "id": "deepseek-flash-bootstrap",
  "model": "ollama-cloud/deepseek-v4-flash:cloud",
  "thinkingLevel": "low",
  "tools": ["read"],
  "description": "Evidence-only bootstrap canary for ollama-cloud/deepseek-v4-flash:cloud.",
  "eligibilityFlags": ["canary-bootstrap"],
  "costTier": "cheap"
}
```

Set `thinkingLevel: "high"` for Nemotron 3 Ultra and GLM-5.1; use the maximum level accepted by each live provider for Luna, Kimi, Composer, and Grok.

- [ ] **Step 4: Add exact worker bindings and red tests**

Add `WORKER_BINDINGS` entries from each exact model selector to its bootstrap card ID. Add a `BOOTSTRAP_AGENT_IDS` set containing all seven bootstrap card IDs. Add a table-driven compiler test asserting each binding compiles only with `purpose: 'evidence'` and rejects the same bootstrap card for `purpose: 'producer'`.

Also correct the existing canary-proven Sonnet verifier binding from `mure-calibrator` to the executable `mure-calibrator-sonnet5` variant and add a compiler test that resolves `anthropic/claude-sonnet-5` to that card.

The bootstrap guard must be explicit:

```javascript
if (BOOTSTRAP_AGENT_IDS.has(normalized.agentId) && normalized.purpose !== 'evidence') {
  throw new TypeError(`Bootstrap worker ${normalized.agentId} is evidence-only`);
}
```

- [ ] **Step 5: Run candidate validation before projection**

Run:

```bash
node --test \
  _SYSTEM/mure/sol-moe-native-dispatch.test.mjs \
  _SYSTEM/mure/omp-model-resolver.test.mjs \
  _SYSTEM/Scripts/mure-fleet-validate.test.mjs
node _SYSTEM/Scripts/mure-fleet-validate.mjs
```

Expected: all unit checks and registry validation pass while normal candidate cards remain fail-closed.

- [ ] **Step 6: Generate the bootstrap projection**

Run:

```bash
node _SYSTEM/Scripts/mure-omp-sync.mjs --check
node _SYSTEM/Scripts/mure-omp-sync.mjs sync
node _SYSTEM/Scripts/mure-fleet-validate.mjs
```

Expected:

- seven bootstrap cards have exact provider model selectors and are not in `disabledAgents`;
- seven normal cards remain `disabled/mure-route-unavailable` and are in `disabledAgents`;
- projection state marks each executable bootstrap card `bootstrapOnly: true`;
- no unrelated card changes model or enabled state.

- [ ] **Step 7: Commit candidate and generated projection files**

Use an explicit path list produced by the sync diff. The commit must include only the two source registries, compiler/test changes for bindings, the seven bootstrap cards, changed normal cards, `.omp/config.yml`, and `_SYSTEM/state/mure-omp-projection.json`.

Commit message:

```text
feat: stage MoE route admission canaries
```

- [ ] **Step 8: Restart OMP before live dispatch**

Exit and relaunch one interactive OMP session in the repository. Do not use headless `claude -p`, `--print`, a subprocess agent runtime, or polling. Verify the new session lists all seven bootstrap cards and still disables all seven normal cards.

---

### Task 5: Execute seven live R2 canaries through the native loop

**Files:**
- Runtime evidence only; no registry mutation until all pushed results are classified.
- Read: bootstrap card projection and parent-adapter transcript artifacts.

- [ ] **Step 1: Build one governed R2 route per model**

Use this exact canary table:

```javascript
const canaries = [
  { taskId: 'canary-deepseek-v4-flash', model: 'ollama-cloud/deepseek-v4-flash:cloud', agentId: 'deepseek-flash-bootstrap', canaryLabel: 'ollama-deepseek-v4-flash' },
  { taskId: 'canary-kimi-k2-7-code', model: 'ollama-cloud/kimi-k2.7-code:cloud', agentId: 'mure-engineer-kimi-bootstrap', canaryLabel: 'ollama-kimi-k2-7-code' },
  { taskId: 'canary-nemotron-3-ultra', model: 'ollama-cloud/nemotron-3-ultra:cloud', agentId: 'mure-deliberator-nemotron-bootstrap', canaryLabel: 'ollama-nemotron-3-ultra' },
  { taskId: 'canary-gpt-5-6-luna', model: 'openai-codex/gpt-5.6-luna', agentId: 'mure-adjudicator-luna-bootstrap', canaryLabel: 'openai-gpt-5-6-luna' },
  { taskId: 'canary-glm-5-1', model: 'zai/glm-5.1', agentId: 'mure-helmsman-glm51-bootstrap', canaryLabel: 'zai-glm-5-1' },
  { taskId: 'canary-composer-2-5', model: 'cursor/composer-2.5', agentId: 'composer-25-bootstrap', canaryLabel: 'cursor-composer-2-5' },
  { taskId: 'canary-grok-4-5', model: 'cursor/grok-4.5', agentId: 'mure-ideator-grok45-bootstrap', canaryLabel: 'cursor-grok-4-5' },
];

const routes = canaries.map(({ taskId }) => ({
  taskId,
  held: false,
  route: {
    selection: 'primary',
    classification: { riskClass: 'R2', requiresVerifier: true },
    verifier: { required: true },
  },
}));
```

When Task 4 discovered a region/fast-qualified Cursor selector, replace only the corresponding Cursor `model` value above with that exact live-listed ID.

Each producer queue entry uses its exact bootstrap card/model, `purpose: 'evidence'`, and:

```javascript
const prompt = `Return exactly one JSON object: ${JSON.stringify({
  canary: canary.canaryLabel,
  packageName: 'yuri-os-musubi',
  status: 'ok',
})}. Do not call tools. Do not add markdown or prose.`;
```

Use `mure-calibrator-sonnet5` as the independent Anthropic verifier for all seven routes. It must return exactly `{"verdict":"pass"}` or `{"verdict":"reject"}`.

- [ ] **Step 2: Schedule and invoke only compiler-produced actions**

For each route:

1. `createNativeDispatchState(plan)`.
2. `createNativeDispatchShadow({id: taskId})`.
3. `reduceNativeDispatch(state, null)`.
4. Require `action.type === 'omp-task-spawn'` and `action.purpose === 'evidence'`.
5. Mirror with `mirrorOmpSpawnAction`.
6. Invoke the parent OMP TaskTool with `action.args` exactly; do not hand-write or batch payloads.

Independent routes may be invoked concurrently, but every action gets its own TaskTool call.

- [ ] **Step 3: Admit every pushed receipt in reducer/shadow lockstep**

For each raw receipt:

```javascript
const admitted = admitOmpSpawn(state, mirroredShadow, action, rawReceipt);
```

Reject malformed job IDs, unknown cards, or agent mismatch. Do not guess correlation from task labels.

- [ ] **Step 4: Apply producer completions from pushed results only**

Use `applyOmpCompletion` or `applyOmpCompletionFromDisk`. The transcript must contain exactly one `session`, exactly one matching `model_change`, and at least one `thinking_level_change` event. Supply producer evidence:

```javascript
{ evidence: { result_label: canary.canaryLabel } }
```

Availability, quota, transport, timeout, rate-limit, and auth failures follow the reducer-selected fallback. Model mismatch or semantic output failure must fail loud.

- [ ] **Step 5: Run and admit each independent verifier action**

Mirror, invoke, admit, and apply the verifier action exactly as the producer action. A route reaches terminal `passed` only when the strict verifier JSON is valid and says `pass`.

- [ ] **Step 6: Extract and classify all seven terminal records**

Run:

```javascript
extractTerminalTaskResults(state)
```

Acceptance: seven terminal records exist. Any `fail-loud`, `blocked`, or `owner-held` route records exact evidence and blocks the overall objective; do not promote or silently omit it.

---

### Task 6: Promote proven routes and expire bootstrap cards

**Files:**
- Modify: `_SYSTEM/config/provider-route-registry.json`
- Modify: `_SYSTEM/mure/agent-catalog.json`
- Modify: `_SYSTEM/mure/sol-moe-native-dispatch.mjs`
- Modify: `_SYSTEM/mure/sol-moe-native-dispatch.test.mjs`
- Generated: `.omp/agents/*.md`
- Generated: `.omp/config.yml`
- Generated: `_SYSTEM/state/mure-omp-projection.json`

- [ ] **Step 1: Write exact observed evidence**

For every passed terminal record, set the route to `canary-proven` and construct evidence only from admitted receipt, parsed completion, and transcript fields:

```javascript
const parsedResult = JSON.parse(completion.output);
const canaryEvidence = {
  agentId: receipt.agent,
  jobId: receipt.jobId,
  model: transcript.modelChange.model,
  observed: new Date().toISOString().slice(0, 10),
  ompSessionId: transcript.session.sessionId,
  result: parsedResult,
  taskResultStatus: completion.status,
  thinkingLevel: transcript.thinkingLevelChange.level,
  transcriptReadObserved: true,
  transcriptYieldObserved: true,
};

assert.equal(canaryEvidence.agentId, route.agentId);
assert.equal(canaryEvidence.model, route.model);
assert.equal(canaryEvidence.taskResultStatus, 'completed');
assert.deepEqual(canaryEvidence.result, {
  canary: canary.canaryLabel,
  packageName: 'yuri-os-musubi',
  status: 'ok',
});
```

Never replace `receipt.agent` with the normal production card ID. The registry validator must compare the transcript-observed bootstrap agent and exact model to the route.

- [ ] **Step 2: Validate evidence before expiring bootstrap variants**

Run:

```bash
node _SYSTEM/Scripts/mure-fleet-validate.mjs
node --test \
  _SYSTEM/mure/provider-route-registry.test.mjs \
  _SYSTEM/mure/omp-model-resolver.test.mjs \
  _SYSTEM/Scripts/mure-fleet-validate.test.mjs
```

Expected: all seven routes pass admissible-evidence validation.

- [ ] **Step 3: Expire bootstrap cards and promote worker bindings**

Keep every bootstrap variant and its ID in `BOOTSTRAP_AGENT_IDS` so historical evidence continues to name a real card. Replace each model's `WORKER_BINDINGS` value with its normal admitted card ID from the Task 4 table. Keep `anthropic/claude-sonnet-5` bound to `mure-calibrator-sonnet5`. Run compiler table tests proving producer work resolves to the normal cards and evidence work can no longer compile against the expired bootstrap cards because their routes are already canary-proven.

- [ ] **Step 4: Regenerate normal executable cards**

Run:

```bash
node _SYSTEM/Scripts/mure-omp-sync.mjs --check
node _SYSTEM/Scripts/mure-omp-sync.mjs sync
node _SYSTEM/Scripts/mure-fleet-validate.mjs
```

Expected:

- the seven normal cards resolve to exact requested models;
- none uses `disabled/mure-route-unavailable`;
- none appears in `task.disabledAgents`;
- all seven bootstrap cards remain generated but resolve to `disabled/mure-route-unavailable`, carry `failClass: bootstrap_expired`, and appear in `task.disabledAgents`;
- unrelated routes retain their prior status.

- [ ] **Step 5: Commit promotion and generated projection**

Use an explicit pathspec containing only registry/catalog source files, generated normal/bootstrap card changes, `.omp/config.yml`, and the projection manifest.

Commit message:

```text
feat: admit verified MoE provider routes
```

- [ ] **Step 6: Restart OMP and smoke every normal card**

In a fresh interactive session, dispatch one minimal no-tool task to each normal card. Verify the transcript model matches the admitted selector and each bootstrap card is rejected as disabled.

---

### Task 7: Resolve GPT-5.6 context-window provenance

**Files:**
- Inspect: `/Users/marcelspatz/.omp/agent/models.db`
- Inspect: installed OMP/pi-catalog package source and version metadata.
- Conditionally create: `/Users/marcelspatz/.omp/agent/models.yml`

- [ ] **Step 1: Record current OMP runtime metadata**

Run the supported OMP model-list command for `openai-codex` and record Sol, Terra, and Luna IDs, context windows, and output limits. Cross-check the cached row with a read-only SQLite query through the harness SQLite reader.

Expected baseline: 372,000 context and 128,000 maximum output for each GPT-5.6 model.

- [ ] **Step 2: Trace the installed 372K value to source**

Identify the loaded `@oh-my-pi/pi-catalog` package version and the exact source entry that produces the `openai-codex` rows. Record whether the entry has a comment, changelog, or upstream issue tying 372K to the Codex OAuth serving transport.

Do not treat GitHub Copilot, Cursor, ZenMux, or the direct OpenAI API catalog as proof for `openai-codex`; they are separate providers.

- [ ] **Step 3: Compare against official OpenAI API limits**

Use the official model pages:

- `https://developers.openai.com/api/docs/models/gpt-5.6-sol`
- `https://developers.openai.com/api/docs/models/gpt-5.6-terra`
- `https://developers.openai.com/api/docs/models/gpt-5.6-luna`

Expected API specification: 1,050,000 context, 922,000 maximum input, 128,000 maximum output for all three.

- [ ] **Step 4: Decide from transport evidence, not configuration convenience**

If provenance or an authenticated, non-billing Codex model-catalog surface confirms a 372K transport cap, keep the OMP runtime at 372K and document the API-versus-Codex distinction. Do not create `models.yml`.

If direct `openai-codex` transport evidence confirms support beyond 372K, proceed to Step 5. Config parsing alone is not proof.

- [ ] **Step 5: Conditionally write the proven override**

Create `/Users/marcelspatz/.omp/agent/models.yml` only after Step 4 proves the larger transport window:

```yaml
providers:
  openai-codex:
    modelOverrides:
      gpt-5.6-sol:
        contextWindow: 1050000
      gpt-5.6-terra:
        contextWindow: 1050000
      gpt-5.6-luna:
        contextWindow: 1050000
```

Do not change provider IDs, model role bindings, max output, or Cursor configuration.

- [ ] **Step 6: Restart and verify the decision**

If no override was written, confirm OMP still reports 372K and record the transport-cap evidence. If an override was written, confirm OMP reports 1,050,000 and run one bounded, privacy-safe transport boundary check beyond 372K before relying on the larger compaction threshold. A rejected boundary check removes the override immediately.

---

### Task 8: Adversarial verification, final commit, and push

**Files:**
- Verify all files modified in Tasks 2–7.

- [ ] **Step 1: Run focused native dispatch tests**

```bash
node --test \
  _SYSTEM/mure/sol-moe-native-dispatch.test.mjs \
  _SYSTEM/mure/native-dispatch-shadow.test.mjs \
  _SYSTEM/mure/sol-moe-parent-adapter.test.mjs \
  _SYSTEM/mure/sol-moe-native-boundary.test.mjs \
  _SYSTEM/mure/omp-task-adapter.test.mjs
```

Expected: all tests pass.

- [ ] **Step 2: Run focused registry, resolver, and projection checks**

```bash
node --test \
  _SYSTEM/mure/provider-route-registry.test.mjs \
  _SYSTEM/mure/omp-model-resolver.test.mjs \
  _SYSTEM/Scripts/mure-fleet-validate.test.mjs
node _SYSTEM/Scripts/mure-omp-sync.mjs --check
node _SYSTEM/Scripts/mure-fleet-validate.mjs
```

Expected: all tests pass, sync reports no drift, and fleet validation reports no invalid current canary evidence.

- [ ] **Step 3: Run negative runtime checks**

Verify:

- each normal card rejects a mismatched model transcript;
- each expired bootstrap card is disabled and cannot dispatch;
- no admitted route has a later failed canary;
- Sol remains parent-only and cannot compile as a child worker;
- no OpenAI model resolves through Cursor;
- a conservative 372K context decision remains unchanged unless the `openai-codex` transport was directly proven larger.

- [ ] **Step 4: Dispatch independent adversarial review**

Use a canary-proven, provider-independent reviewer through the repaired native parent loop. The reviewer must attack route/model identity, bootstrap leakage, registry evidence freshness, generated `disabledAgents`, context-window provenance, and missing negative tests. Treat its output as hypotheses and verify every accepted correction locally.

- [ ] **Step 5: Inspect the scoped commits**

Run:

```bash
git show --stat HEAD
git show --stat HEAD~1
```

Expected: only planned source, test, registry, generated-card/config, and plan/spec files appear. The user-level OMP override, if created, is not in git.

- [ ] **Step 6: Commit any final verified corrections with explicit pathspecs**

Use `git add` with the exact reviewed correction paths, then `git commit -m "fix: harden verified MoE admissions" --` followed by those same literal paths. Never use `git add .`, a wildcard, command substitution, or a bare commit.

- [ ] **Step 7: Fetch, rebase, and push without force**

```bash
git fetch origin
git rebase origin/main
git show --stat HEAD
git push origin main
```

Expected: fast, non-forced push succeeds. If rebase introduces conflicts, stop and resolve only the task's explicit files; never overwrite parallel-session work.

## Completion Evidence

Report:

1. Exact model selector, canary job/session IDs, observed thinking level, and final normal card for all seven admitted routes.
2. Focused test commands and pass counts.
3. Projection totals and the absence of requested cards from `disabledAgents`.
4. GPT-5.6 official API limits, `openai-codex` transport evidence, and the final context decision.
5. Commit hashes and pushed branch.
6. Residual risk as one checkable condition that would reverse admission, chiefly a newer failed canary or provider catalog/model-ID drift.
