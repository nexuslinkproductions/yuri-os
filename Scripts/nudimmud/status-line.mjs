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

function toShortModeLabel(state) {
  const mode = toStringOrEmpty(state.mode).toLowerCase();
  if (state.completed || mode === 'saved') {
    return 'saved';
  }

  if (mode === 'streaming' || mode === 'thinking') {
    return mode;
  }

  if (mode === 'busy') {
    return Number.isInteger(state.output_chars) && state.output_chars > 0 ? 'streaming' : 'thinking';
  }

  return 'idle';
}

function toTokenmaxxingLabel(value) {
  const raw = toStringOrEmpty(value).trim();
  if (!raw) return '';
  if (/inactive/i.test(raw)) return '';
  if (/active/i.test(raw)) return 'tmx active';
  return `tmx ${raw.toLowerCase()}`;
}

function toSavedCue(state) {
  if (!state.completed && !state.last_transcript_path) {
    return '';
  }

  if (state.last_turn_id) {
    return `saved ${state.last_turn_id}`;
  }

  return 'saved transcript';
}

function renderStatusParts(state, { forceBusy = false } = {}) {
  const parts = [];
  const mode = forceBusy ? (Number.isInteger(state.output_chars) && state.output_chars > 0 ? 'streaming' : 'thinking') : toShortModeLabel(state);

  parts.push(`state ${mode}`);
  if (state.model) parts.push(`model ${state.model}`);
  if (state.lane) parts.push(`route ${state.lane}`);

  const showProgress = mode === 'thinking' || mode === 'streaming';
  if (showProgress && Number.isInteger(state.elapsed_seconds) && state.elapsed_seconds > 0) {
    parts.push(`elapsed ${state.elapsed_seconds}s`);
  }

  if (showProgress && Number.isInteger(state.output_chars) && state.output_chars >= 0) {
    parts.push(`output ${state.output_chars} chars`);
  }

  const tmx = toTokenmaxxingLabel(state.tokenmaxxing_state);
  if (tmx) parts.push(tmx);

  const saved = toSavedCue(state);
  if (saved) parts.push(saved);

  return parts.join(' | ');
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
  return clampLine(renderStatusParts(state), DEFAULT_STATUS_LIMITS.compact_max_chars);
}

export function renderBusyStatusLine(snapshot) {
  const state = isPlainObject(snapshot) ? snapshot : createStatusSnapshot();
  return clampLine(renderStatusParts(state, { forceBusy: true }), DEFAULT_STATUS_LIMITS.busy_max_chars);
}

export function renderBudgetStatusLine(snapshot) {
  void snapshot;
  return '';
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
