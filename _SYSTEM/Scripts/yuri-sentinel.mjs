#!/usr/bin/env node

import { appendFileSync, existsSync, mkdirSync, readFileSync, renameSync, statSync, writeFileSync } from 'node:fs';
// semantic-memory/palace retrieval retired 2026-05-29
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '../..');  // Scripts/ → _SYSTEM/ → repo root
const STATE_DIR = path.join(REPO_ROOT, '.claude', 'state');
const YURI_SENTINEL_LEARNING_DIR = path.join(REPO_ROOT, '.claude', 'yuri-sentinel', 'learning');

const PATHS = {
  plan: path.join(STATE_DIR, 'pulse-plan.json'),
  bus: path.join(STATE_DIR, 'pulse-bus.json'),
  hypotheses: path.join(YURI_SENTINEL_LEARNING_DIR, 'hypotheses.json'),
  githubTrending: path.join(YURI_SENTINEL_LEARNING_DIR, 'github-trending.json'),
  synthesis: path.join(REPO_ROOT, '.claude', 'yuri-sentinel', 'learning', 'synthesis.jsonl'),
  heartbeat: path.join(STATE_DIR, 'yuri-sentinel-state.json'),
  vaultLogDir: path.join(STATE_DIR, 'pulse-vault-log'),
  // semantic-memory/palace retrieval retired 2026-05-29
};

const SENTINEL_HEALTH_URL = 'http://localhost:18789/health';
const FETCH_TIMEOUT_MS = 2000;
const NEURON_LOOP_MAX_AGE_HOURS = 25;
const KNOWLEDGE_SCOUT_MAX_AGE_HOURS = 23;
// semantic-memory/palace retrieval retired 2026-05-29

function oneLine(value) {
  return String(value ?? '').replace(/\s+/g, ' ').trim();
}

function phaseLog(phase, status, msg) {
  console.log(`[yuri-sentinel] phase=${phase} status=${status} msg=${oneLine(msg)}`);
}

function readJson(filePath) {
  try {
    if (!existsSync(filePath)) return null;
    return JSON.parse(readFileSync(filePath, 'utf8'));
  } catch {
    return null;
  }
}

function safeStat(filePath) {
  try {
    return existsSync(filePath) ? statSync(filePath) : null;
  } catch {
    return null;
  }
}

function writeJsonAtomic(filePath, value) {
  mkdirSync(path.dirname(filePath), { recursive: true });
  const tmpPath = `${filePath}.tmp`;
  writeFileSync(tmpPath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
  renameSync(tmpPath, filePath);
}

function hoursSince(ms) {
  return (Date.now() - ms) / (60 * 60 * 1000);
}

function formatHours(hours) {
  return Number.isFinite(hours) ? hours.toFixed(1) : 'n/a';
}

function extractPlanSummary(plan) {
  if (!plan || typeof plan !== 'object') return 'plan=missing';
  const turnId = plan.turn_id ?? plan.turnId ?? plan.id ?? 'unknown';
  const tier = plan.plan?.complexityTier ?? plan.complexityTier ?? 'unknown';
  const scenario = plan.plan?.scenario ?? plan.scenario ?? 'unknown';
  return `plan turn=${turnId} tier=${tier} scenario=${scenario}`;
}

function extractBusEntries(bus) {
  if (Array.isArray(bus)) return bus;
  if (!bus || typeof bus !== 'object') return [];
  if (Array.isArray(bus.ring)) return bus.ring;
  if (Array.isArray(bus.findings)) return bus.findings;
  if (Array.isArray(bus.entries)) return bus.entries;
  return [];
}

function isCriticalEntry(entry) {
  return String(entry?.severity ?? '').toUpperCase() === 'CRITICAL';
}

function isPendingHypothesis(entry) {
  if (!entry || typeof entry !== 'object') return false;
  return entry.outcome == null && entry.validated_at == null && entry.validatedAt == null;
}

function summarizeFinding(entry) {
  const source = entry?.source ?? entry?.kind ?? 'unknown';
  const finding = entry?.finding ?? entry?.message ?? entry?.msg ?? entry?.hypothesis ?? entry?.title ?? '';
  return oneLine(`${source}: ${finding}`).slice(0, 180);
}

function summarizeHypothesis(entry) {
  const label = entry?.hypothesis ?? entry?.title ?? entry?.id ?? 'hypothesis';
  return oneLine(String(label)).slice(0, 180);
}

function addIssue(alerts, phase, severity, msg, extra = {}) {
  const issue = { phase, severity, msg, ...extra };
  alerts.push(issue);
  return issue;
}

function worstStatus(items) {
  if (items.some((item) => item.severity === 'alert')) return 'alert';
  if (items.some((item) => item.severity === 'warn')) return 'warn';
  return 'ok';
}

async function runLiveness(alerts) {
  const phase = 'liveness';
  const startedAt = Date.now();
  let timer = null;

  try {
    const controller = new AbortController();
    timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
    const response = await fetch(SENTINEL_HEALTH_URL, {
      method: 'GET',
      signal: controller.signal,
    });
    const elapsedMs = Date.now() - startedAt;
    const status = response.ok ? 'ok' : 'warn';
    const msg = `GET ${SENTINEL_HEALTH_URL} -> ${response.status} (${elapsedMs}ms)`;

    phaseLog(phase, status, msg);

    if (!response.ok) {
      addIssue(alerts, phase, 'warn', `Yuri Sentinel health returned HTTP ${response.status}`, {
        httpStatus: response.status,
        elapsedMs,
        url: SENTINEL_HEALTH_URL,
      });
    }

    return {
      status,
      msg,
      url: SENTINEL_HEALTH_URL,
      httpStatus: response.status,
      elapsedMs,
    };
  } catch (error) {
    const message = error instanceof Error
      ? (error.name === 'AbortError'
        ? `GET ${SENTINEL_HEALTH_URL} timed out after ${FETCH_TIMEOUT_MS}ms`
        : `GET ${SENTINEL_HEALTH_URL} failed: ${error.message}`)
      : `GET ${SENTINEL_HEALTH_URL} failed: ${String(error)}`;

    phaseLog(phase, 'warn', message);
    addIssue(alerts, phase, 'warn', message, { url: SENTINEL_HEALTH_URL });

    return {
      status: 'warn',
      msg: message,
      url: SENTINEL_HEALTH_URL,
      httpStatus: null,
      elapsedMs: Date.now() - startedAt,
    };
  } finally {
    if (timer) clearTimeout(timer);
  }
}

function readHealthInputs() {
  return {
    plan: readJson(PATHS.plan),
    bus: readJson(PATHS.bus),
    hypotheses: readJson(PATHS.hypotheses),
  };
}

function healthSummary({ plan, busEntries, criticalEntries, pendingHypotheses, synthesisAgeHours }) {
  const parts = [
    extractPlanSummary(plan),
    `${busEntries.length} bus entries`,
    criticalEntries.length ? `${criticalEntries.length} CRITICAL` : '0 CRITICAL',
    pendingHypotheses.length ? `${pendingHypotheses.length} pending hypotheses` : '0 pending hypotheses',
    synthesisAgeHours == null ? 'neuron-loop age=missing' : `neuron-loop age=${formatHours(synthesisAgeHours)}h`,
  ];
  return parts.join('; ');
}

function healthIssues({ plan, bus, hypotheses, criticalEntries, pendingHypotheses, synthesisAgeHours }) {
  const issues = [];

  if (!plan) {
    issues.push({ severity: 'warn', msg: 'pulse-plan unavailable' });
  }
  if (!bus) {
    issues.push({ severity: 'warn', msg: 'pulse-bus unavailable' });
  }
  if (!hypotheses) {
    issues.push({ severity: 'warn', msg: 'hypotheses unavailable' });
  }
  if (criticalEntries.length > 0) {
    issues.push({
      severity: 'alert',
      msg: `${criticalEntries.length} CRITICAL bus entries`,
      critical: criticalEntries.slice(0, 3).map(summarizeFinding),
    });
  }
  if (pendingHypotheses.length > 0) {
    issues.push({
      severity: 'warn',
      msg: `${pendingHypotheses.length} pending hypotheses not yet validated`,
      pending: pendingHypotheses.slice(0, 3).map(summarizeHypothesis),
    });
  }
  if (synthesisAgeHours == null) {
    issues.push({ severity: 'warn', msg: 'neuron-loop synthesis.jsonl missing' });
  } else if (synthesisAgeHours > NEURON_LOOP_MAX_AGE_HOURS) {
    issues.push({
      severity: 'alert',
      msg: `neuron-loop overdue (${formatHours(synthesisAgeHours)}h since synthesis.jsonl mtime)`,
      ageHours: synthesisAgeHours,
    });
  }

  return issues;
}

function collectHealthResult(alerts) {
  const { plan, bus, hypotheses } = readHealthInputs();
  const busEntries = extractBusEntries(bus);
  const criticalEntries = busEntries.filter(isCriticalEntry);
  const activeHypotheses = Array.isArray(hypotheses?.active) ? hypotheses.active : [];
  const pendingHypotheses = activeHypotheses.filter(isPendingHypothesis);
  const synthesisStat = safeStat(PATHS.synthesis);
  const synthesisAgeHours = synthesisStat ? hoursSince(synthesisStat.mtimeMs) : null;
  const issues = healthIssues({
    plan,
    bus,
    hypotheses,
    busEntries,
    criticalEntries,
    pendingHypotheses,
    synthesisAgeHours,
  });
  const status = worstStatus(issues);
  const msg = healthSummary({
    plan,
    busEntries,
    criticalEntries,
    pendingHypotheses,
    synthesisAgeHours,
  });

  phaseLog('health', status, msg);
  for (const issue of issues) {
    addIssue(alerts, 'health', issue.severity, issue.msg, {
      critical: issue.critical,
      pending: issue.pending,
      ageHours: issue.ageHours,
    });
  }

  return {
    status,
    msg,
    plan: plan
      ? {
          turn_id: plan.turn_id ?? plan.turnId ?? plan.id ?? null,
          complexityTier: plan.plan?.complexityTier ?? plan.complexityTier ?? null,
          scenario: plan.plan?.scenario ?? plan.scenario ?? null,
        }
      : null,
    bus: {
      total: busEntries.length,
      critical: criticalEntries.length,
    },
    hypotheses: {
      active: activeHypotheses.length,
      pending: pendingHypotheses.length,
    },
    neuronLoop: {
      ageHours: synthesisAgeHours,
      overdue: synthesisAgeHours != null && synthesisAgeHours > NEURON_LOOP_MAX_AGE_HOURS,
    },
  };
}

// semantic-memory/palace retrieval retired 2026-05-29

function runExternal(alerts) {
  const phase = 'external';
  try {
    const stat = safeStat(PATHS.githubTrending);
    if (!stat) {
      const msg = 'github-trending.json missing';
      phaseLog(phase, 'warn', msg);
      addIssue(alerts, phase, 'warn', msg, { file: PATHS.githubTrending });
      return {
        status: 'warn',
        msg,
        ageHours: null,
        overdue: false,
      };
    }

    const ageHours = hoursSince(stat.mtimeMs);
    const overdue = ageHours > KNOWLEDGE_SCOUT_MAX_AGE_HOURS;
    const status = overdue ? 'warn' : 'ok';
    const msg = overdue
      ? `knowledge scout overdue (${formatHours(ageHours)}h since github-trending.json mtime)`
      : `github-trending age=${formatHours(ageHours)}h`;

    phaseLog(phase, status, msg);

    if (overdue) {
      addIssue(alerts, phase, 'warn', 'knowledge scout overdue', {
        ageHours,
        file: PATHS.githubTrending,
      });
    }

    return {
      status,
      msg,
      ageHours,
      overdue,
    };
  } catch (error) {
    const message = error instanceof Error ? `external check failed: ${error.message}` : `external check failed: ${String(error)}`;
    phaseLog(phase, 'warn', message);
    addIssue(alerts, phase, 'warn', message, { file: PATHS.githubTrending });
    return {
      status: 'warn',
      msg: message,
      ageHours: null,
      overdue: false,
    };
  }
}

function writeVaultAlertSection(alerts, runAt) {
  if (alerts.length === 0) return null;

  const date = runAt.slice(0, 10);
  const target = path.join(PATHS.vaultLogDir, `${date}.md`);
  mkdirSync(PATHS.vaultLogDir, { recursive: true });

  const sectionLines = [
    '## Yuri Sentinel Alerts',
    `- run: ${runAt}`,
    ...alerts.map((alert) => `- phase=${alert.phase} severity=${alert.severity} msg=${oneLine(alert.msg)}`),
  ];

  const prefix = existsSync(target) ? '\n\n' : '';
  appendFileSync(target, `${prefix}${sectionLines.join('\n')}\n`, 'utf8');
  return target;
}

async function main() {
  const runAt = new Date().toISOString();
  const alerts = [];

  const phases = {
    liveness: await runLiveness(alerts),
    health: collectHealthResult(alerts),
    // semantic-memory/palace retrieval retired 2026-05-29
    external: runExternal(alerts),
  };

  const heartbeat = {
    lastRun: runAt,
    phases,
    alerts,
  };

  try {
    writeJsonAtomic(PATHS.heartbeat, heartbeat);
    phaseLog('heartbeat', 'ok', `state written to ${PATHS.heartbeat}`);
  } catch (error) {
    const message = error instanceof Error ? `heartbeat write failed: ${error.message}` : `heartbeat write failed: ${String(error)}`;
    phaseLog('heartbeat', 'warn', message);
  }

  if (alerts.length > 0) {
    try {
      const target = writeVaultAlertSection(alerts, runAt);
      phaseLog('notification', 'ok', `appended ${alerts.length} alerts to ${target}`);
    } catch (error) {
      const message = error instanceof Error ? `notification write failed: ${error.message}` : `notification write failed: ${String(error)}`;
      phaseLog('notification', 'warn', message);
    }
  }
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  phaseLog('bootstrap', 'warn', `unexpected sentinel failure: ${message}`);
}).finally(() => {
  process.exit(0);
});
