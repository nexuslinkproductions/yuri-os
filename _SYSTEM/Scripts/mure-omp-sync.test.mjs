import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { cpSync, mkdtempSync, mkdirSync, readFileSync, readdirSync, writeFileSync, rmSync, statSync, symlinkSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import test from 'node:test';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

// ── Model facts (from omp-model-resolver.test.mjs + provider-route-registry.json) ──
// OK, canary-proven:
const M_OK_HAIKU      = 'anthropic/claude-haiku-4-5';   // selector unchanged
// Terra (openai/gpt-5.6-terra) is live quota-blocked (registry_blocked) as of
// 2026-07-11 — it now resolves FAIL_CLOSED. MiniMax-M3 replaces it wherever
// OK/dispatch-eligible semantics are needed; a dedicated fail-closed
// assertion below covers live Terra explicitly instead of relying on it as
// an incidental OK fixture.
const M_OK_TERRA      = 'minimax-portal/MiniMax-M3';    // selector: minimax-code/MiniMax-M3
const M_OK_TERRA_SELECTOR = 'minimax-code/MiniMax-M3';
const M_LIVE_TERRA_BLOCKED = 'openai/gpt-5.6-terra';    // now FAIL_CLOSED (registry_blocked)
const M_OK_OPUS       = 'anthropic/claude-opus-4-8';     // selector unchanged
// FAIL_CLOSED:
const M_FAIL_CLINE    = 'cline-pass/cline-pass/mimo-v2.5'; // cline_unavailable
const M_FAIL_FABLE    = 'anthropic/claude-fable-5';        // model_excluded

// Source paths in the real repo — copied into each fixture so the script
// (when it exists) resolves imports relative to itself without touching
// the production repo for input or output.
const SYNC_SRC     = path.join(REPO_ROOT, '_SYSTEM', 'Scripts', 'mure-omp-sync.mjs');
const RESOLVER_SRC = path.join(REPO_ROOT, '_SYSTEM', 'mure', 'omp-model-resolver.mjs');
const REGISTRY_SRC = path.join(REPO_ROOT, '_SYSTEM', 'config', 'provider-route-registry.json');

// ── Helpers ────────────────────────────────────────────────────────────────

function mkdirDeep(dir) {
  mkdirSync(dir, { recursive: true });
}

function writeJson(filePath, obj) {
  writeFileSync(filePath, JSON.stringify(obj, null, 2), 'utf8');
}

function readJson(filePath) {
  return JSON.parse(readFileSync(filePath, 'utf8'));
}

function readText(filePath) {
  return readFileSync(filePath, 'utf8');
}

function fileExists(p) {
  return statSync(p, { throwIfNoEntry: false })?.isFile() ?? false;
}

/**
 * Copy the sync script, resolver, and registry into a fixture so the
 * script runs self-contained: its imports resolve inside the fixture and
 * input/output paths are resolved relative to cwd (the fixture root).
 * Throws if the sync script does not exist yet (contract enforcement).
 */
function installScriptIntoFixture(fixtureRoot) {
  const dstSync     = path.join(fixtureRoot, '_SYSTEM', 'Scripts', 'mure-omp-sync.mjs');
  const dstResolver = path.join(fixtureRoot, '_SYSTEM', 'mure', 'omp-model-resolver.mjs');
  const dstRegistry = path.join(fixtureRoot, '_SYSTEM', 'config', 'provider-route-registry.json');

  mkdirDeep(path.dirname(dstSync));
  cpSync(SYNC_SRC, dstSync);

  mkdirDeep(path.dirname(dstResolver));
  cpSync(RESOLVER_SRC, dstResolver);

  mkdirDeep(path.dirname(dstRegistry));
  cpSync(REGISTRY_SRC, dstRegistry);

  return dstSync;
}

/**
 * Run the fixture-local copy of the sync script.
 * args: [] for default write, ['--check'] for drift check.
 * `env` merges onto (overriding) process.env — used for deterministic test
 * fault injection (MURE_OMP_SYNC_TEST_FAIL_AFTER_COMMIT) instead of
 * filesystem-permission tricks a privileged/root test runner could bypass.
 */
function runSync(args, { cwd, env } = {}) {
  const root = cwd || REPO_ROOT;
  const scriptPath = path.join(root, '_SYSTEM', 'Scripts', 'mure-omp-sync.mjs');
  return execFileSync(process.execPath, [scriptPath, ...args], {
    cwd: root,
    encoding: 'utf8',
    env: env ? { ...process.env, ...env } : process.env,
  });
}

/**
 * Create a temporary fixture directory shaped like the repo:
 *   .openclaw/mure-agent-catalog.json   ← fixture catalog (input)
 *   .omp/agents/                         ← output dir for agent cards
 *   .omp/config.yml                      ← config (created by sync)
 *   _SYSTEM/state/                       ← output dir for manifest
 *   _SYSTEM/Scripts/mure-omp-sync.mjs    ← copy of script
 *   _SYSTEM/mure/omp-model-resolver.mjs  ← copy of resolver
 *   _SYSTEM/config/provider-route-registry.json ← copy of registry
 * Returns { root, catalog, ompDir, agentDir, stateDir, scriptPath }.
 */
function makeFixture(catalogOverrides) {
  const root = mkdtempSync(path.join(os.tmpdir(), 'omp-sync-'));
  const ompDir = path.join(root, '.omp');
  const agentDir = path.join(ompDir, 'agents');
  const stateDir = path.join(root, '_SYSTEM', 'state');
  const catalogDir = path.join(root, '.openclaw');
  const catalogPath = path.join(catalogDir, 'mure-agent-catalog.json');

  mkdirDeep(catalogDir);
  mkdirDeep(agentDir);
  mkdirDeep(stateDir);

  const catalog = buildCatalog(catalogOverrides);
  writeJson(catalogPath, catalog);

  const scriptPath = installScriptIntoFixture(root);

  return { root, catalogPath, catalog, ompDir, agentDir, stateDir, scriptPath };
}

/**
 * Build a minimal catalog for testing.
 * `overrides.agents` replaces the agent list; `overrides.pending` adds
 * pendingVariants to the first agent.
 */
function buildCatalog(overrides = {}) {
  const agents = overrides.agents || [
    {
      name: 'mure-scout',
      lane: 'worker',
      description: 'Scout agent for research.',
      model: M_OK_HAIKU,
      thinkingLevel: 'medium',
      tools: ['read', 'grep', 'glob'],
      spawns: '*',
      mission: 'scout things',
      capabilities: ['research'],
      autonomy: 'autonomous',
      notes: 'Lightweight worker.',
      variants: [
        {
          id: 'mure-scout-terra',
          model: M_OK_TERRA,
          thinkingLevel: 'high',
          tools: ['read', 'grep', 'glob', 'edit', 'write', 'bash'],
        },
      ],
      selection: 'surfaced-light',
      skills: ['brainstorming'],
    },
    {
      name: 'mure-cline',
      lane: 'worker',
      description: 'Cline-backed agent (unavailable in OMP).',
      model: M_FAIL_CLINE,
      thinkingLevel: 'medium',
      tools: ['read', 'grep'],
      spawns: 'mure-scout',
      mission: 'cline things',
      capabilities: ['research'],
      autonomy: 'autonomous',
      notes: 'Cline — fail closed.',
      variants: [],
      selection: 'surfaced-light',
      skills: [],
    },
  ];

  // Attach pendingVariants if requested
  if (overrides.pending !== undefined) {
    agents[0].pendingVariants = overrides.pending;
  }

  const allModels = [];
  for (const agent of agents) {
    if (agent.model) allModels.push(agent.model);
    if (agent.variants) {
      for (const v of agent.variants) {
        if (v.model) allModels.push(v.model);
      }
    }
    if (agent.pendingVariants) {
      for (const pv of agent.pendingVariants) {
        if (pv.model) allModels.push(pv.model);
      }
    }
  }

  const providerMapping = {};
  for (const m of [...new Set(allModels)]) {
    providerMapping[m] = m;
  }

  return {
    source: 'OpenClaw-native agent definitions from .openclaw/agents/',
    agentCardRoot: '.openclaw/agents',
    generated: '2026-07-11T00:00:00.000Z',
    providerMapping,
    agents,
  };
}

/**
 * Count expected cards: base agents + all variants (excluding pendingVariants).
 */
function expectedCardCount(catalog) {
  let count = 0;
  for (const agent of catalog.agents) {
    count++; // base agent
    if (agent.variants) count += agent.variants.length;
    // pendingVariants are explicitly NOT counted
  }
  return count;
}

// ── Basic projection: card counts ──────────────────────────────────────────

test('projected cards = base agents + variants (excluding pendingVariants)', () => {
  const fixture = makeFixture();
  try {
    runSync([], { cwd: fixture.root });
    const cardFiles = readdirSync(fixture.agentDir).filter(f => f.endsWith('.md'));
    assert.equal(cardFiles.length, expectedCardCount(fixture.catalog),
      `expected ${expectedCardCount(fixture.catalog)} card files, got ${cardFiles.length}`);
  } finally {
    rmSync(fixture.root, { recursive: true, force: true });
  }
});

test('pendingVariants produce no agent cards', () => {
  const fixture = makeFixture({
    agents: [
      {
        name: 'mure-scout',
        lane: 'worker',
        description: 'Scout.',
        model: M_OK_HAIKU,
        thinkingLevel: 'medium',
        tools: ['read'],
        spawns: '*',
        mission: 'scout',
        capabilities: ['research'],
        autonomy: 'autonomous',
        notes: '',
        variants: [{ id: 'mure-scout-terra', model: M_OK_TERRA }],
        selection: 'surfaced-light',
        skills: [],
      },
    ],
    pending: [
      { id: 'mure-scout-pending', model: M_OK_HAIKU },
      { id: 'mure-scout-pending2', model: M_OK_TERRA },
    ],
  });
  try {
    runSync([], { cwd: fixture.root });
    const cardFiles = readdirSync(fixture.agentDir).filter(f => f.endsWith('.md'));
    // 2 expected: mure-scout (base) + mure-scout-terra (variant)
    assert.equal(cardFiles.length, 2, `expected 2 cards (base + 1 variant), got ${cardFiles.length}`);

    // pending ids must not appear in any filename
    const filenames = cardFiles.join(' ');
    assert.ok(!filenames.includes('pending'), `pending variant leaked into filenames: [${cardFiles.join(', ')}]`);
  } finally {
    rmSync(fixture.root, { recursive: true, force: true });
  }
});


// ── Sentinel model: defense in depth for fail-closed cards ─────────────────
// Contract: every projected card carries `model` in frontmatter. Resolver-OK
// cards use their resolved selector; disabled (FAIL_CLOSED) cards use the
// literal sentinel `disabled/mure-route-unavailable` — an intentionally
// unregistered provider that fails locally rather than inheriting the parent
// model from stale session settings. The manifest records `resolvedModel: null`
// for disabled entries; the sentinel exists only in emitted frontmatter.

const DISABLED_SENTINEL = 'disabled/mure-route-unavailable';

test('every projected card carries model; disabled use sentinel, enabled never do', () => {
  const fixture = makeFixture({
    agents: [
      {
        name: 'mure-scout',
        lane: 'worker',
        description: 'Scout (OK).',
        model: M_OK_HAIKU,
        thinkingLevel: 'medium',
        tools: ['read'],
        spawns: '*',
        mission: 'scout',
        capabilities: ['research'],
        autonomy: 'autonomous',
        notes: '',
        variants: [{ id: 'mure-scout-terra', model: M_OK_TERRA, thinkingLevel: 'high' }],
        selection: 'surfaced-light',
        skills: [],
      },
      {
        name: 'mure-cline',
        lane: 'worker',
        description: 'Cline — unavailable (fail-closed).',
        model: M_FAIL_CLINE,
        thinkingLevel: 'medium',
        tools: ['read'],
        spawns: '*',
        mission: 'cline',
        capabilities: ['research'],
        autonomy: 'autonomous',
        notes: '',
        variants: [],
        selection: 'surfaced-light',
        skills: [],
      },
      {
        name: 'mure-fable',
        lane: 'worker',
        description: 'Fable — excluded (fail-closed).',
        model: M_FAIL_FABLE,
        thinkingLevel: 'high',
        tools: ['read'],
        spawns: '*',
        mission: 'fable',
        capabilities: ['synthesis'],
        autonomy: 'autonomous',
        notes: '',
        variants: [],
        selection: 'surfaced-light',
        skills: [],
        params: {},
      },
    ],
  });

  const OK_NAMES          = ['mure-scout', 'mure-scout-terra'];
  const DISABLED_NAMES    = ['mure-cline', 'mure-fable'];
  const ALL_NAMES         = [...OK_NAMES, ...DISABLED_NAMES];

  // ── Expected resolved selectors for OK cards ──
  const expectedModel = {
    'mure-scout':       'anthropic/claude-haiku-4-5',
    'mure-scout-terra': M_OK_TERRA_SELECTOR,
  };

  try {
    runSync([], { cwd: fixture.root });

    // ── 1. Every card file exists and carries model in frontmatter ──────────
    for (const name of ALL_NAMES) {
      const cardPath = path.join(fixture.agentDir, `${name}.md`);
      assert.ok(fileExists(cardPath), `card ${name}.md must exist`);
      const content = readText(cardPath);

      // Extract YAML frontmatter between --- fences
      const fmMatch = content.match(/^---\n([\s\S]*?)\n---/);
      assert.ok(fmMatch !== null,
        `${name}.md must have YAML frontmatter (--- fences)`);
      const frontmatter = fmMatch[1];

      const modelMatch = frontmatter.match(/^model:\s*(.+)$/m);
      assert.ok(modelMatch !== null,
        `${name}.md must have model field in frontmatter`);

      const modelValue = modelMatch[1];

      if (DISABLED_NAMES.includes(name)) {
        assert.strictEqual(modelValue, DISABLED_SENTINEL,
          `${name}.md model must be the disabled sentinel`);
      } else {
        assert.notStrictEqual(modelValue, DISABLED_SENTINEL,
          `${name}.md (OK) must not carry the disabled sentinel`);
        assert.strictEqual(modelValue, expectedModel[name],
          `${name}.md must have correct resolved model`);
      }
    }

    // ── 2. Manifest: disabled entries have resolvedModel null ───────────────
    const manifestPath = path.join(fixture.stateDir, 'mure-omp-projection.json');
    assert.ok(fileExists(manifestPath), 'manifest must exist');
    const manifest = readJson(manifestPath);
    assert.ok(Array.isArray(manifest.cards), 'manifest must have cards array');

    const manifestNames = manifest.cards.map(c => c.filename || c.cardName).sort();
    assert.deepStrictEqual(manifestNames, [...ALL_NAMES].sort(),
      'manifest.cards must list every projected card, no extras');

    for (const entry of manifest.cards) {
      const name = entry.filename || entry.cardName;
      assert.ok(name !== undefined, 'every manifest card entry must have a name');
      assert.ok('resolvedModel' in entry,
        `manifest entry for ${name} must have resolvedModel key`);

      if (DISABLED_NAMES.includes(name)) {
        assert.strictEqual(entry.resolvedModel, null,
          `manifest entry ${name} (disabled) must have resolvedModel: null`);
        assert.strictEqual(entry.status, 'FAIL_CLOSED',
          `manifest entry ${name} must have status FAIL_CLOSED`);
      } else {
        assert.notStrictEqual(entry.resolvedModel, null,
          `manifest entry ${name} (OK) must have non-null resolvedModel`);
        assert.strictEqual(entry.status, 'OK',
          `manifest entry ${name} must have status OK`);
      }
    }

    // ── 3. Config: disabledAgents is complete and scoped correctly ──────────
    const configPath = path.join(fixture.ompDir, 'config.yml');
    assert.ok(fileExists(configPath), 'config.yml must be created');
    const config = readText(configPath);

    // ── 3a. Extract disabledAgents block and compare as exact sorted set ──
    const lines = config.split('\n');
    const daIdx = lines.findIndex(l => l.trimEnd() === '  disabledAgents:');
    assert.notStrictEqual(daIdx, -1, 'config must have disabledAgents: line');

    const daEntries = [];
    for (let i = daIdx + 1; i < lines.length; i++) {
      const line = lines[i];
      // entry lines are indented deeper than the key itself
      if (line.startsWith('    - ')) {
        daEntries.push(line.slice(6)); // strip '    - '
      } else if (line.trim() === '' || line.startsWith('    #')) {
        continue; // comments and blanks inside the block
      } else if (/^\S/.test(line)) {
        break; // next top-level key ends the block
      } else {
        break; // anything else also ends
      }
    }

    assert.deepStrictEqual(
      daEntries.sort(),
      DISABLED_NAMES.sort(),
      'disabledAgents must contain exactly the disabled card names, no extras'
    );

    // ── 3b. OK cards must never appear in the disabledAgents block ─────────
    for (const name of OK_NAMES) {
      assert.ok(!daEntries.includes(name),
        `'${name}' (OK) must not appear in disabledAgents`);
    }
  } finally {
    rmSync(fixture.root, { recursive: true, force: true });
  }
});


// ── No parent-model inheritance ─────────────────────────────────────────────

test('missing model on variant aborts generation with zero partial projection', () => {
  const fixture = makeFixture({
    agents: [
      {
        name: 'mure-scout',
        lane: 'worker',
        description: 'Scout with OK model.',
        model: M_OK_HAIKU,
        thinkingLevel: 'medium',
        tools: ['read'],
        spawns: '*',
        mission: 'scout',
        capabilities: ['research'],
        autonomy: 'autonomous',
        notes: '',
        variants: [
          { id: 'mure-scout-terra', model: M_OK_TERRA, thinkingLevel: 'high' },
          // NO model field — must fail validation, not inherit or become disabled
          { id: 'mure-scout-nomodel' },
        ],
        selection: 'surfaced-light',
        skills: [],
      },
    ],
  });
  try {
    let caught = null;
    try {
      runSync([], { cwd: fixture.root });
    } catch (err) {
      caught = err;
    }
    assert.ok(caught, 'sync must throw on missing-model variant');
    assert.notEqual(caught.status, 0, 'sync must exit non-zero on validation failure');
    assert.ok(/missing required.*model/i.test(String(caught.stderr || caught.message)),
      'stderr must contain model validation error, got: ' + String(caught.stderr || caught.message));

    // Zero partial projection: no agent cards, no config, no manifest
    const cardFiles = readdirSync(fixture.agentDir).filter(f => f.endsWith('.md'));
    assert.equal(cardFiles.length, 0, 'no agent cards must be written on validation failure');

    const configPath = path.join(fixture.ompDir, 'config.yml');
    assert.ok(!fileExists(configPath), 'config.yml must not exist on validation failure');

    const manifestPath = path.join(fixture.stateDir, 'mure-omp-projection.json');
    assert.ok(!fileExists(manifestPath), 'manifest must not exist on validation failure');
  } finally {
    rmSync(fixture.root, { recursive: true, force: true });
  }
});

// ── disabledAgents in config ────────────────────────────────────────────────

test('config disabledAgents lists all fail-closed cards', () => {
  const fixture = makeFixture({
    agents: [
      {
        name: 'mure-scout',
        lane: 'worker',
        description: 'Scout (OK).',
        model: M_OK_HAIKU,
        thinkingLevel: 'medium',
        tools: ['read'],
        spawns: '*',
        mission: 'scout',
        capabilities: ['research'],
        autonomy: 'autonomous',
        notes: '',
        variants: [],
        selection: 'surfaced-light',
        skills: [],
      },
      {
        name: 'mure-cline',
        lane: 'worker',
        description: 'Cline (fail-closed).',
        model: M_FAIL_CLINE,
        thinkingLevel: 'medium',
        tools: ['read'],
        spawns: '*',
        mission: 'cline',
        capabilities: ['research'],
        autonomy: 'autonomous',
        notes: '',
        variants: [],
        selection: 'surfaced-light',
        skills: [],
      },
    ],
  });
  try {
    runSync([], { cwd: fixture.root });

    const configPath = path.join(fixture.ompDir, 'config.yml');
    assert.ok(fileExists(configPath), 'config.yml must be created');
    const config = readText(configPath);

    // mure-cline MUST be in disabledAgents (fail-closed)
    assert.ok(config.includes('mure-cline'),
      'config must include mure-cline in disabledAgents');

    // mure-scout MUST have a model (it is OK, not disabled)
    const scoutCard = readText(path.join(fixture.agentDir, 'mure-scout.md'));
    assert.ok(scoutCard.includes('model: anthropic/claude-haiku-4-5'),
      'mure-scout (OK) must have model field — it is dispatch-eligible');
  } finally {
    rmSync(fixture.root, { recursive: true, force: true });
  }
});

test('config includes maxRecursionDepth: 2, modelRoles.smol, modelRoles.slow', () => {
  const fixture = makeFixture();
  try {
    runSync([], { cwd: fixture.root });

    const config = readText(path.join(fixture.ompDir, 'config.yml'));
    assert.ok(/maxRecursionDepth:\s*2/.test(config), 'config must set maxRecursionDepth: 2');
    assert.ok(/anthropic\/claude-haiku-4-5/.test(config), 'config must set smol model role');
    assert.ok(/anthropic\/claude-opus-4-8/.test(config), 'config must set slow model role');
    assert.ok(!/^\s*default:/.test(config), 'generated config must not contain modelRoles.default');
  } finally {
    rmSync(fixture.root, { recursive: true, force: true });
  }
});

test('generated config omits modelRoles.default', () => {
  const fixture = makeFixture();
  try {
    const configPath = path.join(fixture.ompDir, 'config.yml');
    // Pre-seed with generator-owned config that has a default — it must be stripped
    writeFileSync(configPath, [
      '# GENERATED BY mure-omp-sync.mjs — DO NOT EDIT',
      'modelRoles:',
      '  default: openai/gpt-5.6-sol',
      'task:',
      '  maxRecursionDepth: 2',
    ].join('\n') + '\n', 'utf8');

    runSync([], { cwd: fixture.root });

    const config = readText(configPath);
    assert.ok(!/^\s*default:/.test(config),
      'regenerated config must not contain modelRoles.default');
    assert.ok(/modelRoles:/.test(config),
      'config must still have modelRoles section');
    assert.ok(/smol:/.test(config),
      'config must have modelRoles.smol');
    assert.ok(/slow:/.test(config),
      'config must have modelRoles.slow');
  } finally {
    rmSync(fixture.root, { recursive: true, force: true });
  }
});

// ── Config ownership refusal ────────────────────────────────────────────────

test('refuses to overwrite config without ownership marker', () => {
  const fixture = makeFixture();
  try {
    const configPath = path.join(fixture.ompDir, 'config.yml');
    const customContent = 'modelRoles:\n  default: anthropic/claude-opus-4-8\n';
    writeFileSync(configPath, customContent, 'utf8');
    const originalBytes = readFileSync(configPath);

    try {
      runSync([], { cwd: fixture.root });
    } catch {
      // Non-zero exit on refusal is acceptable
    }

    const newBytes = readFileSync(configPath);
    assert.deepEqual(newBytes, originalBytes,
      'config without ownership marker must be byte-for-byte unchanged');
  } finally {
    rmSync(fixture.root, { recursive: true, force: true });
  }
});

test('allows overwrite of config with ownership marker', () => {
  const fixture = makeFixture();
  try {
    const configPath = path.join(fixture.ompDir, 'config.yml');
    const oldContent = '# GENERATED BY mure-omp-sync.mjs — DO NOT EDIT\ntask:\n  old: true\n';
    writeFileSync(configPath, oldContent, 'utf8');

    runSync([], { cwd: fixture.root });

    const config = readText(configPath);
    assert.ok(!config.includes('old: true'), 'owned config must be overwritten by generator');
    assert.ok(/maxRecursionDepth/.test(config), 'owned config must receive new content');
  } finally {
    rmSync(fixture.root, { recursive: true, force: true });
  }
});

// ── Stale generated agent cleanup ───────────────────────────────────────────

test('removes stale generated agent files that carry the ownership marker', () => {
  const fixture = makeFixture();
  try {
    const stalePath = path.join(fixture.agentDir, 'mure-stale.md');
    writeFileSync(stalePath,
      '---\n# GENERATED BY mure-omp-sync.mjs — DO NOT EDIT\nname: mure-stale\ndescription: "Stale generated card"\n---\nStale body.\n',
      'utf8');

    runSync([], { cwd: fixture.root });

    assert.ok(!fileExists(stalePath),
      'stale generated card with ownership marker must be removed');
  } finally {
    rmSync(fixture.root, { recursive: true, force: true });
  }
});

test('preserves non-generated stale files lacking ownership marker', () => {
  const fixture = makeFixture();
  try {
    const userPath = path.join(fixture.agentDir, 'mure-user-owned.md');
    const userContent = '---\nname: mure-user-owned\ndescription: User card\n---\nCustom body\n';
    writeFileSync(userPath, userContent, 'utf8');
    const originalBytes = readFileSync(userPath);

    runSync([], { cwd: fixture.root });

    assert.ok(fileExists(userPath), 'non-generated user file must survive');
    const newBytes = readFileSync(userPath);
    assert.deepEqual(newBytes, originalBytes,
      'non-generated user file must be byte-for-byte unchanged');
  } finally {
    rmSync(fixture.root, { recursive: true, force: true });
  }
});

test('expected-name agent without ownership marker causes sync to fail and preserves bytes', () => {
  const fixture = makeFixture({
    agents: [
      {
        name: 'mure-scout',
        lane: 'worker',
        description: 'Scout.',
        model: M_OK_HAIKU,
        thinkingLevel: 'medium',
        tools: ['read'],
        spawns: '*',
        mission: 'scout',
        capabilities: ['research'],
        autonomy: 'autonomous',
        notes: '',
        variants: [],
        selection: 'surfaced-light',
        skills: [],
      },
    ],
  });
  try {
    // Pre-seed an expected-name card (mure-scout.md) without ownership marker
    const expectedPath = path.join(fixture.agentDir, 'mure-scout.md');
    const foreignContent = '---\nname: mure-scout\ndescription: "User-owned override"\n---\nUser body.\n';
    writeFileSync(expectedPath, foreignContent, 'utf8');
    const foreignBytes = readFileSync(expectedPath);

    let caught = null;
    try {
      runSync([], { cwd: fixture.root });
    } catch (err) {
      caught = err;
    }
    assert.ok(caught, 'sync must throw on unowned expected-name card');
    assert.notEqual(caught.status, 0, 'sync must exit non-zero');

    // Bytes must be preserved byte-for-byte
    const afterBytes = readFileSync(expectedPath);
    assert.deepEqual(afterBytes, foreignBytes,
      'unowned expected-name card must be byte-for-byte unchanged');

    // No other outputs must have been written
    const configPath = path.join(fixture.ompDir, 'config.yml');
    assert.ok(!fileExists(configPath), 'config.yml must not exist after preflight rejection');
  } finally {
    rmSync(fixture.root, { recursive: true, force: true });
  }
});

test('non-expected unowned mure-*.md survives while separately deleted owned card regenerates', () => {
  const fixture = makeFixture({
    agents: [
      {
        name: 'mure-scout',
        lane: 'worker',
        description: 'Scout.',
        model: M_OK_HAIKU,
        thinkingLevel: 'medium',
        tools: ['read'],
        spawns: '*',
        mission: 'scout',
        capabilities: ['research'],
        autonomy: 'autonomous',
        notes: '',
        variants: [],
        selection: 'surfaced-light',
        skills: [],
      },
      {
        name: 'mure-engineer',
        lane: 'worker',
        description: 'Engineer.',
        model: M_OK_TERRA,
        thinkingLevel: 'high',
        tools: ['read', 'write'],
        spawns: '*',
        mission: 'build',
        capabilities: ['implementation'],
        autonomy: 'autonomous',
        notes: '',
        variants: [],
        selection: 'surfaced-heavy',
        skills: [],
      },
    ],
  });
  try {
    // First sync to create the canonical projection
    runSync([], { cwd: fixture.root });
    assert.ok(fileExists(path.join(fixture.agentDir, 'mure-scout.md')), 'mure-scout.md must exist after first sync');
    assert.ok(fileExists(path.join(fixture.agentDir, 'mure-engineer.md')), 'mure-engineer.md must exist after first sync');

    // Create a non-expected unowned mure-*.md file (not in catalog)
    const foreignPath = path.join(fixture.agentDir, 'mure-foreign.md');
    const foreignContent = '---\nname: mure-foreign\ndescription: "User file"\n---\nUser body.\n';
    writeFileSync(foreignPath, foreignContent, 'utf8');
    const foreignBytes = readFileSync(foreignPath);

    // Delete one owned card (mure-engineer.md) to simulate drift
    rmSync(path.join(fixture.agentDir, 'mure-engineer.md'));

    // Second sync: foreign file survives, deleted owned card regenerates
    runSync([], { cwd: fixture.root });

    // Foreign file must survive byte-for-byte
    assert.ok(fileExists(foreignPath), 'non-expected unowned file must survive sync');
    const afterBytes = readFileSync(foreignPath);
    assert.deepEqual(afterBytes, foreignBytes,
      'non-expected unowned file must be byte-for-byte unchanged');

    // Deleted owned card must be regenerated
    assert.ok(fileExists(path.join(fixture.agentDir, 'mure-engineer.md')),
      'deleted owned card mure-engineer.md must be regenerated');

    // Other owned card must still exist
    assert.ok(fileExists(path.join(fixture.agentDir, 'mure-scout.md')),
      'other owned card mure-scout.md must still exist');
  } finally {
    rmSync(fixture.root, { recursive: true, force: true });
  }
});

// ── Required frontmatter and body ───────────────────────────────────────────

test('every card has required frontmatter: name and description', () => {
  const fixture = makeFixture();
  try {
    runSync([], { cwd: fixture.root });

    const cardFiles = readdirSync(fixture.agentDir).filter(f => f.endsWith('.md'));
    assert.ok(cardFiles.length > 0, 'must have at least one card');

    for (const file of cardFiles) {
      const content = readText(path.join(fixture.agentDir, file));
      assert.ok(/^name:\s*.+/m.test(content), `${file}: missing required "name" field`);
      assert.ok(/^description:\s*.+/m.test(content), `${file}: missing required "description" field`);
    }
  } finally {
    rmSync(fixture.root, { recursive: true, force: true });
  }
});

test('every card has a non-empty body with provenance text', () => {
  const fixture = makeFixture();
  try {
    runSync([], { cwd: fixture.root });

    const cardFiles = readdirSync(fixture.agentDir).filter(f => f.endsWith('.md'));
    for (const file of cardFiles) {
      const content = readText(path.join(fixture.agentDir, file));
      const bodyMatch = content.match(/^---\n[\s\S]*?\n---\n([\s\S]*)$/);
      if (!bodyMatch) {
        assert.fail(`${file}: missing frontmatter delimiters`);
      }
      const body = bodyMatch[1].trim();
      assert.ok(body.length > 0, `${file}: body must not be empty`);
    }
  } finally {
    rmSync(fixture.root, { recursive: true, force: true });
  }
});

// ── Role identity ───────────────────────────────────────────────────────────

test('role identity is from catalog name, not registry agentId', () => {
  // Haiku's registry agentId is "mure-scout" — using a different catalog
  // name proves the sync module preserves catalog identity.
  const CATALOG_NAME = 'mure-fixture-scout';
  const fixture = makeFixture({
    agents: [
      {
        name: CATALOG_NAME,
        lane: 'worker',
        description: 'Fixture scout with name distinct from registry agentId.',
        model: M_OK_HAIKU,  // registry agentId for Haiku is "mure-scout"
        thinkingLevel: 'medium',
        tools: ['read'],
        spawns: '*',
        mission: 'scout',
        capabilities: ['research'],
        autonomy: 'autonomous',
        notes: '',
        variants: [{ id: 'mure-fixture-scout-terra', model: M_OK_TERRA }],
        selection: 'surfaced-light',
        skills: [],
      },
    ],
  });
  try {
    runSync([], { cwd: fixture.root });

    // Base card must use the catalog name, not the registry agentId
    const baseCard = readText(path.join(fixture.agentDir, `${CATALOG_NAME}.md`));
    const baseFmMatch = baseCard.match(/^---\n([\s\S]*?)\n---/);
    assert.ok(baseFmMatch, 'base card must have valid frontmatter delimiters');
    const baseFrontmatter = baseFmMatch[1];

    assert.ok(baseFrontmatter.includes(`name: ${CATALOG_NAME}`),
      `base card name must be "${CATALOG_NAME}" (catalog), got: ${baseFrontmatter.match(/^name:\s*(.+)$/m)?.[1]}`);
    assert.ok(!baseFrontmatter.includes('name: mure-scout'),
      `base card must NOT use registry agentId "mure-scout" as name`);
    assert.ok(!/^(?:agentId|evidenceAgentId)\s*:/m.test(baseFrontmatter),
      'agentId and evidenceAgentId keys must not appear in frontmatter');

    // Variant card also checked
    const varCard = readText(path.join(fixture.agentDir, 'mure-fixture-scout-terra.md'));
    const varFmMatch = varCard.match(/^---\n([\s\S]*?)\n---/);
    assert.ok(varFmMatch, 'variant card must have valid frontmatter delimiters');
    const varFrontmatter = varFmMatch[1];
    assert.ok(!/^(?:agentId|evidenceAgentId)\s*:/m.test(varFrontmatter),
      'agentId and evidenceAgentId keys must not appear in variant frontmatter');
  } finally {
    rmSync(fixture.root, { recursive: true, force: true });
  }
});

// ── Tools and spawns ────────────────────────────────────────────────────────

test('tools from catalog appear in card output', () => {
  const fixture = makeFixture({
    agents: [
      {
        name: 'mure-engineer',
        lane: 'worker',
        description: 'Engineer with full tool set.',
        model: M_OK_TERRA,
        thinkingLevel: 'high',
        tools: ['read', 'grep', 'glob', 'edit', 'write', 'bash'],
        spawns: '*',
        mission: 'build',
        capabilities: ['implementation'],
        autonomy: 'autonomous',
        notes: '',
        variants: [],
        selection: 'surfaced-heavy',
        skills: [],
        params: {},
      },
    ],
  });
  try {
    runSync([], { cwd: fixture.root });

    const card = readText(path.join(fixture.agentDir, 'mure-engineer.md'));
    for (const tool of ['read', 'grep', 'glob', 'edit', 'write', 'bash']) {
      assert.ok(card.includes(tool), `card must include tool: ${tool}`);
    }
  } finally {
    rmSync(fixture.root, { recursive: true, force: true });
  }
});

test('spawns field is preserved in cards that carry it', () => {
  const fixture = makeFixture({
    agents: [
      {
        name: 'mure-yuri',
        lane: 'orchestration',
        description: 'Yuri orchestrator with restricted spawns.',
        model: M_OK_OPUS,
        thinkingLevel: 'high',
        tools: ['read', 'grep', 'glob', 'edit', 'write', 'bash'],
        spawns: 'mure-scout, mure-engineer',
        mission: 'orchestrate',
        capabilities: ['dispatch'],
        autonomy: 'owner-gated',
        notes: '',
        variants: [],
        selection: 'surfaced-heavy',
        skills: [],
        params: {},
      },
      {
        name: 'mure-scout',
        lane: 'worker',
        description: 'Scout with wildcard spawns.',
        model: M_OK_HAIKU,
        thinkingLevel: 'medium',
        tools: ['read', 'grep', 'glob'],
        spawns: '*',
        mission: 'scout',
        capabilities: ['research'],
        autonomy: 'autonomous',
        notes: '',
        variants: [],
        selection: 'surfaced-light',
        skills: [],
      },
    ],
  });
  try {
    runSync([], { cwd: fixture.root });

    const yuriCard = readText(path.join(fixture.agentDir, 'mure-yuri.md'));
    assert.ok(/spawns:/.test(yuriCard), 'mure-yuri must have spawns field');
    assert.ok(yuriCard.includes('mure-scout') && yuriCard.includes('mure-engineer'),
      'mure-yuri spawns must include restricted agent names');

    const scoutCard = readText(path.join(fixture.agentDir, 'mure-scout.md'));
    assert.ok(/spawns:/.test(scoutCard), 'mure-scout with wildcard spawn must have spawns field');
  } finally {
    rmSync(fixture.root, { recursive: true, force: true });
  }
});

// ── Deterministic rendering ─────────────────────────────────────────────────

test('same catalog produces identical output across two runs', () => {
  const fixture = makeFixture();
  try {
    runSync([], { cwd: fixture.root });

    const firstFiles = {};
    for (const file of readdirSync(fixture.agentDir).filter(f => f.endsWith('.md'))) {
      firstFiles[file] = readText(path.join(fixture.agentDir, file));
    }
    const firstConfig = readText(path.join(fixture.ompDir, 'config.yml'));
    const firstManifest = readText(path.join(fixture.stateDir, 'mure-omp-projection.json'));

    // Clean generated output
    for (const file of Object.keys(firstFiles)) {
      rmSync(path.join(fixture.agentDir, file));
    }
    rmSync(path.join(fixture.ompDir, 'config.yml'));
    rmSync(path.join(fixture.stateDir, 'mure-omp-projection.json'));

    runSync([], { cwd: fixture.root });

    const secondFiles = {};
    for (const file of readdirSync(fixture.agentDir).filter(f => f.endsWith('.md'))) {
      secondFiles[file] = readText(path.join(fixture.agentDir, file));
    }
    const secondConfig = readText(path.join(fixture.ompDir, 'config.yml'));
    const secondManifest = readText(path.join(fixture.stateDir, 'mure-omp-projection.json'));

    assert.deepEqual(Object.keys(firstFiles).sort(), Object.keys(secondFiles).sort(),
      'same filenames must be produced across runs');

    for (const file of Object.keys(firstFiles)) {
      assert.equal(secondFiles[file], firstFiles[file],
        `${file} must be byte-identical across runs`);
    }

    assert.equal(secondConfig, firstConfig, 'config must be identical across runs');
    assert.equal(secondManifest, firstManifest, 'manifest must be identical across runs');
  } finally {
    rmSync(fixture.root, { recursive: true, force: true });
  }
});

// ── Check mode: drift detection without mutation ────────────────────────────

test('--check reports clean on freshly synced projection', () => {
  const fixture = makeFixture();
  try {
    runSync([], { cwd: fixture.root });

    const agentFiles = {};
    for (const file of readdirSync(fixture.agentDir).filter(f => f.endsWith('.md'))) {
      agentFiles[file] = readText(path.join(fixture.agentDir, file));
    }
    const configBytes = readFileSync(path.join(fixture.ompDir, 'config.yml'));
    const manifestBytes = readFileSync(path.join(fixture.stateDir, 'mure-omp-projection.json'));

    const checkOut = runSync(['--check'], { cwd: fixture.root });

    for (const [file, content] of Object.entries(agentFiles)) {
      assert.equal(readText(path.join(fixture.agentDir, file)), content,
        `${file} must not be mutated by --check`);
    }
    assert.deepEqual(readFileSync(path.join(fixture.ompDir, 'config.yml')), configBytes,
      'config must not be mutated by --check');
    assert.deepEqual(readFileSync(path.join(fixture.stateDir, 'mure-omp-projection.json')), manifestBytes,
      'manifest must not be mutated by --check');

    assert.ok(checkOut.length > 0, '--check must produce output');
  } finally {
    rmSync(fixture.root, { recursive: true, force: true });
  }
});

test('--check detects drift when an agent card is missing', () => {
  const fixture = makeFixture({
    agents: [
      {
        name: 'mure-scout',
        lane: 'worker',
        description: 'Scout.',
        model: M_OK_HAIKU,
        thinkingLevel: 'medium',
        tools: ['read'],
        spawns: '*',
        mission: 'scout',
        capabilities: ['research'],
        autonomy: 'autonomous',
        notes: '',
        variants: [],
        selection: 'surfaced-light',
        skills: [],
      },
    ],
  });
  try {
    runSync([], { cwd: fixture.root });

    const cardPath = path.join(fixture.agentDir, 'mure-scout.md');
    assert.ok(fileExists(cardPath), 'card must exist before drift');
    rmSync(cardPath);

    let drifted = false;
    try {
      const checkOut = runSync(['--check'], { cwd: fixture.root });
      const combined = checkOut.toLowerCase();
      if (combined.includes('mure-scout') || combined.includes('drift') || combined.includes('missing')) {
        drifted = true;
      }
    } catch (err) {
      const out = (err.stdout || '').toLowerCase();
      const errOut = (err.stderr || '').toLowerCase();
      if (out.includes('drift') || out.includes('missing') ||
          errOut.includes('drift') || errOut.includes('missing')) {
        drifted = true;
      }
    }

    assert.ok(drifted, '--check must detect missing card as drift');
    assert.ok(!fileExists(cardPath), '--check must not create missing cards');
  } finally {
    rmSync(fixture.root, { recursive: true, force: true });
  }
});

test('--check detects drift when card content differs', () => {
  const fixture = makeFixture({
    agents: [
      {
        name: 'mure-scout',
        lane: 'worker',
        description: 'Scout.',
        model: M_OK_HAIKU,
        thinkingLevel: 'medium',
        tools: ['read'],
        spawns: '*',
        mission: 'scout',
        capabilities: ['research'],
        autonomy: 'autonomous',
        notes: '',
        variants: [],
        selection: 'surfaced-light',
        skills: [],
      },
    ],
  });
  try {
    runSync([], { cwd: fixture.root });

    const cardPath = path.join(fixture.agentDir, 'mure-scout.md');
    writeFileSync(cardPath, readText(cardPath).replace(/description:.*/, 'description: Tampered'), 'utf8');
    const tamperedBytes = readFileSync(cardPath); // snapshot immediately after tampering

    let drifted = false;
    try {
      const checkOut = runSync(['--check'], { cwd: fixture.root });
      const combined = checkOut.toLowerCase();
      if (combined.includes('drift') || combined.includes('differ')) {
        drifted = true;
      }
    } catch (err) {
      const out = (err.stdout || '').toLowerCase();
      const errOut = (err.stderr || '').toLowerCase();
      if (out.includes('drift') || out.includes('differ') ||
          errOut.includes('drift') || errOut.includes('differ')) {
        drifted = true;
      }
    }

    assert.ok(drifted, '--check must detect content drift');

    // The tampered bytes must survive byte-for-byte — check mode never mutates
    assert.deepEqual(readFileSync(cardPath), tamperedBytes,
      'tampered content must survive --check byte-for-byte (no mutation on drift)');
  } finally {
    rmSync(fixture.root, { recursive: true, force: true });
  }
});

// ── Manifest count conservation ─────────────────────────────────────────────

test('manifest projected/executable/disabled counts are consistent', () => {
  const fixture = makeFixture({
    agents: [
      {
        name: 'mure-scout',
        lane: 'worker',
        description: 'Scout (OK).',
        model: M_OK_HAIKU,
        thinkingLevel: 'medium',
        tools: ['read'],
        spawns: '*',
        mission: 'scout',
        capabilities: ['research'],
        autonomy: 'autonomous',
        notes: '',
        variants: [{ id: 'mure-scout-terra', model: M_OK_TERRA }],
        selection: 'surfaced-light',
        skills: [],
      },
      {
        name: 'mure-cline',
        lane: 'worker',
        description: 'Cline (fail-closed).',
        model: M_FAIL_CLINE,
        thinkingLevel: 'medium',
        tools: ['read'],
        spawns: '*',
        mission: 'cline',
        capabilities: ['research'],
        autonomy: 'autonomous',
        notes: '',
        variants: [],
        selection: 'surfaced-light',
        skills: [],
      },
      {
        name: 'mure-fable',
        lane: 'worker',
        description: 'Fable (excluded, fail-closed).',
        model: M_FAIL_FABLE,
        thinkingLevel: 'high',
        tools: ['read'],
        spawns: '*',
        mission: 'fable',
        capabilities: ['synthesis'],
        autonomy: 'autonomous',
        notes: '',
        variants: [],
        selection: 'surfaced-light',
        skills: [],
        params: {},
      },
    ],
  });
  try {
    runSync([], { cwd: fixture.root });

    const manifestPath = path.join(fixture.stateDir, 'mure-omp-projection.json');
    assert.ok(fileExists(manifestPath), 'manifest must exist');
    const manifest = readJson(manifestPath);

    const expectedProjected = expectedCardCount(fixture.catalog);
    const cardFiles = readdirSync(fixture.agentDir).filter(f => f.endsWith('.md'));

    assert.equal(cardFiles.length, expectedProjected,
      `card file count (${cardFiles.length}) must equal projected (${expectedProjected})`);

    assert.ok(typeof manifest.projected === 'number', 'manifest must have projected count');
    assert.ok(typeof manifest.executable === 'number', 'manifest must have executable count');
    assert.ok(typeof manifest.disabled === 'number', 'manifest must have disabled count');

    assert.equal(manifest.projected, expectedProjected,
      `manifest.projected (${manifest.projected}) must equal expected (${expectedProjected})`);
    assert.equal(manifest.executable + manifest.disabled, expectedProjected,
      `executable + disabled = projected`);
    assert.equal(manifest.projected, cardFiles.length,
      `manifest.projected must equal card file count`);
    assert.ok(manifest.executable > 0, 'manifest.executable must be > 0');
    assert.ok(manifest.disabled > 0, 'manifest.disabled must be > 0');
    assert.ok(Array.isArray(manifest.cards), 'manifest must have cards array');
    assert.ok(!('stats' in manifest), 'manifest must not have nested stats object');
    assert.ok(!('agentCount' in manifest), 'manifest must not have agentCount field');
  } finally {
    rmSync(fixture.root, { recursive: true, force: true });
  }
});

test('manifest counts are computed dynamically, not hardcoded', () => {
  const small = makeFixture({
    agents: [
      {
        name: 'mure-scout',
        lane: 'worker',
        description: 'Scout.',
        model: M_OK_HAIKU,
        thinkingLevel: 'medium',
        tools: ['read'],
        spawns: '*',
        mission: 'scout',
        capabilities: ['research'],
        autonomy: 'autonomous',
        notes: '',
        variants: [],
        selection: 'surfaced-light',
        skills: [],
      },
    ],
  });
  const large = makeFixture({
    agents: [
      {
        name: 'mure-scout',
        lane: 'worker',
        description: 'Scout.',
        model: M_OK_HAIKU,
        thinkingLevel: 'medium',
        tools: ['read'],
        spawns: '*',
        mission: 'scout',
        capabilities: ['research'],
        autonomy: 'autonomous',
        notes: '',
        variants: [
          { id: 'mure-scout-a', model: M_OK_HAIKU },
          { id: 'mure-scout-b', model: M_OK_HAIKU },
          { id: 'mure-scout-c', model: M_OK_HAIKU },
        ],
        selection: 'surfaced-light',
        skills: [],
      },
      {
        name: 'mure-engineer',
        lane: 'worker',
        description: 'Engineer.',
        model: M_OK_TERRA,
        thinkingLevel: 'high',
        tools: ['read', 'write'],
        spawns: '*',
        mission: 'build',
        capabilities: ['implementation'],
        autonomy: 'autonomous',
        notes: '',
        variants: [{ id: 'mure-engineer-terra', model: M_OK_TERRA }],
        selection: 'surfaced-heavy',
        skills: [],
        params: {},
      },
    ],
  });
  try {
    runSync([], { cwd: small.root });
    runSync([], { cwd: large.root });

    const smallMan = readJson(path.join(small.stateDir, 'mure-omp-projection.json'));
    const largeMan = readJson(path.join(large.stateDir, 'mure-omp-projection.json'));

    assert.notEqual(smallMan.projected, largeMan.projected,
      `projected counts differ: small=${smallMan.projected}, large=${largeMan.projected} (not hardcoded)`);
    assert.notEqual(smallMan.executable, largeMan.executable,
      'executable counts must differ');

    assert.equal(smallMan.projected, 1, `small: projected = 1`);
    assert.equal(smallMan.executable, 1, `small: executable = 1`);
    assert.equal(smallMan.disabled, 0, `small: disabled = 0`);

    assert.equal(largeMan.projected, 6, `large: projected = 6`);
    assert.equal(largeMan.executable, 6, `large: executable = 6`);
    assert.equal(largeMan.disabled, 0, `large: disabled = 0`);
    assert.ok(Array.isArray(smallMan.cards), 'small manifest must have cards array');
    assert.ok(Array.isArray(largeMan.cards), 'large manifest must have cards array');
  } finally {
    rmSync(small.root, { recursive: true, force: true });
    rmSync(large.root, { recursive: true, force: true });
  }
});

// ── Collision handling ──────────────────────────────────────────────────────

test('handles naming collisions: variant id same as a different base agent name', () => {
  const fixture = makeFixture({
    agents: [
      {
        name: 'mure-scout',
        lane: 'worker',
        description: 'Base scout.',
        model: M_OK_HAIKU,
        thinkingLevel: 'medium',
        tools: ['read'],
        spawns: '*',
        mission: 'scout',
        capabilities: ['research'],
        autonomy: 'autonomous',
        notes: '',
        variants: [],
        selection: 'surfaced-light',
        skills: [],
      },
      {
        name: 'mure-engineer',
        lane: 'worker',
        description: 'Engineer base.',
        model: M_OK_TERRA,
        thinkingLevel: 'high',
        tools: ['read', 'write'],
        spawns: '*',
        mission: 'build',
        capabilities: ['implementation'],
        autonomy: 'autonomous',
        notes: '',
        variants: [{ id: 'mure-scout', model: M_OK_HAIKU }],
        selection: 'surfaced-heavy',
        skills: [],
      },
    ],
  });
  try {
    runSync([], { cwd: fixture.root });

    const cardFiles = readdirSync(fixture.agentDir).filter(f => f.endsWith('.md'));
    assert.equal(cardFiles.length, 3,
      `expected 3 cards (collision resolved), got ${cardFiles.length}: ${cardFiles.join(', ')}`);

    assert.equal(new Set(cardFiles).size, cardFiles.length, 'all filenames must be unique');
    assert.ok(cardFiles.includes('mure-scout.md'), 'base mure-scout.md must exist');
    assert.ok(cardFiles.includes('mure-engineer.md'), 'base mure-engineer.md must exist');

    // Collision-resolved card: deterministic <base>--<variant> form
    assert.ok(cardFiles.includes('mure-engineer--mure-scout.md'),
      `collision-resolved card must be mure-engineer--mure-scout.md, got: ${cardFiles.join(', ')}`);

    const collisionContent = readText(path.join(fixture.agentDir, 'mure-engineer--mure-scout.md'));

    // Frontmatter name must be the normalized qualified variant, not the raw variant id
    const collisionFmMatch = collisionContent.match(/^---\n([\s\S]*?)\n---/);
    assert.ok(collisionFmMatch, 'collision card must have valid frontmatter delimiters');
    const collisionFrontmatter = collisionFmMatch[1];
    const collisionName = collisionFrontmatter.match(/^name:\s*(.+)$/m)?.[1]?.trim();
    assert.equal(collisionName, 'mure-engineer--mure-scout',
      `collision card frontmatter name must be "mure-engineer--mure-scout", got "${collisionName}"`);

    // Its model must be Haiku (the variant's model)
    assert.ok(collisionContent.includes('model: anthropic/claude-haiku-4-5'),
      'collision card must contain Haiku model (the variant model)');

    // Collision card must carry its variant parent's description (engineer's)
    assert.ok(collisionFrontmatter.includes('description: "Engineer base."'),
      'collision card description must be the parent agent description');

    // The base mure-scout card must preserve its own description
    const baseCard = readText(path.join(fixture.agentDir, 'mure-scout.md'));
    assert.ok(baseCard.includes('description: "Base scout."'),
      'base mure-scout must preserve its own description');
  } finally {
    rmSync(fixture.root, { recursive: true, force: true });
  }
});

// ── State file output ───────────────────────────────────────────────────────

test('writes state manifest with projection metadata', () => {
  const fixture = makeFixture();
  try {
    runSync([], { cwd: fixture.root });

    const statePath = path.join(fixture.stateDir, 'mure-omp-projection.json');
    assert.ok(fileExists(statePath), 'state manifest must exist');
    const state = readJson(statePath);

    assert.ok(typeof state.projected === 'number');
    assert.ok(typeof state.executable === 'number');
    assert.ok(typeof state.disabled === 'number');
    assert.ok(typeof state.generated === 'string');
    assert.ok(Array.isArray(state.cards), 'manifest must have cards array');
  } finally {
    rmSync(fixture.root, { recursive: true, force: true });
  }
});

test('manifest preserves catalog.generated: "" round-trip (nullish coalescing, not truthiness) — --check stays clean', () => {
  const fixture = makeFixture();
  try {
    // catalog.generated is intentionally an empty string — `||` would
    // silently substitute null, discarding real (if unusual) provenance;
    // `??` preserves it exactly, since '' is not nullish.
    const catalog = readJson(fixture.catalogPath);
    catalog.generated = '';
    writeJson(fixture.catalogPath, catalog);

    runSync([], { cwd: fixture.root });

    const statePath = path.join(fixture.stateDir, 'mure-omp-projection.json');
    const state = readJson(statePath);
    assert.strictEqual(state.generated, '',
      'manifest.generated must round-trip the empty string exactly, not fall back to null');

    // --check must agree with what sync just wrote — no drift from the
    // empty-string provenance value.
    const checkOut = runSync(['--check'], { cwd: fixture.root });
    assert.ok(/^OK:/m.test(checkOut), `--check must report clean, got: ${checkOut}`);
  } finally {
    rmSync(fixture.root, { recursive: true, force: true });
  }
});

// ── Edge cases ──────────────────────────────────────────────────────────────

test('handles catalog with no agents', () => {
  const fixture = makeFixture({ agents: [] });
  try {
    runSync([], { cwd: fixture.root });

    const cardFiles = readdirSync(fixture.agentDir).filter(f => f.endsWith('.md'));
    assert.equal(cardFiles.length, 0, 'empty catalog must produce no cards');

    const state = readJson(path.join(fixture.stateDir, 'mure-omp-projection.json'));
    assert.equal(state.projected, 0);
    assert.equal(state.executable, 0);
    assert.equal(state.disabled, 0);
  } finally {
    rmSync(fixture.root, { recursive: true, force: true });
  }
});

test('handles agent without variants field', () => {
  const fixture = makeFixture({
    agents: [
      {
        name: 'mure-minimal',
        lane: 'worker',
        description: 'Minimal agent.',
        model: M_OK_HAIKU,
        thinkingLevel: 'medium',
        tools: ['read'],
        spawns: '*',
        mission: 'minimal',
        capabilities: ['basic'],
        autonomy: 'autonomous',
        notes: '',
        selection: 'surfaced-light',
        skills: [],
      },
    ],
  });
  try {
    runSync([], { cwd: fixture.root });

    const cardFiles = readdirSync(fixture.agentDir).filter(f => f.endsWith('.md'));
    assert.equal(cardFiles.length, 1, 'agent without variants field must produce 1 card');
    assert.ok(cardFiles.includes('mure-minimal.md'), 'base card must exist');
  } finally {
    rmSync(fixture.root, { recursive: true, force: true });
  }
});

test('handles agent with empty variants array', () => {
  const fixture = makeFixture({
    agents: [
      {
        name: 'mure-scout',
        lane: 'worker',
        description: 'Scout with empty variants.',
        model: M_OK_HAIKU,
        thinkingLevel: 'medium',
        tools: ['read'],
        spawns: '*',
        mission: 'scout',
        capabilities: ['research'],
        autonomy: 'autonomous',
        notes: '',
        variants: [],
        selection: 'surfaced-light',
        skills: [],
      },
    ],
  });
  try {
    runSync([], { cwd: fixture.root });

    const cardFiles = readdirSync(fixture.agentDir).filter(f => f.endsWith('.md'));
    assert.equal(cardFiles.length, 1, 'agent with empty variants must produce exactly 1 card');
  } finally {
    rmSync(fixture.root, { recursive: true, force: true });
  }
});

// ── CLI invocation through symlink alias ────────────────────────────────────
// Regression: on macOS /var → /private/var aliases caused the old
// resolve(process.argv[1]) === __filename guard to skip main(),
// producing empty stdout and no output files from every fixture.

test('CLI produces output and files when invoked through a symlink alias', () => {
  const fixture = makeFixture();
  const aliasParent = mkdtempSync(path.join(os.tmpdir(), 'omp-alias-'));
  const aliasRoot = path.join(aliasParent, 'fixture');
  symlinkSync(fixture.root, aliasRoot, 'dir');

  try {
    const scriptViaAlias = path.join(aliasRoot, '_SYSTEM', 'Scripts', 'mure-omp-sync.mjs');
    const stdout = execFileSync(process.execPath, [scriptViaAlias], {
      cwd: fixture.root,
      encoding: 'utf8',
      env: process.env,
    });

    assert.ok(stdout.includes('Synced:'), 'stdout contains Synced: count');
    assert.ok(stdout.includes('Config:'), 'stdout contains Config: path');
    assert.ok(stdout.includes('Manifest:'), 'stdout contains Manifest: path');

    assert.ok(fileExists(path.join(fixture.ompDir, 'config.yml')), '.omp/config.yml exists');

    const agents = readdirSync(fixture.agentDir).filter(f => f.endsWith('.md'));
    assert.ok(agents.length > 0, 'at least one agent card written');

    const manifestPath = path.join(fixture.stateDir, 'mure-omp-projection.json');
    assert.ok(fileExists(manifestPath), 'state manifest exists');
  } finally {
    rmSync(aliasParent, { recursive: true, force: true });
    rmSync(fixture.root, { recursive: true, force: true });
  }
});


// ── Item 1: staged multi-artifact publication with rollback ────────────────

test('injected commit failure after prior commits triggers full rollback (staged transaction)', () => {
  const fixture = makeFixture();
  const stateDir = fixture.stateDir;
  try {
    runSync([], { cwd: fixture.root });

    const cardPath = path.join(fixture.agentDir, 'mure-scout.md');
    const configPath = path.join(fixture.ompDir, 'config.yml');
    const manifestPath = path.join(stateDir, 'mure-omp-projection.json');

    const originalCard = readFileSync(cardPath);
    const originalConfig = readFileSync(configPath);
    const originalManifest = readFileSync(manifestPath);

    // Mutate the on-disk catalog so a successful re-sync would produce
    // different bytes — proves rollback restores the ORIGINAL content,
    // not merely "doesn't crash".
    const mutatedCatalog = readJson(fixture.catalogPath);
    mutatedCatalog.agents[0].description = 'MUTATED — must never land on disk.';
    writeJson(fixture.catalogPath, mutatedCatalog);

    // Deterministic fault injection, NOT a filesystem-permission trick: a
    // privileged/root test runner silently bypasses chmod, which would let
    // an "injected failure" test pass trivially without ever exercising
    // rollback. MURE_OMP_SYNC_TEST_FAIL_AFTER_COMMIT throws right after the
    // Nth commit unconditionally, regardless of process privilege. The
    // default catalog projects 3 cards; committing all 3 plus config is 4
    // commits, so N=4 fires right before the manifest — proving several
    // real commits precede the failure.
    const cardCount = expectedCardCount(fixture.catalog);
    const failAfter = String(cardCount + 1); // + config, before manifest

    let caught = null;
    try {
      runSync([], { cwd: fixture.root, env: { MURE_OMP_SYNC_TEST_FAIL_AFTER_COMMIT: failAfter } });
    } catch (err) {
      caught = err;
    }

    assert.ok(caught, 'sync must fail when fault injection fires after the Nth commit');
    assert.notEqual(caught.status, 0, 'sync must exit non-zero on injected commit failure');
    assert.ok(/deterministic test fault injection/.test(String(caught.stderr || caught.message || '')),
      'failure must be the deterministic injected fault, not an incidental error');

    assert.deepEqual(readFileSync(cardPath), originalCard,
      'agent card committed before the injected failure must roll back to its original bytes');
    assert.deepEqual(readFileSync(configPath), originalConfig,
      'config committed before the injected failure must roll back to its original bytes');
    assert.deepEqual(readFileSync(manifestPath), originalManifest,
      'manifest must remain at its original bytes (its own commit never succeeded)');

    const cardContent = readFileSync(cardPath, 'utf8');
    assert.ok(!cardContent.includes('MUTATED'),
      'rolled-back card must never reflect the mutated catalog');

    // Backups are same-parent hidden siblings (never OS-tmpdir paths), and
    // must leave zero residue after rollback — check the RAW directory
    // listing (not the ".md"-filtered view) of every target parent, since a
    // leaked ".mure-omp-sync.bak-*" file would otherwise evade the ".md"
    // scanner used by stale cleanup and --check.
    for (const dir of [fixture.agentDir, fixture.ompDir, fixture.stateDir]) {
      const strayBackups = readdirSync(dir).filter(f => f.includes('mure-omp-sync.bak'));
      assert.deepEqual(strayBackups, [],
        `no stray backup files may remain in ${dir} after rollback, found: ${strayBackups.join(', ')}`);
    }
  } finally {
    rmSync(fixture.root, { recursive: true, force: true });
  }
});

test('absent .omp/agents directory is removed again after a later commit failure rolls back', () => {
  const fixture = makeFixture();
  try {
    // .omp/agents does not exist at all before this sync — sync must create
    // it (mutation) and, if the transaction later fails, remove it again to
    // restore the "absent" precondition rather than leaving an empty dir.
    rmSync(fixture.agentDir, { recursive: true, force: true });
    assert.equal(statSync(fixture.agentDir, { throwIfNoEntry: false }), undefined,
      'precondition: .omp/agents must not exist before this sync');

    // Deterministic fault injection (not chmod — see the primary rollback
    // test above for why): fail right after config's commit, before the
    // manifest — every card plus config must already be committed.
    const cardCount = expectedCardCount(fixture.catalog);
    const failAfter = String(cardCount + 1);

    let caught = null;
    try {
      runSync([], { cwd: fixture.root, env: { MURE_OMP_SYNC_TEST_FAIL_AFTER_COMMIT: failAfter } });
    } catch (err) {
      caught = err;
    }

    assert.ok(caught, 'sync must fail when fault injection fires after the Nth commit');
    assert.notEqual(caught.status, 0);

    assert.equal(statSync(fixture.agentDir, { throwIfNoEntry: false }), undefined,
      '.omp/agents must be absent again after rollback — created-then-rolled-back is not a residual mutation');
    assert.equal(statSync(path.join(fixture.ompDir, 'config.yml'), { throwIfNoEntry: false }), undefined,
      'config.yml written before the injected failure must also roll back to absent');
    assert.equal(statSync(path.join(fixture.stateDir, 'mure-omp-projection.json'), { throwIfNoEntry: false }), undefined,
      'manifest must remain absent — its own commit never succeeded');
  } finally {
    rmSync(fixture.root, { recursive: true, force: true });
  }
});

test('entirely absent .omp tree is fully removed again (agents/ AND .omp itself) after a later commit failure rolls back', () => {
  const fixture = makeFixture();
  try {
    // The WHOLE .omp tree is absent, not just agents/ — this is stricter
    // than the agents-only case: sync must create .omp itself as well as
    // .omp/agents, and rollback must remove both, in the correct order,
    // leaving the initial (fully absent) tree byte/path-identical.
    rmSync(fixture.ompDir, { recursive: true, force: true });
    assert.equal(statSync(fixture.ompDir, { throwIfNoEntry: false }), undefined,
      'precondition: .omp must not exist before this sync');

    const cardCount = expectedCardCount(fixture.catalog);
    const failAfter = String(cardCount + 1); // + config, before manifest

    let caught = null;
    try {
      runSync([], { cwd: fixture.root, env: { MURE_OMP_SYNC_TEST_FAIL_AFTER_COMMIT: failAfter } });
    } catch (err) {
      caught = err;
    }

    assert.ok(caught, 'sync must fail when fault injection fires after the Nth commit');
    assert.notEqual(caught.status, 0);

    assert.equal(statSync(fixture.ompDir, { throwIfNoEntry: false }), undefined,
      '.omp itself must be absent again after rollback — the entire newly-created tree, not just agents/, must unwind');
    assert.equal(statSync(fixture.agentDir, { throwIfNoEntry: false }), undefined,
      '.omp/agents must also be absent again after rollback');
    assert.equal(statSync(path.join(fixture.stateDir, 'mure-omp-projection.json'), { throwIfNoEntry: false }), undefined,
      'manifest must remain absent — its own commit never succeeded');
  } finally {
    rmSync(fixture.root, { recursive: true, force: true });
  }
});

test('_SYSTEM/state is created fresh, populated, then torn down again — AND a Phase-B-staged stale card restores — on a later injected failure', () => {
  const fixture = makeFixture();
  try {
    // Establish a real prior sync: owned cards + config + manifest all
    // exist and are byte-known. Default catalog: mure-scout (+ its
    // mure-scout-terra variant) and mure-cline — 3 cards.
    runSync([], { cwd: fixture.root });
    const originalConfig = readFileSync(path.join(fixture.ompDir, 'config.yml'));
    const originalScoutCard = readFileSync(path.join(fixture.agentDir, 'mure-scout.md'));
    const clineCardPath = path.join(fixture.agentDir, 'mure-cline.md');
    const originalClineCard = readFileSync(clineCardPath);

    // Drop mure-cline from the catalog — its previously-owned card becomes
    // a stale-removal candidate on this run (staged in Phase B — renamed
    // to a backup — regardless of where in Phase C the fault fires).
    const reducedCatalog = readJson(fixture.catalogPath);
    reducedCatalog.agents = reducedCatalog.agents.filter(a => a.name !== 'mure-cline');
    writeJson(fixture.catalogPath, reducedCatalog);
    const cardCount = expectedCardCount(reducedCatalog); // 2: mure-scout + mure-scout-terra

    // Remove _SYSTEM/state — this run must create it fresh via
    // ensureDirTracked (Phase A), then actually write the manifest into it
    // (Phase C).
    rmSync(fixture.stateDir, { recursive: true, force: true });
    assert.equal(statSync(fixture.stateDir, { throwIfNoEntry: false }), undefined,
      'precondition: _SYSTEM/state must not exist before this sync');

    // allTargets on this run = [scout-card, scout-terra-card, config,
    // manifest, stale(mure-cline)] = cardCount + 3 entries. Fault fires
    // right after the manifest commits (the cardCount+2-th commit) — i.e.
    // BEFORE the stale target's own Phase-C turn is ever reached (that
    // turn is a no-op anyway; the stale card's actual removal already
    // happened in Phase B, before Phase C started at all). This proves two
    // things at once: (1) _SYSTEM/state is created AND populated before
    // being torn down again, and (2) a stale card staged for removal in
    // Phase B still restores correctly on rollback even though the
    // triggering failure lands on an earlier target in Phase C, never
    // reaching the stale target's own commit-loop turn.
    const failAfter = String(cardCount + 2);

    let caught = null;
    try {
      runSync([], { cwd: fixture.root, env: { MURE_OMP_SYNC_TEST_FAIL_AFTER_COMMIT: failAfter } });
    } catch (err) {
      caught = err;
    }

    assert.ok(caught, 'sync must fail when fault injection fires after the manifest commits');
    assert.notEqual(caught.status, 0);

    assert.equal(statSync(fixture.stateDir, { throwIfNoEntry: false }), undefined,
      '_SYSTEM/state must be torn down again after rollback, even though its mkdir succeeded and its manifest write committed');
    assert.deepEqual(readFileSync(path.join(fixture.ompDir, 'config.yml')), originalConfig,
      'config re-committed before the injected failure must roll back to its original bytes');
    assert.deepEqual(readFileSync(path.join(fixture.agentDir, 'mure-scout.md')), originalScoutCard,
      'card re-committed before the injected failure must roll back to its original bytes');

    assert.ok(fileExists(clineCardPath),
      'a stale card staged (removed) in Phase B must be restored by rollback, even though the failure landed on an earlier Phase-C target');
    assert.deepEqual(readFileSync(clineCardPath), originalClineCard,
      'the restored stale card must be byte-identical to its pre-transaction content');
  } finally {
    rmSync(fixture.root, { recursive: true, force: true });
  }
});

// ── Item 2: strict reads — only ENOENT means absent ─────────────────────────

test('unreadable card target (directory in place of file) raises contextual SyncError before mutation', () => {
  const fixture = makeFixture();
  try {
    const blockedPath = path.join(fixture.agentDir, 'mure-scout.md');
    mkdirSync(blockedPath); // a directory where a file is expected — not ENOENT

    let caught = null;
    try {
      runSync([], { cwd: fixture.root });
    } catch (err) {
      caught = err;
    }
    assert.ok(caught, 'sync must throw when an expected target is unreadable (not ENOENT)');
    const errText = String(caught.stderr || caught.message);
    assert.ok(/cannot read/i.test(errText) || /EISDIR/i.test(errText),
      'error must be contextual about the unreadable target, got: ' + errText);

    assert.ok(!fileExists(path.join(fixture.ompDir, 'config.yml')),
      'config.yml must not be created — preflight must abort before any mutation');
  } finally {
    rmSync(fixture.root, { recursive: true, force: true });
  }
});

// ── Item 3: reject symlinked output roots/components/targets ───────────────

test('rejects a symlinked agents directory and never mutates the external target', () => {
  const fixture = makeFixture();
  const externalDir = mkdtempSync(path.join(os.tmpdir(), 'omp-external-'));
  try {
    rmSync(fixture.agentDir, { recursive: true, force: true });
    symlinkSync(externalDir, fixture.agentDir, 'dir');

    let caught = null;
    try {
      runSync([], { cwd: fixture.root });
    } catch (err) {
      caught = err;
    }
    assert.ok(caught, 'sync must refuse a symlinked agents directory');
    assert.notEqual(caught.status, 0, 'sync must exit non-zero');

    const externalEntries = readdirSync(externalDir);
    assert.equal(externalEntries.length, 0,
      'external symlink target must remain empty — no mutation escapes through the symlink');

    assert.ok(!fileExists(path.join(fixture.ompDir, 'config.yml')),
      'config.yml must not be created — the symlinked root is rejected before any writes');
  } finally {
    rmSync(externalDir, { recursive: true, force: true });
    rmSync(fixture.root, { recursive: true, force: true });
  }
});

test('rejects a symlinked individual card target and leaves its external file untouched', () => {
  const fixture = makeFixture();
  const externalFile = path.join(mkdtempSync(path.join(os.tmpdir(), 'omp-external-file-')), 'target.md');
  writeFileSync(externalFile, 'external content', 'utf8');
  try {
    const cardSymlinkPath = path.join(fixture.agentDir, 'mure-scout.md');
    symlinkSync(externalFile, cardSymlinkPath);

    let caught = null;
    try {
      runSync([], { cwd: fixture.root });
    } catch (err) {
      caught = err;
    }
    assert.ok(caught, 'sync must refuse a symlinked card target');
    assert.equal(readFileSync(externalFile, 'utf8'), 'external content',
      'external symlink target file must remain untouched');
  } finally {
    rmSync(path.dirname(externalFile), { recursive: true, force: true });
    rmSync(fixture.root, { recursive: true, force: true });
  }
});

test('--check rejects a symlinked unprojected .md extra and never follows it', () => {
  const fixture = makeFixture();
  const externalFile = path.join(mkdtempSync(path.join(os.tmpdir(), 'omp-external-check-')), 'external.md');
  writeFileSync(externalFile, 'external content — must never be read or touched', 'utf8');
  try {
    runSync([], { cwd: fixture.root }); // establish a clean, fully-synced baseline

    // An unprojected .md symlink pointing outside the repo — not a
    // replacement target, just an extra file --check would otherwise
    // enumerate and read via tryReadStrict/isOwnedAgentFile.
    const symlinkPath = path.join(fixture.agentDir, 'mure-external-link.md');
    symlinkSync(externalFile, symlinkPath);

    let caught = null;
    try {
      runSync(['--check'], { cwd: fixture.root });
    } catch (err) {
      caught = err;
    }
    assert.ok(caught, '--check must refuse to follow a symlinked .md entry, even an unprojected extra');
    assert.notEqual(caught.status, 0);
    const out = String(caught.stderr || caught.message || '');
    assert.ok(/symlink/i.test(out), `--check error must mention the symlink rejection, got: ${out}`);

    assert.equal(readFileSync(externalFile, 'utf8'), 'external content — must never be read or touched',
      'external symlink target must remain byte-identical — --check never follows it');
  } finally {
    rmSync(path.dirname(externalFile), { recursive: true, force: true });
    rmSync(fixture.root, { recursive: true, force: true });
  }
});

// ── Item 4: shared ownership helpers, CRLF normalization, short/long marker ─

test('CRLF-normalized existing card content is recognized as owned (no false drift)', () => {
  const fixture = makeFixture();
  try {
    runSync([], { cwd: fixture.root });
    const cardPath = path.join(fixture.agentDir, 'mure-scout.md');
    const original = readText(cardPath);
    const crlfContent = original.replace(/\n/g, '\r\n');
    writeFileSync(cardPath, crlfContent, 'utf8');

    const checkOut = runSync(['--check'], { cwd: fixture.root });
    assert.ok(!/agent_not_owned/i.test(checkOut),
      'CRLF-normalized card must still be recognized as structurally owned');
  } finally {
    rmSync(fixture.root, { recursive: true, force: true });
  }
});

test('shared ownership helpers are exported and round-trip with producer output (short + long marker)', async () => {
  const fixture = makeFixture();
  try {
    const mod = await import(pathToFileURL(fixture.scriptPath).href);

    assert.equal(typeof mod.isOwnedAgentFile, 'function', 'isOwnedAgentFile must be exported');
    assert.equal(typeof mod.isOwnedConfig, 'function', 'isOwnedConfig must be exported');
    assert.equal(typeof mod.isOwnedManifest, 'function', 'isOwnedManifest must be exported');
    assert.equal(typeof mod.AGENT_MARKER_SHORT, 'string');
    assert.equal(typeof mod.AGENT_MARKER_LONG, 'string');
    assert.equal(typeof mod.CONFIG_MARKER_SHORT, 'string');
    assert.equal(typeof mod.CONFIG_MARKER_LONG, 'string');
    assert.equal(typeof mod.MANIFEST_MARKER, 'string');

    // Producer output round-trips as owned (short marker).
    const projection = mod.buildOmpProjection(fixture.catalog);
    const rendered = mod.renderOmpAgent(projection.cards[0]);
    assert.ok(mod.isOwnedAgentFile(rendered),
      'producer agent card output must round-trip as owned per isOwnedAgentFile');
    assert.ok(rendered.split('\n')[1] === mod.AGENT_MARKER_SHORT,
      'producer must emit the short marker as line 2');

    const config = mod.renderProjectConfig(projection);
    assert.ok(mod.isOwnedConfig(config),
      'producer config output must round-trip as owned per isOwnedConfig');

    const manifest = mod.renderProjectionManifest(projection, fixture.catalog.generated);
    assert.ok(mod.isOwnedManifest(manifest),
      'producer manifest output must round-trip as owned per isOwnedManifest');

    // Checker independently accepts the documented LONG marker form too —
    // producer and checker agree on both forms of the shared contract.
    const longFormCard = rendered.replace(mod.AGENT_MARKER_SHORT, mod.AGENT_MARKER_LONG);
    assert.ok(mod.isOwnedAgentFile(longFormCard),
      'checker must accept the documented long marker as structurally owned');
    const longFormConfig = config.replace(mod.CONFIG_MARKER_SHORT, mod.CONFIG_MARKER_LONG);
    assert.ok(mod.isOwnedConfig(longFormConfig),
      'checker must accept the documented long config marker as owned');

    // Neither marker form is confused with an arbitrary comment.
    assert.ok(!mod.isOwnedAgentFile('---\n# not the marker\nname: x\n---\nbody\n'),
      'an arbitrary comment line must never be treated as ownership');
  } finally {
    rmSync(fixture.root, { recursive: true, force: true });
  }
});

// ── Item 5: manifest provenance + ownership preflight ───────────────────────

test('refuses to overwrite a manifest lacking a provenance marker; preserves arbitrary bytes', () => {
  const fixture = makeFixture();
  try {
    const manifestPath = path.join(fixture.stateDir, 'mure-omp-projection.json');
    const arbitraryContent = JSON.stringify({ hello: 'world', projected: 999 }, null, 2) + '\n';
    writeFileSync(manifestPath, arbitraryContent, 'utf8');
    const originalBytes = readFileSync(manifestPath);

    let caught = null;
    try {
      runSync([], { cwd: fixture.root });
    } catch (err) {
      caught = err;
    }
    assert.ok(caught, 'sync must refuse an unowned/pre-marker manifest');
    assert.notEqual(caught.status, 0);

    const afterBytes = readFileSync(manifestPath);
    assert.deepEqual(afterBytes, originalBytes, 'arbitrary manifest bytes must survive byte-for-byte');

    const cardFiles = readdirSync(fixture.agentDir).filter(f => f.endsWith('.md'));
    assert.equal(cardFiles.length, 0, 'no cards must be written when manifest preflight fails');
    assert.ok(!fileExists(path.join(fixture.ompDir, 'config.yml')), 'config.yml must not be written');
  } finally {
    rmSync(fixture.root, { recursive: true, force: true });
  }
});

test('manifest carries a provenance marker after sync and is accepted on re-sync', () => {
  const fixture = makeFixture();
  try {
    runSync([], { cwd: fixture.root });
    const manifest = readJson(path.join(fixture.stateDir, 'mure-omp-projection.json'));
    assert.ok(manifest._provenance, 'manifest must carry a _provenance field');

    const before = readText(path.join(fixture.stateDir, 'mure-omp-projection.json'));
    runSync([], { cwd: fixture.root });
    const after = readText(path.join(fixture.stateDir, 'mure-omp-projection.json'));
    assert.equal(after, before, 'manifest must be byte-identical across owned re-syncs');
  } finally {
    rmSync(fixture.root, { recursive: true, force: true });
  }
});

// ── Item 6: variant frontmatter description always equals base description ─

test('variant frontmatter description always equals base description; note appears only in body', () => {
  const fixture = makeFixture({
    agents: [
      {
        name: 'mure-scout',
        lane: 'worker',
        description: 'Base scout description.',
        model: M_OK_HAIKU,
        thinkingLevel: 'medium',
        tools: ['read'],
        spawns: '*',
        mission: 'scout',
        capabilities: ['research'],
        autonomy: 'autonomous',
        notes: '',
        variants: [
          { id: 'mure-scout-terra', model: M_OK_TERRA, note: 'Terra-flavored variant note — must not leak into description.' },
        ],
        selection: 'surfaced-light',
        skills: [],
      },
    ],
  });
  try {
    runSync([], { cwd: fixture.root });

    const variantCard = readText(path.join(fixture.agentDir, 'mure-scout-terra.md'));
    const fmMatch = variantCard.match(/^---\n([\s\S]*?)\n---/);
    assert.ok(fmMatch, 'variant card must have frontmatter');
    const frontmatter = fmMatch[1];

    assert.ok(frontmatter.includes('description: "Base scout description."'),
      'variant frontmatter description must equal the base agent description');
    assert.ok(!frontmatter.includes('Terra-flavored variant note'),
      'variant note must never leak into frontmatter description');

    const bodyMatch = variantCard.match(/^---\n[\s\S]*?\n---\n([\s\S]*)$/);
    const body = bodyMatch[1];
    assert.ok(body.includes('Terra-flavored variant note — must not leak into description.'),
      'variant note must appear in the card body only');
  } finally {
    rmSync(fixture.root, { recursive: true, force: true });
  }
});

// ── Item 7: --check reports every non-projected .md, including unowned ─────

test('--check reports unowned extra .md files; sync never deletes them', () => {
  const fixture = makeFixture();
  try {
    runSync([], { cwd: fixture.root });

    const unownedExtra = path.join(fixture.agentDir, 'mure-hand-authored.md');
    writeFileSync(unownedExtra, '---\nname: mure-hand-authored\ndescription: hand authored\n---\nBody.\n', 'utf8');

    let checkOut = '';
    try {
      checkOut = runSync(['--check'], { cwd: fixture.root });
    } catch (err) {
      checkOut = String(err.stdout || '') + String(err.stderr || '');
    }
    assert.ok(/mure-hand-authored/.test(checkOut), '--check must report the unowned extra file');
    assert.ok(/extra_agent_unowned/.test(checkOut), '--check must classify it as an unowned extra');

    const secondSyncOut = runSync([], { cwd: fixture.root });
    assert.ok(secondSyncOut.includes('Synced:'), 'second sync must succeed cleanly (unowned extras never block sync)');
    assert.ok(fileExists(unownedExtra), 'sync must never delete an unowned extra file');
  } finally {
    rmSync(fixture.root, { recursive: true, force: true });
  }
});

// ── Item 8: validate nonempty description, optional string spawns, arrays ──

test('rejects agent with empty description via deterministic SyncError', () => {
  const fixture = makeFixture({
    agents: [{
      name: 'mure-scout', lane: 'worker', description: '', model: M_OK_HAIKU,
      thinkingLevel: 'medium', tools: ['read'], spawns: '*', mission: 'scout',
      capabilities: ['research'], autonomy: 'autonomous', notes: '', variants: [],
      selection: 'surfaced-light', skills: [],
    }],
  });
  try {
    let caught = null;
    try { runSync([], { cwd: fixture.root }); } catch (err) { caught = err; }
    assert.ok(caught, 'sync must throw on empty description');
    assert.ok(/description/i.test(String(caught.stderr || caught.message)));
  } finally {
    rmSync(fixture.root, { recursive: true, force: true });
  }
});

test('rejects non-string spawns via deterministic SyncError', () => {
  const fixture = makeFixture({
    agents: [{
      name: 'mure-scout', lane: 'worker', description: 'Scout.', model: M_OK_HAIKU,
      thinkingLevel: 'medium', tools: ['read'], spawns: ['not', 'a', 'string'], mission: 'scout',
      capabilities: ['research'], autonomy: 'autonomous', notes: '', variants: [],
      selection: 'surfaced-light', skills: [],
    }],
  });
  try {
    let caught = null;
    try { runSync([], { cwd: fixture.root }); } catch (err) { caught = err; }
    assert.ok(caught, 'sync must throw when spawns is not a string');
    assert.ok(/spawns/i.test(String(caught.stderr || caught.message)));
  } finally {
    rmSync(fixture.root, { recursive: true, force: true });
  }
});

test('rejects non-array capabilities via deterministic SyncError', () => {
  const fixture = makeFixture({
    agents: [{
      name: 'mure-scout', lane: 'worker', description: 'Scout.', model: M_OK_HAIKU,
      thinkingLevel: 'medium', tools: ['read'], spawns: '*', mission: 'scout',
      capabilities: 'research', autonomy: 'autonomous', notes: '', variants: [],
      selection: 'surfaced-light', skills: [],
    }],
  });
  try {
    let caught = null;
    try { runSync([], { cwd: fixture.root }); } catch (err) { caught = err; }
    assert.ok(caught, 'sync must throw when capabilities is not an array');
    assert.ok(/capabilities/i.test(String(caught.stderr || caught.message)));
  } finally {
    rmSync(fixture.root, { recursive: true, force: true });
  }
});

test('rejects non-array skills via deterministic SyncError', () => {
  const fixture = makeFixture({
    agents: [{
      name: 'mure-scout', lane: 'worker', description: 'Scout.', model: M_OK_HAIKU,
      thinkingLevel: 'medium', tools: ['read'], spawns: '*', mission: 'scout',
      capabilities: ['research'], autonomy: 'autonomous', notes: '', variants: [],
      selection: 'surfaced-light', skills: 'brainstorming',
    }],
  });
  try {
    let caught = null;
    try { runSync([], { cwd: fixture.root }); } catch (err) { caught = err; }
    assert.ok(caught, 'sync must throw when skills is not an array');
    assert.ok(/skills/i.test(String(caught.stderr || caught.message)));
  } finally {
    rmSync(fixture.root, { recursive: true, force: true });
  }
});

// ── Item 9: live pending_variants + legacy pendingVariants validation ──────

test('live pending_variants and legacy pendingVariants never project, even with canary-proven production models', () => {
  const fixture = makeFixture({
    agents: [
      {
        name: 'mure-scout', lane: 'worker', description: 'Scout.', model: M_OK_HAIKU,
        thinkingLevel: 'medium', tools: ['read'], spawns: '*', mission: 'scout',
        capabilities: ['research'], autonomy: 'autonomous', notes: '',
        variants: [{ id: 'mure-scout-terra', model: M_OK_TERRA }],
        pendingVariants: [{ id: 'mure-scout-legacy-pending', model: M_OK_OPUS }],
        pending_variants: [{ id: 'mure-scout-live-pending', model: M_OK_HAIKU }],
        selection: 'surfaced-light', skills: [],
      },
    ],
  });
  try {
    runSync([], { cwd: fixture.root });
    const cardFiles = readdirSync(fixture.agentDir).filter(f => f.endsWith('.md'));
    assert.equal(cardFiles.length, 2, `expected base + 1 active variant, got ${cardFiles.length}: ${cardFiles.join(', ')}`);
    assert.ok(!cardFiles.some(f => f.includes('pending')),
      `no pending id (legacy or live) may leak into filenames: ${cardFiles.join(', ')}`);

    const manifest = readJson(path.join(fixture.stateDir, 'mure-omp-projection.json'));
    assert.ok(!manifest.cards.some(c => c.cardName.includes('pending')),
      'no pending id may leak into the manifest either');
  } finally {
    rmSync(fixture.root, { recursive: true, force: true });
  }
});

test('malformed pending_variants entry (missing id) raises deterministic SyncError', () => {
  const fixture = makeFixture({
    agents: [
      {
        name: 'mure-scout', lane: 'worker', description: 'Scout.', model: M_OK_HAIKU,
        thinkingLevel: 'medium', tools: ['read'], spawns: '*', mission: 'scout',
        capabilities: ['research'], autonomy: 'autonomous', notes: '', variants: [],
        pending_variants: [{ model: M_OK_HAIKU }], // missing required "id"
        selection: 'surfaced-light', skills: [],
      },
    ],
  });
  try {
    let caught = null;
    try { runSync([], { cwd: fixture.root }); } catch (err) { caught = err; }
    assert.ok(caught, 'sync must throw on malformed pending_variants entry');
    assert.ok(/pending_variants/i.test(String(caught.stderr || caught.message)));
  } finally {
    rmSync(fixture.root, { recursive: true, force: true });
  }
});

test('malformed legacy pendingVariants entry (non-array) raises deterministic SyncError', () => {
  const fixture = makeFixture({
    agents: [
      {
        name: 'mure-scout', lane: 'worker', description: 'Scout.', model: M_OK_HAIKU,
        thinkingLevel: 'medium', tools: ['read'], spawns: '*', mission: 'scout',
        capabilities: ['research'], autonomy: 'autonomous', notes: '', variants: [],
        pendingVariants: 'not-an-array', // must be an array, not a string (buildCatalog's own
                                          // model-collection loop tolerates a string via char
                                          // iteration, so this exercises the production validator
                                          // without crashing the test fixture helper itself)
        selection: 'surfaced-light', skills: [],
      },
    ],
  });
  try {
    let caught = null;
    try { runSync([], { cwd: fixture.root }); } catch (err) { caught = err; }
    assert.ok(caught, 'sync must throw when pendingVariants is not an array');
    assert.ok(/pendingVariants/i.test(String(caught.stderr || caught.message)));
  } finally {
    rmSync(fixture.root, { recursive: true, force: true });
  }
});

// ── Item 10: task:true iff base role has spawns ─────────────────────────────

test('task:true iff base role has spawns — both directions and variant inheritance asserted', () => {
  const fixture = makeFixture({
    agents: [
      {
        name: 'mure-orchestrator', lane: 'orchestration', description: 'Has spawns.', model: M_OK_OPUS,
        thinkingLevel: 'high', tools: ['read'], spawns: '*', mission: 'orchestrate',
        capabilities: ['dispatch'], autonomy: 'owner-gated', notes: '',
        variants: [{ id: 'mure-orchestrator-terra', model: M_OK_TERRA }],
        selection: 'surfaced-heavy', skills: [],
      },
      {
        name: 'mure-leaf', lane: 'worker', description: 'No spawns.', model: M_OK_HAIKU,
        thinkingLevel: 'medium', tools: ['read'], mission: 'leaf role',
        capabilities: ['research'], autonomy: 'autonomous', notes: '', variants: [],
        selection: 'surfaced-light', skills: [],
      },
    ],
  });
  try {
    runSync([], { cwd: fixture.root });

    const withSpawns = readText(path.join(fixture.agentDir, 'mure-orchestrator.md'));
    assert.ok(/^task:\s*true\s*$/m.test(withSpawns), 'base agent with spawns must carry task: true');

    const variantOfSpawner = readText(path.join(fixture.agentDir, 'mure-orchestrator-terra.md'));
    assert.ok(/^task:\s*true\s*$/m.test(variantOfSpawner),
      'variant of a spawning base role must also carry task: true (base-role-scoped)');

    const noSpawns = readText(path.join(fixture.agentDir, 'mure-leaf.md'));
    assert.ok(!/^task:/m.test(noSpawns), 'base agent without spawns must not carry a task field at all');
  } finally {
    rmSync(fixture.root, { recursive: true, force: true });
  }
});

// ── Live Terra: quota-blocked route must project fail-closed ───────────────

test('live Terra (quota-blocked) still projects fail-closed with the disabled sentinel', () => {
  const fixture = makeFixture({
    agents: [{
      name: 'mure-terra-canary', lane: 'worker', description: 'Live Terra probe.', model: M_LIVE_TERRA_BLOCKED,
      thinkingLevel: 'medium', tools: ['read'], spawns: '*', mission: 'probe',
      capabilities: ['research'], autonomy: 'autonomous', notes: '', variants: [],
      selection: 'surfaced-light', skills: [],
    }],
  });
  try {
    runSync([], { cwd: fixture.root });
    const card = readText(path.join(fixture.agentDir, 'mure-terra-canary.md'));
    assert.ok(card.includes(`model: ${DISABLED_SENTINEL}`),
      'live quota-blocked Terra must project with the disabled sentinel, not a resolved selector');

    const manifest = readJson(path.join(fixture.stateDir, 'mure-omp-projection.json'));
    const entry = manifest.cards.find(c => c.cardName === 'mure-terra-canary');
    assert.equal(entry.status, 'FAIL_CLOSED');
    assert.equal(entry.resolvedModel, null);
  } finally {
    rmSync(fixture.root, { recursive: true, force: true });
  }
});