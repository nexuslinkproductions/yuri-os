import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeHandle, currentUserHandle } from './yuri-user.mjs';

test('normalizeHandle lowercases and strips non-alnum', () => {
  assert.equal(normalizeHandle('Mike'), 'mike');
  assert.equal(normalizeHandle('  Marcel Spatz '), 'marcelspatz');
  assert.equal(normalizeHandle('J@ke!!'), 'jke');
});

test('normalizeHandle returns "" for junk input', () => {
  assert.equal(normalizeHandle(null), '');
  assert.equal(normalizeHandle(42), '');
  assert.equal(normalizeHandle('   '), '');
});

test('currentUserHandle prefers YURI_USER env, normalized', () => {
  const prev = process.env.YURI_USER;
  process.env.YURI_USER = 'Mike';
  try {
    assert.equal(currentUserHandle({ userConfigReader: () => null, operatorReader: () => null }), 'mike');
  } finally { if (prev === undefined) delete process.env.YURI_USER; else process.env.YURI_USER = prev; }
});

test('currentUserHandle reads the persisted handle VERBATIM (no re-normalize)', () => {
  const prev = process.env.YURI_USER; delete process.env.YURI_USER;
  try {
    // 'Mike-7' would normalize to 'mike7'; verbatim read must return it unchanged
    assert.equal(
      currentUserHandle({ userConfigReader: () => ({ handle: 'Mike-7' }), operatorReader: () => null }),
      'Mike-7',
    );
  } finally { if (prev !== undefined) process.env.YURI_USER = prev; }
});

test('currentUserHandle falls back to operator.json name, normalized', () => {
  const prev = process.env.YURI_USER; delete process.env.YURI_USER;
  try {
    assert.equal(
      currentUserHandle({ userConfigReader: () => null, operatorReader: () => ({ name: 'Marcel' }) }),
      'marcel',
    );
  } finally { if (prev !== undefined) process.env.YURI_USER = prev; }
});

test('currentUserHandle returns "" when nothing resolvable', () => {
  const prev = process.env.YURI_USER; delete process.env.YURI_USER;
  try {
    assert.equal(currentUserHandle({ userConfigReader: () => null, operatorReader: () => null }), '');
  } finally { if (prev !== undefined) process.env.YURI_USER = prev; }
});
