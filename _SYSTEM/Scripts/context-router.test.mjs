#!/usr/bin/env node

import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

function route(query) {
  return JSON.parse(execFileSync(
    process.execPath,
    ['_SYSTEM/Scripts/context-router.mjs', query],
    { cwd: repoRoot, encoding: 'utf8' },
  ));
}

for (const query of [
  'humanize this supplied cover letter',
  'de-slop this paragraph without changing citations',
  'voice-match this prose to my sample',
  'polish this supplied paragraph',
  'polish cover letter copy',
]) {
  const result = route(query);
  assert.equal(result.selectedPacket?.id, 'skills', `explicit prose edit must select skills context: ${query}`);
  assert(result.selectedPacket.paths.some((entry) => entry.path === 'skills/humanizer/SKILL.md' && entry.exists), 'canonical Humanizer path missing');
}

assert.notEqual(route('answer a basic factual question').selectedPacket?.id, 'skills', 'ordinary answers must not route through Humanizer context');
assert.notEqual(route('summarize this paragraph').selectedPacket?.id, 'mathematics', 'graph must not match inside paragraph');
assert.notEqual(route('polish this code').selectedPacket?.id, 'skills', 'non-prose polishing must not route through Humanizer context');
assert.notEqual(route('polish this metal').selectedPacket?.id, 'skills', 'physical polishing must not route through Humanizer context');

process.stdout.write('context-router: pass\n');
