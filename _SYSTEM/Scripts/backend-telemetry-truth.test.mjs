#!/usr/bin/env node

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const serverPath = path.join(REPO_ROOT, '_SYSTEM/backend/src/server.ts');
const serverSource = fs.readFileSync(serverPath, 'utf8');

assert.equal(
  /Math\.random\s*\(/.test(serverSource),
  false,
  '_SYSTEM/backend/src/server.ts must not synthesize live operational telemetry with Math.random()'
);

process.stdout.write('backend-telemetry-truth: pass\n');
