export const DEFAULT_STATUS_LIMITS = Object.freeze({
  model_context_window: 1000000,
  workflow_budget_target: 15000,
  workflow_budget_hard: 40000,
  compact_max_chars: 220,
  busy_max_chars: 200,
});

function isPlainObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value) && Object.getPrototypeOf(value) === Object.prototype;
}

function toStringOrEmpty(value) {
  return typeof value === 'string' ? value : '';
}

function toMode(value) {
  return typeof value === 'string' && value.length > 0 ? value : 'normal';
}

function toCount(value, fallback = 0) {
  return Number.isInteger(value) && value >= 0 ? value : fallback;
}

function toBoolean(value) {
  return Boolean(value);
}

function toStringList(value) {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.map((item) => (typeof item === 'string' ? item : String(item)));
}

function clampLine(text, limit) {
  if (typeof text !== 'string' || text.length <= limit) {
    return text;
  }

  return `${text.slice(0, Math.max(0, limit - 1))}…`;
}

function percent(value, hardLimit) {
  if (!Number.isFinite(value) || !Number.isFinite(hardLimit) || hardLimit <= 0) {
    return 0;
  }

  return Math.max(0, Math.round((value / hardLimit) * 100));
}

function budgetState(used, target, hard) {
  if (used >= hard) {
    return 'hard_exceeded';
  }

  if (used >= target) {
    return 'warn';
  }

  return 'ok';
}

export function createStatusSnapshot(input = {}) {
  const modelContextWindow = toCount(input.model_context_window, DEFAULT_STATUS_LIMITS.model_context_window);
  const workflowBudgetTarget = toCount(input.workflow_budget_target, DEFAULT_STATUS_LIMITS.workflow_budget_target);
  const workflowBudgetHard = toCount(input.workflow_budget_hard, DEFAULT_STATUS_LIMITS.workflow_budget_hard);
  const workflowBudgetUsed = toCount(input.workflow_budget_used);
  const tokenEstimate = toCount(input.token_estimate);

  return {
    run_id: toStringOrEmpty(input.run_id),
    turn_id: toStringOrEmpty(input.turn_id),
    model: toStringOrEmpty(input.model),
    lane: toStringOrEmpty(input.lane),
    phase: toStringOrEmpty(input.phase),
    mode: toMode(input.mode),
    token_estimate: tokenEstimate,
    model_context_window: modelContextWindow,
    workflow_budget_target: workflowBudgetTarget,
    workflow_budget_hard: workflowBudgetHard,
    workflow_budget_used: workflowBudgetUsed,
    tokenmaxxing_state: toStringOrEmpty(input.tokenmaxxing_state),
    last_turn_id: toStringOrEmpty(input.last_turn_id),
    last_transcript_path: toStringOrEmpty(input.last_transcript_path),
    warnings: toStringList(input.warnings),
    errors: toStringList(input.errors),
    completed: toBoolean(input.completed),
    elapsed_seconds: toCount(input.elapsed_seconds),
    output_chars: toCount(input.output_chars),
    last_chunk_hint: toStringOrEmpty(input.last_chunk_hint),
    no_output_hint: toStringOrEmpty(input.no_output_hint),
  };
}

export function renderCompactStatusLine(snapshot) {
  const state = isPlainObject(snapshot) ? snapshot : createStatusSnapshot();
  const parts = [];

  if (state.run_id) parts.push(`run ${state.run_id}`);
  if (state.turn_id) parts.push(`turn ${state.turn_id}`);
  if (state.model) parts.push(`model ${state.model}`);
  if (state.lane) parts.push(`lane ${state.lane}`);
  parts.push(`mode ${state.mode || 'normal'}`);
  parts.push(`ctx ${state.token_estimate || 0}/${state.model_context_window || DEFAULT_STATUS_LIMITS.model_context_window}`);
  parts.push(`budget ${state.workflow_budget_used || 0}/${state.workflow_budget_hard || DEFAULT_STATUS_LIMITS.workflow_budget_hard}`);
  if (state.tokenmaxxing_state) parts.push(`tmx ${state.tokenmaxxing_state}`);
  if (state.phase) parts.push(`phase ${state.phase}`);
  if (state.last_turn_id) parts.push(`last ${state.last_turn_id}`);

  return clampLine(parts.join(' | '), DEFAULT_STATUS_LIMITS.compact_max_chars);
}

export function renderBusyStatusLine(snapshot) {
  const state = isPlainObject(snapshot) ? snapshot : createStatusSnapshot();
  const parts = ['thinking'];

  if (state.phase) parts.push(`phase ${state.phase}`);
  if (Number.isInteger(state.elapsed_seconds)) parts.push(`elapsed ${state.elapsed_seconds}s`);
  if (Number.isInteger(state.output_chars)) parts.push(`output ${state.output_chars} chars`);

  const hint = state.last_chunk_hint || state.no_output_hint || (state.output_chars === 0 ? 'no-output' : '');
  if (hint) parts.push(hint);

  return clampLine(parts.join(' | '), DEFAULT_STATUS_LIMITS.busy_max_chars);
}

export function renderBudgetStatusLine(snapshot) {
  const state = isPlainObject(snapshot) ? snapshot : createStatusSnapshot();
  const used = Number.isInteger(state.workflow_budget_used) ? state.workflow_budget_used : 0;
  const hard = Number.isInteger(state.workflow_budget_hard) && state.workflow_budget_hard > 0 ? state.workflow_budget_hard : DEFAULT_STATUS_LIMITS.workflow_budget_hard;
  const target = Number.isInteger(state.workflow_budget_target) && state.workflow_budget_target > 0 ? state.workflow_budget_target : DEFAULT_STATUS_LIMITS.workflow_budget_target;
  const pct = percent(used, hard);
  const stateLabel = budgetState(used, target, hard);

  return clampLine(`budget ${used}/${hard} (${pct}%) | state ${stateLabel}`, DEFAULT_STATUS_LIMITS.busy_max_chars);
}

export function validateStatusSnapshot(snapshot) {
  const issues = [];

  if (!isPlainObject(snapshot)) {
    return { ok: false, issues: ['snapshot must be a plain object'] };
  }

  for (const key of ['run_id', 'turn_id', 'model', 'lane', 'phase', 'mode', 'tokenmaxxing_state', 'last_turn_id', 'last_transcript_path', 'last_chunk_hint', 'no_output_hint']) {
    if (typeof snapshot[key] !== 'string') {
      issues.push(`${key} must be a string`);
    }
  }

  for (const key of ['token_estimate', 'model_context_window', 'workflow_budget_target', 'workflow_budget_hard', 'workflow_budget_used', 'elapsed_seconds', 'output_chars']) {
    if (!Number.isInteger(snapshot[key]) || snapshot[key] < 0) {
      issues.push(`${key} must be a non-negative integer`);
    }
  }

  if (!Array.isArray(snapshot.warnings) || snapshot.warnings.some((item) => typeof item !== 'string')) {
    issues.push('warnings must be a string array');
  }

  if (!Array.isArray(snapshot.errors) || snapshot.errors.some((item) => typeof item !== 'string')) {
    issues.push('errors must be a string array');
  }

  if (typeof snapshot.completed !== 'boolean') {
    issues.push('completed must be a boolean');
  }

  return { ok: issues.length === 0, issues };
}
