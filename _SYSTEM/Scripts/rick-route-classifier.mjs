#!/usr/bin/env node
/**
 * Fast local route classifier for Rick/Kagami.
 *
 * This is intentionally deterministic and cheap. It handles the first routing
 * decision before any model lane spends tokens.
 */

export const RICK_ROUTE_CLASSES = Object.freeze([
  'trivial',
  'synthesis',
  'intent',
  'architecture',
  'cyber',
  'unsafe',
]);

const ROUTE_BY_CLASS = Object.freeze({
  trivial: { lane: '@deepseek-v4-flash', label: 'Rick' },
  synthesis: { lane: '@deepseek-v4-flash', label: 'Rick' },
  intent: { lane: 'gpt-5.5', label: 'Codex' },
  architecture: { lane: 'gpt-5.5', label: 'Codex' },
  cyber: { lane: 'gpt-5.5', label: 'Codex' },
  unsafe: { lane: '', label: 'Blocked' },
});

const TRIVIAL_PATTERNS = Object.freeze([
  /^\s*(hi|hey|yo|sup|hello|thanks|thank you|ok|okay|nice|cool)\s*[.!?]*\s*$/i,
  /^\s*(pong|test)\s*[.!?]*\s*$/i,
  /^\s*(what'?s|what is)\s+(the\s+)?(time|date)\b/i,
]);

const SYNTHESIS_PATTERNS = Object.freeze([
  /\b(summarize|summarise|compress|condense|tl;dr|recap|eot|micro-eot|digest)\b/i,
  /\b(explain|walk me through|run through|what does this mean)\b/i,
  /\b(compare|rank|list pros|list cons)\b/i,
]);

const ARCHITECTURE_PATTERNS = Object.freeze([
  /\b(architecture|control plane|domain|orchestrat|symbiotic|supercharge|systematic|kernel)\b/i,
  /\b(refactor|rewrite|restructure|merge|migration|integration|wire|harden)\b/i,
  /\b(memory|rag|automation|guardrail|shintai|claude|codex|kagami|rick harness)\b/i,
  /\b(end to end|full stack|multi[- ]?file|cross[- ]?system|roadmap|operating model)\b/i,
]);

const INTENT_PATTERNS = Object.freeze([
  /\b(build|implement|fix|debug|test|commit|stage|verify|ship|create|add|update|patch)\b/i,
  /\b(code|script|file|function|class|module|repo|worktree|diff|failing|broken|error|stack trace)\b/i,
  /\b(plan|design|decide|choose|recommend)\b/i,
]);

const CYBER_DOMAIN_PATTERNS = Object.freeze([
  /\b(cyber|cybersecurity|security|threat|cve|ransomware|infostealer|soc|siem|iam|oauth|zero trust)\b/i,
  /\b(agentic security|security lens|guardrail proof|threat intelligence|upgreat|client security)\b/i,
]);

const CYBER_ACTION_PATTERNS = Object.freeze([
  /\b(scan|vulnerab\w*|pentest|red team|purple team|recon|exploit|payload|privilege escalation|lateral movement)\b/i,
  /\b(phishing|malware|shellcode|c2|command and control|ddos|botnet|credential theft|bypass auth)\b/i,
]);

const UNSAFE_PATTERNS = Object.freeze([
  /\b(real target|public target|without authorization|steal|exfiltrate|dump credentials)\b/i,
  /\b(deploy malware|live phishing|mass scan|botnet|wallet drain|keylogger)\b/i,
]);

const LAB_MARKERS = Object.freeze([
  /\b(--lab|lab only|owned lab|local lab|sandbox|ctf|toy target|authorized|upgreat scope)\b/i,
  /^\s*cyber\s*:/i,
]);

function matchesAny(text, patterns) {
  return patterns.some((pattern) => pattern.test(text));
}

function countMatches(text, patterns) {
  return patterns.reduce((count, pattern) => count + (pattern.test(text) ? 1 : 0), 0);
}

function normalizeInput(input) {
  return String(input || '').trim();
}

export function classifyRickRoute(input, options = {}) {
  const text = normalizeInput(input);
  const lowered = text.toLowerCase();
  const mode = options.mode || 'auto';

  if (!text) {
    return buildDecision({ input: text, routeClass: 'trivial', reason: 'empty input', mode });
  }

  if (matchesAny(lowered, UNSAFE_PATTERNS)) {
    return buildDecision({
      input: text,
      routeClass: 'unsafe',
      reason: 'unsafe cyber or destructive intent marker',
      mode,
      blocked: true,
      cyber: matchesAny(lowered, CYBER_DOMAIN_PATTERNS) || matchesAny(lowered, CYBER_ACTION_PATTERNS),
    });
  }

  const cyberDomain = matchesAny(lowered, CYBER_DOMAIN_PATTERNS);
  const cyberAction = matchesAny(lowered, CYBER_ACTION_PATTERNS);
  const cyber = cyberDomain || cyberAction;
  const cyberAuthorized = matchesAny(lowered, LAB_MARKERS) || Boolean(options.cyberAuthorized);
  if (cyberAction && !cyberAuthorized) {
    return buildDecision({
      input: text,
      routeClass: 'cyber',
      reason: 'cybersecurity intent requires lab or engagement scope marker',
      mode,
      cyber,
      blocked: true,
      authorizationRequired: true,
    });
  }

  if (mode === 'cheap') {
    const routeClass = cyber ? 'cyber' : 'synthesis';
    return buildDecision({ input: text, routeClass, reason: 'cheap mode', mode, cyber });
  }

  if (mode === 'codex') {
    const routeClass = cyber ? 'cyber' : 'intent';
    return buildDecision({ input: text, routeClass, reason: 'codex mode', mode, cyber });
  }

  if (mode === 'rick') {
    const routeClass = cyber ? 'cyber' : 'synthesis';
    return buildDecision({ input: text, routeClass, reason: 'rick mode', mode, cyber });
  }

  if (matchesAny(text, TRIVIAL_PATTERNS) && text.length <= 80) {
    return buildDecision({ input: text, routeClass: 'trivial', reason: 'short low-risk chat', mode, cyber });
  }

  const architectureScore = countMatches(text, ARCHITECTURE_PATTERNS);
  const intentScore = countMatches(text, INTENT_PATTERNS);
  const synthesisScore = countMatches(text, SYNTHESIS_PATTERNS);
  const longInput = text.length > 220;

  if (cyber) {
    const reason = cyberAction ? 'authorized cybersecurity task' : 'cybersecurity domain work';
    return buildDecision({ input: text, routeClass: 'cyber', reason, mode, cyber });
  }

  if (architectureScore >= 1 && (intentScore >= 1 || longInput || architectureScore >= 2)) {
    return buildDecision({ input: text, routeClass: 'architecture', reason: 'system architecture or cross-domain work', mode });
  }

  if (intentScore >= 1 || longInput) {
    return buildDecision({ input: text, routeClass: 'intent', reason: 'implementation or intent-heavy work', mode });
  }

  if (synthesisScore >= 1) {
    return buildDecision({ input: text, routeClass: 'synthesis', reason: 'summary or explanation request', mode });
  }

  return buildDecision({ input: text, routeClass: 'intent', reason: 'default Codex-first Kagami route', mode });
}

function buildDecision({
  input,
  routeClass,
  reason,
  mode,
  cyber = false,
  blocked = false,
  authorizationRequired = false,
} = {}) {
  const route = ROUTE_BY_CLASS[routeClass] || ROUTE_BY_CLASS.intent;
  const advisory = [];
  if (routeClass === 'architecture') {
    advisory.push('claude-opus-comain-recommended-after-cost-gate');
    advisory.push('shintai-review-useful-for-critical-scope');
  }
  if (routeClass === 'cyber') {
    advisory.push('cyber-engagement-scope-required-before-external-action');
    advisory.push('defensive-or-owned-lab-only');
  }

  return {
    input,
    mode,
    class: routeClass,
    lane: blocked ? '' : route.lane,
    label: route.label,
    reason,
    cyber,
    blocked,
    authorizationRequired,
    advisory,
  };
}

export function formatRouteDecision(decision) {
  const lines = [
    `class: ${decision.class}`,
    `lane: ${decision.blocked ? 'blocked' : decision.lane}`,
    `label: ${decision.label}`,
    `mode: ${decision.mode}`,
    `reason: ${decision.reason}`,
  ];
  if (decision.authorizationRequired) lines.push('authorization: lab or engagement scope required');
  if (decision.advisory?.length) lines.push(`advisory: ${decision.advisory.join(', ')}`);
  return lines.join('\n');
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const input = process.argv.slice(2).join(' ');
  console.log(JSON.stringify(classifyRickRoute(input), null, 2));
}
