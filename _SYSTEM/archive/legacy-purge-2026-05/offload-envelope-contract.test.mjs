#!/usr/bin/env node
// offload-envelope-contract.test.mjs
// Validates that every adapter emits an envelope conforming to the v1.0 schema.
// Usage: node _SYSTEM/Scripts/offload-envelope-contract.test.mjs

import { readFileSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));

// ── Load schema ───────────────────────────────────────────────────────────────
const schemaPath = path.join(scriptDir, 'offload-envelope.schema.json');
let schema;
try {
  schema = JSON.parse(readFileSync(schemaPath, 'utf8'));
} catch (err) {
  console.error(`FAIL: cannot parse schema: ${err.message}`);
  process.exit(1);
}

const requiredFields = schema.required || [];
const expectedVersion = schema.properties?.envelopeVersion?.const;

// ── Validation helper ────────────────────────────────────────────────────────
function validateEnvelope(label, obj) {
  if (obj === null || typeof obj !== 'object') {
    return `not a JSON object (got ${typeof obj})`;
  }

  for (const field of requiredFields) {
    if (!(field in obj)) {
      return `missing required field "${field}"`;
    }
  }

  if (obj.envelopeVersion !== expectedVersion) {
    return `envelopeVersion expected "${expectedVersion}", got "${obj.envelopeVersion}"`;
  }

  const validStatuses = schema.properties.status.enum;
  if (!validStatuses.includes(obj.status)) {
    return `invalid status "${obj.status}" (allowed: ${validStatuses.join(', ')})`;
  }

  return null; // OK
}

// ── Spawn helper ─────────────────────────────────────────────────────────────
function spawnAdapter(cmd, args, envOverride = {}) {
  return new Promise((resolve) => {
    const child = spawn(cmd, args, {
      cwd: scriptDir,
      env: { ...process.env, ...envOverride },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let stderr = '';
    child.stderr.setEncoding('utf8');
    child.stderr.on('data', (c) => { stderr += c; });
    child.on('close', (code) => {
      resolve({ exitCode: code, stderr: stderr.trim() });
    });
    child.on('error', (err) => {
      resolve({ exitCode: null, stderr: err.message });
    });
  });
}

// ── Main ─────────────────────────────────────────────────────────────────────
let failures = 0;

// ── Report ───────────────────────────────────────────────────────────────────
if (failures === 0) {
  console.log('\n✓ All contract tests PASSED.');
  process.exit(0);
} else {
  console.error(`\n✗ ${failures} contract test(s) FAILED.`);
  process.exit(1);
}
