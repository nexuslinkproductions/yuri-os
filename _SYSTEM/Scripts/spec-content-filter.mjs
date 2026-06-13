#!/usr/bin/env node
// _SYSTEM/Scripts/spec-content-filter.mjs — PATCH 016
// Scan a spec markdown file for secret/credential patterns; replace with [REDACTED:<name>].
// Atomic write (tmp + rename). Exits 0 always (advisory). Stderr-only summary.

'use strict';

import { readFileSync } from 'node:fs';
import { atomicWriteFile } from './_lib/fs.mjs';
import path from 'node:path';

const PATTERNS = [
  { name: 'env-path',           regex: /\.env(\.local|\.production|\.development)?(?![a-zA-Z0-9_\-/])/g },
  { name: 'private-key-block',  regex: /-----BEGIN (RSA |EC |OPENSSH |DSA )?PRIVATE KEY-----[\s\S]*?-----END (RSA |EC |OPENSSH |DSA )?PRIVATE KEY-----/g },
  { name: 'bearer-token',       regex: /Bearer\s+[A-Za-z0-9_\-\.]{20,}/gi },
  { name: 'password-assignment',regex: /(?:^|[\s'"`])password\s*[=:]\s*['"]?[^\s'"`,;]{4,}['"]?/gi },
  { name: 'api-key-assignment', regex: /(?:^|[\s'"`])api[_-]?key\s*[=:]\s*['"]?[^\s'"`,;]{8,}['"]?/gi },
  { name: 'secret-assignment',  regex: /(?:^|[\s'"`])secret\s*[=:]\s*['"]?[^\s'"`,;]{8,}['"]?/gi },
  { name: 'aws-access-key',     regex: /AKIA[0-9A-Z]{16}/g },
  { name: 'github-pat',         regex: /ghp_[A-Za-z0-9]{36}/g },
  { name: 'github-fine-pat',    regex: /github_pat_[A-Za-z0-9_]{82}/g },
  { name: 'openai-key',         regex: /sk-[A-Za-z0-9]{20,}/g },
];

function usage() {
  console.error('Usage: node _SYSTEM/Scripts/spec-content-filter.mjs <spec-file>');
  console.error('       Scans spec markdown for secrets, redacts in-place if found.');
  console.error('       Exits 0 always (advisory). Summary to stderr.');
  process.exit(0);
}

const args = process.argv.slice(2);
if (args.length === 0 || args[0] === '--help' || args[0] === '-h') usage();

const specPath = path.resolve(args[0]);

let content;
try {
  content = readFileSync(specPath, 'utf8');
} catch (err) {
  console.error(`spec-content-filter: cannot read ${specPath}: ${err.message}`);
  process.exit(0);
}

const redactions = [];
let modified = content;

for (const { name, regex } of PATTERNS) {
  modified = modified.replace(regex, (match) => {
    redactions.push({ pattern: name, original_length: match.length });
    return `[REDACTED:${name}]`;
  });
}

if (redactions.length === 0) {
  // Silent on no-match
  process.exit(0);
}

// Atomic write
try {
  atomicWriteFile(specPath, modified, { mkdir: false });
} catch (err) {
  console.error(`spec-content-filter: write failed for ${specPath}: ${err.message}`);
  process.exit(0);
}

// Stderr summary
console.error(`spec-content-filter: ${redactions.length} redaction(s) in ${specPath}`);
const counts = redactions.reduce((acc, r) => {
  acc[r.pattern] = (acc[r.pattern] || 0) + 1;
  return acc;
}, {});
for (const [name, count] of Object.entries(counts).sort((a, b) => b[1] - a[1])) {
  console.error(`  - ${name}: ${count}`);
}
process.exit(0);
