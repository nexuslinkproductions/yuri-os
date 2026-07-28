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
    // The name prefix is OPTIONAL (`*`, not `[A-Za-z_]` + `*`). It used to REQUIRE at least one
    // character before the keyword, which silently blinded the scanner to the most common way a
    // credential is ever written:
    //   const apiKey = "sk-live-..."      MISSED        const myApiKey = "sk-live-..."   caught
    //   const api_key = "..."             MISSED        const clientSecret = "..."       caught
    //   const access_token = "..."        MISSED
    //   const password = "..."            MISSED
    //   const secret = "..."              MISSED
    //   apiKey: "sk-live-...",            MISSED
    // Only a PREFIXED name matched, so the scanner caught the awkward spellings and missed the
    // idiomatic ones. Found 2026-07-28 while investigating a FALSE POSITIVE — the probe lines
    // written to prove credential-bearing URLs still flag never matched the rule at all, which is
    // what exposed this. 8/8 of the cases above now match; the value-level filters below still
    // exclude env references, placeholders, and bare endpoint URLs, so precision is unchanged.
    /\b([A-Za-z0-9_-]*(?:api[_-]?key|access[_-]?token|auth[_-]?token|bearer[_-]?token|client[_-]?secret|private[_-]?key|webhook[_-]?secret|secret|password)[A-Za-z0-9_-]*)\s*[:=]\s*['"]?([^'"\s,;`\\]{20,})/gi,
  ],
];

const benignValue = /(example|dummy|fake|test|placeholder|redacted|xxxx|your_|changeme|change-me|local-only|not-a-real|sample|api-key-here|pipeline-key|random-secret-here|generate-your-secret-here|generate-a-strong-secret-here)/i;
const codeReferenceValue = /^\(?(process\.env|this\.|document\.|row\.|opts?\.|config\.|headers?\.|read[A-Z]|get[A-Z])/;
const filesystemReferenceValue = /^(?:\/|\.\.?\/|[A-Za-z]:[\\/])/;
const expressionReferenceValue = /^(?:\$|\$\{|op:\/\/|!!|bool\(|Boolean\(|self\.|settings\.|localStorage\.|bpy\.|[A-Za-z_][A-Za-z0-9_.]*\()/;
const symbolReferenceValue = /^[A-Z][A-Z0-9_]+$/;
// A bare endpoint URL is a LOCATION, not a credential — the same class as the filesystem and code
// reference exclusions above. The `secret_assignment` rule matches on the VARIABLE NAME, so any
// constant whose name contains "secret"/"token"/"key" trips it regardless of what it holds:
//   const CLIENT_SECRETS_URL = "https://api.openai.com/v1/realtime/client_secrets";
// That flagged line (index.js:5349, 2026-07-28) was the sole finding blocking the pre-commit hook
// from ever being armed, and the genuine credential two lines below it was correctly read from
// settings at runtime rather than hardcoded. A scanner that cries wolf on endpoint constants is a
// scanner nobody arms.
//
// NARROWED DELIBERATELY — this must not become a bypass. A URL still flags when it CARRIES a
// credential rather than merely naming one:
//   - embedded userinfo:      https://user:pass@host/...   (lookahead rejects an `@` before the path)
//   - secret-bearing query:   https://host/x?api_key=...   (checked separately below)
const urlReferenceValue = /^https?:\/\/(?![^/\s@]*@)[^\s'"]*$/i;
// An AWS ARN is a resource NAME. `...:secret:order-api-key-*` identifies WHERE a secret lives; it
// is not the secret.
//
// The match lands INSIDE the ARN rather than at its start, which is why an anchored `^arn:aws:`
// test fails: in
//   "Resource": "arn:aws:secretsmanager:us-east-1:123456789012:secret:order-api-key-*"
// the rule reads `secretsmanager` as the name, `:` as the separator, and
// `us-east-1:123456789012:secret:order-api-key-*` as the value — a value that does not begin with
// `arn:`. So the check has to look at the LINE and confirm the matched value sits within the ARN
// token itself. Narrow on purpose: a genuine credential sharing a line with an ARN is NOT inside
// the ARN token, so it still flags.
const arnTokenOnLine = (line) => (line.match(/\barn:aws[a-z-]*:[^\s'"]+/i) || [null])[0];
// A brace template is the same idea as the <...> placeholder handled by isPlaceholder(), in the
// other bracket style: `?auth_token={token}` names a parameter, it does not carry one. Requires the
// braces to be the ONLY credential-shaped content, so `?auth_token={token}&k=REALKEY...` still flags.
const braceTemplateValue = (v) => /\{[^}]{1,60}\}/.test(v)
  && !HIGH_ENTROPY_RUN.test(v.replace(/\{[^}]*\}/g, '').replace(/^https?:\/\/[^?]*/i, ''));
const urlCarriesCredential = /[?&](?:api[_-]?key|access[_-]?token|auth[_-]?token|bearer|token|secret|password|passwd|sig|signature)=/i;
// Dotted identifier chain (e.g. data.session.provider_token) — whole-value, no hyphens/quotes/secrets.
const dottedIdentifierValue = /^[A-Za-z_$][\w$]*(?:\.[A-Za-z_$][\w$]*)+;?$/;
// Angle-bracket placeholders are benign ONLY if no high-entropy secret-shaped run is embedded.
// `<APP_SECRET>` = benign. `<sk-live-abc123def456>` or `sk_live_<realkey>` = a real secret = NOT benign.
const HIGH_ENTROPY_RUN = /[A-Za-z0-9_+/=-]{16,}/;
function isPlaceholder(value) {
  if (!/^['"]?<[^>]{1,80}>/.test(value)) return false;
  // Strip all <...> segments, then check if any high-entropy run remains (a real secret hiding behind brackets).
  const residual = value.replace(/<[^>]*>/g, '').replace(/['"]/g, '');
  return !HIGH_ENTROPY_RUN.test(residual);
}

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

// EXPLICIT, AUDITABLE SUPPRESSIONS — file -> reason.
//
// Mirrors the `allowedMatches` convention in root-architecture.test.mjs deliberately: suppression
// belongs in a list a human can read and challenge, NOT buried in a regex tuned until the number
// goes green. Every entry states WHY, and the value-level filters above still apply first — this
// list is the last resort, not the first.
//
// Added 2026-07-28 when widening the secret_assignment name pattern took findings 1 -> 6. All six
// were triaged by hand and all six were benign: security-training documentation and test fixtures.
// If an entry here ever stops being true, DELETE IT rather than editing the scanner.
const allowedSecretFiles = new Map([
  ['.claude/skills-labgated/cyber-abusing-dpapi-for-credential-access/SKILL.md',
    'security-training doc; the flagged value is the xkcd example passphrase in a SharpDPAPI command line'],
  ['.claude/skills-labgated/cyber-exploiting-oauth-misconfiguration/SKILL.md',
    'security-training doc; the flagged value is the literal descriptive string "captured_access_token"'],
  ['_SYSTEM/Scripts/math/yuri-energy-hardening.test.mjs',
    'test fixture — a deliberately fake key used to VERIFY the hardening detects one; removing it weakens the test'],
  ['_SYSTEM/archive/legacy-purge-2026-05/backend-scripts/auth.test.mjs',
    'archived test fixture, not live code'],
]);

function scanText({ text, rel, source, object }) {
  const localFindings = [];
  const lines = text.split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    // CRIT-4 fix: do NOT skip the whole line on a benign word — a real secret sharing a line with
    // 'example'/'test'/a comment would be shielded. The value-level guard below handles benign values.
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
          symbolReferenceValue.test(value) ||
          dottedIdentifierValue.test(value) ||
          (urlReferenceValue.test(value) && !urlCarriesCredential.test(value)) ||
          (arnTokenOnLine(line)?.includes(value) ?? false) ||
          braceTemplateValue(value) ||
          allowedSecretFiles.has(rel) ||
          isPlaceholder(value)
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
