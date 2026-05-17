import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const policy = JSON.parse(fs.readFileSync('_SYSTEM/Scripts/policy/yuri-guarded-executor.readonly.json', 'utf8'));
const tempPolicy = { ...policy, repo_root: process.cwd() };
const tempFile = '/tmp/debug-policy.json';
fs.writeFileSync(tempFile, JSON.stringify(tempPolicy, null, 2));

console.log('CWD:', process.cwd());
console.log('Policy repo_root (original):', policy.repo_root);
console.log('Temp policy repo_root:', tempPolicy.repo_root);
console.log('DNA exists:', fs.existsSync(path.join(process.cwd(), '.claude/rules/nudimmud_operating_dna.md')));

try {
  const out = execFileSync(process.execPath, [
    '_SYSTEM/Scripts/yuri-guarded-executor.mjs',
    '--selftest',
    '--artifact-root', '/tmp/debug-run-' + Date.now()
  ], { encoding: 'utf8' });
  console.log('STDOUT:', out);
} catch(e) {
  console.log('STDOUT from error:', e.stdout);
  console.log('Exit:', e.status);
}
