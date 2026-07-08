#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { pathToFileURL } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '../..') // Scripts/ → _SYSTEM/ → repo root;
const CORPUS_ROOT = path.join(REPO_ROOT, 'RESEARCH', 'ORACLE-CORPUS', 'openclaw-skills', 'skills');
const OUTPUT_DIR = path.join(REPO_ROOT, '_SYSTEM', 'corpus-output');
const OUTPUT_FILE = path.join(OUTPUT_DIR, 'skills-index.jsonl');
const BODY_EXCERPT_LENGTH = 200;
const PROGRESS_EVERY = 1000;

function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

function stripBom(text) {
  return text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
}

function normalizeWhitespace(value) {
  return String(value ?? '').replace(/\s+/g, ' ').trim();
}

function countLeadingSpaces(line) {
  const match = line.match(/^ */);
  return match ? match[0].length : 0;
}

function parseScalar(value) {
  const trimmed = String(value ?? '').trim();
  if (!trimmed || trimmed === 'null' || trimmed === '~') return '';
  const quoted =
    (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"));
  if (!quoted) return trimmed;
  return trimmed.slice(1, -1);
}

function parseInlineArray(value) {
  const trimmed = String(value ?? '').trim();
  if (!trimmed.startsWith('[') || !trimmed.endsWith(']')) return [];
  const inner = trimmed.slice(1, -1).trim();
  if (!inner) return [];
  return inner
    .split(',')
    .map((item) => normalizeWhitespace(parseScalar(item)))
    .filter(Boolean);
}

function splitFrontmatter(text) {
  const normalized = stripBom(text);
  if (!/^---\r?\n/.test(normalized)) {
    return { frontmatter: '', body: normalized };
  }

  const lines = normalized.split(/\r?\n/);
  if (lines[0].trim() !== '---') {
    return { frontmatter: '', body: normalized };
  }

  let closingIndex = -1;
  for (let index = 1; index < lines.length; index += 1) {
    if (lines[index].trim() === '---') {
      closingIndex = index;
      break;
    }
  }

  if (closingIndex === -1) {
    return { frontmatter: '', body: normalized };
  }

  return {
    frontmatter: lines.slice(1, closingIndex).join('\n'),
    body: lines.slice(closingIndex + 1).join('\n'),
  };
}

function readIndentedBlock(lines, startIndex, parentIndent) {
  const collected = [];
  let minIndent = Number.POSITIVE_INFINITY;
  let index = startIndex;

  while (index < lines.length) {
    const line = lines[index];
    if (!line.trim()) {
      collected.push('');
      index += 1;
      continue;
    }

    const indent = countLeadingSpaces(line);
    if (indent <= parentIndent) break;

    minIndent = Math.min(minIndent, indent);
    collected.push(line);
    index += 1;
  }

  const dedented = collected.map((line) => {
    if (!line) return '';
    const indent = countLeadingSpaces(line);
    const sliceIndex = Math.min(indent, Number.isFinite(minIndent) ? minIndent : indent);
    return line.slice(sliceIndex);
  });

  return {
    value: dedented.join('\n'),
    nextIndex: index - 1,
  };
}

function readTriggersBlock(lines, startIndex, parentIndent) {
  const items = [];
  let index = startIndex;

  while (index < lines.length) {
    const line = lines[index];
    if (!line.trim()) {
      index += 1;
      continue;
    }

    const indent = countLeadingSpaces(line);
    if (indent <= parentIndent) break;

    const match = line.match(/^\s*-\s*(.*)$/);
    if (!match) break;

    items.push(normalizeWhitespace(parseScalar(match[1])));
    index += 1;
  }

  return {
    items,
    nextIndex: index - 1,
  };
}

function parseFrontmatter(frontmatter) {
  const result = {
    name: '',
    description: '',
    triggers: [],
  };

  if (!frontmatter) return result;

  const lines = frontmatter.split(/\r?\n/);

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    if (!line.trim()) continue;

    const match = line.match(/^([A-Za-z0-9_-]+):(?:\s*(.*))?$/);
    if (!match) continue;

    const key = match[1];
    const rawValue = match[2] ?? '';
    const indent = countLeadingSpaces(line);
    const trimmed = rawValue.trim();

    if (key === 'name') {
      result.name = normalizeWhitespace(parseScalar(rawValue));
      continue;
    }

    if (key === 'description') {
      if (!trimmed || trimmed.startsWith('|') || trimmed.startsWith('>')) {
        const block = readIndentedBlock(lines, index + 1, indent);
        result.description = normalizeWhitespace(block.value);
        index = block.nextIndex;
      } else {
        result.description = normalizeWhitespace(parseScalar(rawValue));
      }
      continue;
    }

    if (key === 'triggers') {
      if (trimmed.startsWith('[') && trimmed.endsWith(']')) {
        result.triggers = parseInlineArray(trimmed);
      } else {
        const block = readTriggersBlock(lines, index + 1, indent);
        result.triggers = block.items;
        index = block.nextIndex;
      }
    }
  }

  return result;
}

function collectSkillFiles(rootDir) {
  const stack = [rootDir];
  const files = [];

  while (stack.length > 0) {
    const dir = stack.pop();
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    entries.sort((a, b) => a.name.localeCompare(b.name));

    for (let index = entries.length - 1; index >= 0; index -= 1) {
      const entry = entries[index];
      const entryPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        stack.push(entryPath);
        continue;
      }

      if (entry.isFile() && entry.name === 'SKILL.md') {
        files.push(entryPath);
      }
    }
  }

  files.sort((left, right) => left.localeCompare(right));
  return files;
}

function getContributor(filePath) {
  const relative = path.relative(CORPUS_ROOT, filePath);
  const parts = relative.split(path.sep).filter(Boolean);
  return parts[0] || path.basename(path.dirname(filePath));
}

function parseSkillFile(filePath) {
  const raw = fs.readFileSync(filePath, 'utf8');
  const { frontmatter, body } = splitFrontmatter(raw);
  const parsed = parseFrontmatter(frontmatter);
  const bodyExcerpt = body.replace(/^\r?\n+/, '').slice(0, BODY_EXCERPT_LENGTH);

  return {
    path: path.relative(REPO_ROOT, filePath),
    name: parsed.name,
    description: parsed.description,
    triggers: parsed.triggers,
    body_excerpt: bodyExcerpt,
    contributor: getContributor(filePath),
  };
}

function main() {
  ensureDir(OUTPUT_DIR);
  fs.writeFileSync(OUTPUT_FILE, '');

  const files = collectSkillFiles(CORPUS_ROOT);
  let total = 0;
  let skipped = 0;
  let written = 0;
  let buffer = [];

  for (const filePath of files) {
    total += 1;
    const skill = parseSkillFile(filePath);

    if (!skill.name && !skill.description) {
      skipped += 1;
    } else {
      buffer.push(JSON.stringify(skill));
      written += 1;
    }

    if (buffer.length >= PROGRESS_EVERY) {
      fs.appendFileSync(OUTPUT_FILE, `${buffer.join('\n')}\n`);
      buffer = [];
    }

    if (total % PROGRESS_EVERY === 0) {
      console.error(`[corpus-mine] processed ${total}/${files.length} | written=${written} | skipped=${skipped}`);
    }
  }

  if (buffer.length > 0) {
    fs.appendFileSync(OUTPUT_FILE, `${buffer.join('\n')}\n`);
  }

  console.log(JSON.stringify({ total, skipped, written }));
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
