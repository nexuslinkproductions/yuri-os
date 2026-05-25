#!/usr/bin/env node
import {
  closeSync,
  copyFileSync,
  existsSync,
  fsyncSync,
  mkdirSync,
  openSync,
  readdirSync,
  rmdirSync,
  statSync,
  unlinkSync,
} from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const REPO_ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../..');
const EOT_DIR = path.join(REPO_ROOT, '_SYSTEM', 'state', 'eot');
const ARCHIVE_DIR = path.join(EOT_DIR, '_archive');
const TTL_DAYS = Number(process.env.EOT_ARCHIVE_TTL_DAYS) || 30;
const DAY_MS = 24 * 60 * 60 * 1000;

const args = new Set(process.argv.slice(2));
const JSON_OUTPUT = args.has('--json');
const EXECUTE = args.has('--execute');
const DRY_RUN = !EXECUTE || args.has('--dry-run');
const HELP = args.has('--help');

function formatDate(date) {
  return date.toISOString().slice(0, 10);
}

function formatMonth(date) {
  return date.toISOString().slice(0, 7);
}

function daysAgo(mtimeMs) {
  return Math.max(0, Math.floor((Date.now() - mtimeMs) / DAY_MS));
}

function warn(message) {
  process.stderr.write(`[eot-archive] WARN: ${message}\n`);
}

function ensureDir(dir) {
  mkdirSync(dir, { recursive: true });
}

function fsyncPath(filePath) {
  const fd = openSync(filePath, 'r');
  try {
    fsyncSync(fd);
  } finally {
    closeSync(fd);
  }
}

function isCandidateDir(name) {
  return /^\d{4}-\d{2}-\d{2}_\d{4}$/.test(name);
}

function shouldSkipDir(name) {
  return name === '_archive' || name === 'continuous';
}

function walkCounts(dirPath) {
  const counts = { dirs: 1, files: 0 };
  for (const entry of readdirSync(dirPath, { withFileTypes: true })) {
    const entryPath = path.join(dirPath, entry.name);
    if (entry.isDirectory()) {
      const child = walkCounts(entryPath);
      counts.dirs += child.dirs;
      counts.files += child.files;
    } else if (entry.isFile()) {
      counts.files += 1;
    }
  }
  return counts;
}

function copyTree(srcDir, destDir) {
  ensureDir(destDir);

  for (const entry of readdirSync(srcDir, { withFileTypes: true })) {
    const srcPath = path.join(srcDir, entry.name);
    const destPath = path.join(destDir, entry.name);
    if (entry.isDirectory()) {
      copyTree(srcPath, destPath);
      continue;
    }
    if (entry.isFile()) {
      ensureDir(path.dirname(destPath));
      copyFileSync(srcPath, destPath);
      fsyncPath(destPath);
    }
  }
}

function removeTree(dirPath) {
  for (const entry of readdirSync(dirPath, { withFileTypes: true })) {
    const entryPath = path.join(dirPath, entry.name);
    if (entry.isDirectory()) {
      removeTree(entryPath);
    } else {
      unlinkSync(entryPath);
    }
  }
  rmdirSync(dirPath);
}

function classifyDir(dirname) {
  const src = path.join(EOT_DIR, dirname);
  const stat = statSync(src);
  const mtime = stat.mtime;
  const oldEnough = Date.now() - stat.mtimeMs > TTL_DAYS * DAY_MS;
  const month = formatMonth(mtime);

  return {
    dirname,
    path: src,
    dest: path.join(ARCHIVE_DIR, month, dirname),
    mtime: formatDate(mtime),
    ageDays: daysAgo(stat.mtimeMs),
    candidate: oldEnough,
  };
}

function listCandidateDirs() {
  if (!existsSync(EOT_DIR)) return [];
  return readdirSync(EOT_DIR, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && isCandidateDir(entry.name) && !shouldSkipDir(entry.name))
    .map((entry) => entry.name)
    .sort();
}

function collectPlan() {
  const dirs = [];
  const errors = [];

  for (const dirname of listCandidateDirs()) {
    try {
      dirs.push(classifyDir(dirname));
    } catch (error) {
      warn(`${dirname}: ${error.message}`);
      errors.push({ dirname, error: error.message });
    }
  }

  return { dirs, errors };
}

function executePlan(dirs) {
  let archived = 0;
  const errors = [];

  for (const dir of dirs.filter((entry) => entry.candidate)) {
    try {
      const srcCounts = walkCounts(dir.path);
      ensureDir(path.dirname(dir.dest));
      copyTree(dir.path, dir.dest);
      const destCounts = walkCounts(dir.dest);

      if (srcCounts.dirs !== destCounts.dirs || srcCounts.files !== destCounts.files) {
        throw new Error(
          `count mismatch src(dirs=${srcCounts.dirs}, files=${srcCounts.files}) dest(dirs=${destCounts.dirs}, files=${destCounts.files})`,
        );
      }

      removeTree(dir.path);
      archived += 1;
    } catch (error) {
      warn(`${dir.dirname}: ${error.message}`);
      errors.push({ dirname: dir.dirname, error: error.message });
    }
  }

  return { archived, errors };
}

function textLine(dir) {
  const status = dir.candidate
    ? `${DRY_RUN ? '[DRY] would-archive' : '[EXEC] archived'}:`
    : `${DRY_RUN ? '[DRY]' : '[EXEC]'} keep:`;
  return `${status} ${dir.dirname} (mtime ${dir.mtime}, ${dir.ageDays} days ago)`;
}

function printText(dirs, archived) {
  if (dirs.length === 0) return;

  const candidates = dirs.filter((dir) => dir.candidate).length;
  process.stdout.write(`SCAN _SYSTEM/state/eot/ — ${candidates} candidate(s)\n`);
  for (const dir of dirs) {
    process.stdout.write(`${textLine(dir)}\n`);
  }
  const mode = DRY_RUN ? 'dry-run' : 'execute';
  process.stdout.write(`SUMMARY: ${candidates} candidate(s), ${archived} archived (${mode})\n`);
}

function printJson(dirs, archived, errors) {
  if (dirs.length === 0) return;

  const candidates = dirs.filter((dir) => dir.candidate).length;
  process.stdout.write(
    `${JSON.stringify(
      {
        eotDir: '_SYSTEM/state/eot/',
        ttlDays: TTL_DAYS,
        dryRun: DRY_RUN,
        candidates,
        archived,
        dirs,
        errors,
      },
      null,
      2,
    )}\n`,
  );
}

function printHelp() {
  process.stdout.write(
    `Usage: node _SYSTEM/Scripts/eot-archive.mjs [--dry-run|--execute] [--json] [--help]\n\n` +
      `Scan _SYSTEM/state/eot/ subdirectories and archive old sessions into _SYSTEM/state/eot/_archive/YYYY-MM/.\n\n` +
      `Options:\n` +
      `  --dry-run   Print what would be archived (default)\n` +
      `  --execute   Perform the archival move\n` +
      `  --json      Emit structured JSON output\n` +
      `  --help      Show this message\n`,
  );
}

function main() {
  if (HELP) {
    printHelp();
    return 0;
  }

  const { dirs, errors: scanErrors } = collectPlan();
  if (dirs.length === 0 && scanErrors.length === 0) return 0;

  const execution = DRY_RUN ? { archived: 0, errors: [] } : executePlan(dirs);
  const errors = [...scanErrors, ...execution.errors];

  if (JSON_OUTPUT) printJson(dirs, execution.archived, errors);
  else printText(dirs, execution.archived);

  return 0;
}

process.exit(main());
