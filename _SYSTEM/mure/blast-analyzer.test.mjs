// MURE blast analyzer — red/grey/green over classification, scoring, governance integration, and disarmed behavior.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { analyzeBlast, classifyBlast, blastRank, BLAST, isEnabled, ARM_FLAG, ARM_ENV } from './blast-analyzer.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));

// ── GREEN ───────────────────────────────────────────────────────────────────
test('GREEN: classifyBlast maps scores to correct tiers', () => {
  assert.deepEqual(classifyBlast(0.0), BLAST.LOW);
  assert.deepEqual(classifyBlast(0.25), BLAST.LOW);
  assert.deepEqual(classifyBlast(0.33), BLAST.LOW);
  assert.deepEqual(classifyBlast(0.34), BLAST.MEDIUM);
  assert.deepEqual(classifyBlast(0.50), BLAST.MEDIUM);
  assert.deepEqual(classifyBlast(0.66), BLAST.MEDIUM);
  assert.deepEqual(classifyBlast(0.67), BLAST.HIGH);
  assert.deepEqual(classifyBlast(0.80), BLAST.HIGH);
  assert.deepEqual(classifyBlast(0.90), BLAST.HIGH);
  assert.deepEqual(classifyBlast(0.91), BLAST.CRITICAL);
  assert.deepEqual(classifyBlast(1.0), BLAST.CRITICAL);
});

test('GREEN: blastRank matches governance.mjs behavior', () => {
  assert.equal(blastRank(0), BLAST.LOW.tier);
  assert.equal(blastRank(1), BLAST.MEDIUM.tier);
  assert.equal(blastRank(2), BLAST.HIGH.tier);
  assert.equal(blastRank(3), BLAST.CRITICAL.tier);
  assert.equal(blastRank('LOW'), BLAST.LOW.tier);
  assert.equal(blastRank('MEDIUM'), BLAST.MEDIUM.tier);
  assert.equal(blastRank('HIGH'), BLAST.HIGH.tier);
  assert.equal(blastRank('CRITICAL'), BLAST.CRITICAL.tier);
  assert.equal(blastRank(-1), BLAST.HIGH.tier, 'negative → HIGH (conservative)');
  assert.equal(blastRank(99), BLAST.HIGH.tier, 'out of range → HIGH (conservative)');
  assert.equal(blastRank('unknown'), BLAST.HIGH.tier, 'unknown string → HIGH (conservative)');
});

test('GREEN: a simple reversible code edit is LOW blast', () => {
  const result = analyzeBlast({
    files: ['src/myModule.js'],
    operations: ['edit'],
    reversible: true,
    outwardFacing: false,
    production: false,
  });
  assert.equal(result.class.label, 'LOW');
  assert.ok(result.score <= BLAST.LOW.maxScore);
  assert.equal(result.warnings.length, 0);
  assert.equal(result.protectedFiles.length, 0);
});

test('GREEN: test files are LOW blast', () => {
  const result = analyzeBlast({
    files: ['src/module.test.js', 'test/spec.test.mjs'],
    operations: ['edit', 'create'],
    reversible: true,
  });
  assert.equal(result.class.label, 'LOW');
});

test('GREEN: runtime/cache files are LOW blast', () => {
  const result = analyzeBlast({
    files: ['node_modules/package/index.js', '.tmp/cache.tmp', 'dist/out.js'],
    operations: ['delete'],
    reversible: true,
  });
  assert.equal(result.class.label, 'LOW');
});

test('GREEN: control plane scripts are MEDIUM blast', () => {
  const result = analyzeBlast({
    files: ['_SYSTEM/Scripts/myscript.mjs'],
    operations: ['edit'],
    reversible: true,
  });
  assert.equal(result.class.label, 'MEDIUM');
});

test('GREEN: irreversible deletions bump blast to MEDIUM+', () => {
  const reversibleResult = analyzeBlast({
    files: ['src/module.js'],
    operations: ['delete'],
    reversible: true,
  });
  const irreversibleResult = analyzeBlast({
    files: ['src/module.js'],
    operations: ['delete'],
    reversible: false,
  });
  assert.ok(irreversibleResult.score > reversibleResult.score);
});

test('GREEN: multiple files increase score logarithmically', () => {
  const oneFile = analyzeBlast({ files: ['src/a.js'], reversible: true });
  const tenFiles = analyzeBlast({
    files: Array.from({ length: 10 }, (_, i) => `src/file${i}.js`),
    reversible: true,
  });
  const hundredFiles = analyzeBlast({
    files: Array.from({ length: 100 }, (_, i) => `src/file${i}.js`),
    reversible: true,
  });
  assert.ok(tenFiles.score > oneFile.score);
  assert.ok(hundredFiles.score > tenFiles.score);
  // Logarithmic: 100x files should not be 100x score
  assert.ok(hundredFiles.score < oneFile.score * 5);
});

test('GREEN: analyzeBlast returns complete structured output', () => {
  const result = analyzeBlast({
    files: ['src/module.js'],
    operations: ['edit'],
    reversible: true,
  });
  assert.ok(result.class);
  assert.ok(result.tier !== undefined);
  assert.ok(result.label);
  assert.ok(typeof result.score === 'number');
  assert.ok(result.color);
  assert.ok(result.description);
  assert.ok(result.details);
  assert.ok(Array.isArray(result.files));
  assert.ok(Array.isArray(result.warnings));
  assert.ok(typeof result.enabled === 'boolean');
});

// ── RED ───────────────────────────────────────────────────────────────────
test('RED: protected paths are ALWAYS CRITICAL blast', () => {
  const protectedPaths = ['.env', 'backend/data/secrets.json', '.claude/state/runtime.db'];
  for (const p of protectedPaths) {
    const result = analyzeBlast({
      files: [p],
      operations: ['read'],
      reversible: true,
    });
    assert.equal(result.class.label, 'CRITICAL', `${p} must be CRITICAL`);
    assert.ok(result.protectedFiles.includes(p));
    assert.ok(result.warnings.some(w => w.includes('protected-path')));
  }
});

test('RED: governance.mjs files are HIGH blast (not protected but sensitive)', () => {
  const result = analyzeBlast({
    files: ['_SYSTEM/mure/governance.mjs'],
    operations: ['edit'],
    reversible: true,
  });
  assert.equal(result.class.label, 'HIGH');
  assert.ok(result.warnings.some(w => w.includes('high-impact')));
});

test('RED: outward-facing operations push blast to HIGH+', () => {
  const baseline = analyzeBlast({
    files: ['src/module.js'],
    operations: ['edit'],
    outwardFacing: false,
    reversible: true,
  });
  const outward = analyzeBlast({
    files: ['src/module.js'],
    operations: ['publish', 'email'],
    outwardFacing: true,
    reversible: true,
  });
  assert.equal(outward.class.label, 'HIGH');
  assert.ok(outward.score > baseline.score);
  assert.ok(outward.warnings.some(w => w.includes('outward-facing')));
});

test('RED: production impact adds significant blast', () => {
  const dev = analyzeBlast({
    files: ['src/config.js'],
    operations: ['edit'],
    production: false,
    reversible: true,
  });
  const prod = analyzeBlast({
    files: ['src/config.js'],
    operations: ['edit'],
    production: true,
    reversible: true,
  });
  assert.ok(prod.score > dev.score);
  assert.ok(prod.warnings.some(w => w.includes('production-impact')));
});

test('RED: commit+push operations increase blast', () => {
  const noCommit = analyzeBlast({
    files: ['src/module.js'],
    operations: ['edit'],
    reversible: true,
  });
  const withCommit = analyzeBlast({
    files: ['src/module.js'],
    operations: ['edit', 'commit', 'push'],
    reversible: true,
  });
  assert.ok(withCommit.score > noCommit.score);
});

test('RED: DISARMED by default (no env, no flag)', () => {
  // Clear env for test isolation
  const originalEnv = process.env[ARM_ENV];
  delete process.env[ARM_ENV];
  const flagExists = fs.existsSync(ARM_FLAG);
  if (flagExists) {
    fs.unlinkSync(ARM_FLAG);
  }
  try {
    assert.equal(isEnabled(), false, 'must be DISARMED by default');
    const result = analyzeBlast({ files: ['src/a.js'] });
    assert.equal(result.enabled, false);
  } finally {
    if (originalEnv) process.env[ARM_ENV] = originalEnv;
  }
});

test('RED: arming requires explicit owner action (env OR flag)', () => {
  const originalEnv = process.env[ARM_ENV];
  const flagExists = fs.existsSync(ARM_FLAG);
  if (flagExists) fs.unlinkSync(ARM_FLAG);

  try {
    // No env, no flag → disarmed
    delete process.env[ARM_ENV];
    assert.equal(isEnabled(), false);

    // Env only → armed
    process.env[ARM_ENV] = '1';
    assert.equal(isEnabled(), true);

    // Flag only → armed
    delete process.env[ARM_ENV];
    fs.writeFileSync(ARM_FLAG, 'test');
    assert.equal(isEnabled(), true);

    // Both → armed
    process.env[ARM_ENV] = '1';
    assert.equal(isEnabled(), true);
  } finally {
    if (originalEnv) process.env[ARM_ENV] = originalEnv;
    else delete process.env[ARM_ENV];
    if (fs.existsSync(ARM_FLAG)) fs.unlinkSync(ARM_FLAG);
  }
});

test('RED regression: score never exceeds 1.0 or goes below 0', () => {
  // Maximum possible blast
  const maxBlast = analyzeBlast({
    files: ['.env', 'backend/data/db', '_SYSTEM/mure/governance.mjs'],
    operations: ['delete', 'publish', 'email', 'commit', 'push'],
    outwardFacing: true,
    production: true,
    reversible: false,
  });
  assert.ok(maxBlast.score <= 1.0, 'score must not exceed 1.0');

  // Minimum possible blast (reversible, single low-impact file)
  const minBlast = analyzeBlast({
    files: ['test/unit.test.js'],
    operations: [],
    outwardFacing: false,
    production: false,
    reversible: true,
  });
  assert.ok(minBlast.score >= 0, 'score must not be negative');
});

// ── GREY ───────────────────────────────────────────────────────────────────
test('GREY (invariant): file count contribution is logarithmic', () => {
  // Test that adding 10x files does not add 10x score from file count alone
  const base = analyzeBlast({
    files: Array.from({ length: 1 }, (_, i) => `src/${i}.js`),
    reversible: true,
  });
  const ten = analyzeBlast({
    files: Array.from({ length: 10 }, (_, i) => `src/${i}.js`),
    reversible: true,
  });
  const hundred = analyzeBlast({
    files: Array.from({ length: 100 }, (_, i) => `src/${i}.js`),
    reversible: true,
  });

  // File count factor should grow slowly
  const baseScoreExclFiles = base.score - 0.25 * (1 / BLAST.CRITICAL.tier); // rough estimate
  const tenScoreExclFiles = ten.score - 0.25 * (1 / BLAST.CRITICAL.tier);
  const hundredScoreExclFiles = hundred.score - 0.25 * (1 / BLAST.CRITICAL.tier);

  assert.ok(tenScoreExclFiles - baseScoreExclFiles < 0.1);
  assert.ok(hundredScoreExclFiles - tenScoreExclFiles < 0.1);
});

test('GREY (invariant): protected-path detection handles Windows paths', () => {
  const result = analyzeBlast({
    files: ['C:\\Users\\test\\.env', 'backend\\data\\secrets.json'],
    operations: ['read'],
    reversible: true,
  });
  assert.ok(result.protectedFiles.length >= 1, 'should detect protected paths with backslashes');
});

test('GREY (invariant): missing input defaults to conservative MEDIUM blast', () => {
  const empty = analyzeBlast({});
  assert.ok(empty.class.label === 'MEDIUM' || empty.class.label === 'HIGH', 'empty input should default to MEDIUM or higher (conservative)');
  assert.ok(empty.details.fileCount === 0);
});

test('GREY (determinism): same input produces identical output', () => {
  const input = {
    files: ['src/module.js', '_SYSTEM/Scripts/script.mjs'],
    operations: ['edit', 'delete'],
    outwardFacing: false,
    production: false,
    reversible: true,
  };
  const a = analyzeBlast(input);
  const b = analyzeBlast(input);
  assert.equal(a.score, b.score);
  assert.equal(a.class.label, b.class.label);
  assert.deepEqual(a.warnings, b.warnings);
  assert.equal(a.details.protectedCount, b.details.protectedCount);
});

test('GREY (coverage): all BLAST tiers are reachable', () => {
  const tiers = new Set();
  // LOW
  tiers.add(analyzeBlast({ files: ['test/a.test.js'], reversible: true }).class.label);
  // MEDIUM
  tiers.add(analyzeBlast({ files: ['src/a.js', '_SYSTEM/Scripts/s.mjs'], reversible: true }).class.label);
  // HIGH
  tiers.add(analyzeBlast({
    files: ['src/a.js'],
    operations: ['publish'],
    outwardFacing: true,
    reversible: false,
  }).class.label);
  // CRITICAL
  tiers.add(analyzeBlast({ files: ['.env'], operations: ['edit'] }).class.label);

  assert.ok(tiers.has('LOW'));
  assert.ok(tiers.has('MEDIUM'));
  assert.ok(tiers.has('HIGH'));
  assert.ok(tiers.has('CRITICAL'));
});

test('GREY (integration): blastRank aligns with analyzeBlast.tier', () => {
  const result = analyzeBlast({ files: ['.env'] });
  assert.equal(result.tier, blastRank(result.label));
  assert.equal(result.tier, blastRank(result.class.label));
  assert.equal(result.tier, blastRank(result.tier));
});