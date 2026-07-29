#!/usr/bin/env node
// NEXUS backend spine, module 5 — verification toolkit. Zero npm deps.
//
//   node backend/verify.mjs <path>   trufflehog-style secret sweep + sha256
//                                    file manifest; writes nexus-verify-report.json
//                                    and nexus-verify-manifest.json into the scanned
//                                    directory. Exit 1 on any finding.
//   node backend/verify.mjs --audit [audit.jsonl]
//                                    re-verify the policy audit hash chain.
//                                    Exit 1 if the chain is broken.

import { createHash } from 'node:crypto';
import { readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { verifyAuditFile } from './policy.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..', '..', '..');
const DEFAULT_AUDIT = path.join(ROOT, '_SYSTEM', 'state', 'nexus', 'audit.jsonl');

const sha256 = (buf) => createHash('sha256').update(buf).digest('hex');

// ── secret patterns (trufflehog-style) ─────────────────────────────────────
const PATTERNS = [
  { id: 'aws-access-key', re: /\b(?:AKIA|ASIA)[0-9A-Z]{16}\b/g },
  { id: 'github-token', re: /\bgh[op]_[A-Za-z0-9]{36,}\b/g },
  { id: 'anthropic-key', re: /\bsk-ant-[A-Za-z0-9_-]{20,}\b/g },
  { id: 'openai-key', re: /\bsk-[A-Za-z0-9_-]{20,}\b/g },
  { id: 'private-key-block', re: /-----BEGIN (?:RSA |EC |OPENSSH |DSA |PGP |ENCRYPTED )?PRIVATE KEY(?: BLOCK)?-----/g },
];

// generic high-entropy assignment: api_key = "...", token: '...', etc.
const ASSIGN_RE = /(?:api[_-]?key|api[_-]?secret|secret|token|password|passwd|credential|private[_-]?key)["'\s]*[:=]\s*["']([^"']{20,})["']/gi;
const ENTROPY_MIN = 4.0;

function shannon(s) {
  const freq = new Map();
  for (const ch of s) freq.set(ch, (freq.get(ch) || 0) + 1);
  let h = 0;
  for (const n of freq.values()) {
    const p = n / s.length;
    h -= p * Math.log2(p);
  }
  return h;
}

const SKIP_DIRS = new Set(['.git', 'node_modules', '.venv', 'venv', '__pycache__', '.idea', '.vscode']);
const SKIP_EXT = new Set([
  '.png', '.jpg', '.jpeg', '.gif', '.webp', '.ico', '.pdf', '.zip', '.gz', '.tar',
  '.mp4', '.mov', '.mp3', '.wav', '.db', '.sqlite', '.sqlite3', '.wal', '.shm',
  '.woff', '.woff2', '.ttf', '.otf', '.exe', '.dylib', '.so',
]);
const GENERATED = new Set(['nexus-verify-report.json', 'nexus-verify-manifest.json']);
const MAX_FILE = 1024 * 1024;

/** Walk a file or directory, yielding scannable text-file paths. */
export function* walkFiles(target) {
  const st = statSync(target);
  if (st.isFile()) {
    if (!GENERATED.has(path.basename(target)) && !SKIP_EXT.has(path.extname(target).toLowerCase()) && st.size <= MAX_FILE) yield target;
    return;
  }
  for (const name of readdirSync(target).sort()) {
    if (SKIP_DIRS.has(name)) continue;
    const p = path.join(target, name);
    const s = statSync(p);
    if (s.isDirectory()) yield* walkFiles(p);
    else if (s.isFile() && s.size <= MAX_FILE && !SKIP_EXT.has(path.extname(name).toLowerCase()) && !GENERATED.has(name)) yield p;
  }
}

const mask = (v) => (v.length <= 10 ? '***' : v.slice(0, 6) + '…' + v.slice(-4) + ` (${v.length} chars)`);

/**
 * Sweep a path for secrets and build a sha256 manifest of everything scanned.
 * Returns { findings, manifest } — findings carry file, line, pattern, masked match.
 */
export function sweepPath(target) {
  const findings = [];
  const manifest = {};
  const base = statSync(target).isDirectory() ? target : path.dirname(target);

  for (const file of walkFiles(target)) {
    const buf = readFileSync(file);
    const rel = path.relative(base, file);
    manifest[rel] = sha256(buf);
    if (buf.includes(0)) continue; // binary
    const text = buf.toString('utf8');
    const lines = text.split('\n');

    // track values already flagged per line so sk-ant-* is not double-reported as sk-*
    const seenOnLine = new Set();
    for (const { id, re } of PATTERNS) {
      re.lastIndex = 0;
      let m;
      while ((m = re.exec(text))) {
        const line = lines.slice(0, text.slice(0, m.index).split('\n').length).length;
        const key = line + ':' + m[0].slice(0, 12);
        if (seenOnLine.has(key)) continue;
        seenOnLine.add(key);
        findings.push({ file: rel, line, pattern: id, match: mask(m[0]) });
      }
    }

    ASSIGN_RE.lastIndex = 0;
    let m;
    while ((m = ASSIGN_RE.exec(text))) {
      const value = m[1];
      if (value.length < 20 || shannon(value) < ENTROPY_MIN) continue;
      const line = lines.slice(0, text.slice(0, m.index).split('\n').length).length;
      const key = line + ':' + value.slice(0, 12);
      if (seenOnLine.has(key)) continue;
      seenOnLine.add(key);
      findings.push({ file: rel, line, pattern: 'high-entropy-assignment', match: mask(value) });
    }
  }
  return { findings, manifest };
}

// ── CLI ────────────────────────────────────────────────────────────────────
function main(argv) {
  const args = argv.slice(2);
  if (args[0] === '--audit') {
    const auditPath = args[1] ? path.resolve(args[1]) : DEFAULT_AUDIT;
    const result = verifyAuditFile(auditPath);
    if (result.ok) {
      console.log(`audit chain OK — ${result.events} event(s) verified, head ${result.head || 'none'}`);
      console.log(`file: ${auditPath}`);
      return 0;
    }
    console.error(`audit chain BROKEN at event ${result.broken_at}: ${result.error}`);
    console.error(`file: ${auditPath}`);
    return 1;
  }

  const target = args[0];
  if (!target) {
    console.error('usage: node backend/verify.mjs <path> | node backend/verify.mjs --audit [audit.jsonl]');
    return 2;
  }
  const resolved = path.resolve(target);
  const { findings, manifest } = sweepPath(resolved);
  const outDir = statSync(resolved).isDirectory() ? resolved : path.dirname(resolved);

  const manifestPath = path.join(outDir, 'nexus-verify-manifest.json');
  writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + '\n', 'utf8');

  const report = {
    tool: 'nexus-verify',
    target: resolved,
    scanned_at: new Date().toISOString(),
    files_scanned: Object.keys(manifest).length,
    findings,
    manifest: manifestPath,
  };
  const reportPath = path.join(outDir, 'nexus-verify-report.json');
  writeFileSync(reportPath, JSON.stringify(report, null, 2) + '\n', 'utf8');

  console.log(`scanned ${report.files_scanned} file(s) under ${resolved}`);
  console.log(`manifest: ${manifestPath}`);
  console.log(`report:   ${reportPath}`);
  if (findings.length) {
    console.error(`\n${findings.length} FINDING(S):`);
    for (const f of findings) console.error(`  ${f.file}:${f.line}  ${f.pattern}  ${f.match}`);
    return 1;
  }
  console.log('no secrets found');
  return 0;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exit(main(process.argv));
}
