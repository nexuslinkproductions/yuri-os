import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const SPEC = path.join(REPO, '_SYSTEM/docs/work-dashboard.openapi.yaml');

test('work-dashboard OpenAPI 3.1 spec structure', () => {
  const raw = fs.readFileSync(SPEC, 'utf8');
  assert.match(raw, /^openapi:\s*3\.1\.0/m);
  assert.match(raw, /\/api\/processes:/);
  assert.match(raw, /\/api\/overview:/);
  assert.match(raw, /127\.0\.0\.1:4270/);
  assert.match(raw, /ProcessesResponse/);
});
