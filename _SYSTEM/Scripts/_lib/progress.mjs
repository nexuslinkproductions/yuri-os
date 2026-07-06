import { pathToFileURL } from 'node:url';
import { appendFileSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';

const LOG_FILE = '.claude/state/progress.log';
const MAX_LINES = 200;
const KEEP_LINES = 100;

function clampProgress01(value) {
  const num = Number(value);
  if (!Number.isFinite(num)) {
    return 0;
  }
  return Math.min(1, Math.max(0, num));
}

function rotateLogIfNeeded() {
  try {
    const text = readFileSync(LOG_FILE, 'utf8');
    const lines = text.split(/\r?\n/);
    if (lines[lines.length - 1] === '') {
      lines.pop();
    }
    if (lines.length > MAX_LINES) {
      const trimmed = lines.slice(-KEEP_LINES).join('\n');
      writeFileSync(LOG_FILE, `${trimmed}\n`, 'utf8');
    }
  } catch {
    // no-op
  }
}

export function emitProgress(operation, phase, progress01, message) {
  const progress = clampProgress01(progress01);
  const percent = Math.round(progress * 100);
  const record = {
    operation,
    phase,
    progress01: progress,
    message,
    timestamp: new Date().toISOString(),
  };
  const payload = JSON.stringify(record);

  try {
    mkdirSync('.claude/state', { recursive: true });
    appendFileSync(LOG_FILE, `${payload}\n`, 'utf8');
    rotateLogIfNeeded();
  } catch {
    // no-op
  }

  process.stdout.write(
    `[PROGRESS] ${operation}:${phase} ${percent}% — ${message}\n`
  );

  const ws = process.env.PROGRESS_WEBSOCKET_URL;
  if (ws && typeof fetch === 'function') {
    try {
      void fetch(ws, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: payload,
      }).catch(() => {});
    } catch {
      // no-op
    }
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  emitProgress('ExampleOp', 'start', -0.2, 'starting');
  emitProgress('ExampleOp', 'work', 0.5, 'processing');
  emitProgress('ExampleOp', 'done', 1.2, 'completed');
}
