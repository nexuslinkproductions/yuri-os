import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { validateAgentCardAuthority, validateCanaryEvidence, validateCanaryBootstrapVariants, validateSkillAffinity, validateProjectedSkillIntegrity, normalizeSkillSet, SKILL_AFFINITY_DENY, DISABLED_MODEL_SELECTOR } from './mure-fleet-validate.mjs';
import {
  buildOmpProjection,
  renderOmpAgent,
  renderProjectConfig,
  renderProjectionManifest,
  AGENT_MARKER_SHORT,
  AGENT_MARKER_LONG,
} from './mure-omp-sync.mjs';

// ── Existing card-authority fixtures ──────────────────────────────────────

function writeCard(dir, filename, name) {
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, filename), `---\nname: ${name}\n---\n`, 'utf8');
}

function fixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'mure-card-authority-'));
  const mureAgentDir = path.join(root, '_SYSTEM', 'mure', 'agents');
  const ompRoot = path.join(root, '.omp');
  const catalog = {
    source: 'MURE-native agent definitions from _SYSTEM/mure/agents/',
    agentCardRoot: '_SYSTEM/mure/agents',
    agents: [{ name: 'mure-alpha' }, { name: 'worker-beta' }],
  };
  writeCard(mureAgentDir, 'mure-alpha.md', 'mure-alpha');
  writeCard(mureAgentDir, 'worker-beta.md', 'worker-beta');
  return { root, mureAgentDir, ompRoot, catalog };
}

// ── Existing card-authority tests (preserved) ─────────────────────────────

test('MURE-native card authority accepts a complete exact catalog', (t) => {
  const f = fixture();
  t.after(() => fs.rmSync(f.root, { recursive: true, force: true }));
  assert.deepEqual(validateAgentCardAuthority(f.catalog, f), []);
});

test('card authority fails closed on missing, mismatched, uncatalogued, and OMP MURE files', (t) => {
  const f = fixture();
  t.after(() => fs.rmSync(f.root, { recursive: true, force: true }));
  fs.rmSync(path.join(f.mureAgentDir, 'worker-beta.md'));
  writeCard(f.mureAgentDir, 'mure-alpha.md', 'wrong-name');
  writeCard(f.mureAgentDir, 'extra.md', 'extra');
  writeCard(path.join(f.ompRoot, 'hooks', 'pre'), 'mure-learn.mjs', 'mure-learn');
  const problems = validateAgentCardAuthority(f.catalog, f);
  assert.ok(problems.includes('missing:worker-beta.md'));
  assert.ok(problems.includes('name-mismatch:mure-alpha.md:wrong-name'));
  assert.ok(problems.includes('uncatalogued:extra.md'));
  assert.ok(problems.some((problem) => problem.startsWith('retired-omp-mure-file:')));
});

test('card authority rejects OMP catalog provenance', (t) => {
  const f = fixture();
  t.after(() => fs.rmSync(f.root, { recursive: true, force: true }));
  const stale = { ...f.catalog, source: 'OMP agent definitions from .omp/agents/' };
  assert.ok(validateAgentCardAuthority(stale, f).includes('catalog-source-still-omp'));
});

// ── CHECK I: OMP projection validation ────────────────────────────────────

const REPO_SCRIPTS = path.resolve('_SYSTEM', 'Scripts');
const REPO_MURE = path.resolve('_SYSTEM', 'mure');
const REPO_CONFIG = path.resolve('_SYSTEM', 'config');

// Catalog factory helpers

function makeCatalog(agents) {
  return {
    source: 'MURE-native agent definitions from _SYSTEM/mure/agents/',
    agentCardRoot: '_SYSTEM/mure/agents',
    agents,
  };
}

function makeAgent(name, overrides = {}) {
  return {
    name,
    lane: 'worker',
    description: `${name} executes delegated tasks`,
    model: 'anthropic/claude-sonnet-5',
    thinkingLevel: 'medium',
    tools: ['read', 'grep', 'glob', 'bash'],
    capabilities: ['execution', 'analysis'],
    skills: ['executing-plans', 'systematic-debugging', 'finishing-a-development-branch', 'verification-before-completion'],
    mission: `Execute ${name} tasks with discipline`,
    ...overrides,
  };
}

// Stable catalogs used across tests.
// CLEAN: 1 OK agent (alpha) + 1 FAIL_CLOSED agent (beta via cline-pass)
const CLEAN_CATALOG = makeCatalog([
  makeAgent('alpha'),
  makeAgent('beta', {
    model: 'cline-pass/cline-pass/deepseek-v4-flash',
    description: 'beta runs cline-pass tasks',
    mission: 'Execute beta tasks via ClinePass',
  }),
]);


// DUAL_FAIL_CLOSED: 2 FAIL_CLOSED agents so removing one from disabledAgents
// keeps the list non-empty (empty list → parser stores '' not array).
const DUAL_FAIL_CLOSED_CATALOG = makeCatalog([
  makeAgent('alpha'),
  makeAgent('beta', {
    model: 'cline-pass/cline-pass/deepseek-v4-flash',
    description: 'beta cline-pass',
    mission: 'beta tasks',
  }),
  makeAgent('gamma', {
    model: 'cline-pass/cline-pass/mimo-v2.5',
    description: 'gamma cline-pass',
    mission: 'gamma tasks',
  }),
]);

// SOURCE_INVALID: variant without model field
const SOURCE_INVALID_CATALOG = makeCatalog([
  makeAgent('alpha', {
    variants: [{ id: 'alpha-fast', tools: ['read'] }],
  }),
]);

// ── Temp-root OMP fixture ─────────────────────────────────────────────────
//
// Copies mure-fleet-validate.mjs into <root>/_SYSTEM/Scripts/ so its REPO
// calculation targets the temp root.  Symlinks all transitive imports so the
// real implementation is exercised without a second code path.
//
// Returns { root, agentsDir, stateDir, projection, catalog }.

const SYMLINK_TARGETS = [
  { src: path.join(REPO_SCRIPTS, 'mure-omp-sync.mjs'),     dstRel: '_SYSTEM/Scripts/mure-omp-sync.mjs' },
  { src: path.join(REPO_SCRIPTS, 'cline-fleet.mjs'),       dstRel: '_SYSTEM/Scripts/cline-fleet.mjs' },
  { src: path.join(REPO_MURE, 'omp-model-resolver.mjs'),    dstRel: '_SYSTEM/mure/omp-model-resolver.mjs' },
  { src: path.join(REPO_CONFIG, 'provider-route-registry.json'), dstRel: '_SYSTEM/config/provider-route-registry.json' },
];

function setupOmpFixture(catalog, t, opts = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'omp-check-i-'));

  // Symlink targets (must exist before copyFile — their parent dirs needed)
  for (const { dstRel } of SYMLINK_TARGETS) {
    fs.mkdirSync(path.join(root, path.dirname(dstRel)), { recursive: true });
  }
  // Extra dirs not covered by symlink targets
  fs.mkdirSync(path.join(root, '.omp', 'agents'), { recursive: true });
  fs.mkdirSync(path.join(root, '_SYSTEM', 'state'), { recursive: true });

  // Copy the ONE file we are allowed to touch — the validator entry module
  fs.copyFileSync(
    path.join(REPO_SCRIPTS, 'mure-fleet-validate.mjs'),
    path.join(root, '_SYSTEM', 'Scripts', 'mure-fleet-validate.mjs'),
  );

  // Symlink every import so the real code resolves
  for (const { src, dstRel } of SYMLINK_TARGETS) {
    fs.symlinkSync(src, path.join(root, dstRel));
  }

  t.after(() => fs.rmSync(root, { recursive: true, force: true }));

  if (opts.skipProjection) {
    return { root, catalog, projection: null };
  }

  // Build projection and write artifacts from the real renderers
  const projection = buildOmpProjection(catalog);

  for (const card of projection.cards) {
    fs.writeFileSync(
      path.join(root, '.omp', 'agents', `${card.filename}.md`),
      renderOmpAgent(card),
      'utf8',
    );
  }

  fs.writeFileSync(
    path.join(root, '.omp', 'config.yml'),
    renderProjectConfig(projection),
    'utf8',
  );

  fs.writeFileSync(
    path.join(root, '_SYSTEM', 'state', 'mure-omp-projection.json'),
    renderProjectionManifest(projection),
    'utf8',
  );

  return { root, catalog, projection };
}

async function loadValidatorModule(tempRoot) {
  const entry = path.join(tempRoot, '_SYSTEM', 'Scripts', 'mure-fleet-validate.mjs');
  // Force a fresh module per temp root (cache-bust via query param)
  return import(`${entry}?t=${Date.now()}-${Math.random().toString(36).slice(2)}`);
}

async function loadValidator(tempRoot) {
  const mod = await loadValidatorModule(tempRoot);
  return mod.validateOmpProjection;
}

// ── CHECK I tests ─────────────────────────────────────────────────────────

test('CHECK I: clean generated projection passes', async (t) => {
  const f = setupOmpFixture(CLEAN_CATALOG, t);
  const validate = await loadValidator(f.root);
  const problems = validate(f.catalog);
  assert.deepEqual(problems, []);
});

test('CHECK I: missing card fails', async (t) => {
  const f = setupOmpFixture(CLEAN_CATALOG, t);
  const validate = await loadValidator(f.root);
  // Delete one agent card
  fs.rmSync(path.join(f.root, '.omp', 'agents', 'alpha.md'));
  const problems = validate(f.catalog);
  assert.ok(problems.some((p) => p.startsWith('omp-agent-missing:') && p.includes('alpha')));
});

test('CHECK I: stale (unexpected) card fails', async (t) => {
  const f = setupOmpFixture(CLEAN_CATALOG, t);
  const validate = await loadValidator(f.root);
  // Write a card the catalog does not project
  fs.writeFileSync(
    path.join(f.root, '.omp', 'agents', 'gamma.md'),
    '---\n# GENERATED BY mure-omp-sync.mjs — DO NOT EDIT\nname: gamma\n---\n',
    'utf8',
  );
  const problems = validate(f.catalog);
  assert.ok(problems.includes('omp-agent-stale:gamma.md'));
});

test('CHECK I: unowned expected card fails', async (t) => {
  const f = setupOmpFixture(CLEAN_CATALOG, t);
  const validate = await loadValidator(f.root);
  // Rewrite alpha.md without the ownership marker line
  const cardPath = path.join(f.root, '.omp', 'agents', 'alpha.md');
  let source = fs.readFileSync(cardPath, 'utf8');
  // Strip the # GENERATED BY … line (second line after ---)
  source = source.replace(/^---\r?\n# GENERATED BY mure-omp-sync\.mjs.*\r?\n/m, '---\n');
  fs.writeFileSync(cardPath, source, 'utf8');
  const problems = validate(f.catalog);
  assert.ok(problems.includes('omp-agent-no-ownership:alpha.md'));
});

test('CHECK I: wrong normalized model fails', async (t) => {
  const f = setupOmpFixture(CLEAN_CATALOG, t);
  const validate = await loadValidator(f.root);
  // Rewrite alpha.md with a different (still valid) model
  const cardPath = path.join(f.root, '.omp', 'agents', 'alpha.md');
  let source = fs.readFileSync(cardPath, 'utf8');
  source = source.replace(/^model: .*$/m, 'model: anthropic/claude-opus-4-8');
  fs.writeFileSync(cardPath, source, 'utf8');
  const problems = validate(f.catalog);
  assert.ok(problems.some((p) =>
    p.startsWith('omp-agent-model-mismatch:alpha') && p.includes('anthropic/claude-opus-4-8'),
  ));
});

test('CHECK I: FAIL_CLOSED card with real model fails', async (t) => {
  const f = setupOmpFixture(CLEAN_CATALOG, t);
  const validate = await loadValidator(f.root);
  // beta is FAIL_CLOSED (cline-pass). Replace sentinel with a real model.
  const cardPath = path.join(f.root, '.omp', 'agents', 'beta.md');
  let source = fs.readFileSync(cardPath, 'utf8');
  source = source.replace(/^model: .*$/m, 'model: anthropic/claude-haiku-4-5');
  fs.writeFileSync(cardPath, source, 'utf8');
  const problems = validate(f.catalog);
  assert.ok(problems.some((p) => p.startsWith('omp-agent-disabled-wrong-model:beta') && p.includes('anthropic/claude-haiku-4-5')));
});

test('CHECK I: FAIL_CLOSED card with alternate sentinel fails', async (t) => {
  const f = setupOmpFixture(CLEAN_CATALOG, t);
  const validate = await loadValidator(f.root);
  // beta is FAIL_CLOSED. Replace sentinel with a different disabled/ prefix string.
  const cardPath = path.join(f.root, '.omp', 'agents', 'beta.md');
  let source = fs.readFileSync(cardPath, 'utf8');
  source = source.replace(/^model: .*$/m, 'model: disabled/alternate-route');
  fs.writeFileSync(cardPath, source, 'utf8');
  const problems = validate(f.catalog);
  assert.ok(problems.some((p) => p.startsWith('omp-agent-disabled-wrong-model:beta') && p.includes('disabled/alternate-route')));
});

test('CHECK I: FAIL_CLOSED card missing model fails', async (t) => {
  const f = setupOmpFixture(CLEAN_CATALOG, t);
  const validate = await loadValidator(f.root);
  // beta is FAIL_CLOSED (cline-pass). Remove the model line entirely.
  const cardPath = path.join(f.root, '.omp', 'agents', 'beta.md');
  let source = fs.readFileSync(cardPath, 'utf8');
  source = source.replace(/^model: .*\n/m, '');
  fs.writeFileSync(cardPath, source, 'utf8');
  const problems = validate(f.catalog);
  assert.ok(problems.some((p) => p.startsWith('omp-agent-disabled-missing-model:beta')));
});

test('CHECK I: OK card with disabled sentinel fails', async (t) => {
  const f = setupOmpFixture(CLEAN_CATALOG, t);
  const validate = await loadValidator(f.root);
  // alpha is OK. Replace its real model with the disabled sentinel.
  const cardPath = path.join(f.root, '.omp', 'agents', 'alpha.md');
  let source = fs.readFileSync(cardPath, 'utf8');
  source = source.replace(/^model: .*$/m, `model: ${DISABLED_MODEL_SELECTOR}`);
  fs.writeFileSync(cardPath, source, 'utf8');
  const problems = validate(f.catalog);
  assert.ok(problems.some((p) => p.startsWith('omp-agent-ok-has-disabled-sentinel:alpha')));
});

test('CHECK I: missing disabledAgents membership fails', async (t) => {
  // Use two FAIL_CLOSED cards so removing beta keeps disabledAgents non-empty
  // (empty YAML list → parseOmpConfig stores '' not array).
  const f = setupOmpFixture(DUAL_FAIL_CLOSED_CATALOG, t);
  const validate = await loadValidator(f.root);
  // Remove beta from config disabledAgents list while keeping gamma
  const configPath = path.join(f.root, '.omp', 'config.yml');
  let configSource = fs.readFileSync(configPath, 'utf8');
  configSource = configSource.replace(/^    - beta\n/m, '');
  fs.writeFileSync(configPath, configSource, 'utf8');
  const problems = validate(f.catalog);
  assert.ok(problems.some((p) => p.startsWith('omp-config-missing-disabled:') && p.includes('beta')));
});

test('CHECK I: executable agent disabled fails', async (t) => {
  const f = setupOmpFixture(CLEAN_CATALOG, t);
  const validate = await loadValidator(f.root);
  // Add alpha (OK card) to disabledAgents
  const configPath = path.join(f.root, '.omp', 'config.yml');
  let configSource = fs.readFileSync(configPath, 'utf8');
  configSource = configSource.replace(
    /^(  disabledAgents:\n(?:    - beta\n)*)/m,
    '$1    - alpha\n',
  );
  fs.writeFileSync(configPath, configSource, 'utf8');
  const problems = validate(f.catalog);
  assert.ok(problems.some((p) => p.startsWith('omp-config-executable-disabled:') && p.includes('alpha')));
});

test('CHECK I: wrong tools fails', async (t) => {
  const f = setupOmpFixture(CLEAN_CATALOG, t);
  const validate = await loadValidator(f.root);
  // Mutate alpha's tools list to differ from catalog
  const cardPath = path.join(f.root, '.omp', 'agents', 'alpha.md');
  let source = fs.readFileSync(cardPath, 'utf8');
  // Replace tools block with a shorter list
  source = source.replace(/^tools:\n(?:  - .*\n)+/m, 'tools:\n  - read\n');
  fs.writeFileSync(cardPath, source, 'utf8');
  const problems = validate(f.catalog);
  assert.ok(problems.some((p) =>
    p.startsWith('omp-agent-tools-mismatch:alpha'),
  ));
});

test('CHECK I: wrong thinkingLevel fails', async (t) => {
  const f = setupOmpFixture(CLEAN_CATALOG, t);
  const validate = await loadValidator(f.root);
  // Mutate alpha's thinkingLevel to diverge from the catalog's projected value
  const cardPath = path.join(f.root, '.omp', 'agents', 'alpha.md');
  let source = fs.readFileSync(cardPath, 'utf8');
  source = source.replace(/^thinkingLevel: .*$/m, 'thinkingLevel: xhigh');
  fs.writeFileSync(cardPath, source, 'utf8');
  const problems = validate(f.catalog);
  assert.ok(problems.some((p) => p.startsWith('omp-agent-thinkingLevel-mismatch:alpha') && p.includes('xhigh')));
});

test('CHECK I: wrong spawns fails', async (t) => {
  // Need an agent with spawns.  Use a catalog where alpha has spawns.
  const cat = makeCatalog([
    makeAgent('alpha', { spawns: 'read-only' }),
    makeAgent('beta', { model: 'cline-pass/cline-pass/deepseek-v4-flash' }),
  ]);
  const f = setupOmpFixture(cat, t);
  const validate = await loadValidator(f.root);
  // Mutate alpha's spawns in the rendered card
  const cardPath = path.join(f.root, '.omp', 'agents', 'alpha.md');
  let source = fs.readFileSync(cardPath, 'utf8');
  source = source.replace(/^spawns: .*$/m, 'spawns: "*"');
  fs.writeFileSync(cardPath, source, 'utf8');
  const problems = validate(f.catalog);
  assert.ok(problems.some((p) => p.startsWith('omp-agent-spawns-mismatch:alpha') && p.includes('*')));
});

test('CHECK I: agentId frontmatter key fails', async (t) => {
  const f = setupOmpFixture(CLEAN_CATALOG, t);
  const validate = await loadValidator(f.root);
  // Add agentId to alpha's frontmatter
  const cardPath = path.join(f.root, '.omp', 'agents', 'alpha.md');
  let source = fs.readFileSync(cardPath, 'utf8');
  source = source.replace(/^(name: .*)$/m, '$1\nagentId: mure-scout');
  fs.writeFileSync(cardPath, source, 'utf8');
  const problems = validate(f.catalog);
  assert.ok(problems.includes('omp-agent-has-agentId:alpha.md'));
});

test('CHECK I: short ownership markers accepted', async (t) => {
  const f = setupOmpFixture(CLEAN_CATALOG, t);
  const validate = await loadValidator(f.root);
  // The generator already renders the short form.  Verify no ownership problems.
  const problems = validate(f.catalog);
  const ownershipProblems = problems.filter((p) => p.includes('ownership'));
  assert.deepEqual(ownershipProblems, []);
});

test('CHECK I: long agent ownership marker still recognized as owned but is content drift', async (t) => {
  const f = setupOmpFixture(CLEAN_CATALOG, t);
  const validate = await loadValidator(f.root);
  // Rewrite alpha.md with the long-form marker
  const cardPath = path.join(f.root, '.omp', 'agents', 'alpha.md');
  let source = fs.readFileSync(cardPath, 'utf8');
  source = source.replace(
    /^# GENERATED BY mure-omp-sync\.mjs — DO NOT EDIT$/m,
    AGENT_MARKER_LONG,
  );
  fs.writeFileSync(cardPath, source, 'utf8');
  const problems = validate(f.catalog);
  const ownershipProblems = problems.filter((p) => p.includes('ownership'));
  assert.deepEqual(ownershipProblems, [], 'the long marker must still be recognized as owned');
  assert.ok(
    problems.includes('omp-agent-content-mismatch:alpha.md'),
    `expected omp-agent-content-mismatch:alpha.md — LONG marker is owned but is content drift, matching sync --check byte-exact parity (renderOmpAgent always emits SHORT). Got: ${JSON.stringify(problems)}`,
  );
});

test('CHECK I: long config ownership marker still recognized as owned but is content drift', async (t) => {
  const f = setupOmpFixture(CLEAN_CATALOG, t);
  const validate = await loadValidator(f.root);
  const configPath = path.join(f.root, '.omp', 'config.yml');
  let source = fs.readFileSync(configPath, 'utf8');
  source = source.replace(
    /^# GENERATED BY mure-omp-sync\.mjs — DO NOT EDIT$/m,
    AGENT_MARKER_LONG,
  );
  fs.writeFileSync(configPath, source, 'utf8');
  const problems = validate(f.catalog);
  const ownershipProblems = problems.filter((p) => p.includes('ownership'));
  assert.deepEqual(ownershipProblems, [], 'the long marker must still be recognized as owned');
  assert.ok(
    problems.includes('omp-config-content-mismatch'),
    `expected omp-config-content-mismatch — LONG marker is owned but is content drift, matching sync --check byte-exact parity (renderProjectConfig always emits SHORT). Got: ${JSON.stringify(problems)}`,
  );
});

test('CHECK I: flat manifest count drift fails', async (t) => {
  const f = setupOmpFixture(CLEAN_CATALOG, t);
  const validate = await loadValidator(f.root);
  // Corrupt the manifest's projected count
  const manifestPath = path.join(f.root, '_SYSTEM', 'state', 'mure-omp-projection.json');
  let manifestSource = fs.readFileSync(manifestPath, 'utf8');
  manifestSource = manifestSource.replace(/"projected": \d+/, '"projected": 999');
  fs.writeFileSync(manifestPath, manifestSource, 'utf8');
  const problems = validate(f.catalog);
  assert.ok(problems.includes('omp-state-projected-mismatch:got=999 expected=2'));
});

test('CHECK I: source variant without model reports source-invalid', async (t) => {
  // buildOmpProjection throws SyncError on variant missing model, so skip
  // artifact generation — validateOmpProjection catches it before reading fs.
  const f = setupOmpFixture(SOURCE_INVALID_CATALOG, t, { skipProjection: true });
  const validate = await loadValidator(f.root);
  const problems = validate(f.catalog);
  assert.ok(problems.length === 1, `expected exactly 1 problem, got ${JSON.stringify(problems)}`);
  assert.ok(
    problems[0].startsWith('omp-source-invalid:') && problems[0].includes('alpha-fast'),
    `expected omp-source-invalid including alpha-fast, got "${problems[0]}"`,
  );
});

// ── CHECK I: projection-absence + full-content drift gates ────────────────

test('CHECK I: nonempty catalog with no projection artifacts fails absent', async (t) => {
  const f = setupOmpFixture(CLEAN_CATALOG, t, { skipProjection: true });
  fs.rmdirSync(path.join(f.root, '.omp', 'agents'));
  fs.rmdirSync(path.join(f.root, '_SYSTEM', 'state'));
  const validate = await loadValidator(f.root);
  const problems = validate(f.catalog);
  assert.deepEqual(problems, ['omp-projection-absent:2']);
});

test('CHECK I: empty catalog with no projection artifacts passes', async (t) => {
  const emptyCatalog = makeCatalog([]);
  const f = setupOmpFixture(emptyCatalog, t, { skipProjection: true });
  fs.rmdirSync(path.join(f.root, '.omp', 'agents'));
  fs.rmdirSync(path.join(f.root, '_SYSTEM', 'state'));
  const validate = await loadValidator(f.root);
  const problems = validate(f.catalog);
  assert.deepEqual(problems, []);
});

test('CHECK I: manifest cards array entry removed with counts unchanged fails content-mismatch', async (t) => {
  const f = setupOmpFixture(CLEAN_CATALOG, t);
  const validate = await loadValidator(f.root);
  const manifestPath = path.join(f.root, '_SYSTEM', 'state', 'mure-omp-projection.json');
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  manifest.cards = manifest.cards.slice(1); // drop one card entry; projected/executable/disabled left untouched
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + '\n', 'utf8');
  const problems = validate(f.catalog);
  assert.deepEqual(problems, ['omp-state-content-mismatch']);
});

test('CHECK I: manifest resolvedModel mutated with counts unchanged fails content-mismatch', async (t) => {
  const f = setupOmpFixture(CLEAN_CATALOG, t);
  const validate = await loadValidator(f.root);
  const manifestPath = path.join(f.root, '_SYSTEM', 'state', 'mure-omp-projection.json');
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  const alphaEntry = manifest.cards.find((c) => c.cardName === 'alpha');
  alphaEntry.resolvedModel = 'anthropic/claude-opus-4-8';
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + '\n', 'utf8');
  const problems = validate(f.catalog);
  assert.deepEqual(problems, ['omp-state-content-mismatch']);
});

test('CHECK I: manifest _provenance corruption fails ownership and content-mismatch', async (t) => {
  const f = setupOmpFixture(CLEAN_CATALOG, t);
  const validate = await loadValidator(f.root);
  const manifestPath = path.join(f.root, '_SYSTEM', 'state', 'mure-omp-projection.json');
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  manifest._provenance = 'tampered-marker';
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + '\n', 'utf8');
  const problems = validate(f.catalog);
  assert.deepEqual(problems, ['omp-state-no-ownership', 'omp-state-content-mismatch']);
});

test('CHECK I: manifest schemaVersion corruption fails content-mismatch', async (t) => {
  const f = setupOmpFixture(CLEAN_CATALOG, t);
  const validate = await loadValidator(f.root);
  const manifestPath = path.join(f.root, '_SYSTEM', 'state', 'mure-omp-projection.json');
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  manifest.schemaVersion = '2.0';
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + '\n', 'utf8');
  const problems = validate(f.catalog);
  assert.deepEqual(problems, ['omp-state-content-mismatch']);
});

test('CHECK I: manifest source corruption fails content-mismatch', async (t) => {
  const f = setupOmpFixture(CLEAN_CATALOG, t);
  const validate = await loadValidator(f.root);
  const manifestPath = path.join(f.root, '_SYSTEM', 'state', 'mure-omp-projection.json');
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  manifest.source = '_SYSTEM/mure/wrong-catalog.json';
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + '\n', 'utf8');
  const problems = validate(f.catalog);
  assert.deepEqual(problems, ['omp-state-content-mismatch']);
});

test('CHECK I: manifest generated corruption fails content-mismatch', async (t) => {
  const f = setupOmpFixture(CLEAN_CATALOG, t);
  const validate = await loadValidator(f.root);
  const manifestPath = path.join(f.root, '_SYSTEM', 'state', 'mure-omp-projection.json');
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  manifest.generated = '2099-01-01T00:00:00Z';
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + '\n', 'utf8');
  const problems = validate(f.catalog);
  assert.deepEqual(problems, ['omp-state-content-mismatch']);
});

test('CHECK I: nonempty card description drift fails content-mismatch', async (t) => {
  const f = setupOmpFixture(CLEAN_CATALOG, t);
  const validate = await loadValidator(f.root);
  const cardPath = path.join(f.root, '.omp', 'agents', 'alpha.md');
  let source = fs.readFileSync(cardPath, 'utf8');
  source = source.replace(/^description: .*$/m, 'description: "alpha now does something entirely different"');
  fs.writeFileSync(cardPath, source, 'utf8');
  const problems = validate(f.catalog);
  assert.deepEqual(problems, ['omp-agent-content-mismatch:alpha.md']);
});

test('CHECK I: task field removal fails content-mismatch', async (t) => {
  const cat = makeCatalog([
    makeAgent('alpha', { spawns: 'read-only' }),
    makeAgent('beta', { model: 'cline-pass/cline-pass/deepseek-v4-flash' }),
  ]);
  const f = setupOmpFixture(cat, t);
  const validate = await loadValidator(f.root);
  const cardPath = path.join(f.root, '.omp', 'agents', 'alpha.md');
  let source = fs.readFileSync(cardPath, 'utf8');
  source = source.replace(/^task: true\n/m, '');
  fs.writeFileSync(cardPath, source, 'utf8');
  const problems = validate(f.catalog);
  assert.ok(problems.includes('omp-agent-content-mismatch:alpha.md'));
});

test('CHECK I: task field addition fails content-mismatch', async (t) => {
  const f = setupOmpFixture(CLEAN_CATALOG, t);
  const validate = await loadValidator(f.root);
  const cardPath = path.join(f.root, '.omp', 'agents', 'alpha.md');
  let source = fs.readFileSync(cardPath, 'utf8');
  // alpha has no spawns/task; insert an unexpected task: true before the closing fence
  source = source.replace(/\n---\n\n/, '\ntask: true\n---\n\n');
  fs.writeFileSync(cardPath, source, 'utf8');
  const problems = validate(f.catalog);
  assert.ok(problems.includes('omp-agent-content-mismatch:alpha.md'));
});

test('CHECK I: config maxRecursionDepth drift fails content-mismatch', async (t) => {
  const f = setupOmpFixture(CLEAN_CATALOG, t);
  const validate = await loadValidator(f.root);
  const configPath = path.join(f.root, '.omp', 'config.yml');
  let source = fs.readFileSync(configPath, 'utf8');
  source = source.replace(/^  maxRecursionDepth: 2$/m, '  maxRecursionDepth: 5');
  fs.writeFileSync(configPath, source, 'utf8');
  const problems = validate(f.catalog);
  assert.deepEqual(problems, ['omp-config-content-mismatch']);
});

test('CHECK I: config modelRoles value drift fails content-mismatch', async (t) => {
  const f = setupOmpFixture(CLEAN_CATALOG, t);
  const validate = await loadValidator(f.root);
  const configPath = path.join(f.root, '.omp', 'config.yml');
  let source = fs.readFileSync(configPath, 'utf8');
  source = source.replace(/^  smol: ollama-cloud\/deepseek-v4-flash$/m, '  smol: anthropic/claude-sonnet-5');
  fs.writeFileSync(configPath, source, 'utf8');
  const problems = validate(f.catalog);
  assert.deepEqual(problems, ['omp-config-content-mismatch']);
});

test('CHECK I: CRLF round-trip with short ownership marker agrees with producer', async (t) => {
  const f = setupOmpFixture(CLEAN_CATALOG, t);
  const validate = await loadValidator(f.root);

  const agentsDir = path.join(f.root, '.omp', 'agents');
  for (const filename of fs.readdirSync(agentsDir).filter((n) => n.endsWith('.md'))) {
    const filePath = path.join(agentsDir, filename);
    fs.writeFileSync(filePath, fs.readFileSync(filePath, 'utf8').replace(/\n/g, '\r\n'), 'utf8');
  }
  const configPath = path.join(f.root, '.omp', 'config.yml');
  fs.writeFileSync(configPath, fs.readFileSync(configPath, 'utf8').replace(/\n/g, '\r\n'), 'utf8');

  const problems = validate(f.catalog);
  assert.deepEqual(problems, []);
});

test('CHECK I: CRLF plus long ownership marker is owned but content-drifted, not unowned', async (t) => {
  // sync --check parity: renderOmpAgent/renderProjectConfig always emit the
  // SHORT marker, so a LONG-marker artifact is owned (isOwnedAgentFile/
  // isOwnedConfig still accept it) but its exact bytes never match the
  // generator's own output — content-mismatch, never no-ownership.
  const f = setupOmpFixture(CLEAN_CATALOG, t);
  const validate = await loadValidator(f.root);

  const toCRLFLongMarker = (text) => text.split(AGENT_MARKER_SHORT).join(AGENT_MARKER_LONG).replace(/\n/g, '\r\n');

  const agentsDir = path.join(f.root, '.omp', 'agents');
  for (const filename of fs.readdirSync(agentsDir).filter((n) => n.endsWith('.md'))) {
    const filePath = path.join(agentsDir, filename);
    fs.writeFileSync(filePath, toCRLFLongMarker(fs.readFileSync(filePath, 'utf8')), 'utf8');
  }
  const configPath = path.join(f.root, '.omp', 'config.yml');
  fs.writeFileSync(configPath, toCRLFLongMarker(fs.readFileSync(configPath, 'utf8')), 'utf8');

  const problems = validate(f.catalog);
  assert.deepEqual(problems, [
    'omp-agent-content-mismatch:alpha.md',
    'omp-agent-content-mismatch:beta.md',
    'omp-config-content-mismatch',
  ]);
});

// ── CHECK D: catalog thinkingLevel vocabulary (validateFleet) ─────────────

test('CHECK D: catalog thinkingLevel "max" is accepted vocabulary', async (t) => {
  const cat = makeCatalog([
    {
      name: 'maxthinker',
      lane: 'worker',
      description: 'maxthinker executes delegated tasks at the maximum reasoning depth for validation',
      model: 'anthropic/claude-haiku-4-5',
      thinkingLevel: 'max',
      tools: ['read'],
      capabilities: ['execution'],
      skills: ['max-skill-a', 'max-skill-b', 'max-skill-c', 'max-skill-d'],
      mission: 'Validate max thinking vocabulary acceptance',
    },
  ]);
  const f = setupOmpFixture(cat, t, { skipProjection: true });

  fs.mkdirSync(path.join(f.root, '_SYSTEM', 'mure'), { recursive: true });
  fs.writeFileSync(
    path.join(f.root, '_SYSTEM', 'mure', 'agent-catalog.json'),
    JSON.stringify(cat),
    'utf8',
  );
  for (const id of cat.agents[0].skills) {
    const skillDir = path.join(f.root, '.claude', 'skills', id);
    fs.mkdirSync(skillDir, { recursive: true });
    fs.writeFileSync(path.join(skillDir, 'SKILL.md'), `# ${id}\n`, 'utf8');
  }

  const mod = await loadValidatorModule(f.root);

  const { checks } = mod.validateFleet();
  const checkD = checks.find((c) => c.name.startsWith('D:'));
  assert.ok(checkD, 'expected CHECK D to run');
  assert.equal(checkD.ok, true, checkD.detail);
});

// ── CHECK J: canary evidence gate ──────────────────────────────────────────

function makeOmpRoute(overrides = {}) {
  return {
    id: 'synth.omp',
    provider: 'synth-co',
    surface: 'omp-native',
    model: 'synth-code/Synth-1',
    agentId: 'synth-agent',
    status: 'canary-proven',
    source: 'omp-task-completion',
    canaryEvidence: {
      jobId: 'SynthCanary',
      ompSessionId: '019f5000-0000-7000-0000-000000000000',
      model: 'synth-code/Synth-1',
      agentId: 'synth-agent',
      taskResultStatus: 'completed',
      observed: '2026-07-11',
      result: { canary: 'synth-1', packageName: 'yuri-os-musubi', status: 'ok' },
      transcriptReadObserved: true,
      transcriptYieldObserved: true,
      thinkingLevel: 'high',
    },
    ...overrides,
  };
}

function registryOfRoute(route) {
  return { modelIdentities: { synth: { role: 'frontier-worker', routes: [route] } } };
}

test('CHECK J: canary evidence — invalid OMP evidence fails with model diagnostic', () => {
  const route = makeOmpRoute();
  route.canaryEvidence.model = 'synth-code/Synth-DIFFERENT';
  const problems = validateCanaryEvidence(registryOfRoute(route));
  assert.deepEqual(problems, ['provider-route-canary-evidence-invalid:synth-code/Synth-1']);
});

test('CHECK J: canary evidence — failed taskResultStatus is rejected', () => {
  const route = makeOmpRoute();
  route.canaryEvidence.taskResultStatus = 'failed';
  const problems = validateCanaryEvidence(registryOfRoute(route));
  assert.deepEqual(problems, ['provider-route-canary-evidence-invalid:synth-code/Synth-1']);
});

test('CHECK J: canary evidence — current live registry evidence union passes', () => {
  const raw = fs.readFileSync(path.join(REPO_CONFIG, 'provider-route-registry.json'), 'utf8');
  const registry = JSON.parse(raw.replace(/,\s*([}\]])/g, '$1'));
  const problems = validateCanaryEvidence(registry);
  assert.deepEqual(problems, []);
});

test('CHECK J: canary evidence — valid OMP evidence passes', () => {
  const problems = validateCanaryEvidence(registryOfRoute(makeOmpRoute()));
  assert.deepEqual(problems, []);
});

test('CHECK J: canary evidence — OMP evidence with impossible observed date fails', () => {
  const route = makeOmpRoute();
  route.canaryEvidence.observed = '2026-02-31';
  const problems = validateCanaryEvidence(registryOfRoute(route));
  assert.deepEqual(problems, ['provider-route-canary-evidence-invalid:synth-code/Synth-1']);
});

test('CHECK J: canary evidence — OMP evidence with non-date-shaped observed fails', () => {
  const route = makeOmpRoute();
  route.canaryEvidence.observed = 'yesterday';
  const problems = validateCanaryEvidence(registryOfRoute(route));
  assert.deepEqual(problems, ['provider-route-canary-evidence-invalid:synth-code/Synth-1']);
});

test('CHECK J: canary evidence — OMP evidence with missing jobId fails', () => {
  const route = makeOmpRoute();
  delete route.canaryEvidence.jobId;
  const problems = validateCanaryEvidence(registryOfRoute(route));
  assert.deepEqual(problems, ['provider-route-canary-evidence-invalid:synth-code/Synth-1']);
});

test('CHECK J: canary evidence — OMP evidence with foreign agentId fails', () => {
  const route = makeOmpRoute();
  route.canaryEvidence.agentId = 'someone-elses-agent';
  const problems = validateCanaryEvidence(registryOfRoute(route));
  assert.deepEqual(problems, ['provider-route-canary-evidence-invalid:synth-code/Synth-1']);
});

test('CHECK J: canary evidence — route missing agentId fails regardless of otherwise-valid evidence', () => {
  const route = makeOmpRoute();
  delete route.agentId;
  const problems = validateCanaryEvidence(registryOfRoute(route));
  assert.deepEqual(problems, ['provider-route-canary-evidence-invalid:synth-code/Synth-1']);
});

test('CHECK J: canary evidence — legacy fields in OMP evidence fail', () => {
  const route = makeOmpRoute();
  route.canaryEvidence.runId = 'old-run-id';
  const problems = validateCanaryEvidence(registryOfRoute(route));
  assert.deepEqual(problems, ['provider-route-canary-evidence-invalid:synth-code/Synth-1']);
});

test('CHECK J: canary evidence — missing result object fails', () => {
  const route = makeOmpRoute();
  delete route.canaryEvidence.result;
  const problems = validateCanaryEvidence(registryOfRoute(route));
  assert.deepEqual(problems, ['provider-route-canary-evidence-invalid:synth-code/Synth-1']);
});

test('CHECK J: canary evidence — result.status not ok fails', () => {
  const route = makeOmpRoute();
  route.canaryEvidence.result = { ...makeOmpRoute().canaryEvidence.result, status: 'error' };
  const problems = validateCanaryEvidence(registryOfRoute(route));
  assert.deepEqual(problems, ['provider-route-canary-evidence-invalid:synth-code/Synth-1']);
});

// ── CHECK I: canonicalization scope + manifest-only absence (Main-requested regressions) ──

test('CHECK I: long-marker text in a card body line still fails content-mismatch', async (t) => {
  // canonicalizeProjectionText folds the accepted LONG ownership marker down
  // to SHORT so a legitimately long-form ownership line round-trips clean.
  // That folding MUST be scoped to the ownership-marker position — if it
  // instead folds every occurrence of the long-marker substring anywhere in
  // the file, a corrupted BODY line that happens to carry the marker text
  // gets silently normalized away and the exact-content gate never fires.
  // This agent's `notes` field is set to the literal short-marker text so a
  // legitimate rendered body line reads "**Notes:** <AGENT_MARKER_SHORT>";
  // mutating only that body occurrence to the long form (leaving the real
  // ownership line on line 2 untouched) must still trip the content gate.
  const cat = makeCatalog([
    makeAgent('alpha', { notes: AGENT_MARKER_SHORT }),
    makeAgent('beta', { model: 'cline-pass/cline-pass/deepseek-v4-flash', description: 'beta cline-pass', mission: 'beta tasks' }),
  ]);
  const f = setupOmpFixture(cat, t);
  const validate = await loadValidator(f.root);
  const cardPath = path.join(f.root, '.omp', 'agents', 'alpha.md');
  let source = fs.readFileSync(cardPath, 'utf8');
  const notesLinePrefix = '**Notes:** ';
  assert.ok(source.includes(`${notesLinePrefix}${AGENT_MARKER_SHORT}`), 'fixture must render the marker text inside the Notes body line');
  source = source.replace(`${notesLinePrefix}${AGENT_MARKER_SHORT}`, `${notesLinePrefix}${AGENT_MARKER_LONG}`);
  fs.writeFileSync(cardPath, source, 'utf8');
  const problems = validate(f.catalog);
  assert.ok(
    problems.includes('omp-agent-content-mismatch:alpha.md'),
    `expected omp-agent-content-mismatch:alpha.md — canonicalization must be scoped to the ownership-marker position, not fold every long-marker substring in the file. Got: ${JSON.stringify(problems)}`,
  );
});

test('CHECK I: manifest removed from an otherwise complete nonempty projection fails state-missing', async (t) => {
  const f = setupOmpFixture(CLEAN_CATALOG, t);
  const validate = await loadValidator(f.root);
  // Agents + config remain intact; only the manifest is deleted.
  fs.rmSync(path.join(f.root, '_SYSTEM', 'state', 'mure-omp-projection.json'));
  const problems = validate(f.catalog);
  assert.ok(
    problems.some((p) => p.startsWith('omp-state-missing')),
    `expected omp-state-missing when agents+config exist but the manifest is absent (symmetric with omp-agents-missing/omp-config-missing). Got: ${JSON.stringify(problems)}`,
  );
});

// ── CHECK I: malformed-artifact deterministic read errors (Main-requested) ──

test('CHECK I: expected card path replaced with a directory fails read-error, not throw', async (t) => {
  const f = setupOmpFixture(CLEAN_CATALOG, t);
  const validate = await loadValidator(f.root);
  const cardPath = path.join(f.root, '.omp', 'agents', 'alpha.md');
  fs.rmSync(cardPath);
  fs.mkdirSync(cardPath);
  const problems = validate(f.catalog);
  assert.ok(
    problems.includes('omp-agent-read-error:alpha.md'),
    `expected omp-agent-read-error:alpha.md without a throw. Got: ${JSON.stringify(problems)}`,
  );
});

test('CHECK I: config path replaced with a directory fails read-error, not throw', async (t) => {
  const f = setupOmpFixture(CLEAN_CATALOG, t);
  const validate = await loadValidator(f.root);
  const configPath = path.join(f.root, '.omp', 'config.yml');
  fs.rmSync(configPath);
  fs.mkdirSync(configPath);
  const problems = validate(f.catalog);
  assert.ok(
    problems.includes('omp-config-read-error'),
    `expected omp-config-read-error without a throw. Got: ${JSON.stringify(problems)}`,
  );
});

test('CHECK I: manifest path replaced with a directory fails read-error, not throw', async (t) => {
  const f = setupOmpFixture(CLEAN_CATALOG, t);
  const validate = await loadValidator(f.root);
  const manifestPath = path.join(f.root, '_SYSTEM', 'state', 'mure-omp-projection.json');
  fs.rmSync(manifestPath);
  fs.mkdirSync(manifestPath);
  const problems = validate(f.catalog);
  assert.ok(
    problems.includes('omp-state-read-error'),
    `expected omp-state-read-error (split from omp-state-parse-error) without a throw. Got: ${JSON.stringify(problems)}`,
  );
});

test('CHECK I: .omp/agents replaced with a regular file fails agents-read-error, not throw', async (t) => {
  const f = setupOmpFixture(CLEAN_CATALOG, t);
  const validate = await loadValidator(f.root);
  const agentsDir = path.join(f.root, '.omp', 'agents');
  fs.rmSync(agentsDir, { recursive: true, force: true });
  fs.writeFileSync(agentsDir, 'not a directory', 'utf8');
  const problems = validate(f.catalog);
  assert.ok(
    problems.includes('omp-agents-read-error'),
    `expected omp-agents-read-error (separate readdir-level catch) without a throw. Got: ${JSON.stringify(problems)}`,
  );
});

// ── CHECK I: manifest byte-exact drift gate (F2) ───────────────────────────

test('CHECK I: manifest reordered but semantically identical fails content-mismatch (byte-exact contract)', async (t) => {
  const f = setupOmpFixture(CLEAN_CATALOG, t);
  const validate = await loadValidator(f.root);
  const manifestPath = path.join(f.root, '_SYSTEM', 'state', 'mure-omp-projection.json');
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  // Reorder every card's own keys and the manifest's top-level keys without
  // changing a single value — semantically identical, byte-different from
  // the generator's own renderProjectionManifest output.
  const reorderedCards = manifest.cards.map((card) => {
    const reordered = {};
    for (const key of Object.keys(card).reverse()) reordered[key] = card[key];
    return reordered;
  });
  const reorderedManifest = {
    schemaVersion: manifest.schemaVersion,
    _provenance: manifest._provenance,
    generated: manifest.generated,
    source: manifest.source,
    projected: manifest.projected,
    disabled: manifest.disabled,
    executable: manifest.executable,
    cards: reorderedCards,
  };
  fs.writeFileSync(manifestPath, JSON.stringify(reorderedManifest, null, 2) + '\n', 'utf8');
  const problems = validate(f.catalog);
  assert.deepEqual(problems, ['omp-state-content-mismatch']);
});

// ── CHECK I: symlink safety — unsafe-path gates (F3) ───────────────────────

test('CHECK I: .omp/agents symlinked to an external byte-identical directory fails unsafe-path, not followed', async (t) => {
  const f = setupOmpFixture(CLEAN_CATALOG, t);
  const validate = await loadValidator(f.root);

  const externalDir = fs.mkdtempSync(path.join(os.tmpdir(), 'omp-external-agents-'));
  t.after(() => fs.rmSync(externalDir, { recursive: true, force: true }));
  const agentsDir = path.join(f.root, '.omp', 'agents');
  for (const filename of fs.readdirSync(agentsDir)) {
    fs.copyFileSync(path.join(agentsDir, filename), path.join(externalDir, filename));
  }
  fs.rmSync(agentsDir, { recursive: true, force: true });
  fs.symlinkSync(externalDir, agentsDir);

  const problems = validate(f.catalog);
  assert.ok(
    problems.includes('omp-agents-unsafe-path'),
    `expected omp-agents-unsafe-path without following the symlink. Got: ${JSON.stringify(problems)}`,
  );
});

test('CHECK I: config.yml symlinked to an external byte-identical file fails unsafe-path, not followed', async (t) => {
  const f = setupOmpFixture(CLEAN_CATALOG, t);
  const validate = await loadValidator(f.root);

  const externalDir = fs.mkdtempSync(path.join(os.tmpdir(), 'omp-external-config-'));
  t.after(() => fs.rmSync(externalDir, { recursive: true, force: true }));
  const configPath = path.join(f.root, '.omp', 'config.yml');
  const externalConfig = path.join(externalDir, 'config.yml');
  fs.copyFileSync(configPath, externalConfig);
  fs.rmSync(configPath);
  fs.symlinkSync(externalConfig, configPath);

  const problems = validate(f.catalog);
  assert.ok(
    problems.includes('omp-config-unsafe-path'),
    `expected omp-config-unsafe-path without following the symlink. Got: ${JSON.stringify(problems)}`,
  );
});

test('CHECK I: manifest symlinked to an external byte-identical file fails unsafe-path, not followed', async (t) => {
  const f = setupOmpFixture(CLEAN_CATALOG, t);
  const validate = await loadValidator(f.root);

  const externalDir = fs.mkdtempSync(path.join(os.tmpdir(), 'omp-external-manifest-'));
  t.after(() => fs.rmSync(externalDir, { recursive: true, force: true }));
  const manifestPath = path.join(f.root, '_SYSTEM', 'state', 'mure-omp-projection.json');
  const externalManifest = path.join(externalDir, 'mure-omp-projection.json');
  fs.copyFileSync(manifestPath, externalManifest);
  fs.rmSync(manifestPath);
  fs.symlinkSync(externalManifest, manifestPath);

  const problems = validate(f.catalog);
  assert.ok(
    problems.includes('omp-state-unsafe-path'),
    `expected omp-state-unsafe-path without following the symlink. Got: ${JSON.stringify(problems)}`,
  );
});

// ── CHECK I: catalog.generated empty-string producer/consumer round-trip (F4) ──

test('CHECK I: catalog.generated empty string round-trips clean', async (t) => {
  const cat = { ...CLEAN_CATALOG, generated: '' };
  const f = setupOmpFixture(cat, t, { skipProjection: true });
  const projection = buildOmpProjection(f.catalog);
  for (const card of projection.cards) {
    fs.writeFileSync(path.join(f.root, '.omp', 'agents', `${card.filename}.md`), renderOmpAgent(card), 'utf8');
  }
  fs.writeFileSync(path.join(f.root, '.omp', 'config.yml'), renderProjectConfig(projection), 'utf8');
  fs.writeFileSync(
    path.join(f.root, '_SYSTEM', 'state', 'mure-omp-projection.json'),
    renderProjectionManifest(projection, f.catalog.generated),
    'utf8',
  );
  const validate = await loadValidator(f.root);
  const problems = validate(f.catalog);
  assert.deepEqual(problems, []);
});

// ── Canary-bootstrap variant identity + projection envelope ────────────────
// deepseek-v4-flash:direct (live catalog-candidate) and minimax-portal/MiniMax-M3
// (live canary-proven) are used as real registry-backed targets — no registry
// fixture/mutation needed for the OK-path envelope tests. Registry-eligibility
// (blocked/quota/unresolved/owner-excluded/unknown-status routes) is tested via
// a small fixture registry through validateCanaryBootstrapVariants directly.

function bootstrapVariantFixture(overrides = {}) {
  return {
    id: 'bootstrap-fixture',
    model: 'deepseek-v4-flash:direct',
    eligibilityFlags: ['canary-bootstrap'],
    tools: ['read'],
    note: 'An evidence-only canary bootstrap for the pending deepseek-v4-flash:direct route.',
    ...overrides,
  };
}

test('buildOmpProjection: catalog-candidate bootstrap variant resolves OK/bootstrapOnly with a forced read-only/no-spawn/task envelope; base card stays canary_pending', () => {
  const cat = makeCatalog([
    makeAgent('bootstrap-host', {
      model: 'deepseek-v4-flash:direct',
      tools: ['read', 'grep', 'glob', 'edit', 'write', 'bash'],
      spawns: 'worker-*',
      variants: [bootstrapVariantFixture()],
    }),
  ]);

  const projection = buildOmpProjection(cat);
  const baseCard = projection.cards.find((c) => c.variant === null);
  const bootstrapCard = projection.cards.find((c) => c.variant !== null);
  assert.ok(baseCard && bootstrapCard, 'expected both a base and a bootstrap card');

  assert.equal(baseCard.resolution.status, 'FAIL_CLOSED');
  assert.equal(baseCard.resolution.failClass, 'canary_pending');
  assert.equal(baseCard.resolution.bootstrapOnly, false);

  assert.equal(bootstrapCard.resolution.status, 'OK');
  assert.equal(bootstrapCard.resolution.bootstrapOnly, true);
  assert.deepEqual(bootstrapCard.tools, ['read'], 'bootstrap card must be forced read-only regardless of base tools');
  assert.equal(bootstrapCard.spawns, null, 'bootstrap card must never inherit spawn authority');
  assert.equal(bootstrapCard.task, true, 'bootstrap card must be forced task mode');
});

test('buildOmpProjection: canary-proven bootstrap variant tombstones (bootstrap_expired) while the base card resolves normally OK', () => {
  const cat = makeCatalog([
    makeAgent('proven-host', {
      model: 'minimax-portal/MiniMax-M3',
      variants: [bootstrapVariantFixture({
        id: 'proven-host-bootstrap',
        model: 'minimax-portal/MiniMax-M3',
        note: 'An evidence-only canary bootstrap — tombstoned now that the route is canary-proven.',
      })],
    }),
  ]);

  const projection = buildOmpProjection(cat);
  const baseCard = projection.cards.find((c) => c.variant === null);
  const bootstrapCard = projection.cards.find((c) => c.variant !== null);
  assert.ok(baseCard && bootstrapCard, 'expected both a base and a bootstrap card');

  assert.equal(baseCard.resolution.status, 'OK');
  assert.equal(baseCard.resolution.bootstrapOnly, false);

  assert.equal(bootstrapCard.resolution.status, 'FAIL_CLOSED');
  assert.equal(bootstrapCard.resolution.failClass, 'bootstrap_expired');
  assert.equal(bootstrapCard.resolution.bootstrapOnly, false);
});

// ── validateCanaryBootstrapVariants: catalog hygiene for canary-bootstrap variants ──

function bootstrapCatalog(variantOverrides = {}) {
  return makeCatalog([
    makeAgent('bootstrap-host', {
      model: 'deepseek-v4-flash:direct',
      variants: [bootstrapVariantFixture(variantOverrides)],
    }),
  ]);
}

function candidateRegistry() {
  return { modelIdentities: { deepseek: { role: 'bounded-worker', routes: [
    { id: 'dvf.direct', provider: 'deepseek', surface: 'direct-api', model: 'deepseek-v4-flash:direct', agentId: 'deepseek-flash', status: 'catalog-candidate', source: 'mure-agent-catalog' },
  ] } } };
}

test('validateCanaryBootstrapVariants: exact evidence-only bootstrap targeting a catalog-candidate route is clean', () => {
  const problems = validateCanaryBootstrapVariants(bootstrapCatalog(), candidateRegistry());
  assert.deepEqual(problems, []);
});

test('validateCanaryBootstrapVariants: exact evidence-only bootstrap targeting a canary-proven route is clean (pre-tombstone catalog state)', () => {
  const provenRoute = makeOmpRoute({ model: 'deepseek-v4-flash:direct', canaryEvidence: { ...makeOmpRoute().canaryEvidence, model: 'deepseek-v4-flash:direct' } });
  const registry = { modelIdentities: { deepseek: { role: 'bounded-worker', routes: [provenRoute] } } };
  const problems = validateCanaryBootstrapVariants(bootstrapCatalog(), registry);
  assert.deepEqual(problems, []);
});

test('validateCanaryBootstrapVariants: catalog-candidate route registered under a REMAPPED source-route key (cursor/* -> cursor-cli/*) is recognized eligible', () => {
  // cursor/composer-2.5's exact source-route key is cursor-cli/composer-2.5
  // (see CATALOG_SOURCE_ROUTES) — the registry row lives at that ALIASED
  // key, never at the raw variant.model string itself. A naive
  // routeByModel[variant.model] lookup would miss this and wrongly reject.
  const cat = bootstrapCatalog({ model: 'cursor/composer-2.5', note: bootstrapVariantFixture().note });
  const registry = { modelIdentities: { cursor: { role: 'bounded-worker', routes: [
    { id: 'composer.cli', provider: 'cursor-cli', surface: 'omp-native', model: 'cursor-cli/composer-2.5', agentId: 'composer-agent', status: 'catalog-candidate', source: 'mure-agent-catalog' },
  ] } } };
  const problems = validateCanaryBootstrapVariants(cat, registry);
  assert.deepEqual(problems, []);
});

test('validateCanaryBootstrapVariants: canary-proven route registered under a REMAPPED normalized-selector key (minimax-portal/MiniMax-M3 -> minimax-code/MiniMax-M3) is recognized eligible', () => {
  // minimax-portal/MiniMax-M3's exact source-route key IS itself (identity
  // mapping in EXTRA_SOURCE_ROUTES) — the live registry row is instead keyed
  // at the NORMALIZED SELECTOR minimax-code/MiniMax-M3. A naive
  // routeByModel[variant.model] lookup would miss this too.
  const cat = bootstrapCatalog({ model: 'minimax-portal/MiniMax-M3', note: bootstrapVariantFixture().note });
  const provenRoute = makeOmpRoute({ model: 'minimax-code/MiniMax-M3', canaryEvidence: { ...makeOmpRoute().canaryEvidence, model: 'minimax-code/MiniMax-M3' } });
  const registry = { modelIdentities: { minimax: { role: 'frontier-worker', routes: [provenRoute] } } };
  const problems = validateCanaryBootstrapVariants(cat, registry);
  assert.deepEqual(problems, []);
});

test('validateCanaryBootstrapVariants: a REMAPPED route in a blocked status is still rejected — remapping never rescues an ineligible status', () => {
  const cat = bootstrapCatalog({ model: 'cursor/composer-2.5', note: bootstrapVariantFixture().note });
  const registry = { modelIdentities: { cursor: { role: 'bounded-worker', routes: [
    { id: 'composer.cli', provider: 'cursor-cli', surface: 'omp-native', model: 'cursor-cli/composer-2.5', agentId: 'composer-agent', status: 'quota-blocked', blockedReason: 'fixture', source: 'mure-agent-catalog' },
  ] } } };
  const problems = validateCanaryBootstrapVariants(cat, registry);
  assert.ok(problems.some((p) => p.startsWith('bootstrap-route-not-eligible:')), problems.join('; '));
});

test('validateCanaryBootstrapVariants: a bare selector-key catalog-candidate row (no source-key row at all) is rejected — the resolver never admits bootstrap by selector-key candidacy', () => {
  // sourceRoute for cursor/composer-2.5 is the aliased cursor-cli/composer-2.5
  // (absent here); the registry row instead sits at the SELECTOR key
  // cursor/composer-2.5 itself. The resolver's Step 2 bootstrap admission is
  // decided ONLY at the source key — a selector-key candidate row is never
  // consulted for admission (Step 6 only ever checks selector-key
  // CANARY-PROVEN-ness, never catalog-candidate-ness) — so this must stay
  // ineligible even though a "catalog-candidate" row technically exists.
  const cat = bootstrapCatalog({ model: 'cursor/composer-2.5', note: bootstrapVariantFixture().note });
  const registry = { modelIdentities: { cursor: { role: 'bounded-worker', routes: [
    { id: 'composer.selector', provider: 'cursor-cli', surface: 'omp-native', model: 'cursor/composer-2.5', agentId: 'composer-agent', status: 'catalog-candidate', source: 'mure-agent-catalog' },
  ] } } };
  const problems = validateCanaryBootstrapVariants(cat, registry);
  assert.ok(problems.some((p) => p.startsWith('bootstrap-route-not-eligible:')), problems.join('; '));
});

test('validateCanaryBootstrapVariants: a blocked/quota source-key row is rejected even when the selector-key row is canary-proven — a blocked source always wins', () => {
  // sourceRoute cursor-cli/composer-2.5 exists and is quota-blocked; the
  // resolver's Step 2 REGISTRY_BLOCKED fires unconditionally on that source
  // row and Step 6 (where a proven selector could otherwise matter) is
  // never reached. A proven selector must never rescue a blocked source.
  const cat = bootstrapCatalog({ model: 'cursor/composer-2.5', note: bootstrapVariantFixture().note });
  const provenSelectorRoute = makeOmpRoute({
    model: 'cursor/composer-2.5',
    canaryEvidence: { ...makeOmpRoute().canaryEvidence, model: 'cursor/composer-2.5' },
  });
  const registry = { modelIdentities: { cursor: { role: 'bounded-worker', routes: [
    { id: 'composer.cli', provider: 'cursor-cli', surface: 'omp-native', model: 'cursor-cli/composer-2.5', agentId: 'composer-agent', status: 'quota-blocked', blockedReason: 'fixture', source: 'mure-agent-catalog' },
    provenSelectorRoute,
  ] } } };
  const problems = validateCanaryBootstrapVariants(cat, registry);
  assert.ok(problems.some((p) => p.startsWith('bootstrap-route-not-eligible:')), problems.join('; '));
});

test('validateCanaryBootstrapVariants: extra eligibility flags are rejected', () => {
  const problems = validateCanaryBootstrapVariants(
    bootstrapCatalog({ eligibilityFlags: ['canary-bootstrap', 'heavy'] }),
    candidateRegistry(),
  );
  assert.ok(problems.some((p) => p.startsWith('bootstrap-extra-flags:')), problems.join('; '));
});

test('validateCanaryBootstrapVariants: a write-capable bootstrap variant is rejected', () => {
  const problems = validateCanaryBootstrapVariants(
    bootstrapCatalog({ tools: ['read', 'write'] }),
    candidateRegistry(),
  );
  assert.ok(problems.some((p) => p.startsWith('bootstrap-not-read-only:')), problems.join('; '));
});

test('validateCanaryBootstrapVariants: a bootstrap variant missing the evidence-only description is rejected', () => {
  const problems = validateCanaryBootstrapVariants(
    bootstrapCatalog({ note: 'Cheap fast worker for scaffolding.' }),
    candidateRegistry(),
  );
  assert.ok(problems.some((p) => p.startsWith('bootstrap-missing-evidence-only-description:')), problems.join('; '));
});

test('validateCanaryBootstrapVariants: a bootstrap variant targeting a blocked/quota/unresolved/unknown-status route is rejected', () => {
  for (const status of ['blocked-schema', 'quota-blocked', 'unresolved', 'some-future-status']) {
    const registry = { modelIdentities: { deepseek: { role: 'bounded-worker', routes: [
      { id: 'dvf.direct', provider: 'deepseek', surface: 'direct-api', model: 'deepseek-v4-flash:direct', agentId: 'deepseek-flash', status, blockedReason: status === 'blocked-schema' ? 'fixture' : undefined, source: 'mure-agent-catalog' },
    ] } } };
    const problems = validateCanaryBootstrapVariants(bootstrapCatalog(), registry);
    assert.ok(problems.some((p) => p.startsWith('bootstrap-route-not-eligible:')),
      `status "${status}" must be rejected as bootstrap-route-not-eligible: ${problems.join('; ')}`);
  }
});

test('validateCanaryBootstrapVariants: a bootstrap variant targeting an owner-excluded/unregistered route is rejected', () => {
  const emptyRegistry = { modelIdentities: {} };
  const problems = validateCanaryBootstrapVariants(bootstrapCatalog(), emptyRegistry);
  assert.ok(problems.some((p) => p.startsWith('bootstrap-route-not-eligible:')), problems.join('; '));
});

test('validateCanaryBootstrapVariants: a non-bootstrap variant (no canary-bootstrap flag) is never inspected', () => {
  const cat = bootstrapCatalog({ eligibilityFlags: ['heavy'], tools: ['read', 'write'], note: 'normal variant' });
  const problems = validateCanaryBootstrapVariants(cat, candidateRegistry());
  assert.deepEqual(problems, [], 'a variant that never claims canary-bootstrap must not be flagged');
});

// ── CHECK N: role-skill affinity bleed gate ───────────────────────────────

const LIVE_CATALOG = JSON.parse(
  fs.readFileSync(path.join(REPO_MURE, 'agent-catalog.json'), 'utf8'),
);

test('CHECK N: live catalog carries no scenario/workflow skill bleed', () => {
  // mure-chronicler must not carry nex-vault / nex-deliverables;
  // composer-fast must not carry frontend-design;
  // mure-oracle must not carry oracle-router.
  assert.deepEqual(validateSkillAffinity(LIVE_CATALOG), []);
});

test('CHECK N: every confirmed bleed pair is flagged (negative path)', () => {
  // Inject every forbidden skill into its role's base card → all must bite.
  const tampered = {
    ...LIVE_CATALOG,
    agents: LIVE_CATALOG.agents.map((a) => {
      const deny = SKILL_AFFINITY_DENY[a.name];
      return deny ? { ...a, skills: [...(a.skills || []), ...deny] } : a;
    }),
  };
  const problems = validateSkillAffinity(tampered);
  for (const [role, forbidden] of Object.entries(SKILL_AFFINITY_DENY)) {
    for (const skill of forbidden) {
      assert.ok(problems.includes(`skill-affinity-bleed:${role}:${skill}`),
        `expected skill-affinity-bleed:${role}:${skill} in ${problems.join('; ')}`);
    }
  }
});

test('CHECK N: a role absent from the catalog is skipped, not flagged', () => {
  const noChronicler = { ...LIVE_CATALOG, agents: LIVE_CATALOG.agents.filter((a) => a.name !== 'mure-chronicler') };
  assert.deepEqual(validateSkillAffinity(noChronicler), [],
    'absent roles are skipped, so no bleed is reported');
});

test('mure-yuri projects mure-role-variant-matrix into Skills: (no duplication)', () => {
  // The skill is hash-registered and named in mure-yuri notes; it must also
  // ride the machine-readable skills array so the OMP skill:// projection surfaces it.
  const yuri = LIVE_CATALOG.agents.find((a) => a.name === 'mure-yuri');
  assert.ok(yuri, 'mure-yuri present in live catalog');
  const skills = Array.isArray(yuri.skills) ? yuri.skills : [];
  assert.equal(skills.filter((s) => s === 'mure-role-variant-matrix').length, 1,
    'mure-role-variant-matrix must appear exactly once in mure-yuri skills (no duplication)');
  // The rendered base card's Skills: line must surface it (what OMP loads).
  const projection = buildOmpProjection(LIVE_CATALOG);
  const base = projection.cards.find((c) => c.cardName === 'mure-yuri' && c.variant == null);
  assert.ok(base, 'mure-yuri projected base card exists');
  assert.ok(renderOmpAgent(base).includes('**Skills:**') &&
    renderOmpAgent(base).match(/\*\*Skills:\*\* (.*)/)[1].split(', ').includes('mure-role-variant-matrix'),
    'mure-yuri projected Skills: line must contain mure-role-variant-matrix');
});


// ── CHECK O: projected-skill integrity (generic projection invariant) ──────

test('CHECK O: live catalog — every projected card renders exactly its source agent skills', () => {
  // The generic projection invariant must pass trivially today: there are no
  // variant-level skill overrides, so every projected variant inherits its
  // base role's skills and the renderer echoes them verbatim.
  const problems = validateProjectedSkillIntegrity(LIVE_CATALOG);
  assert.deepEqual(problems, [],
    `live catalog must have zero projected-skill bleed/drop; got ${problems.join('; ')}`);
});

test('CHECK O: projected card with a deny-listed skill injected at projection time is flagged (negative path)', () => {
  // Simulate a renderer-time injection: build the real projection, then mutate
  // ONE card's skills at projection time (reassigning the array so the catalog
  // source stays clean) to add a deny-listed skill that role's source agent
  // does NOT carry. The invariant parses the renderer's own output and must
  // catch the bleed against the canonical source — without trusting card.skills
  // and without altering production renderer code.
  const projection = buildOmpProjection(LIVE_CATALOG);
  const chroniclerCard = projection.cards.find(
    (c) => c.agent && c.agent.name === 'mure-chronicler',
  );
  assert.ok(chroniclerCard, 'mure-chronicler projects at least one card');
  // nex-vault is deny-listed for mure-chronicler (SKILL_AFFINITY_DENY) and the
  // source agent does not carry it — a textbook renderer-time injection.
  assert.ok(!(chroniclerCard.agent.skills || []).includes('nex-vault'),
    'precondition: chronicler source does not carry nex-vault');
  const tampered = {
    ...projection,
    cards: projection.cards.map((c) =>
      c === chroniclerCard
        ? { ...c, skills: [...(c.skills || []), 'nex-vault'] }
        : c,
    ),
  };
  const problems = validateProjectedSkillIntegrity(LIVE_CATALOG, { projection: tampered });
  assert.ok(
    problems.some((p) => p === `projected-skill-bleed:${chroniclerCard.filename}:nex-vault`),
    `expected projected-skill-bleed:${chroniclerCard.filename}:nex-vault in ${problems.join('; ')}`,
  );
});

test('CHECK O: projected card missing a source skill (renderer dropped it) is flagged', () => {
  // The reverse drift: the renderer silently drops a skill the source agent
  // carries. Mutate one card's skills to drop a legitimate skill; the
  // invariant must report projected-skill-drop.
  const projection = buildOmpProjection(LIVE_CATALOG);
  const card = projection.cards.find((c) => (c.skills || []).length > 0);
  assert.ok(card, 'a card with skills exists');
  const dropped = card.skills[0];
  const tampered = {
    ...projection,
    cards: projection.cards.map((c) =>
      c === card ? { ...c, skills: c.skills.slice(1) } : c,
    ),
  };
  const problems = validateProjectedSkillIntegrity(LIVE_CATALOG, { projection: tampered });
  assert.ok(
    problems.some((p) => p === `projected-skill-drop:${card.filename}:${dropped.toLowerCase()}`),
    `expected projected-skill-drop:${card.filename}:${dropped.toLowerCase()} in ${problems.join('; ')}`,
  );
});

test('CHECK O: normalizeSkillSet is deterministic and order/case/whitespace-insensitive (pure helper)', () => {
  assert.deepEqual([...normalizeSkillSet(['B', ' a ', 'A', 'b', 'a'])].sort(), ['a', 'b'],
    'dedupes case-insensitively and trims whitespace');
  assert.equal(normalizeSkillSet(null).size, 0, 'null → empty');
  assert.equal(normalizeSkillSet(undefined).size, 0, 'undefined → empty');
  assert.equal(normalizeSkillSet('not-an-array').size, 0, 'non-array → empty');
  assert.equal(normalizeSkillSet([]).size, 0, 'empty array → empty');
});