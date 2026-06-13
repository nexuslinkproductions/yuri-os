#!/usr/bin/env node
/**
 * cache-prefix-scan.mjs — WARN-ONLY detector for volatile tokens leaking into the cache-hot prefix.
 *
 * Adoption item `ccr-compression` companion (github-adoption-2026-06-13 mission, brief §ITEM 4).
 * Clean-room YURI-native re-imagining of the "CacheAligner / prefix-stability" idea. Pure node-builtin.
 *
 * WHY THIS MATTERS (the mechanism, not the label):
 *   LLM prompt-prefix KV-caching only hits when the prefix bytes are STABLE across calls. A single
 *   volatile token in the cacheable preamble — a fresh UUID, an ISO timestamp, a per-request JWT, a
 *   random hex hash — invalidates the whole downstream cache for that turn. CLAUDE.md's "Token Caching
 *   Shape" section says exactly this: "do not paste long lore, timestamps, random task IDs ... into the
 *   stable preamble." This detector makes that rule checkable: feed it the prefix, it FLAGS the volatile
 *   tokens with line/col + class, and emits a verdict. It is a CONSCIENCE, not a gate.
 *
 * HARD INVARIANT — NEVER MUTATES THE PREFIX. scanPrefix returns findings; it returns the input string
 *   BYTE-FOR-BYTE unchanged as `prefix`. There is no repair path. Diagnose, do not edit. (This is the
 *   same fail-safe posture as filing-assessor: it RECOMMENDS, it never moves/deletes.)
 *
 * VOLATILE CLASSES (deterministic regex, closed-set):
 *   - uuid        : RFC-4122 8-4-4-4-12 hex
 *   - iso-ts      : ISO-8601 datetime (date + T + time, optional ms/zone)
 *   - jwt         : three base64url segments dot-separated (header.payload.sig) — STRUCTURE only, never decoded
 *   - hex-hash    : a long bare hex run (≥32) — git sha / content hash / nonce shape
 *   - epoch-ms    : a 13-digit unix-ms timestamp (volatile clock value)
 *
 * SECRET SAFETY: this never decodes a JWT, never logs token VALUE beyond a bounded redacted excerpt,
 *   and its own fixtures (in the test) carry NO real-prefix secrets (no sk-/AKIA/AIza/ghp_/nvapi-).
 *
 * Lane Result Grammar: emits the BARE canonical label `04CP_CACHE_PREFIX_SCAN_X_COMMITTED`
 *   (LANE_ID=04CP, DESC=CACHE_PREFIX_SCAN, PASS_TYPE=X, terminal=COMMITTED). Verified canonical by
 *   contract-conformance.parseResultLabel. No 'RESULT_LABEL:' prefix (that mis-parses). A clean scan
 *   is still _X_COMMITTED — the lane RAN successfully; findings are advisory data, not a lane failure.
 */
// @capability: cache-prefix-volatility-scan
// @serves: cache prefix scan | volatile token detection | KV cache prefix stability | uuid timestamp jwt hash in prompt prefix | cache-hot prefix leak | prompt cache invalidation | warn-only prefix detector
// @does: WARN-ONLY detector — flags volatile tokens (UUID / ISO-timestamp / JWT-structure / long-hex / epoch-ms) leaking into the cache-hot prompt prefix, with line/col + redacted excerpt. NEVER mutates the prefix. Emits the canonical Lane Result Grammar label.
// @use: Reach for this before building any prompt-prefix-stability / cache-hit / "why is my prompt cache missing" check. Pairs with ccr-compress; diagnoses, never repairs.
// @exports: scanPrefix, VOLATILE_PATTERNS, LANE_RESULT_LABEL, redact
import fs from 'node:fs';

// BARE canonical Lane Result Grammar label (parseResultLabel-verified canonical).
export const LANE_RESULT_LABEL = '04CP_CACHE_PREFIX_SCAN_X_COMMITTED';

// Closed-set volatile-token detectors. Ordered most-specific → least so JWT/UUID win over bare hex.
export const VOLATILE_PATTERNS = Object.freeze([
  {
    cls: 'jwt',
    // header.payload.signature — three base64url segments. STRUCTURE only; never decoded.
    re: /\b[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/g,
    why: 'per-request JWT in the cacheable prefix invalidates the prompt cache every call',
  },
  {
    cls: 'uuid',
    re: /\b[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}\b/g,
    why: 'a fresh UUID (task/request id) is volatile — pin it BELOW the stable preamble',
  },
  {
    cls: 'iso-ts',
    re: /\b\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}(:\d{2}(\.\d{1,6})?)?(Z|[+-]\d{2}:?\d{2})?\b/g,
    why: 'an ISO timestamp changes every call — it belongs in the volatile task body, not the prefix',
  },
  {
    cls: 'epoch-ms',
    re: /\b1[0-9]{12}\b/g, // 13-digit ms epoch (covers ~2001-2286)
    why: 'a unix-ms epoch is a volatile clock value leaking into the cache-hot prefix',
  },
  {
    cls: 'hex-hash',
    re: /\b[0-9a-f]{32,}\b/g, // git sha / content hash / nonce — long bare lowercase hex
    why: 'a long hex hash (sha/nonce) is per-artifact volatile — keep it out of the stable preamble',
  },
]);

/** redact — bounded, secret-safe excerpt of a matched token (head+tail, middle masked). */
export function redact(token) {
  const s = String(token);
  if (s.length <= 12) return `${s.slice(0, 4)}…`;
  return `${s.slice(0, 6)}…${s.slice(-4)} (${s.length}c)`;
}

function lineColOf(text, index) {
  let line = 1;
  let lastNl = -1;
  for (let i = 0; i < index; i += 1) {
    if (text[i] === '\n') { line += 1; lastNl = i; }
  }
  return { line, col: index - lastNl };
}

/**
 * scanPrefix(prefix, opts) → { prefix, findings, count, byClass, label, clean, leaked }
 * prefix is returned BYTE-FOR-BYTE unchanged (no mutation). findings is the warn list.
 * opts.prefixBytes: if set, only the first N bytes are treated as "cache-hot" (the rest is the
 *   volatile body and is NOT scanned) — matches the "stable preamble then volatile body" caching shape.
 */
export function scanPrefix(prefix, opts = {}) {
  const original = String(prefix);
  // Scope: only the cache-hot region. Default = whole string is treated as the prefix.
  const hotBytes = typeof opts.prefixBytes === 'number' && opts.prefixBytes >= 0 ? opts.prefixBytes : original.length;
  const region = original.slice(0, hotBytes);

  const findings = [];
  const claimedSpans = []; // dedupe overlapping matches: most-specific class wins (patterns ordered).
  for (const { cls, re, why } of VOLATILE_PATTERNS) {
    const r = new RegExp(re.source, 'g');
    let m;
    while ((m = r.exec(region)) !== null) {
      const start = m.index;
      const end = m.index + m[0].length;
      // skip if this span is already covered by a more-specific earlier class
      if (claimedSpans.some((s) => start < s.end && end > s.start)) continue;
      claimedSpans.push({ start, end });
      const { line, col } = lineColOf(region, start);
      findings.push({ cls, line, col, excerpt: redact(m[0]), why });
    }
  }
  findings.sort((a, b) => (a.line - b.line) || (a.col - b.col));

  const byClass = {};
  for (const f of findings) byClass[f.cls] = (byClass[f.cls] || 0) + 1;

  return {
    prefix: original,          // INVARIANT: byte-for-byte unchanged. No mutation, ever.
    unchanged: original === prefix && original === String(prefix),
    findings,
    count: findings.length,
    byClass,
    clean: findings.length === 0,
    leaked: findings.length > 0,
    label: LANE_RESULT_LABEL,  // BARE canonical label (no RESULT_LABEL: prefix)
  };
}

// ── CLI (warn-only; exit 0 always — this is a conscience, not a gate) ─────────────────────────────
function main() {
  const argv = process.argv.slice(2);
  let prefix = '';
  const fileArg = argv.find((a) => !a.startsWith('--'));
  if (fileArg) {
    prefix = fs.readFileSync(fileArg, 'utf8');
    emit(prefix);
  } else {
    const chunks = [];
    process.stdin.on('data', (c) => chunks.push(c));
    process.stdin.on('end', () => emit(Buffer.concat(chunks).toString('utf8')));
  }
}

function emit(prefix) {
  const r = scanPrefix(prefix);
  if (r.leaked) {
    process.stderr.write(`cache-prefix-scan: ${r.count} volatile token(s) in the cache-hot prefix (WARN-ONLY — prefix NOT modified):\n`);
    for (const f of r.findings) {
      process.stderr.write(`  [${f.cls}] ${f.line}:${f.col} ${f.excerpt} — ${f.why}\n`);
    }
  } else {
    process.stderr.write('cache-prefix-scan: prefix clean (no volatile tokens).\n');
  }
  // stdout = machine-readable: BARE label first line, then JSON. exit 0 always (warn-only).
  process.stdout.write(`${r.label}\n`);
  process.stdout.write(`${JSON.stringify({ count: r.count, byClass: r.byClass, clean: r.clean, findings: r.findings }, null, 2)}\n`);
}

if (import.meta.url === `file://${process.argv[1]}`) main();
