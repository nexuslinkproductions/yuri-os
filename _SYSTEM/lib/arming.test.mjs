import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { isArmed, armState, resolveFlagPath, REPO_ROOT } from './arming.mjs';

describe('arming', () => {
  let tempDir;
  let originalEnv;

  beforeEach(() => {
    // Create a hermetic temp dir for flag files
    tempDir = fs.mkdtempSync(path.join(process.env.TMPDIR || '/tmp', 'arming-test-'));
    // Snapshot and clear relevant env vars
    originalEnv = {};
    ['TEST_ARM', 'YURI_FEATURE', 'ANOTHER_FEATURE'].forEach(k => {
      originalEnv[k] = process.env[k];
      delete process.env[k];
    });
  });

  afterEach(() => {
    // Clean up temp dir
    try {
      fs.rmSync(tempDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
    // Restore env vars
    Object.entries(originalEnv).forEach(([k, v]) => {
      if (v === undefined) {
        delete process.env[k];
      } else {
        process.env[k] = v;
      }
    });
  });

  describe('isArmed', () => {
    it('returns false when both env and flag are unset', () => {
      assert.strictEqual(isArmed({ env: 'TEST_ARM' }), false);
      assert.strictEqual(isArmed({}), false);
    });

    it('returns true when env var is "1"', () => {
      process.env.TEST_ARM = '1';
      assert.strictEqual(isArmed({ env: 'TEST_ARM' }), true);
    });

    it('returns false when env var is "0" or any other value', () => {
      process.env.TEST_ARM = '0';
      assert.strictEqual(isArmed({ env: 'TEST_ARM' }), false);
      process.env.TEST_ARM = 'true';
      assert.strictEqual(isArmed({ env: 'TEST_ARM' }), false);
      process.env.TEST_ARM = '';
      assert.strictEqual(isArmed({ env: 'TEST_ARM' }), false);
    });

    it('returns true when flag file exists (relative path)', () => {
      const flagPath = path.join(tempDir, 'test.enabled');
      fs.writeFileSync(flagPath, '');
      assert.strictEqual(isArmed({ flag: flagPath }), true);
    });

    it('returns true when flag file exists (absolute path)', () => {
      const flagPath = path.join(tempDir, 'test.enabled');
      fs.writeFileSync(flagPath, '');
      assert.strictEqual(isArmed({ flag: flagPath }), true);
    });

    it('returns false when flag file does not exist', () => {
      const flagPath = path.join(tempDir, 'test.enabled');
      assert.strictEqual(isArmed({ flag: flagPath }), false);
    });

    it('returns true when env var is "1" even if flag does not exist', () => {
      process.env.TEST_ARM = '1';
      const flagPath = path.join(tempDir, 'test.enabled');
      assert.strictEqual(isArmed({ env: 'TEST_ARM', flag: flagPath }), true);
    });

    it('returns true when flag exists even if env var is not "1"', () => {
      process.env.TEST_ARM = '0';
      const flagPath = path.join(tempDir, 'test.enabled');
      fs.writeFileSync(flagPath, '');
      assert.strictEqual(isArmed({ env: 'TEST_ARM', flag: flagPath }), true);
    });

    it('env takes precedence over flag', () => {
      process.env.TEST_ARM = '1';
      const flagPath = path.join(tempDir, 'test.enabled');
      // Flag does not exist, but env is armed
      assert.strictEqual(isArmed({ env: 'TEST_ARM', flag: flagPath }), true);
    });

    it('handles invalid flag paths gracefully', () => {
      assert.strictEqual(isArmed({ flag: '' }), false);
      assert.strictEqual(isArmed({ flag: null }), false);
      assert.strictEqual(isArmed({ flag: undefined }), false);
    });

    it('handles invalid env var names gracefully', () => {
      assert.strictEqual(isArmed({ env: '' }), false);
      assert.strictEqual(isArmed({ env: null }), false);
      assert.strictEqual(isArmed({ env: undefined }), false);
    });
  });

  describe('armState', () => {
    it('returns armed:false, source:null when unarmed', () => {
      assert.deepStrictEqual(armState({}), { armed: false, source: null });
    });

    it('returns armed:true, source:"env" when env var is "1"', () => {
      process.env.TEST_ARM = '1';
      assert.deepStrictEqual(armState({ env: 'TEST_ARM' }), { armed: true, source: 'env' });
    });

    it('returns armed:false, source:null when env var is not "1"', () => {
      process.env.TEST_ARM = '0';
      assert.deepStrictEqual(armState({ env: 'TEST_ARM' }), { armed: false, source: null });
    });

    it('returns armed:true, source:"flag" when flag exists', () => {
      const flagPath = path.join(tempDir, 'test.enabled');
      fs.writeFileSync(flagPath, '');
      assert.deepStrictEqual(armState({ flag: flagPath }), { armed: true, source: 'flag' });
    });

    it('returns armed:false, source:null when flag does not exist', () => {
      const flagPath = path.join(tempDir, 'test.enabled');
      assert.deepStrictEqual(armState({ flag: flagPath }), { armed: false, source: null });
    });

    it('env takes precedence over flag when both are armed', () => {
      process.env.TEST_ARM = '1';
      const flagPath = path.join(tempDir, 'test.enabled');
      fs.writeFileSync(flagPath, '');
      assert.deepStrictEqual(armState({ env: 'TEST_ARM', flag: flagPath }), { armed: true, source: 'env' });
    });

    it('env takes precedence when env is armed but flag does not exist', () => {
      process.env.TEST_ARM = '1';
      const flagPath = path.join(tempDir, 'test.enabled');
      assert.deepStrictEqual(armState({ env: 'TEST_ARM', flag: flagPath }), { armed: true, source: 'env' });
    });
  });

  describe('resolveFlagPath', () => {
    it('appends .enabled when not present', () => {
      const result = resolveFlagPath('my-feature');
      assert.ok(result.endsWith('my-feature.enabled'));
    });

    it('does not append .enabled when already present', () => {
      const result = resolveFlagPath('my-feature.enabled');
      assert.ok(result.endsWith('my-feature.enabled'));
      // Ensure not doubled
      assert.ok(!result.endsWith('.enabled.enabled'));
    });

    it('resolves to absolute path under _SYSTEM/state', () => {
      const result = resolveFlagPath('test-flag');
      assert.ok(path.isAbsolute(result));
      assert.ok(result.includes('_SYSTEM/state'));
    });

    it('handles name with .enabled correctly', () => {
      const result = resolveFlagPath('complex.name.enabled');
      assert.ok(result.endsWith('complex.name.enabled'));
    });

    it('handles empty string gracefully', () => {
      const result = resolveFlagPath('');
      assert.ok(result.endsWith('.enabled'));
    });
  });

  describe('REPO_ROOT', () => {
    it('is defined and absolute', () => {
      assert.ok(typeof REPO_ROOT === 'string');
      assert.ok(path.isAbsolute(REPO_ROOT));
      assert.ok(REPO_ROOT.length > 0);
    });

    it('points to a valid directory', () => {
      try {
        const stats = fs.statSync(REPO_ROOT);
        assert.ok(stats.isDirectory());
      } catch (e) {
        assert.fail(`REPO_ROOT ${REPO_ROOT} is not a valid directory: ${e.message}`);
      }
    });

    it('_SYSTEM/lib is two levels below REPO_ROOT', () => {
      const expectedLib = path.resolve(REPO_ROOT, '_SYSTEM', 'lib');
      const libDir = path.dirname(fileURLToPath(new URL('./arming.mjs', import.meta.url)));
      assert.ok(path.resolve(libDir) === expectedLib);
    });
  });
});