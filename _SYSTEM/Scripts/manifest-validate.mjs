#!/usr/bin/env node
// @capability: manifest-json-validate
// @serves: package.json corruption | invalid manifest | JSON parse gate | pre-commit json validity
// @does: fails closed if a critical Node manifest (package.json / package-lock.json) is not valid JSON
// @use: pre-commit, to catch a corrupt manifest before it lands on main
// @exports: (CLI only)
//
// Anchored to a real miss: PR #12 (b6001b03) landed a stray `PACKAGE_JSON` heredoc terminator on
// line 1 of package.json. Node then aborts with "Invalid package config" in any resolution path that
// reads the scope config — it broke xref-query in a clean worktree. It passed EVERY pre-commit check
// because none of them parse the manifest. This closes that gap: a manifest that Node cannot read
// must not be committable.
//
// Scope is deliberately narrow — only the two manifests that MUST always parse for the toolchain to
// resolve. It does not validate arbitrary *.json (test fixtures are legitimately allowed to be
// malformed). It validates the on-disk (worktree) copy, which is what a commit ships for these files.

import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

const root = process.cwd();
const MANIFESTS = ['package.json', 'package-lock.json'];

let failed = false;
for (const rel of MANIFESTS) {
  const abs = resolve(root, rel);
  if (!existsSync(abs)) continue; // absent is not this gate's concern
  let raw;
  try {
    raw = readFileSync(abs, 'utf8');
  } catch (e) {
    console.error(`[manifest-validate] cannot read ${rel}: ${e.message}`);
    failed = true;
    continue;
  }
  try {
    JSON.parse(raw);
  } catch (e) {
    failed = true;
    const firstLine = raw.split('\n', 1)[0];
    console.error(`[manifest-validate] REJECTED — ${rel} is not valid JSON: ${e.message}`);
    console.error(`    first line reads: ${JSON.stringify(firstLine)}`);
    console.error(`    A manifest Node cannot parse aborts resolution with "Invalid package config".`);
    console.error(`    Fix the JSON before committing (a stray heredoc terminator or trailing text`);
    console.error(`    above the opening brace is the usual cause).`);
  }
}

process.exit(failed ? 1 : 0);
