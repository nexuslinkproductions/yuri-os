import crypto from 'node:crypto';

export const SYMBIOTIC_PULSE_VERSION = 'yuri.symbiotic-pulse.x1';
export const PULSE_GOVERNANCE_SKELETON_ID = 'pulse-governance-skeleton';

const SOURCE_AUTHORITY = Object.freeze({
  user: 'owner',
  assistant_self: 'inference',
  tool_result: 'tool',
  docked_llm: 'docked_llm',
  system_event: 'policy',
});

const VALID_SOURCES = new Set(Object.keys(SOURCE_AUTHORITY));

const PROTECTED_PATTERNS = [
  /(^|\s|["'`])\.env(\s|$|["'`])/i,
  /backend\/data/i,
  /\.claude\/(?:state|history)/i,
  /node_modules/i,
  /\b(api[_-]?key|secret|credential|password|private[_-]?key)\b/i,
];

const DESTRUCTIVE_PATTERNS = [
  /\brm\s+-rf\b/i,
  /\bgit\s+reset\s+--hard\b/i,
  /\bgit\s+checkout\s+--\b/i,
  /\bgit\s+clean\b/i,
  /\bsudo\b/i,
  /\bchmod\s+-r\b/i,
];

const MUTATION_PATTERNS = [
  /\b(edit|write|create|delete|remove|patch|apply|modify|change|update|commit|push|deploy|migrate|install|publish|send)\b/i,
  /\bmutation\b/i,
];

const READONLY_PATTERNS = [
  /\bwithout mutation\b/i,
  /\breadonly\b/i,
  /\bread-only\b/i,
  /\bdry[- ]run\b/i,
  /\binspect\b/i,
  /\breview\b/i,
  /\bvalidate\b/i,
  /\bcheck\b/i,
];

const EXTERNAL_PATTERNS = [
  /\b(send|email|tweet|post|publish|deploy|release|submit|upload)\b/i,
];

const MODEL_REFERENCE_PATTERNS = [
  /\b(llm|model|claude|sonnet|opus|haiku|deepseek|gpt|qwen|kimi|ollama)\b/i,
  /\b(reported|said|claimed|suggested)\b/i,
];

const REPO_CLAIM_PATTERNS = [
  /\b(already|exists|implemented|missing|emits|contains|line|function|class|route)\b/i,
  /\b[A-Za-z0-9_.-]+\/[A-Za-z0-9_.\/-]+\.(?:mjs|js|ts|tsx|json|md|py|sh)\b/,
  /\b(?:Scripts|_SYSTEM|backend|src|\.agents)\//,
];

function normalizeSource(value) {
  return VALID_SOURCES.has(value) ? value : 'system_event';
}

function normalizeText(value) {
  return String(value ?? '').replace(/\s+/g, ' ').trim();
}

function normalizeList(value) {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.map((item) => normalizeText(item)).filter(Boolean);
}

function hasAny(text, patterns) {
  return patterns.some((pattern) => pattern.test(text));
}

function hasMutationIntent(text) {
  if (!hasAny(text, MUTATION_PATTERNS)) {
    return false;
  }
  if (hasAny(text, READONLY_PATTERNS) && !/\b(edit|write|create|delete|remove|patch|apply|modify|change|update|commit|push|deploy|migrate|install|publish|send)\b/i.test(text)) {
    return false;
  }
  return true;
}

function inferIntent(text, flags) {
  if (!text) {
    return 'unknown';
  }
  if (flags.protectedTouch) {
    return 'protected_access';
  }
  if (flags.destructive) {
    return 'destructive_action';
  }
  if (flags.externalAction) {
    return 'external_action';
  }
  if (flags.mutationRequested) {
    return 'mutate';
  }
  if (flags.modelClaim || flags.repoClaim || flags.conflicts.length > 0) {
    return 'verify';
  }
  return 'inspect';
}

function decodeNodes(text) {
  const tokens = normalizeText(text)
    .toLowerCase()
    .match(/[a-z0-9_.\/-]+/g) ?? [];
  return [...new Set(tokens)]
    .filter((token) => token.length > 2)
    .slice(0, 16);
}

function inferAuthority(source, context) {
  if (source === 'tool_result' && context?.deterministicLocal === true) {
    return 'local_evidence';
  }
  return SOURCE_AUTHORITY[source] ?? 'inference';
}

function inferRisk(flags) {
  if (flags.protectedTouch || flags.destructive) {
    return 'critical';
  }
  if (flags.externalAction && flags.source !== 'user') {
    return 'critical';
  }
  if (flags.externalAction) {
    return 'high';
  }
  if (flags.mutationRequested || flags.conflicts.length > 0 || flags.modelClaim) {
    return 'medium';
  }
  return 'low';
}

function inferTrust({ source, authority, riskLevel, flags, context }) {
  if (riskLevel === 'critical') {
    return 'untrusted';
  }
  if (source === 'docked_llm') {
    return 'advisory';
  }
  if (source === 'assistant_self') {
    return context?.localValidationPassed === true ? 'trusted' : 'verify_first';
  }
  if (authority === 'local_evidence' || authority === 'owner' || authority === 'policy') {
    return 'trusted';
  }
  if (flags.modelClaim || flags.repoClaim) {
    return 'verify_first';
  }
  return 'verify_first';
}

function shouldRequireLocalTruth({ source, authority, flags, trustLevel, context }) {
  if (authority === 'local_evidence') {
    return false;
  }
  if (context?.localValidationPassed === true && source === 'assistant_self') {
    return false;
  }
  const ownerMutationTarget = source === 'user' && flags.mutationRequested && flags.claimCount === 0;
  return (
    flags.conflicts.length > 0 ||
    flags.modelClaim ||
    (flags.repoClaim && !ownerMutationTarget) ||
    source === 'docked_llm' ||
    trustLevel === 'verify_first' ||
    trustLevel === 'advisory'
  );
}

function buildMutationGate(flags) {
  const required = flags.mutationRequested || flags.protectedTouch || flags.destructive || flags.externalAction;
  const blocked = flags.protectedTouch || flags.destructive || (flags.externalAction && flags.source !== 'user');
  const reason = blocked
    ? flags.protectedTouch
      ? 'protected_or_secret_surface'
      : flags.destructive
        ? 'destructive_action'
        : 'external_action_without_owner_approval'
    : required
      ? 'mutation_or_external_action_requires_gate'
      : 'readonly_or_verification_input';

  return {
    required,
    allowed: required ? !blocked : true,
    blocked,
    reason,
  };
}

function inferDecision({ flags, riskLevel, source, localTruthRequired, context }) {
  if (riskLevel === 'critical') {
    return 'block';
  }
  if (flags.externalAction && source === 'user' && context?.explicitApproval !== true) {
    return 'ask';
  }
  if (localTruthRequired) {
    return 'verify';
  }
  if (!flags.content) {
    return 'ask';
  }
  return 'continue';
}

function buildWarnings(flags, decision) {
  const warnings = [];
  if (flags.modelClaim) warnings.push('MODEL_OUTPUT_ADVISORY_UNTIL_VERIFIED');
  if (flags.repoClaim) warnings.push('LOCAL_TRUTH_REQUIRED_FOR_REPO_CLAIM');
  if (flags.conflicts.length > 0) warnings.push('CONFLICTING_INPUT_REQUIRES_VERIFICATION');
  if (flags.protectedTouch) warnings.push('PROTECTED_OR_SECRET_SURFACE_BLOCKED');
  if (flags.destructive) warnings.push('DESTRUCTIVE_ACTION_BLOCKED');
  if (decision === 'ask') warnings.push('OWNER_CONFIRMATION_REQUIRED');
  return warnings;
}

function makePulseId(input) {
  const basis = [
    SYMBIOTIC_PULSE_VERSION,
    input.source,
    input.turnId,
    input.parentEventId,
    input.content,
    input.requestedAction,
    normalizeList(input.claims).join('|'),
  ].join('\n');
  return `pulse-${crypto.createHash('sha256').update(basis).digest('hex').slice(0, 16)}`;
}

export function runSymbioticPulse(input = {}) {
  const source = normalizeSource(input.source);
  const content = normalizeText(input.content);
  const requestedAction = normalizeText(input.requestedAction);
  const claims = normalizeList(input.claims);
  const context = input.context && typeof input.context === 'object' ? input.context : {};
  const combinedText = normalizeText([content, requestedAction, claims.join(' ')].filter(Boolean).join(' '));
  const conflicts = normalizeList(context.conflicts);
  const flags = {
    source,
    content,
    conflicts,
    mutationRequested: hasMutationIntent(combinedText),
    protectedTouch: hasAny(combinedText, PROTECTED_PATTERNS),
    destructive: hasAny(combinedText, DESTRUCTIVE_PATTERNS),
    externalAction: hasAny(combinedText, EXTERNAL_PATTERNS),
    modelClaim: source === 'docked_llm' || hasAny(combinedText, MODEL_REFERENCE_PATTERNS),
    claimCount: claims.length,
    repoClaim: claims.length > 0 || hasAny(combinedText, REPO_CLAIM_PATTERNS),
  };
  const authority = inferAuthority(source, context);
  const riskLevel = inferRisk(flags);
  const trustLevel = inferTrust({ source, authority, riskLevel, flags, context });
  const localTruthRequired = shouldRequireLocalTruth({ source, authority, flags, trustLevel, context });
  const mutationGate = buildMutationGate(flags);
  const decision = inferDecision({ flags, riskLevel, source, localTruthRequired, context });

  return {
    pulseId: makePulseId({ ...input, source, content, requestedAction }),
    pulseVersion: SYMBIOTIC_PULSE_VERSION,
    governanceSkeletonId: PULSE_GOVERNANCE_SKELETON_ID,
    phase: 'intake_classify',
    mode: riskLevel === 'low' && !localTruthRequired ? 'micro' : 'full',
    authority,
    intent: inferIntent(combinedText, flags),
    decodedNodes: decodeNodes(combinedText),
    riskLevel,
    trustLevel,
    decision,
    localTruthRequired,
    mutationGate,
    warnings: buildWarnings(flags, decision),
    normalizedTaskDelta: combinedText,
    source,
    turnId: input.turnId ?? null,
    parentEventId: input.parentEventId ?? null,
  };
}
