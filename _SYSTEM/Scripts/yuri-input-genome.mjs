#!/usr/bin/env node

import crypto from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildNormalizedIntent, validateNormalizedIntent } from './yuri-control-plane-schema.mjs';
import { compileOneTransactionContract, validateCompiledContract } from './yuri/prompt-compiler.mjs';

export const INPUT_GENOME_SCHEMA = 'yuri.input-genome.v0';

export const PROTECTED_PATHS = Object.freeze([
  'backend/data/',
  '.claude/state/',
  '.claude/history/',
  '.claude/file-history/',
  '.claude/projects/',
  '.env',
  'node_modules/',
  '.amp/',
]);

const ACTION_VERBS = Object.freeze([
  'add',
  'analyze',
  'audit',
  'build',
  'check',
  'compare',
  'create',
  'debug',
  'design',
  'explain',
  'fix',
  'harden',
  'implement',
  'inspect',
  'integrate',
  'load',
  'make',
  'plan',
  'proceed',
  'refactor',
  'review',
  'run',
  'synthesize',
  'test',
  'update',
  'verify',
  'wire',
]);

const VAGUE_MARKERS = Object.freeze([
  'maybe',
  'whatever',
  'somehow',
  'that thing',
  'stuff',
  'idk',
  'not sure',
  'you know',
]);

const PROTECTED_SURFACE_MARKERS = Object.freeze([
  '.env',
  'secret',
  'credential',
  'token',
  'api key',
  'backend/data',
  '.claude/state',
  '.claude/history',
  '.claude/file-history',
  '.claude/projects',
  'node_modules',
]);

const RISK_PATTERNS = Object.freeze([
  { id: 'protected-surface', pattern: /(\.env|backend\/data|\.claude\/(?:state|history|file-history|projects)|node_modules|secret|credential|token|api key)/iu, level: 'high' },
  { id: 'commit-or-push', pattern: /\b(commit|push|stage|staging)\b/iu, level: 'medium' },
  { id: 'security-sensitive', pattern: /\b(cyber|pentest|exploit|vulnerability|soc|siem|xdr|runtime protection)\b/iu, level: 'high' },
  { id: 'production-claim', pattern: /\b(production-ready|trusted|verified|proven|autonomous)\b/iu, level: 'medium' },
  { id: 'broad-mutation', pattern: /\b(rewrite|mass[- ]?rewrite|bulk[- ]?migrate|delete|remove all)\b/iu, level: 'medium' },
]);

const CONSTRAINT_PATTERNS = Object.freeze([
  { id: 'no-commit', pattern: /\b(no commits?|do not commit|don't commit|without committing)\b/iu, text: 'Do not commit unless the operator explicitly authorizes it.' },
  { id: 'no-push', pattern: /\b(no pushes?|do not push|don't push|without pushing)\b/iu, text: 'Do not push unless the operator explicitly authorizes it.' },
  { id: 'preserve-user-work', pattern: /\b(do not revert|don't revert|preserve|keep existing|do not overwrite)\b/iu, text: 'Preserve existing user work and unrelated dirty changes.' },
  { id: 'deep-research', pattern: /\b(deep research|online research|web research|look up|latest|current)\b/iu, text: 'Use research or browsing when the task needs current/source-backed information.' },
  { id: 'high-reasoning', pattern: /\b(highest reasoning|deep reasoning|systematic|utmost|rigor|rigour)\b/iu, text: 'Use systematic high-reasoning procedure.' },
  { id: 'local-first', pattern: /\b(without lanes|no lanes|even when.*no other lanes|local deterministic|works locally)\b/iu, text: 'The base mechanism must work locally without advisory lanes.' },
  { id: 'optional-lanes', pattern: /\b(shintai|deepseek|nim|council|lanes?|fan[- ]?out)\b/iu, text: 'Treat model lanes as optional advisory pressure unless explicitly promoted by local verification.' },
  { id: 'time-unbounded', pattern: /\b(give .* time|do not restrict .* time|unbounded|no timeout)\b/iu, text: 'Do not impose proposal/reasoning time limits unless a sterile health probe or operator policy requires it.' },
  { id: 'brief-output', pattern: /\b(simple|brief|short|concise|summary only)\b/iu, text: 'Keep the final operator-facing output concise.' },
]);

function hashText(value) {
  return crypto.createHash('sha256').update(String(value || '')).digest('hex');
}

function normalizeText(value) {
  return String(value || '').replace(/\r\n?/gu, '\n').trim();
}

function collapse(value) {
  return normalizeText(value).replace(/\s+/gu, ' ');
}

function uniqueStrings(values) {
  return [...new Set(values.filter((value) => typeof value === 'string' && value.trim()).map((value) => value.trim()))];
}

function clampPreview(value, max = 420) {
  const text = collapse(value);
  return text.length <= max ? text : `${text.slice(0, max - 3)}...`;
}

function splitClauses(rawInput) {
  return uniqueStrings(normalizeText(rawInput)
    .split(/(?:\n+|[.!?;]+|\s+-\s+|\s+\|\s+)/u)
    .map((part) => collapse(part))
    .filter((part) => part.length > 0 && part.length <= 500));
}

function actionVerbPattern() {
  return new RegExp(`\\b(${ACTION_VERBS.join('|')})(?:ing|ed|s)?\\b`, 'iu');
}

function startsLikeCommand(text) {
  return /^(@[\w-]+|\/[\w-]+)\b/u.test(collapse(text));
}

export function classifyInputMode(rawInput = '') {
  const text = normalizeText(rawInput);
  const lowered = text.toLowerCase();
  const clauses = splitClauses(text);
  const command = startsLikeCommand(text);
  const question = /\?\s*$/u.test(text) || /^(how|what|why|when|where|can|could|should|would|does|do)\b/iu.test(collapse(text));
  const hasVague = VAGUE_MARKERS.some((marker) => lowered.includes(marker));
  const hasBrainDumpSignals = clauses.length >= 3 || text.length > 260 || /\b(braindump|brain dump|shotgun|chaos|all over)\b/iu.test(text);

  if (command && clauses.length > 1) return 'mixed';
  if (command) return 'command';
  if (hasBrainDumpSignals || hasVague) return 'braindump';
  if (question) return 'query';
  return 'task';
}

export function isProtectedPath(candidatePath = '', { repoRoot = process.cwd() } = {}) {
  const raw = String(candidatePath || '').trim();
  const normalized = raw.replaceAll('\\', '/');
  const absolute = path.isAbsolute(raw) ? raw : path.resolve(repoRoot, raw);
  const relative = path.relative(repoRoot, absolute).replaceAll('\\', '/');
  const checks = uniqueStrings([normalized, relative, normalized.replace(/^\.\//u, ''), relative.replace(/^\.\//u, '')]);
  const hit = PROTECTED_PATHS.find((protectedPath) => checks.some((check) => (
    check === protectedPath.replace(/\/$/u, '') ||
    check === protectedPath ||
    check.startsWith(protectedPath)
  )));
  return {
    protected: Boolean(hit),
    matched: hit || null,
    relative,
  };
}

function extractExplicitRequests(rawInput) {
  const verb = actionVerbPattern();
  const clauses = splitClauses(rawInput);
  const requests = clauses.filter((clause) => (
    verb.test(clause) ||
    /^(please|can you|could you|would you|we need|i want|let'?s|go ahead|proceed)\b/iu.test(clause)
  ));
  if (requests.length) return uniqueStrings(requests).slice(0, 8);
  const fallback = clampPreview(rawInput, 240);
  return fallback ? [fallback] : [];
}

function extractConstraints(rawInput) {
  const text = normalizeText(rawInput);
  const constraints = CONSTRAINT_PATTERNS
    .filter((entry) => entry.pattern.test(text))
    .map((entry) => ({ id: entry.id, text: entry.text }));
  if (!constraints.some((entry) => entry.id === 'preserve-user-work')) {
    constraints.push({ id: 'preserve-user-work', text: 'Do not overwrite unrelated user changes.' });
  }
  return constraints;
}

function extractRiskSignals(rawInput) {
  const text = normalizeText(rawInput);
  return RISK_PATTERNS
    .filter((entry) => entry.pattern.test(text))
    .map((entry) => ({ id: entry.id, level: entry.level }));
}

function extractProtectedSurfaceWarnings(rawInput) {
  const lowered = normalizeText(rawInput).toLowerCase();
  return PROTECTED_SURFACE_MARKERS
    .filter((marker) => lowered.includes(marker))
    .map((marker) => ({ marker, warning: 'Protected or sensitive surface mentioned; do not read/write unless an approved wrapper allows it.' }));
}

function inferObjective(rawInput, explicitRequests) {
  const firstRequest = explicitRequests[0] || '';
  const text = firstRequest || collapse(rawInput);
  if (!text) return 'Process the operator input through the YURI control plane.';
  return text.length <= 220 ? text : `${text.slice(0, 217)}...`;
}

function inferImpliedNeeds(rawInput, inputMode, constraints, riskSignals) {
  const needs = [];
  if (inputMode === 'braindump' || inputMode === 'mixed') needs.push('Decode unordered input into explicit objective, constraints, risks, and work packets.');
  if (constraints.some((entry) => entry.id === 'local-first')) needs.push('Keep a deterministic local path that does not require advisory lanes.');
  if (constraints.some((entry) => entry.id === 'optional-lanes')) needs.push('Separate advisory lane pressure from Codex/main arbitration.');
  if (riskSignals.length) needs.push('Surface risks before execution and require local verification before promotion.');
  if (!needs.length) needs.push('Preserve the raw request and compile a structured operating packet.');
  return needs;
}

function inferSuccessCriteria(rawInput, explicitRequests, constraints) {
  const criteria = [
    'Raw operator input is preserved with a stable hash.',
    'Objective, constraints, risks, work packets, and verification needs are explicit before routing.',
  ];
  if (explicitRequests.some((request) => /\b(test|verify|audit|inspect|review)\b/iu.test(request))) {
    criteria.push('Smallest meaningful local verification is run or named.');
  }
  if (constraints.some((entry) => entry.id === 'local-first')) {
    criteria.push('The base path succeeds without Shintai, DeepSeek, Claude, or NIM lanes.');
  }
  if (/\b(register|registry|artifact|schema)\b/iu.test(rawInput)) {
    criteria.push('Durable files are placed through YURI registry/config architecture.');
  }
  return uniqueStrings(criteria);
}

function inferWorkPackets(explicitRequests, objective) {
  const packets = explicitRequests.length ? explicitRequests : [objective];
  return packets.slice(0, 8).map((packet, index) => ({
    id: `wp-${String(index + 1).padStart(2, '0')}`,
    title: clampPreview(packet, 120),
    source: index === 0 ? 'primary-request' : 'explicit-request',
  }));
}

function inferRouteHints(rawInput, constraints, riskSignals, options = {}) {
  const text = normalizeText(rawInput).toLowerCase();
  const hints = {
    primaryAuthority: 'codex-main',
    localBaseRequired: true,
    optionalReviewLanes: [],
    suggestedLane: options.routePlan?.lane || 'local',
    scenario: options.routePlan?.scenario || 'general',
  };
  if (text.includes('shintai')) hints.optionalReviewLanes.push('shintai');
  if (text.includes('deepseek')) hints.optionalReviewLanes.push('deepseek');
  if (/\b(nim|nvidia|nemotron|qwen|mistral|minimax|gpt-oss)\b/iu.test(text)) hints.optionalReviewLanes.push('nim');
  if (constraints.some((entry) => entry.id === 'local-first')) hints.suggestedLane = 'local';
  if (riskSignals.some((entry) => entry.level === 'high')) hints.scenario = 'high-risk-review';
  hints.optionalReviewLanes = uniqueStrings(hints.optionalReviewLanes);
  return hints;
}

function estimateConfidence(rawInput, inputMode, explicitRequests, riskSignals) {
  let score = 0.68;
  if (explicitRequests.length > 1) score += 0.12;
  if (inputMode === 'command' || inputMode === 'task') score += 0.08;
  if (inputMode === 'braindump') score -= 0.08;
  if (VAGUE_MARKERS.some((marker) => normalizeText(rawInput).toLowerCase().includes(marker))) score -= 0.18;
  if (riskSignals.length) score -= 0.04;
  return Math.max(0.15, Math.min(0.95, Number(score.toFixed(2))));
}

function inferVerificationNeeds(rawInput, riskSignals) {
  const needs = ['Verify local evidence before promotion or durable claims.'];
  if (/\b(test|tests|node|run)\b/iu.test(rawInput)) needs.push('Run the relevant local test or syntax check where feasible.');
  if (riskSignals.some((entry) => entry.id === 'protected-surface')) needs.push('Confirm protected paths were not read or written.');
  if (riskSignals.some((entry) => entry.id === 'production-claim')) needs.push('Require promotion state and evidence before accepting trust/proven/production claims.');
  return uniqueStrings(needs);
}

function buildProvenance({ rawInputHash, genomeHash, normalizedIntent, source }) {
  const activityId = `activity-${genomeHash.slice(0, 16)}`;
  return {
    model: 'PROV-O-lite',
    entities: {
      rawInput: { type: 'prov:Entity', sha256: rawInputHash },
      inputGenome: { type: 'prov:Entity', sha256: genomeHash },
      normalizedIntent: { type: 'prov:Entity', id: normalizedIntent.id },
    },
    activities: {
      [activityId]: {
        type: 'prov:Activity',
        label: 'braindump-to-intent',
        used: ['rawInput'],
        generated: ['inputGenome', 'normalizedIntent'],
      },
    },
    agents: {
      normalizer: {
        type: 'prov:SoftwareAgent',
        label: 'yuri-input-genome.mjs',
        source,
      },
    },
  };
}

export function extractInputSignals(rawInput = '') {
  const inputMode = classifyInputMode(rawInput);
  const explicitRequests = extractExplicitRequests(rawInput);
  const constraints = extractConstraints(rawInput);
  const riskSignals = extractRiskSignals(rawInput);
  return {
    inputMode,
    explicitRequests,
    constraints,
    riskSignals,
    protectedSurfaceWarnings: extractProtectedSurfaceWarnings(rawInput),
  };
}

export function buildInputGenome(rawInput = '', options = {}) {
  const raw = normalizeText(rawInput);
  const rawInputSha256 = hashText(raw);
  const signals = extractInputSignals(raw);
  const objective = inferObjective(raw, signals.explicitRequests);
  const routeHints = inferRouteHints(raw, signals.constraints, signals.riskSignals, options);
  const impliedNeeds = inferImpliedNeeds(raw, signals.inputMode, signals.constraints, signals.riskSignals);
  const successCriteria = inferSuccessCriteria(raw, signals.explicitRequests, signals.constraints);
  const workPackets = inferWorkPackets(signals.explicitRequests, objective);
  const verificationNeeds = inferVerificationNeeds(raw, signals.riskSignals);
  const confidence = estimateConfidence(raw, signals.inputMode, signals.explicitRequests, signals.riskSignals);
  const artifactRoot = options.artifactRoot || '_SYSTEM/state/input-genome';
  const runDir = options.runDir || `${artifactRoot}/current`;
  const normalizedIntent = buildNormalizedIntent({
    prompt: objective || raw,
    mode: options.mode || 'dry-run',
    routePlan: {
      scenario: routeHints.scenario,
      lane: routeHints.suggestedLane,
      ...(options.routePlan || {}),
    },
    artifactRoot,
    runDir,
  });
  const promptContract = compileOneTransactionContract({
    contract_id: `input-genome-${rawInputSha256.slice(0, 12)}`,
    task_delta: objective,
    allowed_scope: [
      'Decode raw input into objective, constraints, risks, work packets, route hints, and verification needs.',
      'Use YURI context and registry architecture before durable writes.',
    ],
    forbidden_scope: [
      ...PROTECTED_PATHS,
      'Direct Claude one-shot calls',
      'Advisory lane output promoted without Codex/main verification',
    ],
    internal_checklist: [
      'Treat the raw input as authoritative provenance.',
      'If the genome is low confidence, state assumptions and proceed conservatively.',
      'Codex/main owns final arbitration.',
    ],
    output_schema: {
      type: 'yuri_input_genome_packet',
      fields: ['objective', 'constraints', 'risks', 'work_packets', 'verification_needs', 'final_answer'],
    },
  });

  const partialGenome = {
    schema: INPUT_GENOME_SCHEMA,
    createdAt: new Date().toISOString(),
    source: options.source || 'local',
    target: options.target || routeHints.suggestedLane || 'local',
    rawInput: raw,
    rawInputPreview: clampPreview(raw),
    rawInputSha256,
    inputMode: signals.inputMode,
    confidence,
    userVisibleIntent: objective,
    objective,
    explicitRequests: signals.explicitRequests,
    impliedNeeds,
    constraints: signals.constraints,
    riskSignals: signals.riskSignals,
    protectedSurfaceWarnings: signals.protectedSurfaceWarnings,
    successCriteria,
    workPackets,
    routeHints,
    verificationNeeds,
    normalizedIntent,
    promptContract,
    validation: {
      normalizedIntent: validateNormalizedIntent(normalizedIntent),
      promptContract: validateCompiledContract(promptContract),
    },
  };

  const genomeHash = hashText(JSON.stringify({
    schema: partialGenome.schema,
    rawInputSha256,
    objective,
    explicitRequests: signals.explicitRequests,
    constraints: signals.constraints,
    riskSignals: signals.riskSignals,
    successCriteria,
    workPackets,
    routeHints,
    verificationNeeds,
  }));
  const genome = {
    ...partialGenome,
    genomeSha256: genomeHash,
    provenance: buildProvenance({
      rawInputHash: rawInputSha256,
      genomeHash,
      normalizedIntent,
      source: partialGenome.source,
    }),
  };
  genome.promptBlock = renderInputGenomeBlock(genome, { target: genome.target });
  genome.promptBlockSha256 = hashText(genome.promptBlock);
  genome.validation.inputGenome = validateInputGenome(genome);

  return genome;
}

export function validateInputGenome(genome) {
  const issues = [];
  if (!genome || typeof genome !== 'object' || Array.isArray(genome)) {
    return { ok: false, issues: ['input genome must be an object'] };
  }
  for (const key of [
    'schema',
    'rawInput',
    'rawInputSha256',
    'inputMode',
    'confidence',
    'objective',
    'constraints',
    'riskSignals',
    'workPackets',
    'routeHints',
    'verificationNeeds',
    'normalizedIntent',
    'promptContract',
  ]) {
    if (!(key in genome)) issues.push(`input genome missing field: ${key}`);
  }
  if (genome.schema !== INPUT_GENOME_SCHEMA) issues.push(`schema must be ${INPUT_GENOME_SCHEMA}`);
  if (!/^[a-f0-9]{64}$/u.test(String(genome.rawInputSha256 || ''))) issues.push('rawInputSha256 must be a sha256 hex string');
  if (!['command', 'query', 'task', 'braindump', 'mixed'].includes(genome.inputMode)) issues.push('invalid inputMode');
  if (typeof genome.confidence !== 'number' || genome.confidence < 0 || genome.confidence > 1) issues.push('confidence must be between 0 and 1');
  for (const key of ['constraints', 'riskSignals', 'workPackets', 'verificationNeeds']) {
    if (!Array.isArray(genome[key])) issues.push(`${key} must be an array`);
  }
  if (!genome.routeHints || genome.routeHints.primaryAuthority !== 'codex-main') {
    issues.push('routeHints.primaryAuthority must be codex-main');
  }
  const normalized = validateNormalizedIntent(genome.normalizedIntent);
  if (!normalized.ok) issues.push(...normalized.issues.map((issue) => `normalizedIntent: ${issue}`));
  const contract = validateCompiledContract(genome.promptContract);
  if (!contract.ok) issues.push(...contract.issues.map((issue) => `promptContract: ${issue}`));
  return { ok: issues.length === 0, issues };
}

function formatList(values, formatter = (value) => value) {
  if (!Array.isArray(values) || values.length === 0) return '- none';
  return values.map((value) => `- ${formatter(value)}`).join('\n');
}

export function renderInputGenomeBlock(genome, options = {}) {
  const target = options.target || genome?.target || 'local';
  const constraints = formatList(genome.constraints, (entry) => `${entry.id}: ${entry.text}`);
  const risks = formatList(genome.riskSignals, (entry) => `${entry.id}: ${entry.level}`);
  const protectedWarnings = formatList(genome.protectedSurfaceWarnings, (entry) => `${entry.marker}: ${entry.warning}`);
  const workPackets = formatList(genome.workPackets, (entry) => `${entry.id}: ${entry.title}`);
  const verificationNeeds = formatList(genome.verificationNeeds);
  const optionalLanes = genome.routeHints?.optionalReviewLanes?.length
    ? genome.routeHints.optionalReviewLanes.join(', ')
    : 'none';

  return [
    '[YURI Input Genome v0]',
    `target: ${target}`,
    `raw_sha256: ${genome.rawInputSha256}`,
    `genome_sha256: ${genome.genomeSha256}`,
    `mode: ${genome.inputMode}`,
    `confidence: ${genome.confidence}`,
    `primary_authority: ${genome.routeHints.primaryAuthority}`,
    `local_base_required: ${genome.routeHints.localBaseRequired}`,
    `optional_review_lanes: ${optionalLanes}`,
    `objective: ${genome.objective}`,
    '',
    'constraints:',
    constraints,
    '',
    'risks:',
    risks,
    '',
    'protected_surface_warnings:',
    protectedWarnings,
    '',
    'work_packets:',
    workPackets,
    '',
    'verification_needs:',
    verificationNeeds,
    '',
    'operating_rule: Treat raw input as authoritative provenance, this genome as a reversible local decode, lanes as advisory only, and Codex/main as final verifier.',
  ].join('\n');
}

function parseCli(argv) {
  const out = { text: '', path: '', json: false };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--text') out.text = argv[++index] || '';
    else if (arg === '--path') out.path = argv[++index] || '';
    else if (arg === '--json') out.json = true;
    else if (!out.text) out.text = arg;
    else out.text += ` ${arg}`;
  }
  return out;
}

function readCliInput(args) {
  if (args.path) {
    const protectedCheck = isProtectedPath(args.path);
    if (protectedCheck.protected) {
      throw new Error(`refusing protected path before read: ${protectedCheck.matched}`);
    }
    const abs = path.isAbsolute(args.path) ? args.path : path.resolve(process.cwd(), args.path);
    if (!existsSync(abs)) throw new Error(`path does not exist: ${args.path}`);
    return readFileSync(abs, 'utf8');
  }
  return args.text;
}

function runCli() {
  const args = parseCli(process.argv.slice(2));
  const input = readCliInput(args);
  if (!normalizeText(input)) {
    process.stderr.write('usage: node _SYSTEM/Scripts/yuri-input-genome.mjs --text <input> [--json]\n');
    process.exit(1);
  }
  const genome = buildInputGenome(input, {
    source: 'cli',
    target: 'local',
  });
  process.stdout.write(args.json ? `${JSON.stringify(genome, null, 2)}\n` : `${genome.promptBlock}\n`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  try {
    runCli();
  } catch (err) {
    process.stderr.write(`${err?.message || err}\n`);
    process.exit(1);
  }
}
