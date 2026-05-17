import fs from 'node:fs';
import path from 'node:path';

// Run selftest and read the verification artifact from the first run
const artifactRoot = '/tmp/yt-hardstop-' + Date.now();
fs.mkdirSync(artifactRoot, { recursive: true });

import { execFileSync } from 'node:child_process';
try {
  execFileSync(process.execPath, [
    '_SYSTEM/Scripts/yuri-guarded-executor.mjs', '--selftest', '--artifact-root', artifactRoot
  ], { encoding: 'utf8' });
} catch(e) {}

// Find all verification.json files
const dirs = fs.readdirSync(artifactRoot);
for (const d of dirs) {
  const vFile = path.join(artifactRoot, d, 'verification.json');
  if (fs.existsSync(vFile)) {
    const v = JSON.parse(fs.readFileSync(vFile, 'utf8'));
    if (v.hard_stop) {
      console.log('HARD_STOP in', d);
      console.log('Reasons:', v.hard_stop_reasons);
      console.log('Preflight:', JSON.stringify(v.preflight, null, 2));
    }
  }
}
