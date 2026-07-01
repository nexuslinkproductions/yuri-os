#!/usr/bin/env node
/**
 * lane-persona-map.mjs - private dev persona overlay for Rick-lane sessions.
 *
 * Public/YURI-facing labels stay neutral. Actual show references are personal
 * dev aliases only and must remain opt-in through YURI_PRIVATE_RICK_OVERLAY=1.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

export const PRIVATE_PERSONA_ENV = 'YURI_PRIVATE_RICK_OVERLAY';
export const PRIVATE_PERSONA_ENV_ALIAS = 'YURI_PRIVATE_PERSONA_OVERLAY';

export const LANE_PERSONAS = Object.freeze({
  codex: Object.freeze({
    key: 'codex',
    shipLabel: 'Claude/Opus',
    privateAlias: 'Rick C-137',
    privateUseOnly: true,
    copyrightRisk: true,
    authority: 'core implementation, verification, and arbitration lane; advisory until local evidence verifies, owner holds commit authority',
    role: 'core builder and verifier',
    rationale:
      'Private shorthand for the main self-made Rick: strongest fit for core technical ownership on the Claude/Opus lane without changing YURI authority. Codex/main is retired as a roster lane.',
  }),
  quantum: Object.freeze({
    key: 'quantum',
    shipLabel: 'Claude/Sonnet Quantum builder',
    privateAlias: 'Quantum Rick',
    privateUseOnly: true,
    copyrightRisk: true,
    authority: 'primary Claude Sonnet builder lane for bounded drafts, plans, and advisory implementation packets verified against local evidence',
    role: 'fast builder and pressure-test lane',
    rationale:
      'Private shorthand for the active Sonnet builder lane; advisory until local evidence verifies.',
  }),
  'claude-sonnet': Object.freeze({
    key: 'claude-sonnet',
    shipLabel: 'Claude/Sonnet',
    privateAlias: 'Memory Rick',
    privateUseOnly: true,
    copyrightRisk: true,
    authority: 'regular collaboration, critique, planning, and synthesis lane verified against local evidence',
    role: 'live thought partner',
    rationale:
      'Private shorthand for a mind-space collaborator: useful for critique, recall, planning, and conversational continuity.',
  }),
  'claude-opus': Object.freeze({
    key: 'claude-opus',
    shipLabel: 'Claude/Opus',
    privateAlias: 'Rick Prime',
    privateUseOnly: true,
    copyrightRisk: true,
    authority: 'intentional escalation for hard coding, architecture, and expensive reasoning verified against local evidence',
    role: 'rare high-power escalation lane',
    rationale:
      'Private shorthand for apex-tier escalation. The reference is power-tier only; do not import villain persona or ethics.',
  }),
  deepseek: Object.freeze({
    key: 'deepseek',
    shipLabel: 'DeepSeek',
    privateAlias: 'Simple Rick',
    privateUseOnly: true,
    copyrightRisk: true,
    authority: 'persistent synthesis, EOT, and low-drama reasoning lane',
    role: 'calm distiller',
    rationale:
      'Private shorthand for stripped-down signal: useful for summaries, end-of-transmission synthesis, and cheap second-pass reasoning.',
  }),
  kagami: Object.freeze({
    key: 'kagami',
    shipLabel: 'Kagami control domain',
    privateAlias: 'Council of Ricks',
    privateUseOnly: true,
    copyrightRisk: true,
    authority: 'routing, evidence, health, and governed-autonomy coordination surface',
    role: 'coordination chamber',
    rationale:
      'Private shorthand for the lane council. YURI still owns governance; this alias is atmosphere, not authority.',
  }),
  automation: Object.freeze({
    key: 'automation',
    shipLabel: 'Automation kernel',
    privateAlias: 'Robot Rick',
    privateUseOnly: true,
    copyrightRisk: true,
    authority: 'health, capture, scheduling, and lifecycle automation support',
    role: 'mechanical lane caretaker',
    rationale:
      'Private shorthand for infrastructure that keeps sessions awake, captured, and observable.',
  }),
});

const WORKER_TO_PERSONA = Object.freeze({
  codex: 'codex',
  claude: 'claude-sonnet',
  deepseek: 'deepseek',
  kagami: 'kagami',
  automation: 'automation',
  quantum: 'quantum',
  prime: 'claude-opus',
});

export function privatePersonaOverlayEnabled(env = process.env) {
  return String(env?.[PRIVATE_PERSONA_ENV] || '') === '1' || String(env?.[PRIVATE_PERSONA_ENV_ALIAS] || '') === '1';
}

// Per-machine operator identity, mirrors brain-inject.js's loadOperatorProfile (gitignored
// .claude/operator.json -> local override, never committed, merge-clean with upstream). Absent
// profile -> null, callers fall back to the committed Rick roster.
const OPERATOR_PROFILE_FILE = path.join(REPO_ROOT, '.claude', 'operator.json');
function loadOperatorProfile() {
  try {
    if (!fs.existsSync(OPERATOR_PROFILE_FILE)) return null;
    return JSON.parse(fs.readFileSync(OPERATOR_PROFILE_FILE, 'utf8')) || null;
  } catch { return null; }
}

// Resolves the operator-driven overlay NAME for Claude lanes only ('claude-sonnet' /
// 'claude-opus'). Non-Claude lanes stay on the committed Rick roster regardless of
// operator.json, so switching operators never changes deepseek/kagami/automation aliases.
export function operatorOverlayName(key, options = {}) {
  const reader = options.operatorReader ?? loadOperatorProfile;
  const profile = reader();
  const overlay = profile?.persona?.overlay;
  if (typeof overlay !== 'string' || overlay.trim() === '') return null;
  if (key !== 'claude-sonnet' && key !== 'claude-opus') return null;
  return `${overlay.trim()}${key === 'claude-opus' ? ' · Opus' : ''}`;
}

export function claudePersonaKeyForModel(model = 'sonnet') {
  return /opus/i.test(String(model || '')) ? 'claude-opus' : 'claude-sonnet';
}

export function lanePersonaKey(worker, options = {}) {
  const workerName = String(worker || '').toLowerCase();
  if (workerName === 'claude') return claudePersonaKeyForModel(options.model);
  return WORKER_TO_PERSONA[workerName] || workerName || 'kagami';
}

export function lanePersonaForWorker(worker, options = {}) {
  const key = lanePersonaKey(worker, options);
  const persona = LANE_PERSONAS[key] || {
    key,
    shipLabel: String(worker || key || 'YURI lane'),
    privateAlias: String(worker || key || 'YURI lane'),
    privateUseOnly: false,
    copyrightRisk: false,
    authority: 'bounded YURI lane',
    role: 'bounded collaborator',
    rationale: 'Fallback lane with no private reference.',
  };
  const privateOverlay = privatePersonaOverlayEnabled(options.env || process.env);
  const opOverlay = privateOverlay ? operatorOverlayName(key, options) : null;
  const displayName = privateOverlay ? (opOverlay ?? persona.privateAlias) : persona.shipLabel;
  const packetRole = privateOverlay
    ? `${persona.privateAlias} (${persona.shipLabel})`
    : persona.shipLabel;

  return Object.freeze({
    ...persona,
    displayName,
    packetRole,
    privateOverlay,
    operatorOverlay: opOverlay || null,
  });
}

export function buildRickLaneHeader(worker, options = {}) {
  const persona = lanePersonaForWorker(worker, options);
  const lines = [
    persona.privateOverlay ? 'Rick-to-Rick live lane packet.' : 'YURI live lane packet.',
    `Lane: ${persona.shipLabel}`,
    `Display: ${persona.displayName}`,
    `Role: ${persona.role}`,
    `Authority: ${persona.authority}`,
    'Cache rule: keep this header stable; put volatile task details below the packet body separator.',
    'Safety: keep protected paths sealed; do not commit or push unless explicitly authorized.',
  ];
  if (persona.privateOverlay) {
    lines.push('Private overlay: enabled for local dev only; never use these aliases as shipping YURI names.');
  }
  return lines.join('\n');
}

export function buildRickLanePacket(worker, prompt, options = {}) {
  const body = String(prompt || '');
  if (/Rick-to-Rick live lane packet|YURI live lane packet|You are Rick/i.test(body)) return body;
  return [buildRickLaneHeader(worker, options), '', body].join('\n');
}

export function shippingPersonaAudit() {
  return Object.values(LANE_PERSONAS).map((persona) => ({
    key: persona.key,
    shipLabel: persona.shipLabel,
    privateAlias: persona.privateAlias,
    privateUseOnly: persona.privateUseOnly,
    copyrightRisk: persona.copyrightRisk,
  }));
}

export function rickRoster() {
  return Object.values(LANE_PERSONAS).map((persona) => ({
    key: persona.key,
    shipLabel: persona.shipLabel,
    privateAlias: persona.privateAlias,
    role: persona.role,
    authority: persona.authority,
    privateUseOnly: persona.privateUseOnly,
    copyrightRisk: persona.copyrightRisk,
  }));
}

export function resolveRickRosterAlias(input, options = {}) {
  const needle = normalizeAlias(input);
  if (!needle) return null;
  for (const entry of rickRoster(options)) {
    const aliases = [
      entry.key,
      entry.shipLabel,
      entry.privateAlias,
    ].filter(Boolean).map(normalizeAlias);
    if (aliases.includes(needle)) return entry;
  }
  return null;
}

function normalizeAlias(value) {
  return String(value || '').trim().toLowerCase();
}

function printRoster(command) {
  if (command === 'audit') {
    process.stdout.write(`${JSON.stringify(shippingPersonaAudit(), null, 2)}\n`);
    return;
  }
  if (command === 'table') {
    const rows = rickRoster();
    const lines = rows.map((entry) => {
      return `${entry.key}: ${entry.privateAlias} -> ${entry.shipLabel}; ${entry.role}; ${entry.authority}`;
    });
    process.stdout.write(`${lines.join('\n')}\n`);
    return;
  }
  process.stdout.write(`${JSON.stringify(rickRoster(), null, 2)}\n`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const command = process.argv[2] || 'roster';
  if (['roster', 'json', 'audit', 'table'].includes(command)) {
    printRoster(command);
  } else {
    process.stderr.write('Usage: node _SYSTEM/Scripts/lane-persona-map.mjs [roster|json|table|audit]\n');
    process.exit(1);
  }
}
