#!/usr/bin/env node

import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

const USAGE = [
  'Usage:',
  '  node _SYSTEM/Scripts/yuri-council-claim-evidence.mjs split [--out file] <advisory.md...>',
].join('\n');

const [command, ...argv] = process.argv.slice(2);

try {
  if (command !== 'split') throw new Error(USAGE);
  const options = parseArgs(argv);
  const register = buildClaimEvidenceRegister(options.files, options.out);
  writeJson(register, options.out);
} catch (error) {
  console.error(error.message);
  process.exit(1);
}

function parseArgs(args) {
  const files = [];
  let out = '';
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === '--out') out = path.resolve(requireValue(args, ++index, '--out'));
    else files.push(path.resolve(arg));
  }
  if (files.length === 0) throw new Error(`split requires at least one advisory file\n${USAGE}`);
  return { files, out };
}

function requireValue(args, index, flag) {
  const value = args[index];
  if (!value) throw new Error(`${flag} requires a value`);
  return value;
}

function buildClaimEvidenceRegister(files, out = '') {
  const sources = files.map((file) => readAdvisory(file));
  const claims = sources.flatMap((source) => extractClaims(source));
  return {
    schema_version: 1,
    generated_at: new Date().toISOString(),
    advisory_only: true,
    local_truth_claim: false,
    raw_output_policy: 'raw council output is tainted; only classified claim summaries may be used for planning',
    promotion_policy: {
      verified_fact: 'eligible_for_sanitized_summary_only_after_local_verifier_confirms',
      hypothesis: 'direct_check_required_or_record_blocker',
      test_candidate: 'execute_test_or_record_blocker',
      risk: 'direct_check_required_before_risk_register',
      upgrade_candidate: 'direct_check_required_before_ranking',
      unsafe_or_rejected: 'do_not_use',
    },
    source_count: sources.length,
    sources: sources.map(({ file, sha256, line_count }) => ({ file, sha256, line_count })),
    counts: countClassifications(claims),
    claims,
    output_file: out || null,
  };
}

function readAdvisory(file) {
  if (!fs.existsSync(file)) throw new Error(`Advisory file not found: ${file}`);
  const raw = fs.readFileSync(file);
  const text = raw.toString('utf8');
  return {
    file,
    sha256: crypto.createHash('sha256').update(raw).digest('hex'),
    line_count: text.split(/\r?\n/).length,
    text,
  };
}

function extractClaims(source) {
  const claims = [];
  let section = 'unsectioned';
  const lines = source.text.split(/\r?\n/);
  for (let index = 0; index < lines.length; index += 1) {
    const rawLine = lines[index];
    const heading = sectionHeading(rawLine);
    if (heading) {
      section = heading;
      continue;
    }
    const text = normalizeClaimLine(rawLine);
    if (!text) continue;
    if (isMetadataLine(text)) continue;
    const classification = classifyClaim(text, section);
    claims.push({
      id: claimId(source.file, index + 1, text),
      source_file: source.file,
      source_sha256: source.sha256,
      source_line: index + 1,
      source_section: section,
      text,
      classification,
      promotion: promotionFor(classification),
      evidence_required: evidenceRequiredFor(classification),
    });
  }
  return claims;
}

function sectionHeading(line) {
  const markdown = line.match(/^#{1,6}\s+(.+)$/);
  if (markdown) return normalizeSection(markdown[1]);
  const bold = line.match(/^\*\*([^*]+):\*\*$/);
  if (bold) return normalizeSection(bold[1]);
  return '';
}

function normalizeSection(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/§\d+\s*[—-]\s*/g, '')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '') || 'unsectioned';
}

function normalizeClaimLine(line) {
  const trimmed = String(line || '').trim();
  if (!trimmed || /^[-*]{3,}$/.test(trimmed)) return '';
  if (/^\|?\s*:?-{3,}:?\s*\|/.test(trimmed)) return '';
  if (/^\|/.test(trimmed)) {
    const cells = trimmed.split('|').map((cell) => cell.trim()).filter(Boolean);
    return cells.length > 0 ? cells.join(' | ') : '';
  }
  return trimmed
    .replace(/^[-*]\s+/, '')
    .replace(/^\d+\.\s+/, '')
    .replace(/^#+\s+/, '')
    .trim();
}

function isMetadataLine(text) {
  return /^#\s/.test(text)
    || /^lane:|^model:|^reasoning:|^stdout_|^stderr_|^exit_code:|^required_sections=|^advisory_only=|^local_truth_claim=|^codex_final_authority=|^not_local_truth$/i.test(text)
    || /^council:|^scope:|^review type:|^status:/i.test(text);
}

function classifyClaim(text, section) {
  const lower = text.toLowerCase();
  if (/(delete|exfiltrate|write secrets|disable guard|bypass|ignore policy)/.test(lower)) return 'unsafe_or_rejected';
  if (/upgrade|candidate|recommendation/.test(section) || /\b(upgrade|promote|extend|formalize|add configurable|schema_version|sbom)\b/.test(lower)) return 'upgrade_candidate';
  if (/tests?_needed|test|benchmark|fuzz|fixture|reproducib|seed|scenario/.test(section) || /\b(test|benchmark|fuzz|verify|check)\b/.test(lower)) return 'test_candidate';
  if (/risk/.test(section) || /\b(risk|misses|unsafe|gap|blindspot|limitation|ambiguit|orphan|poison|contaminat)\b/.test(lower)) return 'risk';
  if (/\b(hypothesis|speculative|could|likely|may|future|invent|idea|candidate)\b/.test(lower)) return 'hypothesis';
  if (/\b(pass|passed|sha256|artifact:|file:|evidence|observed|implemented|line[s]?:\s*\d+)\b/.test(lower)) return 'verified_fact';
  return 'hypothesis';
}

function promotionFor(classification) {
  if (classification === 'verified_fact') return 'eligible_after_local_verification';
  if (classification === 'hypothesis') return 'direct_check_required_or_record_blocker';
  if (classification === 'test_candidate') return 'execute_test_or_record_blocker';
  if (classification === 'risk') return 'direct_check_required_before_risk_register';
  if (classification === 'upgrade_candidate') return 'direct_check_required_before_ranking';
  return 'blocked';
}

function evidenceRequiredFor(classification) {
  if (classification === 'verified_fact') return ['local command output', 'file hash/path', 'test result'];
  if (classification === 'test_candidate') return ['new regression test', 'expected pass/fail gate'];
  if (classification === 'upgrade_candidate') return ['impact/risk/reversibility ranking', 'acceptance test'];
  if (classification === 'risk') return ['reproduction or explicit unresolved assumption'];
  if (classification === 'hypothesis') return ['deterministic validation before promotion'];
  return ['none; blocked'];
}

function claimId(file, line, text) {
  const hash = crypto.createHash('sha1').update(`${file}:${line}:${text}`).digest('hex').slice(0, 10);
  return `claim-${hash}`;
}

function countClassifications(claims) {
  return claims.reduce((counts, claim) => {
    counts[claim.classification] = (counts[claim.classification] || 0) + 1;
    return counts;
  }, {});
}

function writeJson(value, out = '') {
  const body = `${JSON.stringify(value, null, 2)}\n`;
  if (out) fs.writeFileSync(out, body);
  else process.stdout.write(body);
}
