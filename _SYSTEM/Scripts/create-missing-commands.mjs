#!/usr/bin/env node
// @capability: skill-command-gen
// @serves: generate a /command alias for a skill | scaffold command file | audit dangling commands | missing command alias | skill CLI route
// @does: derives /command files ONLY from real, live skill frontmatter (never a hardcoded dict); audits dangling commands + missing aliases
// @use: when a real skill needs a CLI /alias, or to audit .claude/commands for routes pointing at deleted skills — replaces the old hardcoded resurrect-retired-skills footgun
// @exports: scanSkills, parseFrontmatter, auditCommands, planCommand, renderCommand, runWrite
//
// SAFETY (why this replaced the old hardcoded version, 2026-06-16):
//   The previous create-missing-commands.mjs carried a HARDCODED skill dict that
//   still listed retired skills (ai-pipeline-offloading, deepseek-offload,
//   openclaw-offload, swarm-coordination) and ignored CLI flags — so it RESURRECTED
//   retired skills even on `--help`. This version:
//     1. derives every name from live skill DIRECTORIES (retired skills are absent
//        from the scan, so they are structurally un-resurrectable);
//     2. writes ONLY for explicitly named skills (no bulk write-all);
//     3. pulls name+description from REAL frontmatter, never a literal;
//     4. is flag-aware: --help / default audit write NOTHING.

import { readdirSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '../..');
const SKILL_ROOTS = ['skills', '.claude/skills'];
const CMD_DIR = '.claude/commands';

// --- frontmatter (standard: --- fence MUST open at byte 0) -------------------
export function parseFrontmatter(raw) {
  raw = raw.replace(/^﻿/, '');
  const m = raw.match(/^---\s*\n([\s\S]*?)\n---\s*(?:\n|$)/);
  if (!m) return null;
  const block = m[1];
  const grab = (k) => {
    const mm = block.match(new RegExp('^' + k + ':\\s*(.+)$', 'm'));
    if (!mm) return null;
    return mm[1].trim().replace(/^["'>|]\s*/, '').replace(/["']$/, '');
  };
  return { name: grab('name'), description: grab('description') };
}

// --- scan: live skills only, keyed by directory name ------------------------
export function scanSkills(root = REPO_ROOT) {
  const skills = new Map(); // dirName -> { dir, roots:[], fm }
  for (const sr of SKILL_ROOTS) {
    const abs = path.join(root, sr);
    if (!existsSync(abs)) continue;
    for (const e of readdirSync(abs, { withFileTypes: true })) {
      if (!e.isDirectory()) continue;
      const skp = path.join(abs, e.name, 'SKILL.md');
      if (!existsSync(skp)) continue;
      const fm = parseFrontmatter(readFileSync(skp, 'utf8')) || {};
      const prev = skills.get(e.name);
      // prefer a frontmatter that actually has a description
      if (!prev || (!prev.fm.description && fm.description)) {
        skills.set(e.name, { dir: e.name, roots: [...(prev?.roots || []), sr], fm });
      } else {
        prev.roots.push(sr);
      }
    }
  }
  return skills;
}

// --- resolve which skill a command file invokes -----------------------------
function commandTarget(raw) {
  const fm = raw.match(/^skill:\s*([a-z0-9-]+)\s*$/m);
  if (fm) return fm[1];
  const prose = raw.match(/Invoke the [`'"]?([a-z0-9-]+)[`'"]? (?:skill|closeout)/i);
  return prose ? prose[1] : null;
}

// --- audit: dangling commands + skills missing an alias ---------------------
export function auditCommands(root = REPO_ROOT) {
  const skills = scanSkills(root);
  const cmdAbs = path.join(root, CMD_DIR);
  const cmdFiles = existsSync(cmdAbs)
    ? readdirSync(cmdAbs).filter((f) => f.endsWith('.md'))
    : [];
  const dangling = [];
  const cmdNames = new Set();
  for (const f of cmdFiles) {
    cmdNames.add(f.replace(/\.md$/, ''));
    const raw = readFileSync(path.join(cmdAbs, f), 'utf8');
    const target = commandTarget(raw);
    // a command is dangling only if it names a target skill that no longer exists
    if (target && !skills.has(target)) dangling.push({ command: f, invokes: target });
  }
  const missingAlias = [...skills.keys()].filter((s) => !cmdNames.has(s)).sort();
  return { skillCount: skills.size, commandCount: cmdFiles.length, dangling, missingAlias };
}

// --- render a command file from REAL frontmatter ----------------------------
export function renderCommand(skill) {
  const name = skill.fm.name || skill.dir;
  let desc = (skill.fm.description || '').replace(/\s+/g, ' ').trim();
  if (desc.length > 280) desc = desc.slice(0, 277).replace(/\s+\S*$/, '') + '…';
  return (
    `Invoke the \`${skill.dir}\` skill via the Skill tool.\n\n` +
    `Canonical command: /${skill.dir}\n\n` +
    (desc ? `${desc}\n` : `${name}\n`)
  );
}

// --- plan a single write (retirement-proof: unknown name -> refused) --------
export function planCommand(name, { force = false, root = REPO_ROOT } = {}) {
  const skills = scanSkills(root);
  if (!skills.has(name)) {
    return { name, action: 'refuse', reason: 'no live skill by that name (retired/typo) — refusing to resurrect' };
  }
  const dest = path.join(root, CMD_DIR, name + '.md');
  if (existsSync(dest) && !force) return { name, action: 'skip', reason: 'command already exists (use --force)' };
  return { name, action: 'write', dest, content: renderCommand(skills.get(name)) };
}

export function runWrite(names, opts = {}) {
  const results = names.map((n) => planCommand(n, opts));
  if (!opts.dryRun) {
    for (const r of results) if (r.action === 'write') writeFileSync(r.dest, r.content);
  }
  return results;
}

// --- CLI --------------------------------------------------------------------
function isMain() {
  return process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
}

if (isMain()) {
  const argv = process.argv.slice(2);
  const help = argv.includes('--help') || argv.includes('-h');
  const force = argv.includes('--force');
  const dryRun = argv.includes('--dry-run');
  const writeIdx = argv.indexOf('--write');

  if (help) {
    process.stdout.write(
      [
        'skill-command-gen — derive /command aliases from REAL skills (no hardcoded dict)',
        '',
        'Usage:',
        '  create-missing-commands.mjs                 # audit: dangling commands + missing aliases (writes nothing)',
        '  create-missing-commands.mjs --write <name…> # scaffold command(s) for named LIVE skill(s)',
        '  create-missing-commands.mjs --write <name> --dry-run   # preview, write nothing',
        '  create-missing-commands.mjs --write <name> --force     # overwrite existing command',
        '',
        'Retired/unknown skill names are refused — they cannot be resurrected.',
      ].join('\n') + '\n'
    );
    process.exit(0);
  }

  if (writeIdx === -1) {
    const a = auditCommands();
    process.stdout.write(`skills=${a.skillCount} commands=${a.commandCount}\n`);
    process.stdout.write(`\nDANGLING commands (invoke a deleted skill): ${a.dangling.length}\n`);
    for (const d of a.dangling) process.stdout.write(`  ${d.command} -> ${d.invokes} (MISSING)\n`);
    process.stdout.write(`\nLIVE skills with no /command alias: ${a.missingAlias.length}\n`);
    process.stdout.write('  ' + a.missingAlias.join(', ') + '\n');
    process.stdout.write('\n(audit only — pass --write <name…> to scaffold a specific alias)\n');
    process.exit(0);
  }

  const names = argv.slice(writeIdx + 1).filter((x) => !x.startsWith('-'));
  if (!names.length) {
    process.stderr.write('ERROR: --write requires at least one skill name\n');
    process.exit(1);
  }
  const results = runWrite(names, { force, dryRun });
  let wrote = 0;
  for (const r of results) {
    if (r.action === 'write') { process.stdout.write(`${dryRun ? 'WOULD-WRITE' : 'WROTE'}: ${r.name}.md\n`); wrote++; }
    else process.stdout.write(`${r.action.toUpperCase()}: ${r.name} (${r.reason})\n`);
  }
  process.stdout.write(`\nDone: ${wrote} ${dryRun ? 'planned' : 'written'}, ${results.length - wrote} skipped/refused\n`);
}
