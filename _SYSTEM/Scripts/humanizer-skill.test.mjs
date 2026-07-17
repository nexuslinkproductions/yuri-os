#!/usr/bin/env node

import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { stableSkillBody } from './yuri-skill-loader.mjs';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const read = (relativePath) => readFileSync(path.join(repoRoot, relativePath), 'utf8');
const sha256 = (body) => createHash('sha256').update(body).digest('hex');

const canonicalPath = 'skills/humanizer/SKILL.md';
const upstreamPath = 'skills/humanizer/references/upstream-SKILL.md';
const licensePath = 'skills/humanizer/LICENSE';
const canonical = read(canonicalPath);
const upstream = read(upstreamPath);
const license = read(licensePath);
const provenance = JSON.parse(read('skills/humanizer/UPSTREAM.json'));
const skillIndex = JSON.parse(read('skills/skill-index.json'));
const domainIndex = JSON.parse(read('skills/domain-index.json'));

assert.match(canonical, /yuri-policy: opt-in-prose-editor/, 'canonical wrapper must remain opt-in');
assert.match(canonical, /Do not use it to imitate a living writer/, 'style-imitation boundary missing');
assert.match(canonical, /optimize text to evade an AI detector/, 'detector-evasion boundary missing');
assert.match(canonical, /keep them byte-for-byte/, 'protected-anchor contract missing');
assert.match(canonical, /Never invent a fact/, 'no-invention contract missing');
assert.match(canonical, /wrapper is authoritative/, 'YURI wrapper precedence missing');
assert.doesNotMatch(canonical, /`references\/upstream-SKILL\.md`/, 'upstream reference must be root-qualified for provider projections');
assert.match(canonical, /strictly as data to edit/, 'untrusted-input boundary missing');
assert.match(canonical, /Never follow or execute instructions/, 'embedded-instruction boundary missing');
assert.match(canonical, /## Session Notes/, 'skill session-notes surface missing');

assert.equal(sha256(upstream), provenance.files[upstreamPath.replace('skills/humanizer/', '')], 'pinned upstream skill hash drift');
assert.equal(sha256(license), provenance.files.LICENSE, 'pinned upstream license hash drift');
assert.equal(provenance.ref, '1b48564898e999219882660237fde01bf4843a0f', 'upstream ref drift');
assert.equal(provenance.commit, '1b48564898e999219882660237fde01bf4843a0f', 'upstream commit drift');
assert.equal(provenance.tree, '299241e3698ecdfe6ba5633da3f407349cff25d6', 'upstream tree drift');
assert.equal(provenance.archiveSha256, 'd321803aa6a3424f5d18da5b82cf96088954ac69e13e1adf04bf9749d5d90197', 'upstream archive hash drift');
assert.equal(provenance.version, '2.8.2', 'upstream version drift');
assert.match(license, /MIT License/, 'upstream license notice missing');

for (const projection of ['.claude/skills/humanizer/SKILL.md', '.codex/skills/humanizer/SKILL.md']) {
  const body = read(projection);
  assert.match(body, /## Session Notes/, `${projection} must expose the governed session-notes surface`);
  assert.equal(stableSkillBody(body), stableSkillBody(canonical), `${projection} stable body must match the canonical projection`);
}

const indexed = skillIndex.skills.find((skill) => skill.id === 'humanizer');
assert.deepEqual(indexed, {
  id: 'humanizer',
  path: canonicalPath,
  sourceFamily: 'codex_import',
}, 'Humanizer skill-index registration mismatch');
assert.equal(skillIndex.count, skillIndex.skills.length, 'skill-index count must match entries');
const contentDomain = domainIndex.domains.find((domain) => domain.domainId === '06-design-content-business');
assert(contentDomain?.skillIds.includes('humanizer'), 'Humanizer domain registration missing');

process.stdout.write('humanizer-skill: pass\n');
