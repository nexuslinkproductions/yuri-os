#!/usr/bin/env node

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const serverPath = path.join(process.cwd(), 'backend/src/server.ts');
const serverSource = fs.readFileSync(serverPath, 'utf8');

assert.equal(
  /Math\.random\s*\(/.test(serverSource),
  false,
  'backend/src/server.ts must not synthesize live operational telemetry with Math.random()'
);

process.stdout.write('backend-telemetry-truth: pass\n');
