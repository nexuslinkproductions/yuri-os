#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..');
const SCANNER_PATH = path.join(REPO_ROOT, 'Scripts', 'corpus-security-scan.mjs');
const DEFAULT_DEST_ROOT = path.join(REPO_ROOT, '.claude', 'skills');
const DEFAULT_RECORD_FILE = path.join(REPO_ROOT, '_SYSTEM', 'corpus-output', 'absorbed-skills.jsonl');

function usage() {
  return 'Usage: node _SYSTEM/Scripts/corpus-absorb.mjs <skill-dir-path> [--force] [--dry-run]';
}

function parseArgs(argv) {
  const args = {
    skillPath: '',
    force: false,
    dryRun: false,
    help: false,
  };

  for (const arg of argv) {
    if (arg === '--force') args.force = true;
    else if (arg === '--dry-run') args.dryRun = true;
    else if (arg === '--help' || arg === '-h') args.help = true;
    else if (!args.skillPath) args.skillPath = arg;
    else throw new Error(`Unexpected argument: ${arg}`);
  }

  return args;
}

function main() {
  let args;
  try {
    args = parseArgs(process.argv.slice(2));
  } catch (error) {
    console.error(`[corpus-absorb] ${error.message}`);
    console.error(usage());
    process.exit(1);
  }

  if (args.help) {
    console.log(usage());
    return;
  }

  if (!args.skillPath) {
    console.error('[corpus-absorb] missing skill directory path');
    console.error(usage());
    process.exit(1);
  }

  try {
    const plan = absorbSkill(args.skillPath, {
      force: args.force,
      dryRun: args.dryRun,
    });

    if (plan.status !== 0) {
      console.log(plan.message);
      process.exit(1);
    }

    if (plan.message) {
      console.log(plan.message);
    }
  } catch (error) {
    console.error(`[corpus-absorb] failed: ${error.message}`);
    process.exit(1);
  }
}

function absorbSkill(inputPath, options) {
  const resolvedInput = path.resolve(inputPath);
  if (!fs.existsSync(resolvedInput)) {
    throw new Error(`skill path not found: ${resolvedInput}`);
  }

  const stat = fs.statSync(resolvedInput);
  const skillDir = stat.isDirectory() ? resolvedInput : path.dirname(resolvedInput);
  const skillMarkdownPath = stat.isFile() ? resolvedInput : path.join(skillDir, 'SKILL.md');

  if (!fs.existsSync(skillMarkdownPath) || !fs.statSync(skillMarkdownPath).isFile()) {
    throw new Error(`SKILL.md not found in: ${skillDir}`);
  }

  const scan = runScanner(skillDir);
  const sourcePath = path.resolve(skillDir);
  const skillName = normalizeSkillName(scan.name, skillDir);
  const destRoot = path.resolve(process.env.CORPUS_ABSORB_DEST_ROOT || DEFAULT_DEST_ROOT);
  const recordFile = path.resolve(process.env.CORPUS_ABSORB_RECORD_FILE || DEFAULT_RECORD_FILE);
  const destDir = path.join(destRoot, skillName);
  const destFile = path.join(destDir, 'SKILL.md');

  if (scan.verdict === 'FAIL') {
    return {
      status: 1,
      message: `[corpus-absorb] REJECTED [${skillName}]: score=${scan.score}`,
    };
  }

  if (scan.verdict === 'WARN' && !options.force) {
    return {
      status: 1,
      message: `[corpus-absorb] WARN [${skillName}]: score=${scan.score}`,
    };
  }

  if (options.dryRun) {
    return {
      status: 0,
      message: `[corpus-absorb] DRY-RUN [${skillName}]: score=${scan.score}`,
    };
  }

  const header = `# ABSORBED FROM: ${sourcePath} | scanned: ${new Date().toISOString().slice(0, 10)} | score: ${scan.score}`;
  const original = fs.readFileSync(skillMarkdownPath, 'utf8').replace(/^\uFEFF/, '');
  const absorbed = `${header}\n\n${original.replace(/^\n+/, '')}`;

  fs.mkdirSync(destDir, { recursive: true });
  fs.writeFileSync(destFile, absorbed);
  appendRecord(recordFile, {
    name: skillName,
    source_path: sourcePath,
    dest_path: path.resolve(destFile),
    score: scan.score,
    verdict: scan.verdict,
    absorbed_at: new Date().toISOString(),
  });

  return {
    status: 0,
    message: `[corpus-absorb] ABSORBED: ${skillName} → .claude/skills/${skillName}/`,
  };
}

function runScanner(skillDir) {
  const stdout = execFileSync(process.execPath, [SCANNER_PATH, skillDir, '--json'], {
    cwd: REPO_ROOT,
    encoding: 'utf8',
    maxBuffer: 1024 * 1024,
  });
  return JSON.parse(stdout);
}

function appendRecord(recordFile, record) {
  fs.mkdirSync(path.dirname(recordFile), { recursive: true });
  fs.appendFileSync(recordFile, `${JSON.stringify(record)}\n`);
}

function normalizeSkillName(name, fallbackPath) {
  const fallback = path.basename(path.resolve(fallbackPath));
  const candidate = String(name ?? '').trim();
  if (!candidate) return fallback;
  const sanitized = path.basename(candidate);
  if (!sanitized || sanitized === '.' || sanitized === '..') return fallback;
  return sanitized;
}

main();
