import { EVENT_TYPES } from './event-protocol.mjs';

function normalizeList(value) {
  return Array.isArray(value) ? [...value] : [];
}

function buildStatusLine(state) {
  const parts = [
    state.run_id ? `run ${state.run_id}` : 'run unset',
    state.turn_id ? `turn ${state.turn_id}` : 'turn unset',
    state.phase ? `phase ${state.phase}` : 'phase unset',
  ];

  if (state.completed) {
    parts.push('completed');
  }

  if (state.errors.length > 0) {
    parts.push(`errors ${state.errors.length}`);
  } else if (state.warnings.length > 0) {
    parts.push(`warnings ${state.warnings.length}`);
  }

  return parts.join(' | ');
}

export function createInitialHarnessState(input = {}) {
  const state = {
    run_id: input.run_id ?? null,
    turn_id: input.turn_id ?? null,
    phase: input.phase ?? 'INITIAL',
    model: input.model ?? null,
    lane: input.lane ?? null,
    last_event_id: input.last_event_id ?? null,
    last_turn_id: input.turn_id ?? null,
    transcript_paths: normalizeList(input.transcript_paths),
    token_estimate: input.token_estimate ?? 0,
    workflow_budget_state: input.workflow_budget_state ?? null,
    status_line: input.status_line ?? '',
    warnings: normalizeList(input.warnings),
    errors: normalizeList(input.errors),
    completed: input.completed ?? false,
  };

  return {
    ...state,
    status_line: state.status_line || buildStatusLine(state),
  };
}

export function reduceHarnessState(state, event) {
  const current = state ?? createInitialHarnessState();
  const next = {
    ...current,
    last_event_id: event?.event_id ?? current.last_event_id,
    last_turn_id: event?.turn_id ?? current.last_turn_id,
    run_id: event?.run_id ?? current.run_id,
    turn_id: event?.turn_id ?? current.turn_id,
    phase: event?.phase ?? current.phase,
    model: event?.model ?? current.model,
    lane: event?.lane ?? current.lane,
    transcript_paths: normalizeList(current.transcript_paths),
    token_estimate: event?.token_estimate ?? current.token_estimate,
    workflow_budget_state: event?.workflow_budget_state ?? current.workflow_budget_state,
    warnings: normalizeList(current.warnings),
    errors: normalizeList(current.errors),
    completed: current.completed,
  };

  if (Array.isArray(event?.transcript_paths) && event.transcript_paths.length > 0) {
    for (const path of event.transcript_paths) {
      if (!next.transcript_paths.includes(path)) {
        next.transcript_paths.push(path);
      }
    }
  }

  const payload = event?.payload ?? {};
  if (Array.isArray(payload.warnings)) {
    next.warnings.push(...payload.warnings);
  }
  if (Array.isArray(payload.errors)) {
    next.errors.push(...payload.errors);
  }
  if (typeof payload.status_line === 'string' && payload.status_line.length > 0) {
    next.status_line = payload.status_line;
  }

  if (
    event?.type === EVENT_TYPES.FINAL_REPORT ||
    event?.type === EVENT_TYPES.RUN_ABORTED
  ) {
    next.completed = true;
  }

  if (!next.status_line) {
    next.status_line = buildStatusLine(next);
  }

  return next;
}

export function summarizeHarnessState(state) {
  if (!state) {
    return '';
  }

  const parts = [
    state.status_line || buildStatusLine(state),
    `model ${state.model ?? 'unset'}`,
    `lane ${state.lane ?? 'unset'}`,
    `tokens ${state.token_estimate ?? 0}`,
  ];

  return parts.join(' | ');
}
