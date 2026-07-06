#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { PROTECTED_SURFACE_PREFIXES } from './lane-kernel.mjs';

const root = process.cwd();
const args = new Set(process.argv.slice(2));

const protectedPrefixes = [...PROTECTED_SURFACE_PREFIXES];

const binaryExt = new Set([
  '.png', '.jpg', '.jpeg', '.gif', '.webp', '.ico', '.pdf', '.zip', '.gz', '.tgz',
  '.woff', '.woff2', '.ttf', '.otf', '.mp4', '.mov', '.sqlite', '.db', '.wasm',
]);

const secretPatterns = [
  ['openai_or_generic_sk', /\bsk-[A-Za-z0-9_-]{32,}\b/g],
  ['anthropic', /\bsk-ant-[A-Za-z0-9_-]{20,}\b/g],
  ['nvidia', /\bnvapi-[A-Za-z0-9_-]{20,}\b/g],
  ['browser_use', /\bbu_[A-Za-z0-9_-]{20,}\b/g],
  ['github_pat', /\bgithub_pat_[A-Za-z0-9_]{20,}\b/g],
  ['github_ghp', /\bghp_[A-Za-z0-9_]{20,}\b/g],
  ['google_ai', /\bAIza[0-9A-Za-z_-]{20,}\b/g],
  ['aws_access_key', /\bAKIA[0-9A-Z]{16}\b/g],
  [
    'secret_assignment',
    /\b([A-Za-z_][A-Za-z0-9_-]*(?:api[_-]?key|access[_-]?token|auth[_-]?token|bearer[_-]?token|client[_-]?secret|private[_-]?key|webhook[_-]?secret|secret|password)[A-Za-z0-9_-]*)\s*[:=]\s*['"]?([^'"\s,;`\\]{20,})/gi,
  ],
];

const benignValue = /(example|dummy|fake|test|placeholder|redacted|xxxx|your_|changeme|change-me|local-only|not-a-real|sample|api-key-here|pipeline-key|random-secret-here|generate-your-secret-here|generate-a-strong-secret-here)/i;
const codeReferenceValue = /^\(?(process\.env|this\.|document\.|row\.|opts?\.|config\.|headers?\.|read[A-Z]|get[A-Z])/;
const filesystemReferenceValue = /^(?:\/|\.\.?\/|[A-Za-z]:[\\/])/;
const expressionReferenceValue = /^(?:\$|\$\{|op:\/\/|!!|bool\(|Boolean\(|self\.|settings\.|localStorage\.|bpy\.|[A-Za-z_][A-Za-z0-9_.]*\()/;
const symbolReferenceValue = /^[A-Z][A-Z0-9_]+$/;

function isProtected(rel) {
  return protectedPrefixes.some((prefix) => rel === prefix || rel.startsWith(prefix));
}

// Safe, non-secret env templates that SHOULD ship (they carry only placeholders).
// A real `.env` / `.env.local` / `.env.production` still counts as protected.
function isSafeEnvTemplate(rel) {
  const base = (rel.split('/').pop() || rel).toLowerCase();
  return base === '.env.example' || base === '.env.sample' || base === '.env.template';
}

function hasNodeModulesSegment(rel) {
  return rel.split(path.sep).includes('node_modules') || rel.split('/').includes('node_modules');
}

function mask(value) {
  if (!value || value.length < 10) return '<masked>';
  return `${value.slice(0, 4)}...${value.slice(-4)} (${value.length})`;
}

function listedFiles() {
  const raw = execFileSync('git', ['ls-files', '-z', '--cached', '--others', '--exclude-standard'], {
    encoding: 'utf8',
    maxBuffer: 128 * 1024 * 1024,
  });
  return raw.split('\0').filter(Boolean);
}

function scanText({ text, rel, source, object }) {
  const localFindings = [];
  const lines = text.split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (benignValue.test(line)) continue;
    for (const [type, pattern] of secretPatterns) {
      pattern.lastIndex = 0;
      let match;
      while ((match = pattern.exec(line))) {
        const value = type === 'secret_assignment' ? match[2] : match[0];
        if (
          benignValue.test(value) ||
          codeReferenceValue.test(value) ||
          filesystemReferenceValue.test(value) ||
          expressionReferenceValue.test(value) ||
          symbolReferenceValue.test(value)
        ) continue;
        localFindings.push({
          file: rel,
          line: i + 1,
          type,
          value: mask(value),
          ...(source ? { source } : {}),
          ...(object ? { object } : {}),
        });
      }
    }
  }
  return localFindings;
}

function trackedProtectedFiles() {
  const raw = execFileSync('git', ['ls-files', '-z'], {
    encoding: 'utf8',
    maxBuffer: 128 * 1024 * 1024,
  });
  return raw.split('\0').filter(Boolean).filter((rel) => (isProtected(rel) || hasNodeModulesSegment(rel)) && !isSafeEnvTemplate(rel));
}

const allFiles = listedFiles();
const trackedProtected = trackedProtectedFiles();
const scanFiles = allFiles
  .filter((rel) => !isProtected(rel))
  .filter((rel) => !hasNodeModulesSegment(rel))
  .filter((rel) => !binaryExt.has(path.extname(rel).toLowerCase()));

const findings = [];
let skippedLargeFiles = 0;

for (const rel of scanFiles) {
  const abs = path.join(root, rel);
  let stat;
  try {
    stat = fs.statSync(abs);
  } catch {
    continue;
  }
  if (!stat.isFile()) continue;
  if (stat.size > 1_500_000) {
    skippedLargeFiles++;
    continue;
  }

  let text;
  try {
    text = fs.readFileSync(abs, 'utf8');
  } catch {
    continue;
  }

  findings.push(...scanText({ text, rel }));
}

function scanHistory() {
  const result = {
    pickaxe_patterns: 0,
    scanned_patch_lines: 0,
    skipped_protected_matches: 0,
    findings: [],
  };
  const seen = new Set();
  const pickaxePatterns = [
    'sk-',
    'sk-ant-',
    'nvapi-',
    'bu_',
    'github_pat_',
    'ghp_',
    'AIza',
    'AKIA',
  ];
  const pathspec = [
    '.',
    ':(exclude)backend/data/**',
    ':(exclude).claude/state/**',
    ':(exclude).claude/history/**',
    ':(exclude).claude/projects/**',
    ':(exclude).claude/file-history/**',
    ':(exclude).claude/lane-sessions/**',
    ':(exclude).claude/paste-cache/**',
    ':(exclude).claude/.credentials.json',
    ':(exclude).claude/credentials.json',
    ':(exclude).env',
    ':(exclude)node_modules/**',
    ':(exclude).amp/**',
    ':(exclude)_SYSTEM/tools/browser-harness/**',
    ':(exclude)_SYSTEM/tools/nemo-guardrails/**',
    ':(exclude)_SYSTEM/tools/MSA/**',
  ];

  for (const pickaxePattern of pickaxePatterns) {
    result.pickaxe_patterns++;
    let raw = '';
    try {
      raw = execFileSync('git', [
        'log',
        '--all',
        '--patch',
        '--no-color',
        '--no-ext-diff',
        '--unified=0',
        '-G',
        pickaxePattern,
        '--',
        ...pathspec,
      ], {
        encoding: 'utf8',
        maxBuffer: 128 * 1024 * 1024,
        stdio: ['ignore', 'pipe', 'ignore'],
      });
    } catch {
      continue;
    }
    let commit = '';
    let rel = '';
    for (const line of raw.split(/\r?\n/).filter(Boolean)) {
      if (line.startsWith('commit ')) {
        commit = line.slice('commit '.length).trim();
        continue;
      }
      if (line.startsWith('diff --git ')) {
        const match = line.match(/^diff --git a\/(.+?) b\/(.+)$/);
        rel = (match?.[2] || match?.[1] || '').replaceAll('\\', '/');
        continue;
      }
      if (line.startsWith('+++ b/')) {
        rel = line.slice('+++ b/'.length).replaceAll('\\', '/');
        continue;
      }
      if (!rel || line.startsWith('+++ ') || line.startsWith('--- ') || line.startsWith('@@')) continue;
      if (!line.startsWith('+') && !line.startsWith('-')) continue;
      if (isProtected(rel) || hasNodeModulesSegment(rel)) {
        result.skipped_protected_matches++;
        continue;
      }
      const text = line.slice(1);
      result.scanned_patch_lines++;
      const key = `${commit}:${rel}:${text}`;
      if (seen.has(key)) continue;
      seen.add(key);
      const patchFindings = scanText({
        text,
        rel,
        source: 'git_history',
        object: commit.slice(0, 12),
      }).filter((finding) => finding.type !== 'secret_assignment');
      result.findings.push(...patchFindings);
    }
  }

  return result;
}

const history = args.has('--history') ? scanHistory() : null;

const result = {
  scanned_files: scanFiles.length,
  skipped_large_files: skippedLargeFiles,
  tracked_protected_files: trackedProtected.length,
  tracked_protected_sample: trackedProtected.slice(0, 20),
  findings,
  ...(history ? { history } : {}),
  ok: findings.length === 0 && trackedProtected.length === 0 && (!history || history.findings.length === 0),
};

console.log(JSON.stringify(result, null, 2));
process.exit(result.ok ? 0 : 1);
