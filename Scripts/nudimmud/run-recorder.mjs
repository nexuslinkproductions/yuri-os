import { join as joinPath } from 'node:path';

export const DEFAULT_RUN_ARTIFACTS = Object.freeze([
  'request.md',
  'output.md',
  'meta.json',
  'events.jsonl',
]);

function isPlainObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value) && Object.getPrototypeOf(value) === Object.prototype;
}

function toStringOrEmpty(value) {
  return typeof value === 'string' ? value : '';
}

function toBoolean(value) {
  return Boolean(value);
}

function toCount(value, fallback = 0) {
  return Number.isInteger(value) && value >= 0 ? value : fallback;
}

function toPlainJsonValue(value) {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') {
    return value;
  }

  if (typeof value === 'number') {
    if (!Number.isFinite(value)) {
      throw new TypeError('serializeEventForJsonl only accepts finite numbers');
    }
    return value;
  }

  if (Array.isArray(value)) {
    return value.map((item) => toPlainJsonValue(item));
  }

  if (isPlainObject(value)) {
    const output = {};
    for (const [key, item] of Object.entries(value)) {
      if (item !== undefined) {
        output[key] = toPlainJsonValue(item);
      }
    }
    return output;
  }

  throw new TypeError('serializeEventForJsonl only accepts plain JSON values');
}

function toStringList(value) {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.map((item) => (typeof item === 'string' ? item : String(item)));
}

export function createRunArtifactPaths(input = {}) {
  const baseDir = toStringOrEmpty(input.base_dir);
  const runId = toStringOrEmpty(input.run_id);
  const turnId = toStringOrEmpty(input.turn_id);
  const runDir = joinPath(baseDir, runId, turnId);

  return {
    run_dir: runDir,
    request_path: joinPath(runDir, DEFAULT_RUN_ARTIFACTS[0]),
    output_path: joinPath(runDir, DEFAULT_RUN_ARTIFACTS[1]),
    meta_path: joinPath(runDir, DEFAULT_RUN_ARTIFACTS[2]),
    events_path: joinPath(runDir, DEFAULT_RUN_ARTIFACTS[3]),
  };
}

export function serializeEventForJsonl(event) {
  return `${JSON.stringify(toPlainJsonValue(event))}\n`;
}

export function createRunRecord(input = {}) {
  const artifactPaths = isPlainObject(input.artifact_paths) ? { ...input.artifact_paths } : createRunArtifactPaths(input);

  return {
    run_id: toStringOrEmpty(input.run_id),
    turn_id: toStringOrEmpty(input.turn_id),
    created_at: typeof input.created_at === 'string' ? input.created_at : new Date().toISOString(),
    artifact_paths: artifactPaths,
    event_count: toCount(input.event_count),
    final_report_seen: toBoolean(input.final_report_seen),
    aborted: toBoolean(input.aborted),
    warnings: toStringList(input.warnings),
    errors: toStringList(input.errors),
  };
}

export function summarizeRunRecord(record) {
  const runId = isPlainObject(record) ? toStringOrEmpty(record.run_id) || 'unknown' : 'unknown';
  const turnId = isPlainObject(record) ? toStringOrEmpty(record.turn_id) || 'unknown' : 'unknown';
  const eventCount = isPlainObject(record) ? toCount(record.event_count) : 0;
  const finalReportSeen = isPlainObject(record) ? toBoolean(record.final_report_seen) : false;
  const aborted = isPlainObject(record) ? toBoolean(record.aborted) : false;
  const warnings = isPlainObject(record) ? toStringList(record.warnings).length : 0;
  const errors = isPlainObject(record) ? toStringList(record.errors).length : 0;

  return `run ${runId} | turn ${turnId} | events ${eventCount} | final ${finalReportSeen ? 'yes' : 'no'} | aborted ${aborted ? 'yes' : 'no'} | warnings ${warnings} | errors ${errors}`;
}

export function validateRunRecord(record) {
  const issues = [];

  if (!isPlainObject(record)) {
    return { ok: false, issues: ['record must be a plain object'] };
  }

  if (typeof record.run_id !== 'string') {
    issues.push('run_id must be a string');
  }

  if (typeof record.turn_id !== 'string') {
    issues.push('turn_id must be a string');
  }

  if (typeof record.created_at !== 'string' || record.created_at.length === 0) {
    issues.push('created_at must be a non-empty string');
  }

  if (!isPlainObject(record.artifact_paths)) {
    issues.push('artifact_paths must be a plain object');
  } else {
    for (const key of ['run_dir', 'request_path', 'output_path', 'meta_path', 'events_path']) {
      if (typeof record.artifact_paths[key] !== 'string' || record.artifact_paths[key].length === 0) {
        issues.push(`artifact_paths.${key} must be a non-empty string`);
      }
    }
  }

  if (!Number.isInteger(record.event_count) || record.event_count < 0) {
    issues.push('event_count must be a non-negative integer');
  }

  if (typeof record.final_report_seen !== 'boolean') {
    issues.push('final_report_seen must be a boolean');
  }

  if (typeof record.aborted !== 'boolean') {
    issues.push('aborted must be a boolean');
  }

  if (!Array.isArray(record.warnings) || record.warnings.some((item) => typeof item !== 'string')) {
    issues.push('warnings must be a string array');
  }

  if (!Array.isArray(record.errors) || record.errors.some((item) => typeof item !== 'string')) {
    issues.push('errors must be a string array');
  }

  return { ok: issues.length === 0, issues };
}
