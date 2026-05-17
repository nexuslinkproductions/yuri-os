#!/usr/bin/env node

import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';

const output = execFileSync(process.execPath, ['Scripts/yuri-persona-check.mjs'], {
  encoding: 'utf8',
}).trim();

assert.equal(output, 'YURI_PERSONA_CHECK_PASS');
process.stdout.write('yuri-persona-check: pass\n');
