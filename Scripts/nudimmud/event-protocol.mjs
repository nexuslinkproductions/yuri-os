const EVENT_TYPE_LIST = [
  'RUN_CREATED',
  'REQUEST_CAPTURED',
  'CONTRACT_COMPILED',
  'PREFLIGHT_RESULT',
  'PROMPT_PACKAGED',
  'MODEL_DISPATCHED',
  'MODEL_STREAM_STARTED',
  'MODEL_STREAM_DELTA',
  'ROUTE_LOG',
  'ACTIVITY_TICK',
  'TOOL_EVENT',
  'VALIDATION_RESULT',
  'TRANSCRIPT_SAVED',
  'FINAL_REPORT',
  'RUN_ABORTED',
  'SPLIT_REQUIRED',
  'BUDGET_WARNING',
  'GATE_EVALUATION',
  'EVIDENCE_PACK_COMPILED',
  'GRAPH_COMPILED',
  'NODE_DISPATCHED',
  'NODE_VERIFIED',
  'PROMOTION_DECISION',
  'UI_RENDER_TICK',
];

const SEVERITY_LIST = ['info', 'notice', 'warning', 'error', 'critical'];

const DISPLAY_HINT_LIST = ['hidden', 'compact', 'normal', 'expanded'];

export const EVENT_TYPES = Object.freeze(
  EVENT_TYPE_LIST.reduce((acc, type) => {
    acc[type] = type;
    return acc;
  }, {}),
);

export const SEVERITIES = Object.freeze(
  SEVERITY_LIST.reduce((acc, severity) => {
    acc[severity.toUpperCase()] = severity;
    return acc;
  }, {}),
);

export const DISPLAY_HINTS = Object.freeze(
  DISPLAY_HINT_LIST.reduce((acc, hint) => {
    acc[hint.toUpperCase()] = hint;
    return acc;
  }, {}),
);

export function isKnownEventType(type) {
  return Object.prototype.hasOwnProperty.call(EVENT_TYPES, type);
}

export function createEvent(input = {}) {
  return {
    event_id: input.event_id ?? null,
    run_id: input.run_id ?? null,
    turn_id: input.turn_id ?? null,
    timestamp: input.timestamp ?? new Date().toISOString(),
    type: input.type ?? null,
    model: input.model ?? null,
    lane: input.lane ?? null,
    phase: input.phase ?? null,
    severity: input.severity ?? SEVERITIES.INFO,
    display_hint: input.display_hint ?? DISPLAY_HINTS.NORMAL,
    token_estimate: input.token_estimate ?? null,
    workflow_budget_state: input.workflow_budget_state ?? null,
    transcript_paths: Array.isArray(input.transcript_paths)
      ? [...input.transcript_paths]
      : [],
    local_truth_required: input.local_truth_required ?? false,
    source_authority: input.source_authority ?? null,
    parent_event_id: input.parent_event_id ?? null,
    payload: input.payload ?? {},
  };
}
