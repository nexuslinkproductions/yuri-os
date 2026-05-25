#!/usr/bin/env node
/**
 * lane-persona-map.mjs - private dev persona overlay for Rick-lane sessions.
 *
 * Public/YURI-facing labels stay neutral. Actual show references are personal
 * dev aliases only and must remain opt-in through YURI_PRIVATE_RICK_OVERLAY=1.
 */

export const PRIVATE_PERSONA_ENV = 'YURI_PRIVATE_RICK_OVERLAY';

export const LANE_PERSONAS = Object.freeze({
  codex: Object.freeze({
    key: 'codex',
    shipLabel: 'Codex/main',
    privateAlias: 'Rick C-137',
    privateUseOnly: true,
    copyrightRisk: true,
    authority: 'final implementation, verification, arbitration, and authorized commit lane',
    role: 'core builder and verifier',
    rationale:
      'Private shorthand for the main self-made Rick: strongest fit for final technical ownership without changing YURI authority.',
  }),
  'claude-sonnet': Object.freeze({
    key: 'claude-sonnet',
    shipLabel: 'Claude/Sonnet',
    privateAlias: 'Memory Rick',
    privateUseOnly: true,
    copyrightRisk: true,
    authority: 'regular collaboration, critique, planning, and synthesis lane verified by Codex/main',
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
    authority: 'intentional escalation for hard coding, architecture, and expensive reasoning verified by Codex/main',
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
});

export function privatePersonaOverlayEnabled(env = process.env) {
  return String(env?.[PRIVATE_PERSONA_ENV] || '') === '1';
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
  const displayName = privateOverlay ? persona.privateAlias : persona.shipLabel;
  const packetRole = privateOverlay
    ? `${persona.privateAlias} (${persona.shipLabel})`
    : persona.shipLabel;

  return Object.freeze({
    ...persona,
    displayName,
    packetRole,
    privateOverlay,
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
