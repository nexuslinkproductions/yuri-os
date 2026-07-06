#!/usr/bin/env node
// @capability: security-antipattern-scan
// @serves: security audit | wave-2 hardening | DO-NOT-USE enforcement | pre-commit gate
// @does: scans a target dir for the Wave-2 DO-NOT-USE security anti-patterns (the ones the verify pass killed) and reports file:line + the control to use instead. CI-usable (exit 1 on critical).
// @use: before every Wave-2 build slice, in pre-commit, and as the sentinel lane's first diagnostic. Pair with rls-audit + audit-chain-verify.
// @exports: scan, scanFile, PATTERNS
//
// Nexus Link security anti-pattern scanner.
// Greps for the anti-patterns documented in
//   02_RESOURCES/RESEARCH/nexus-security-code-reference-pack-2026-07-06.md → "DO NOT USE"
// Heuristic by design — flags candidates for human review. Each finding points at the
// canonical control that replaces it. Critical findings exit non-zero (CI gate).

import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

// Each pattern: { id, regex, severity, message, control }
// severity: "critical" (exit 1) | "warn" (review) | "info"
export const PATTERNS = [
  {
    id: "LOG_RAW_EXCEPTION",
    regex: /\b(log|logger|logging|console|self\.\w*log)\w*\.[a-z]+\s*\(\s*[fF]?["'`]?(?:[^)]*\{)?\s*str\s*\(\s*(e|err|exc|error|ex)\b/g,
    severity: "critical",
    message: "logs str(e) — driver exceptions embed failing SQL + bound values (token-leak path)",
    control: "L5d — route through the NexusSanitizeFilter denylist (root logger)",
  },
  {
    id: "BCRYPT_FOR_PASSWORDS",
    regex: /\bbcrypt\b/gi,
    severity: "warn",
    message: "bcrypt referenced — legacy-only (truncates at 72 bytes, no memory-hardness)",
    control: "L1b — Argon2id m=19456/t=2/p=1 via PyNaCl",
  },
  {
    id: "AES_GCM_RANDOM_NONCE",
    regex: /(?:aes[-_]?(?:256[-_]?)?gcm|AESGCM|crypto\.createCipheriv\(\s*['"]aes)/gi,
    severity: "warn",
    message: "AES-GCM referenced — random 96-bit nonce = catastrophic on reuse (leaks auth key + plaintext XORs)",
    control: "L1a — XChaCha20-Poly1305-IETF (192-bit nonce) via PyNaCl",
  },
  {
    id: "SMS_2FA",
    regex: /\b(sms|twilio)[-_\s]*?(2fa|mfa|otp|auth|factor|verify)/gi,
    severity: "critical",
    message: "SMS-based 2FA — SIM-swap risk",
    control: "L1 — TOTP (RFC 6238) or WebAuthn, never SMS",
  },
  {
    id: "PSYCOPG_CLIENT_MERGE",
    regex: /\b(mogrify|ClientCursor|sql\.SQL\s*\(\s*[^)]*\+|sql\.SQL\s*\(\s*f["'`])/g,
    severity: "critical",
    message: "psycopg client-side SQL merge — re-enables SQLi",
    control: "L5b — server-side binding Cursor + LiteralString constants",
  },
  {
    id: "WAF_GLOBAL_RULE_REMOVAL",
    regex: /SecRuleRemoveById\s+([0-9]+)/g,
    severity: "critical",
    message: "global WAF rule removal — re-opens the entire attack surface on every endpoint",
    control: "L4c — ctl:ruleRemoveTargetById=<id>;ARGS:<param> (parameter-scoped)",
  },
  {
    id: "FAST_HASH_PASSWORDS",
    regex: /(?:md5|sha1|sha256|sha512)\s*\(\s*[^)]*pass/gi,
    severity: "critical",
    message: "fast hash applied to a password — brute-forceable at billions/sec",
    control: "L1b — Argon2id (never fast hashes for password storage)",
  },
  {
    id: "PEPPER_IN_ENV",
    regex: /^(?:PEPPER|SECRET_KEY|JWT_SECRET|ENCRYPTION_KEY)\s*=/gm,
    severity: "warn",
    message: "secret/pepper assigned in what looks like an env/code constant — defeats the out-of-band requirement",
    control: "L1c — pepper/key fetched from KMS/Vault at runtime, never .env/repo",
  },
  {
    id: "SSL_VERIFY_DISABLED",
    regex: /verify\s*=\s*(False|false|FALSE)|sslmode\s*=\s*(?:disable|allow|prefer)|CERT_NONE|ssl\._create_unverified_context/g,
    severity: "critical",
    message: "TLS verification disabled — MITM-open",
    control: "L4f — sslmode=verify-full + cert pinning",
  },
  {
    id: "TRUST_PG_HBA",
    regex: /pg_hba.*trust|method\s*=\s*['"]trust['"]/gi,
    severity: "critical",
    message: "Postgres 'trust' auth — any local user connects as any role",
    control: "L4f — scram-sha-256 + cert",
  },
];

const SKIP_DIRS = new Set([
  "node_modules", ".git", "target", "dist", "build", "__pycache__", ".next",
  ".venv", "venv", "env", ".cache", ".idea", ".vscode", "coverage",
]);
const SCAN_EXT = new Set([
  ".py", ".mjs", ".js", ".ts", ".tsx", ".rs", ".sql", ".toml", ".yaml", ".yml",
  ".env", ".sh", ".conf", ".tf",
]);

function walk(dir, acc = []) {
  let ents;
  try { ents = readdirSync(dir); } catch { return acc; }
  for (const name of ents) {
    const p = join(dir, name);
    let st;
    try { st = statSync(p); } catch { continue; }
    if (st.isDirectory()) {
      if (!SKIP_DIRS.has(name) && !name.startsWith(".")) walk(p, acc);
    } else if (SCAN_EXT.has(name.slice(name.lastIndexOf("."))) || name === ".env" || name.startsWith(".env.")) {
      acc.push(p);
    }
  }
  return acc;
}

export function scanFile(filePath, root = process.cwd()) {
  let src;
  try { src = readFileSync(filePath, "utf8"); } catch { return []; }
  const rel = relative(root, filePath);
  const out = [];
  src.split("\n").forEach((line, i) => {
    for (const pat of PATTERNS) {
      pat.regex.lastIndex = 0;
      if (pat.regex.test(line)) {
        out.push({
          file: rel, line: i + 1,
          id: pat.id, severity: pat.severity,
          message: pat.message, control: pat.control,
          excerpt: line.trim().slice(0, 120),
        });
      }
    }
  });
  return out;
}

export function scan(target = process.cwd()) {
  const files = walk(target);
  const findings = files.flatMap((f) => scanFile(f, target));
  return {
    target,
    filesScanned: files.length,
    findings,
    critical: findings.filter((f) => f.severity === "critical"),
    warnings: findings.filter((f) => f.severity === "warn"),
  };
}

function main() {
  const target = process.argv[2] || process.cwd();
  const { filesScanned, findings, critical, warnings } = scan(target);
  const fmt = (f) => `  [${f.severity.toUpperCase().padEnd(8)}] ${f.file}:${f.line}  ${f.id}\n    ${f.message}\n    fix: ${f.control}\n    >  ${f.excerpt}`;
  console.log(`security-antipattern-scan · ${target} · ${filesScanned} files · ${findings.length} findings (${critical.length} critical, ${warnings.length} warn)\n`);
  if (critical.length) { console.log("CRITICAL:\n"); critical.forEach((f) => console.log(fmt(f))); }
  if (warnings.length) { console.log("\nWARN:\n"); warnings.forEach((f) => console.log(fmt(f))); }
  if (!findings.length) console.log("✓ no anti-patterns matched (heuristic — pair with rls-audit + audit-chain-verify)");
  process.exit(critical.length ? 1 : 0);
}

if (import.meta.url === `file://${process.argv[1]}`) main();
