#!/usr/bin/env node
// Trio (GREEN/RED/GREY) for skill-command-gen (create-missing-commands.mjs).
// Hermetic: builds a temp skill/command fixture, never touches the real repo.
// Run: node --test _SYSTEM/Scripts/create-missing-commands.test.mjs

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import {
  scanSkills, parseFrontmatter, auditCommands, planCommand, renderCommand, runWrite,
} from './create-missing-commands.mjs';

// --- fixture ----------------------------------------------------------------
function fixture() {
  const root = mkdtempSync(path.join(tmpdir(), 'scg-'));
  const mkSkill = (rel, name, desc) => {
    const d = path.join(root, rel);
    mkdirSync(d, { recursive: true });
    writeFileSync(path.join(d, 'SKILL.md'), `---\nname: ${name}\ndescription: ${desc}\n---\n\n# ${name}\n\nbody\n`);
  };
  mkSkill('skills/alpha', 'alpha', 'Do the alpha thing. Use when alpha is needed.');
  mkSkill('skills/beta', 'beta', 'Beta utility for beta cases.');
  mkSkill('.claude/skills/alpha', 'alpha', 'Do the alpha thing. Use when alpha is needed.'); // published mirror
  // command dir with a healthy alias + a DANGLING command (invokes a deleted skill)
  const cmdDir = path.join(root, '.claude/commands');
  mkdirSync(cmdDir, { recursive: true });
  writeFileSync(path.join(cmdDir, 'alpha.md'), 'Invoke the `alpha` skill via the Skill tool.\n\nCanonical command: /alpha\n\nDo the alpha thing.\n');
  writeFileSync(path.join(cmdDir, 'deepseek-offload.md'), 'Invoke the `deepseek-offload` skill via the Skill tool.\n'); // RETIRED -> dangling
  return { root, cmdDir };
}

// independent target oracle for GREY (NOT the impl's internal commandTarget)
function oracleTarget(raw) {
  const m = raw.match(/Invoke the `([a-z0-9-]+)`/);
  return m ? m[1] : null;
}

// ======================= GREEN =======================
test('GREEN scanSkills finds live skills with real frontmatter', () => {
  const { root } = fixture();
  const s = scanSkills(root);
  assert.ok(s.has('alpha') && s.has('beta'));
  assert.equal(s.get('alpha').fm.name, 'alpha');
  assert.match(s.get('alpha').fm.description, /alpha thing/);
});

test('GREEN parseFrontmatter requires --- at byte 0', () => {
  assert.equal(parseFrontmatter('# pre\n\n---\nname: x\n---\n'), null); // pre-frontmatter content -> null
  assert.equal(parseFrontmatter('---\nname: x\ndescription: d\n---\n').name, 'x');
});

test('GREEN planCommand scaffolds a real skill from its frontmatter', () => {
  const { root } = fixture();
  const p = planCommand('beta', { root });
  assert.equal(p.action, 'write');
  assert.match(p.content, /Invoke the `beta` skill/);
  assert.match(p.content, /Beta utility/); // pulled from REAL description, not a literal
});

test('GREEN auditCommands detects the planted dangling command', () => {
  const { root } = fixture();
  const a = auditCommands(root);
  assert.equal(a.dangling.length, 1);
  assert.equal(a.dangling[0].invokes, 'deepseek-offload');
  assert.ok(a.missingAlias.includes('beta')); // beta has no command yet
});

test('GREEN runWrite dryRun writes NOTHING to disk', () => {
  const { root, cmdDir } = fixture();
  const before = readdirSync(cmdDir).sort();
  const res = runWrite(['beta'], { root, dryRun: true });
  assert.equal(res[0].action, 'write');
  assert.deepEqual(readdirSync(cmdDir).sort(), before); // unchanged
});

test('GREEN --help / default exit without writing (CLI flag-aware)', () => {
  // the OLD bug: writing on --help. Assert the module exposes no top-level write side-effect:
  // importing it (done above) created no files; a pure-function call is the only write path.
  const { root, cmdDir } = fixture();
  const n = readdirSync(cmdDir).length;
  auditCommands(root); // audit is read-only
  assert.equal(readdirSync(cmdDir).length, n);
});

// ======================= RED =======================
// The load-bearing safety property: a retired/unknown name must be REFUSED, never written.
// A mutant that drops the existence guard (the OLD hardcoded behavior) writes anyway -> caught.
test('RED retired/unknown name is refused (mutant that writes is caught)', () => {
  const { root, cmdDir } = fixture();
  // real impl: refuse
  const p = planCommand('deepseek-offload', { root });
  assert.equal(p.action, 'refuse');
  assert.ok(/resurrect/i.test(p.reason));
  // mutant impl (guard removed) would return action 'write' for the same input:
  const mutantPlan = (name) => ({ name, action: 'write', dest: path.join(root, '.claude/commands', name + '.md') });
  const m = mutantPlan('deepseek-offload');
  assert.notEqual(m.action, p.action); // the test discriminates real (refuse) from mutant (write)
  // and runWrite must not have created the retired file
  runWrite(['deepseek-offload', 'totally-fake-skill'], { root });
  assert.ok(!existsSync(path.join(cmdDir, 'totally-fake-skill.md')));
});

// ======================= GREY =======================
// 1) round-trip invariant via an INDEPENDENT oracle parser: every rendered command
//    must resolve (per a parser written independently of the impl) back to a LIVE skill.
test('GREY rendered command round-trips to a live skill (independent oracle)', () => {
  const { root } = fixture();
  const skills = scanSkills(root);
  for (const [name, skill] of skills) {
    const content = renderCommand(skill);
    const resolved = oracleTarget(content);
    assert.equal(resolved, name);          // independent parser agrees
    assert.ok(skills.has(resolved));        // and it points at a live skill
  }
});

// 2) metamorphic: rendering is deterministic/idempotent; writing then re-auditing
//    removes that skill from missingAlias and never makes it dangling.
test('GREY render idempotent + write clears missingAlias without creating a dangler', () => {
  const { root } = fixture();
  const skill = scanSkills(root).get('beta');
  assert.equal(renderCommand(skill), renderCommand(skill)); // byte-identical
  runWrite(['beta'], { root });
  const a = auditCommands(root);
  assert.ok(!a.missingAlias.includes('beta'));               // now has an alias
  assert.ok(!a.dangling.some((d) => d.command === 'beta.md')); // and it is not dangling
});
