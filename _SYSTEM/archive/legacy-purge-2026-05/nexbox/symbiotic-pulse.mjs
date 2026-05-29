#!/usr/bin/env node
// nexbox/symbiotic-pulse.mjs — standalone nexbox runtime. Derived from Yuri OS symbiotic-pulse, de-coupled from YURI-OS-MUSUBI internals.

import { readFileSync } from 'node:fs';
import path from 'node:path';

const WORKSPACE_ROOT = path.resolve(process.env.NEXBOX_ROOT || process.cwd());
const NEXBOX_DIR = path.join(WORKSPACE_ROOT, process.env.NEXBOX_DIR || 'nexbox');

const lane = (kind, defaultModel, envKey, capabilities, traits = capabilities, command = '') => ({
  kind, defaultModel, envKey, capabilities, traits, command,
});

export const NATIVE_LANES = Object.freeze({
  'triage-local': lane('local', 'qwen2.5:7b', 'TRIAGE_LOCAL_MODEL', ['classification', 'small-decision', 'intent-normalization']),
  'summarize-local': lane('local', 'qwen2.5:7b', 'SUMMARIZE_LOCAL_MODEL', ['summarization', 'extraction', 'condensation']),
  'code-local': lane('local', 'qwen2.5-coder:7b', 'CODE_LOCAL_MODEL', ['code', 'patch-shape', 'debugging', 'test-repair']),
  'ollama-local': lane('local', 'qwen2.5:7b', 'OLLAMA_LOCAL_MODEL', ['private-utility', 'bounded-local-reasoning']),
  'ollama-cloud': lane('cloud', 'ollama-cloud', 'OLLAMA_CLOUD_API_KEY', ['cloud-utility']),
  ollama: lane('cloud-or-local', 'qwen2.5:7b', 'OLLAMA_API_KEY', ['utility']),
  'deepseek-v4-pro': lane('cloud', 'deepseek-reasoner', 'DEEPSEEK_API_KEY', ['deep-reasoning', 'decomposition', 'architecture-review', 'risk-review', 'deep-code-analysis']),
  'deepseek-v4-flash': lane('cloud', 'deepseek-chat', 'DEEPSEEK_API_KEY', ['fast-triage', 'condensation', 'sanity-review']),
  deepseek: lane('cloud', 'deepseek-chat', 'DEEPSEEK_API_KEY', ['reasoning', 'analysis', 'multi-step']),
  kimi: lane('cloud', 'moonshot-v1-128k', 'KIMI_API_KEY', ['long-context', 'deep-synthesis']),
  'reason-cloud': lane('cloud', 'reason-cloud', 'REASON_API_KEY', ['reasoning', 'large-model']),
  'code-cloud': lane('cloud', 'code-cloud', 'CODE_API_KEY', ['code', 'large-code-model']),
  'gemma-local': lane('local', 'gemma-2-9b', 'GEMMA_LOCAL_MODEL', ['multimodal', 'inspection']),
  'gemma-cloud': lane('cloud', 'gemma', 'GEMMA_CLOUD_API_KEY', ['multimodal', 'inspection']),
  gemma: lane('cloud-or-local', 'gemma', 'GEMMA_API_KEY', ['multimodal', 'inspection']),
  'openrouter-free': lane('cloud', 'openrouter-free', 'OPENROUTER_API_KEY', ['fallback', 'research-scout']),
  codex: lane('cloud', 'gpt-5.4-mini', 'OPENAI_API_KEY', ['executor-adjacent', 'responses', 'deep-code-reasoning']),
  'codex-mini': lane('cloud', 'gpt-5.4-mini', 'OPENAI_API_KEY', ['small-reasoning', 'responses']),
  'codex-spark': lane('cloud', 'gpt-5.4-mini', 'OPENAI_API_KEY', ['implementation', 'sandbox']),
  'gpt-oss': lane('local', 'gpt-oss-20b', 'GPT_OSS_MODEL', ['formatting', 'synthesis', 'template-generation']),
  swarm: lane('native', '', '', ['orchestration', 'fanout'], ['native', 'deterministic', 'swarm']),
  comet: lane('cloud', 'comet', 'COMET_API_KEY', ['search', 'research']),
  shell: lane('native', '', '', ['deterministic-verification', 'source-truth'], ['native', 'deterministic', 'verification']),
  tests: lane('native', '', '', ['regression-verification'], ['native', 'deterministic', 'tests']),
  git: lane('native', '', '', ['change-state', 'local-truth'], ['native', 'deterministic', 'git']),
  memory: lane('native', '', '', ['trace-ledger', 'learning-capture'], ['native', 'memory', 'trace']),
});

export const EXTERNAL_LANES = Object.freeze({
  claude: { command: process.env.CLAUDE_BIN || 'claude', kind: 'external' },
});

const LEGACY_ALIAS_PATTERNS = [
  ['council', /\bcouncil\b|model council/i], ['workhorse', /\bworkhorse\b|deepseek-workhorse/i],
  ['swarm', /@swarm|\bswarm\b|fan[- ]out|parallel/i], ['offload', /\boffload\b|btw offload this/i],
];

export function selectSteeringLane(prompt) {
  const text = normalizePrompt(prompt);
  if (!text) return 'triage-local';
  if (text.includes('/tokenmaxxing') || text.includes('tokenmaxxing')) return 'swarm';
  if (text.includes('btw offload this') || text.startsWith('offload this')) return 'swarm';
  if (text.includes('@claude') || text.includes('claude sonnet')) return 'claude';
  if (text.includes('@codex-spark') || text.includes('@spark') || text.includes('sandbox') || text.includes('isolated') || text.includes('improvement loop') || text.includes('sandbox loop') || text.includes('operational trial') || text.includes('live test') || text.includes('proving run') || text.includes('beta-readiness') || text.includes('beta readiness') || text.includes('source manifest') || text.includes('reference registry') || text.includes('section manifest') || text.includes('md-vs-html') || text.includes('control surface') || text.includes('artifact audit')) return 'codex-spark';
  if (text.includes('control plane') || text.includes('control-plane') || text.includes('graph plan') || text.includes('graph-plan') || text.includes('task graph') || text.includes('brain dump') || text.includes('durable orchestration') || text.includes('verify sanitize promote') || text.includes('sanitize promote') || text.includes('canonical state')) return 'swarm';
  if (text.includes('@swarm') || text.includes('swarm') || text.includes('fan out') || text.includes('parallel') || text.includes('compare') || text.includes('consensus')) return 'swarm';
  if (text.includes('architecture') || text.includes('review') || text.includes('audit') || text.includes('security') || text.includes('high-stakes')) return 'swarm';
  if (text.includes('protocol') || text.includes('ide') || text.includes('agent harness') || text.includes('workflow') || text.includes('routing') || text.includes('offload')) return 'swarm';
  if (text.includes('@ollama-local') || text.includes('ollama local')) return 'ollama-local';
  if (text.includes('@ollama-cloud') || text.includes('ollama cloud')) return 'ollama-cloud';
  if (text.includes('@ollama') || text.includes('use ollama') || text.includes('try ollama')) return 'ollama';
  if ((text.includes('local private') || text.includes('offline') || text.includes('private local')) && (text.includes('summarize') || text.includes('extract') || text.includes('triage') || text.includes('draft cleanup'))) return 'ollama-local';
  if (text.includes('cross-reference') || text.includes('cross reference') || text.includes('cross-domain') || text.includes('cross domain') || text.includes('canonical tag') || text.includes('canonical tags') || text.includes('prevention rule') || text.includes('prevention rules') || text.includes('lesson index') || text.includes('bridge map') || text.includes('alias map')) return 'summarize-local';
  if (text.includes('@kimi') || text.includes('kimi') || text.includes('moonshot') || text.includes('cloud')) return 'kimi';
  if (text.includes('@code-local') || text.includes('implement') || text.includes('build') || text.includes('compile') || text.includes('typescript') || text.includes('javascript') || text.includes('function') || text.includes('class') || text.includes('test') || text.includes('debug') || text.includes('fix') || text.includes('refactor') || text.includes('patch') || text.includes('coding')) return 'code-local';
  if (text.includes('@deepseek') || text.includes('deepseek') || text.includes('reasoning') || text.includes('analysis') || text.includes('multi-step')) return 'deepseek';
  if (text.includes('@qwen') || text.includes('summarize') || text.includes('summary') || text.includes('condense') || text.includes('extract') || text.includes('extraction') || text.includes('triage') || text.includes('general task')) return text.includes('summarize') || text.includes('summary') || text.includes('condense') ? 'summarize-local' : 'triage-local';
  if (text.includes('@gpt-oss') || text.includes('gpt-oss') || text.includes('format') || text.includes('formatting') || text.includes('template') || text.includes('ui ') || text.includes('frontend') || text.includes('design') || text.includes('react') || text.includes('interface')) return 'gpt-oss';
  if (text.includes('@comet')) return 'comet';
  return 'triage-local';
}

export function dispatch(input = '', options = {}) {
  const intent = normalizePrompt(typeof input === 'string' ? input : input.intent || input.prompt || input.text || '');
  const steeringLane = selectSteeringLane(intent);
  const context = analyzeIntent(intent, steeringLane, options);
  const stages = buildStages(context);
  return {
    schema_version: 1,
    contract: 'SymbioticPulse',
    cwd: WORKSPACE_ROOT,
    configDir: NEXBOX_DIR,
    mode: options.mode || 'plan',
    intent,
    steeringLane,
    lanes: { native: NATIVE_LANES, external: EXTERNAL_LANES },
    route: { lane: steeringLane, dispatch: steeringLane === 'swarm' ? 'parallel-fan-out' : 'single-lane' },
    selectedLanes: unique(stages.flatMap((stage) => stage.laneIds).filter((id) => id !== 'main-session')),
    stages,
    trace: { aliasInputs: detectLegacyAliases(intent), signals: context.signals, highReasoning: context.highReasoning },
  };
}

function analyzeIntent(intent, steeringLane, options) {
  const text = intent.toLowerCase();
  const signals = [];
  for (const [signal, pattern] of [['campaign', /campaign|large|broad|multi|orchestrat|symbiotic|pulse|arsenal|braindump|brain dump/], ['code', /code|implement|debug|test|patch|refactor|typescript|javascript|backend|frontend|api/], ['docs', /summarize|summary|extract|document|docs|notes|brief|report|rewrite|presentation/], ['research', /latest|current|today|web|research|citation|source|market|competitor|anthropic|tencent/], ['design', /design|ui|ux|frontend|interface|visual|layout|brand|animated|animation|graph|deck/], ['risk', /risk|security|audit|architecture|protocol|policy|governance|high-stakes/], ['private', /private|offline|local-only|local only|sensitive/], ['multimodal', /image|screenshot|vision|multimodal|pdf|diagram/]]) if (pattern.test(text)) signals.push(signal);
  if (!signals.length) signals.push(steeringLane || 'general');
  return { signals, code: signals.includes('code'), docs: signals.includes('docs'), research: signals.includes('research'), design: signals.includes('design'), risk: signals.includes('risk'), private: signals.includes('private'), multimodal: signals.includes('multimodal'), highReasoning: signals.some((signal) => ['campaign', 'risk', 'research'].includes(signal)) || options.forceHighReasoning || ['swarm', 'deepseek-v4-pro', 'kimi'].includes(steeringLane) };
}

function buildStages(context) {
  const stages = [];
  const classLane = firstAvailable(['triage-local', 'summarize-local', 'deepseek-v4-flash', 'deepseek']);
  stages.push(stage('intake_classify', 'intent-normalization', ['triage-local', 'summarize-local', 'deepseek-v4-flash', 'deepseek'], classLane));
  if (context.highReasoning) stages.push(stage('campaign_decompose', 'deep-decomposition', ['deepseek-v4-pro', 'kimi', 'deepseek'], firstAvailable(['deepseek-v4-pro', 'kimi', 'deepseek'])));
  const specialistCandidates = unique([...(context.code ? ['code-local', 'deepseek-v4-pro', 'code-cloud'] : []), ...(context.docs ? ['summarize-local', 'deepseek-v4-flash', 'gpt-oss'] : []), ...(context.research ? ['openrouter-free', 'deepseek-v4-flash', 'kimi'] : []), ...(context.design ? ['gpt-oss', 'gemma', 'gemma-cloud'] : []), ...(context.risk ? ['deepseek-v4-pro', 'claude', 'kimi'] : []), ...(context.private ? ['ollama-local', 'triage-local'] : []), ...(context.multimodal ? ['gemma-local', 'gemma-cloud', 'gemma'] : []), 'deepseek-v4-pro', 'deepseek-v4-flash']);
  stages.push(stage('specialist_fanout', 'bounded-specialist-work', specialistCandidates, firstAvailable(specialistCandidates)));
  stages.push(stage('verify_local_truth', 'deterministic-verification', ['shell', 'tests', 'git'], 'main-session', true));
  stages.push(stage('merge_learn', 'reduce-and-learn', ['main-session', 'memory'], 'main-session', true));
  return stages;
}

function stage(id, capability, candidates, laneId, nativeOnly = false) { return { id, capability, candidates, laneIds: laneId ? [laneId] : [], nativeOnly }; }
function firstAvailable(candidates) { return candidates.find((id) => id === 'main-session' || laneAvailable(id)) || ''; }
function laneAvailable(id) { if (id === 'main-session') return true; if (EXTERNAL_LANES[id]) return !!EXTERNAL_LANES[id].command; const entry = NATIVE_LANES[id]; if (!entry) return false; if (entry.kind === 'native') return true; if (entry.kind === 'local' || entry.kind === 'cloud') return !!entry.defaultModel || !!process.env[entry.envKey || '']; return !!entry.defaultModel || !!process.env[entry.envKey || '']; }
function detectLegacyAliases(intent) { const detected = String(process.env.PULSE_LEGACY_ALIAS || '').split(',').map((value) => value.trim()).filter(Boolean); for (const [id, pattern] of LEGACY_ALIAS_PATTERNS) if (pattern.test(intent)) detected.push(id); return unique(detected); }
function normalizePrompt(value) { return String(value || '').replace(/\s+/g, ' ').trim().toLowerCase(); }
function unique(values) { return [...new Set((values || []).filter(Boolean))]; }
function escapeRegex(value) { return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }
export default dispatch;

function selfCheck() {
  const sample = dispatch('large campaign to refactor backend code, summarize docs, and review architecture risk', { mode: 'check' });
  const source = readFileSync(new URL(import.meta.url), 'utf8');
  if ('model' in EXTERNAL_LANES.claude) throw new Error('claude lane must not declare model');
  if (sample.steeringLane !== 'swarm') throw new Error('swarm steering mismatch');
  if (!sample.selectedLanes.includes('triage-local')) throw new Error('triage lane missing');
  const forbidden = [['api', 'anthropic'].join('.'), ['claude', 'sonnet'].join('-'), ['claude', 'haiku'].join('-'), ['claude', 'opus'].join('-')];
  if (new RegExp(forbidden.map(escapeRegex).join('|'), 'i').test(source)) throw new Error('forbidden anthropic strings found');
  return { ok: true, root: WORKSPACE_ROOT, configDir: NEXBOX_DIR, steeringLane: sample.steeringLane, selectedLanes: sample.selectedLanes };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const argv = process.argv.slice(2);
  if (argv.includes('--self-check')) {
    process.stdout.write(`${JSON.stringify(selfCheck(), null, 2)}\n`);
  } else {
    const mode = argv[0] === 'observe' ? 'observe' : 'plan';
    const intent = argv.filter((arg) => arg !== 'plan' && arg !== 'observe').join(' ');
    process.stdout.write(`${JSON.stringify(intent ? dispatch(intent, { mode }) : { usage: 'node nexbox/symbiotic-pulse.mjs [plan|observe] "<intent>"' }, null, 2)}\n`);
  }
}
