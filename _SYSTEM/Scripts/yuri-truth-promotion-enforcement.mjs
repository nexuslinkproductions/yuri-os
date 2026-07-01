#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const REPO_ROOT = path.resolve(__dirname, '../..');

export const TRUTH_PROMOTION_RUNTIME_SCHEMA = 'yuri.truth-promotion-runtime-enforcement.v0';
export const TRUTH_PROMOTION_REGISTRY_SCHEMA = 'yuri.truth-promotion-registry-runtime.v0';

export const CANONICAL_MEMORY_GATE_VALUES = Object.freeze([
  'eligible_for_canonical_memory_candidate',
  'blocked_from_canonical_memory',
]);

export const DEFAULT_PROMOTION_THRESHOLDS = Object.freeze({
  support_min_score: 0.35,
  allowed_reference_tiers: ['P0', 'P1'],
  origin_replacement_blocks_canonical_memory: true,
});

const SHA256_PATTERN = /^[a-f0-9]{64}$/iu;

export const TRUTH_PROMOTION_RUNTIME_ARTIFACTS = Object.freeze([
  { path: '_SYSTEM/Scripts/claim-integrity-gate.mjs', type: 'script', class: 'system_control_plane' },
  { path: '_SYSTEM/Scripts/claim-integrity-gate.test.mjs', type: 'test', class: 'system_control_plane' },
  { path: '_SYSTEM/Scripts/yuri-council-claim-evidence.mjs', type: 'script', class: 'system_control_plane' },
  { path: '_SYSTEM/Scripts/yuri-council-claim-evidence.test.mjs', type: 'test', class: 'system_control_plane' },
  { path: '_SYSTEM/Scripts/yuri-artifact-audit.mjs', type: 'script', class: 'system_control_plane' },
  { path: '_SYSTEM/Scripts/yuri-artifact-audit.test.mjs', type: 'test', class: 'system_control_plane' },
  { path: '_SYSTEM/Scripts/yuri-canonical-memory-import.mjs', type: 'script', class: 'system_control_plane' },
  { path: '_SYSTEM/Scripts/yuri-canonical-memory-import.test.mjs', type: 'test', class: 'system_control_plane' },
  { path: '_SYSTEM/Scripts/yuri-proving-run-repeatable.mjs', type: 'script', class: 'system_control_plane' },
  { path: '_SYSTEM/Scripts/yuri-truth-promotion-enforcement.mjs', type: 'script', class: 'system_control_plane' },
  { path: '_SYSTEM/Scripts/yuri-truth-promotion-enforcement.test.mjs', type: 'test', class: 'system_control_plane' },
  { path: '_SYSTEM/Scripts/yuri-truth-promotion-pipeline.test.mjs', type: 'test', class: 'system_control_plane' },
  { path: '_SYSTEM/config/schemas/yuri.promotion-ladder.v0.schema.json', type: 'config', class: 'artifact_registry' },
  { path: '_SYSTEM/reports/YURI_TRUTH_PROMOTION_PROVING_PATH_REWORK_2026-05-25.md', type: 'report', class: 'generated_artifact' },
]);

export function validateTruthPromotionRegistryRuntime(registry = {}, options = {}) {
  const repoRoot = options.repoRoot || REPO_ROOT;
  const checkFiles = options.checkFiles !== false;
  const artifacts = Array.isArray(registry.artifacts) ? registry.artifacts : [];
  const byPath = new Map(artifacts.map((artifact) => [artifact.path, artifact]));
  const errors = [];
  const warnings = [];
  const checkedArtifacts = [];

  for (const required of TRUTH_PROMOTION_RUNTIME_ARTIFACTS) {
    const artifact = byPath.get(required.path);
    checkedArtifacts.push(required.path);
    if (!artifact) {
      errors.push(`truth promotion runtime artifact missing from registry: ${required.path}`);
      continue;
    }
    if (artifact.type !== required.type) {
      errors.push(`${required.path} must be registered as type ${required.type}`);
    }
    if (artifact.class !== required.class) {
      errors.push(`${required.path} must be registered as class ${required.class}`);
    }
    if (artifact.protected) {
      errors.push(`${required.path} cannot be protected; enforcement must remain callable through YURI scripts`);
    }
    if (!artifact.owner || !/YURI|Codex/i.test(artifact.owner)) {
      warnings.push(`${required.path} owner should identify YURI/Codex control-plane ownership`);
    }
    if (checkFiles && !['planned', 'retired'].includes(artifact.status) && !fs.existsSync(path.join(repoRoot, artifact.path))) {
      errors.push(`${required.path} is registered for truth promotion but does not exist`);
    }
  }

  return {
    schema: TRUTH_PROMOTION_REGISTRY_SCHEMA,
    ok: errors.length === 0,
    errors,
    warnings,
    checkedArtifactCount: checkedArtifacts.length,
    checkedArtifacts,
  };
}

export function validateCanonicalMemoryPromotionGate(gate = {}, options = {}) {
  const thresholds = {
    ...DEFAULT_PROMOTION_THRESHOLDS,
    ...(gate.thresholds || {}),
  };
  const allowedReferenceTiers = Array.isArray(thresholds.allowed_reference_tiers)
    ? thresholds.allowed_reference_tiers
    : DEFAULT_PROMOTION_THRESHOLDS.allowed_reference_tiers;
  const claims = Array.isArray(gate.claims) ? gate.claims : [];
  const errors = [];
  const warnings = [];
  const seenClaimIds = new Set();
  const seenContentHashes = new Set();

  if (gate.schema_version !== 1) errors.push('promotion gate schema_version must be 1');
  if (!Array.isArray(gate.claims)) errors.push('promotion gate claims must be an array');
  if (gate.local_truth_claim !== true) errors.push('promotion gate must declare local_truth_claim=true');
  if (!/raw source prose remains tainted/i.test(String(gate.policy || ''))) {
    errors.push('promotion gate policy must preserve the raw-source taint boundary');
  }

  for (const [index, claim] of claims.entries()) {
    const claimId = claim.claim_id || `claim[${index}]`;
    const gateValue = claim.canonical_memory_gate;
    const blockers = Array.isArray(claim.blockers) ? claim.blockers : [];
    const supportScore = Number(claim.support_score);
    const referenceTier = claim.reference?.tier || 'unknown';
    const sourceUri = String(claim.reference?.normalized_href || claim.reference?.href || '').trim();
    const promotionRequirements = Array.isArray(claim.promotion_requirements)
      ? claim.promotion_requirements.join(' ')
      : '';

    if (claim.claim_id) {
      if (seenClaimIds.has(claim.claim_id)) errors.push(`${claimId} duplicate claim_id`);
      seenClaimIds.add(claim.claim_id);
    }
    if (SHA256_PATTERN.test(String(claim.content_sha256 || ''))) {
      if (seenContentHashes.has(claim.content_sha256)) errors.push(`${claimId} duplicate content_sha256`);
      seenContentHashes.add(claim.content_sha256);
    }

    if (!CANONICAL_MEMORY_GATE_VALUES.includes(gateValue)) {
      errors.push(`${claimId} has unsupported canonical_memory_gate: ${gateValue || '(missing)'}`);
      continue;
    }

    if (gateValue !== 'eligible_for_canonical_memory_candidate') {
      if (blockers.length === 0) warnings.push(`${claimId} is blocked without explicit blockers`);
      continue;
    }

    if (blockers.length > 0) errors.push(`${claimId} is eligible but still has blockers`);
    if (!Number.isFinite(supportScore) || supportScore < Number(thresholds.support_min_score)) {
      errors.push(`${claimId} support_score is below runtime threshold ${thresholds.support_min_score}`);
    }
    if (!allowedReferenceTiers.includes(referenceTier)) {
      errors.push(`${claimId} reference tier ${referenceTier} is not allowed for canonical memory candidates`);
    }
    if (!sourceUri) errors.push(`${claimId} missing source reference URI`);
    if (!claim.source_file || typeof claim.source_file !== 'string') {
      errors.push(`${claimId} missing source_file provenance`);
    }
    if (!Number.isInteger(Number(claim.source_line)) || Number(claim.source_line) <= 0) {
      errors.push(`${claimId} missing positive source_line provenance`);
    }
    if (!SHA256_PATTERN.test(String(claim.content_sha256 || ''))) {
      errors.push(`${claimId} missing valid content_sha256`);
    }
    if (!claim.verification_method || typeof claim.verification_method !== 'string') {
      errors.push(`${claimId} missing verification_method`);
    }
    if (thresholds.origin_replacement_blocks_canonical_memory && claim.reference?.resolution_precision === 'origin_replacement') {
      errors.push(`${claimId} uses origin_replacement reference resolution`);
    }
    if (!/\b(?:(?:human|operator)\s+approv(?:e|ed|al)|operator validation|operator validated)\b/i.test(promotionRequirements)) {
      errors.push(`${claimId} missing human/operator approval promotion requirement`);
    }
    if (!/\b(?:sanitized|not raw|no raw|raw source prose)\b/i.test(promotionRequirements)) {
      errors.push(`${claimId} missing sanitized-summary promotion requirement`);
    }
  }

  return {
    schema: TRUTH_PROMOTION_RUNTIME_SCHEMA,
    ok: errors.length === 0,
    errors,
    warnings,
    thresholds: {
      support_min_score: Number(thresholds.support_min_score),
      allowed_reference_tiers: allowedReferenceTiers,
      origin_replacement_blocks_canonical_memory: Boolean(thresholds.origin_replacement_blocks_canonical_memory),
    },
    counts: {
      claims: claims.length,
      eligible: claims.filter((claim) => claim.canonical_memory_gate === 'eligible_for_canonical_memory_candidate').length,
      blocked: claims.filter((claim) => claim.canonical_memory_gate !== 'eligible_for_canonical_memory_candidate').length,
    },
  };
}

export function enforceCanonicalMemoryImportRuntime({
  gate,
  dryRun = false,
  operatorApproved = false,
  runRoot = '',
  dbPath = '',
} = {}) {
  const gateReport = validateCanonicalMemoryPromotionGate(gate);
  const errors = [...gateReport.errors];
  if (!dryRun && !operatorApproved) {
    errors.push('canonical_memory_write_requires_operator_approved_flag');
  }

  return {
    schema: TRUTH_PROMOTION_RUNTIME_SCHEMA,
    generated_at: new Date().toISOString(),
    operation: 'canonical_memory_import',
    mode: dryRun ? 'dry-run' : 'apply',
    run_root: runRoot,
    db_path: dbPath,
    operator_approved: Boolean(operatorApproved),
    ok: errors.length === 0,
    decision: errors.length === 0 ? 'allow' : 'block',
    errors,
    warnings: gateReport.warnings,
    gate: gateReport,
  };
}

export function writeTruthPromotionEnforcementReport({
  runRoot,
  report,
  fileName = 'truth-promotion-runtime-enforcement.json',
} = {}) {
  if (!runRoot) return '';
  const reportPath = path.join(runRoot, fileName);
  fs.writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`);
  return reportPath;
}

function parseCliArgs(argv) {
  const options = { command: argv[0] || '', gate: '', registry: '', dryRun: false, operatorApproved: false };
  for (let index = 1; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--gate') options.gate = requireValue(argv, ++index, '--gate');
    else if (arg === '--registry') options.registry = requireValue(argv, ++index, '--registry');
    else if (arg === '--dry-run') options.dryRun = true;
    else if (arg === '--operator-approved') options.operatorApproved = true;
    else throw new Error(`Unknown argument: ${arg}`);
  }
  return options;
}

function requireValue(args, index, flag) {
  const value = args[index];
  if (!value) throw new Error(`${flag} requires a value`);
  return value;
}

function runCli(argv = process.argv.slice(2)) {
  const options = parseCliArgs(argv);
  if (options.command === 'gate') {
    if (!options.gate) throw new Error('gate command requires --gate file');
    const gate = JSON.parse(fs.readFileSync(options.gate, 'utf8'));
    const report = enforceCanonicalMemoryImportRuntime({
      gate,
      dryRun: options.dryRun,
      operatorApproved: options.operatorApproved,
      runRoot: path.dirname(path.resolve(options.gate)),
    });
    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
    if (!report.ok) process.exitCode = 1;
    return;
  }
  if (options.command === 'registry') {
    if (!options.registry) throw new Error('registry command requires --registry file');
    const registry = JSON.parse(fs.readFileSync(options.registry, 'utf8'));
    const report = validateTruthPromotionRegistryRuntime(registry, { repoRoot: REPO_ROOT });
    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
    if (!report.ok) process.exitCode = 1;
    return;
  }
  process.stderr.write('Usage: node _SYSTEM/Scripts/yuri-truth-promotion-enforcement.mjs gate --gate file [--dry-run|--operator-approved]\n');
  process.stderr.write('   or: node _SYSTEM/Scripts/yuri-truth-promotion-enforcement.mjs registry --registry file\n');
  process.exitCode = 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    runCli();
  } catch (error) {
    console.error(error.message);
    process.exit(1);
  }
}
