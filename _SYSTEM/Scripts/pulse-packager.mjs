#!/usr/bin/env node

import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, '..', '..');
const PULSE_PLAN_FILE = join(REPO_ROOT, '.claude', 'state', 'pulse-plan.json');
const MEMORY_QUERY = join(REPO_ROOT, '_SYSTEM', 'Scripts', 'memory-query.mjs');
const MAX_DIGEST_CHARS = 500;

function parseArgs(argv) {
  const out = { sessionId: process.env.CLAUDE_SESSION_ID || '', prompt: '' };
  for (let i = 2; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--session-id') {
      out.sessionId = argv[i + 1] || '';
      i += 1;
      continue;
    }
    if (arg === '--prompt') {
      out.prompt = argv[i + 1] || '';
      i += 1;
    }
  }
  if (!out.sessionId) out.sessionId = randomUUID();
  return out;
}

function readPulsePlan() {
  if (!existsSync(PULSE_PLAN_FILE)) {
    process.stderr.write(`[pulse-packager] warn: missing ${PULSE_PLAN_FILE}; writing minimal packet\n`);
    return { plan: null, missing: true };
  }

  try {
    return { plan: JSON.parse(readFileSync(PULSE_PLAN_FILE, 'utf8')), missing: false };
  } catch (error) {
    process.stderr.write(`[pulse-packager] warn: failed to read pulse plan: ${error.message}; writing minimal packet\n`);
    return { plan: null, missing: true };
  }
}

function arrayOf(value) {
  return Array.isArray(value) ? value : [];
}

function compactMemoryDigest(stdout) {
  const raw = String(stdout || '').trim();
  if (!raw) return '';

  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      return parsed
        .map((item) => [item.name, item.description, item.file_path].filter(Boolean).join(' | '))
        .join('\n')
        .slice(0, MAX_DIGEST_CHARS);
    }
  } catch (_) {
    // Plain stdout is acceptable as a digest fallback.
  }

  return raw.slice(0, MAX_DIGEST_CHARS);
}

function queryMemoryDigest() {
  try {
    if (!existsSync(MEMORY_QUERY)) return '';
    const result = spawnSync('node', [MEMORY_QUERY, 'session context', '--top', '3'], {
      cwd: REPO_ROOT,
      encoding: 'utf8',
      timeout: 2000,
      stdio: ['ignore', 'pipe', 'ignore'],
    });
    if (result.error || result.status !== 0) return '';
    return compactMemoryDigest(result.stdout);
  } catch (_) {
    return '';
  }
}

function buildPulsePlan(plan) {
  const route = plan?.route || plan?.routePlan || plan?.selected_route || null;
  return {
    route,
    lane: plan?.lane || route?.lane || plan?.selected_lane || 'unknown',
    complexityTier: plan?.complexityTier || plan?.complexity_tier || plan?.tier || 'unknown',
    scenario: plan?.scenario || route?.scenario || 'unknown',
    allowed_tools: arrayOf(plan?.allowed_tools || plan?.allowedTools),
    risk_flags: arrayOf(plan?.risk_flags || plan?.riskFlags),
    required_gates: arrayOf(plan?.required_gates || plan?.requiredGates),
  };
}

function main() {
  const args = parseArgs(process.argv);
  const { plan, missing } = readPulsePlan();
  const sessionId = args.sessionId;
  const packet = {
    session_id: sessionId,
    turn_id: plan?.turn_id || plan?.turnId || process.env.PULSE_TURN_ID || randomUUID(),
    pulse_plan: buildPulsePlan(plan),
    memory_digest: queryMemoryDigest(),
    generated_at: new Date().toISOString(),
    entry_point: process.env.YURI_ENTRY_POINT || 'claude',
  };

  if (missing) {
    packet.pulse_plan.complexityTier = 'unknown';
  }

  const packetPath = `/tmp/yuri-session-packet-${sessionId}.json`;
  writeFileSync(packetPath, `${JSON.stringify(packet, null, 2)}\n`);
  process.stdout.write(`${packetPath}\n`);
}

main();
