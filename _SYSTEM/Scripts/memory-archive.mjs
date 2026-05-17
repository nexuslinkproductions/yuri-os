#!/usr/bin/env node
import {
  closeSync,
  copyFileSync,
  existsSync,
  fsyncSync,
  mkdirSync,
  openSync,
  readFileSync,
  readdirSync,
  statSync,
  unlinkSync,
} from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const REPO_ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const MEMORY_DIR = path.join(REPO_ROOT, 'memory');
const ARCHIVE_DIR = path.join(MEMORY_DIR, '_archive');
const TTL_DAYS = Number(process.env.MEMORY_ARCHIVE_TTL_DAYS) || 90;
const DAY_MS = 24 * 60 * 60 * 1000;

const args = new Set(process.argv.slice(2));
const JSON_OUTPUT = args.has('--json');
const EXECUTE = args.has('--execute');
const DRY_RUN = !EXECUTE || args.has('--dry-run');

function formatDate(date) {
  return date.toISOString().slice(0, 10);
}

function formatMonth(date) {
  return date.toISOString().slice(0, 7);
}

function warn(message) {
  process.stderr.write(`[memory-archive] WARN: ${message}\n`);
}

function parseArchiveFlag(content) {
  if (!content.startsWith('---\n') && !content.startsWith('---\r\n')) {
    return { hasFrontmatter: false, archive: null };
  }

  const end = content.search(/\r?\n---\r?\n/);
  if (end === -1) {
    return { hasFrontmatter: false, archive: null };
  }

  const frontmatter = content.slice(content.indexOf('\n') + 1, end);
  const match = frontmatter.match(/^archive:\s*(true|false)\s*$/im);
  if (!match) {
    return { hasFrontmatter: true, archive: null };
  }

  return { hasFrontmatter: true, archive: match[1].toLowerCase() === 'true' };
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

function atomicMoveByCopy(src, dest) {
  ensureDir(path.dirname(dest));
  copyFileSync(src, dest);
  fsyncPath(dest);
  unlinkSync(src);
}

function classifyFile(filename) {
  const src = path.join(MEMORY_DIR, filename);
  const stat = statSync(src);
  const mtime = stat.mtime;
  const content = stat.isFile() ? readFileSync(src, 'utf8') : '';
  const frontmatter = parseArchiveFlag(content);
  const oldEnough = Date.now() - stat.mtimeMs > TTL_DAYS * DAY_MS;

  let candidate = false;
  let reason = 'recent';
  let archiveLabel = 'no frontmatter';

  if (frontmatter.hasFrontmatter) {
    if (frontmatter.archive === true) archiveLabel = 'true';
    else if (frontmatter.archive === false) archiveLabel = 'false explicit';
    else archiveLabel = 'not set';
  }

  if (frontmatter.archive === false) {
    reason = 'archive: false explicit';
  } else if (!oldEnough) {
    reason = 'recent';
  } else if (frontmatter.archive === true || !frontmatter.hasFrontmatter) {
    candidate = true;
    reason = frontmatter.hasFrontmatter ? 'archive: true' : 'no frontmatter';
  } else {
    reason = 'archive not set';
  }

  const month = formatMonth(mtime);
  return {
    filename,
    path: src,
    dest: path.join(ARCHIVE_DIR, month, filename),
    mtime: formatDate(mtime),
    archive: archiveLabel,
    candidate,
    reason,
  };
}

function listFeedbackFiles() {
  if (!existsSync(MEMORY_DIR)) return [];
  return readdirSync(MEMORY_DIR, { withFileTypes: true })
    .filter((entry) => entry.isFile() && /^feedback_.*\.md$/.test(entry.name))
    .map((entry) => entry.name)
    .sort();
}

function collectPlan() {
  const files = [];
  const errors = [];

  for (const filename of listFeedbackFiles()) {
    try {
      files.push(classifyFile(filename));
    } catch (error) {
      warn(`${filename}: ${error.message}`);
      errors.push({ filename, error: error.message });
    }
  }

  return { files, errors };
}

function executePlan(files) {
  let archived = 0;
  const errors = [];

  for (const file of files.filter((entry) => entry.candidate)) {
    try {
      atomicMoveByCopy(file.path, file.dest);
      archived += 1;
    } catch (error) {
      warn(`${file.filename}: ${error.message}`);
      errors.push({ filename: file.filename, error: error.message });
    }
  }

  return { archived, errors };
}

function textLine(file) {
  const action = file.candidate
    ? `${DRY_RUN ? '[DRY] would-archive' : '[EXEC] archived'}:`
    : `${DRY_RUN ? '[DRY]' : '[EXEC]'} keep:`;
  return `${action} ${file.filename} (mtime ${file.mtime}, ${file.candidate ? file.reason : file.archive})`;
}

function printText(files, archived) {
  const candidates = files.filter((file) => file.candidate).length;
  process.stdout.write(`SCAN memory/ - ${candidates} candidate(s)\n`);
  for (const file of files) {
    process.stdout.write(`${textLine(file)}\n`);
  }
  const mode = DRY_RUN ? 'dry-run' : 'execute';
  process.stdout.write(`SUMMARY: ${candidates} candidate(s), ${archived} archived (${mode})\n`);
}

function printJson(files, archived, errors) {
  const candidates = files.filter((file) => file.candidate).length;
  process.stdout.write(
    `${JSON.stringify(
      {
        memoryDir: 'memory/',
        ttlDays: TTL_DAYS,
        dryRun: DRY_RUN,
        candidates,
        archived,
        files,
        errors,
      },
      null,
      2,
    )}\n`,
  );
}

function main() {
  const { files, errors: scanErrors } = collectPlan();
  if (files.length === 0 && scanErrors.length === 0) return 0;

  const execution = DRY_RUN ? { archived: 0, errors: [] } : executePlan(files);
  const errors = [...scanErrors, ...execution.errors];

  if (JSON_OUTPUT) printJson(files, execution.archived, errors);
  else printText(files, execution.archived);

  return 0;
}

process.exit(main());
