#!/usr/bin/env node
// ESM protocol-guard hook (converted from CJS 2026-05-29). The control-file list is now
// single-sourced from lane-kernel.mjs (CONTROL_FILE_PREFIXES) instead of a hardcoded copy,
// so the hook and the rest of the control plane can never drift on which core files require
// a control packet. session-state.js stays CJS and is imported via ESM default interop.

import fs from 'node:fs';
import os from 'node:os';
import ssModule from './session-state.js';
import { CONTROL_FILE_PREFIXES } from '../../_SYSTEM/Scripts/lane-kernel.mjs';

const ss = ssModule;

const MUTATION_TOOLS = new Set(['Write', 'Edit', 'MultiEdit']);
const CODEX_DISPATCH_MARKERS = [
  'codex exec',
  '_SYSTEM/Scripts/ai codex',
  '_SYSTEM/Scripts/ai @codex',
  'codex-spark',
  '_SYSTEM/Scripts/codex-offload-runner.mjs',
];
// Only fire route-plan gate when 2+ of these appear together (reduces false positives)
const HIGH_RISK_MARKERS = [
  'protocol',
  'routing',
  'promotion',
  'promote',
  'protected path',
  'protected-path',
  'high-stakes',
  'governance',
  'control plane',
  'control-plane',
  'canonical state',
  'canonical memory',
];
// Paths that warrant a control-packet even for routine edits — single-sourced from lane-kernel.
const PROTECTED_PATHS = CONTROL_FILE_PREFIXES;
const MUTATING_COMMAND_MARKERS = [
  ' apply_patch',
  ' git commit',
  ' git add',
  ' npm install',
  ' pnpm add',
  ' yarn add',
  ' tee ',
  ' sed -i',
  ' chmod ',
  ' mv ',
  ' cp ',
];
const IMPLEMENTATION_MARKERS = [
  'edit',
  'write',
  'change',
  'modify',
  'patch',
  'implement',
  'promote',
  'canonical',
  'merge',
  'audit',
  'research',
  'analyze',
  'inspect',
  'investigate',
  'gather',
  'scan',
  'survey',
];

const SHINTAI_DISPATCH_KEYWORDS = [
  'shintai',
  'full shintai',
  'full operation',
  'deploy team',
  'dispatch team',
  'shintai operation',
  'full deployment',
];

function textOf(value) {
  if (value == null) return '';
  if (typeof value === 'string') return value;
  if (Array.isArray(value)) return value.map(textOf).join('\n');
  if (typeof value === 'object') {
    return Object.values(value).map(textOf).join('\n');
  }
  return String(value);
}

function normalize(value) {
  return textOf(value).toLowerCase();
}

function includesAny(text, markers) {
  return markers.some((marker) => text.includes(marker.toLowerCase()));
}

function hasClaudeControlPacket(text) {
  const source = textOf(text);
  return source.includes('## CLAUDE CONTROL PACKET') &&
    source.includes('**Goal:**') &&
    source.includes('**Target files:**') &&
    source.includes('**Acceptance criteria:**') &&
    source.includes('**Test command:**') &&
    source.includes('**Rollback boundary:**');
}

function hasCodexTaskSpec(text) {
  const source = textOf(text);
  if (!source.includes('## CODEX TASK SPEC')) return false;
  // Require Goal + at least one target/file declaration — covers both formal and practical spec formats
  const hasGoal = source.includes('**Goal:**') || source.includes('Goal:');
  const hasTarget = source.includes('**Target files:**') ||
    source.includes('Files to modify') ||
    source.includes('Files to CREATE') ||
    source.includes('File to modify') ||
    source.includes('File to CREATE') ||
    source.includes('**Output:**');
  return hasGoal && hasTarget;
}

function hasRoutePlanEvidence(text) {
  const source = textOf(text);
  const lower = source.toLowerCase();
  // PATCH 033 — Pulse Cortex evidence paths count as route-plan evidence.
  // Any commit/tool-input that points to a stored route-plan JSON satisfies
  // the gate without needing the historical "deepseek + symbioticpulse" pair.
  const pulseCortexEvidence =
    lower.includes('.claude/state/pulse-plan.json') ||
    lower.includes('.claude/eot/pulse-cortex/route-plans/') ||
    lower.includes('pulse-cortex/route-plans');
  if (pulseCortexEvidence) return true;
  // Recognize direct Scripts/ai dispatch or offload as route-plan evidence
  if (lower.includes('_system/scripts/ai route-plan') ||
      lower.includes('_system/scripts/ai auto') ||
      lower.includes('scripts/ai route-plan') ||
      lower.includes('scripts/ai auto') ||
      lower.includes('offload.sh -m') ||
      lower.includes('scripts/offload.sh')) return true;
  return (
    lower.includes('route-plan evidence') ||
    lower.includes('scripts/ai route-plan evidence') ||
    lower.includes('symbioticpulse route-plan')
  ) &&
    lower.includes('deepseek') &&
    lower.includes('symbioticpulse');
}

function bashCommand(input) {
  return input?.tool_input?.command || '';
}

// The high-risk-marker scan must look at the ACTION surface (the command being run,
// the file being mutated, the agent prompt) — NOT free-text document content. Scanning
// content made the route-plan gate false-fire on doc/report writes and planning tools
// (TodoWrite) that merely mention "control plane" / "routing" / "promotion" in prose.
function riskSurface(input) {
  const tool = input?.tool_name || '';
  if (tool === 'Bash') return normalize(bashCommand(input));
  if (MUTATION_TOOLS.has(tool)) return normalize(input?.tool_input?.file_path || input?.tool_input?.path || '');
  if (tool === 'Agent' || tool === 'Task') {
    return normalize(`${input?.tool_input?.prompt || ''} ${input?.tool_input?.description || ''}`);
  }
  return ''; // read-only / planning tools (Read, Grep, TodoWrite, ...) never trip the routing gate
}

function isProtectedPath(input) {
  const filePath = input?.tool_input?.file_path || input?.tool_input?.path || '';
  return PROTECTED_PATHS.some(p => filePath.includes(p));
}

function needsDirectMutationWarning(input) {
  const toolName = input?.tool_name || '';
  if (MUTATION_TOOLS.has(toolName)) {
    // Only warn on protected paths — routine edits to regular files don't need a control packet
    return isProtectedPath(input);
  }
  if (toolName === 'Agent') {
    const text = normalize(input?.tool_input);
    return includesAny(text, IMPLEMENTATION_MARKERS);
  }
  if (toolName === 'Bash') {
    const command = ` ${normalize(bashCommand(input))} `;
    return includesAny(command, MUTATING_COMMAND_MARKERS);
  }
  return false;
}

const PLAN_GATE_TTL_MS = 30 * 60 * 1000;
const PLAN_GATE_MAX_WARNS = 3;

function checkPlanDispatchGate(input) {
  const toolName = input?.tool_name || '';
  const isMutation = MUTATION_TOOLS.has(toolName) ||
    (toolName === 'Bash' && includesAny(` ${normalize(bashCommand(input))} `, MUTATING_COMMAND_MARKERS));
  if (!isMutation) return null;

  try {
    const state = ss.read();
    const gate = state?.plan_dispatch_gate;
    if (!gate || !gate.armed || gate.satisfied) return null;

    if (gate.warn_count >= PLAN_GATE_MAX_WARNS || Date.now() - gate.armed_at > PLAN_GATE_TTL_MS) {
      ss.update(s => { s.plan_dispatch_gate.satisfied = true; });
      return null;
    }

    if (hasRoutePlanEvidence(textOf(input?.tool_input))) {
      ss.update(s => { s.plan_dispatch_gate.satisfied = true; });
      return null;
    }

    ss.update(s => { s.plan_dispatch_gate.warn_count = (s.plan_dispatch_gate.warn_count || 0) + 1; });
    return {
      code: 'post-plan-dispatch-required',
      message: 'ExitPlanMode approved but no route-plan dispatch — run: _SYSTEM/Scripts/ai route-plan "<task>" and dispatch to the returned lane before direct mutation. (offload priority: @gpt-5.5 → @codex-spark → ... → @claude last resort)',
    };
  } catch (_) {
    return null;
  }
}

function checkShintaiDispatch(input) {
  const toolName = input?.tool_name || '';
  if (toolName !== 'Agent') return null;
  const text = normalize(input?.tool_input);
  const isShintai = SHINTAI_DISPATCH_KEYWORDS.some(k => text.includes(k));
  if (!isShintai) return null;
  return {
    code: 'shintai-must-use-offload',
    message: 'Shintai operations MUST dispatch via offload lanes — not Claude agents. Run: bash _SYSTEM/Scripts/ai auto "<task>" or bash _SYSTEM/Scripts/offload.sh -m <lane> "<spec>". Claude agents are banned for Shintai. See _SYSTEM/memory/feedback_no_anthropic_agents.md.',
  };
}

function inspect(input) {
  // Sprint mode bypass: set YURI_SPRINT_MODE=1 in env to suppress WARNs during
  // authorized rapid-implementation sessions. Session-scoped only — does not persist.
  // Activate: export YURI_SPRINT_MODE=1
  // Deactivate: unset YURI_SPRINT_MODE (or open a new session)
  if (process.env.YURI_SPRINT_MODE === '1') return [];

  // Shintai enforcement — block before any other check
  const shintaiBlock = checkShintaiDispatch(input);
  if (shintaiBlock) return [shintaiBlock];

  const toolText = textOf(input?.tool_input);
  const lowerToolText = toolText.toLowerCase();
  const warnings = [];

  // Satisfy plan dispatch gate when route-plan evidence appears in any tool call
  try {
    const state = ss.read();
    if (state?.plan_dispatch_gate?.armed && !state.plan_dispatch_gate.satisfied &&
        hasRoutePlanEvidence(toolText)) {
      ss.update(s => { s.plan_dispatch_gate.satisfied = true; });
    }
  } catch (_) {}

  if (needsDirectMutationWarning(input) && !hasClaudeControlPacket(toolText) && !hasCodexTaskSpec(toolText)) {
    warnings.push({
      code: 'missing-control-packet',
      message: 'Direct mutation or implementation tool use needs a CLAUDE CONTROL PACKET with goal, target files, constraints, acceptance criteria, test command, and rollback boundary.',
    });
  }

  if (input?.tool_name === 'Bash' && includesAny(lowerToolText, CODEX_DISPATCH_MARKERS) && !hasCodexTaskSpec(toolText)) {
    warnings.push({
      code: 'missing-codex-task-spec',
      message: 'Codex-bound dispatch must include a valid ## CODEX TASK SPEC from CODEX_PROTOCOL.md.',
    });
  }

  // Require 2+ high-risk markers ON THE ACTION SURFACE (command/path/prompt), not in
  // document prose — prevents false fire on doc writes and planning tools.
  const riskText = riskSurface(input);
  const highRiskCount = HIGH_RISK_MARKERS.filter(m => riskText.includes(m.toLowerCase())).length;
  if (highRiskCount >= 2 && !hasRoutePlanEvidence(toolText)) {
    warnings.push({
      code: 'missing-route-plan-evidence',
      message: 'Protocol, routing, memory, promotion, protected-path, or high-stakes work needs _SYSTEM/Scripts/ai route-plan evidence plus DeepSeek and symbioticPulse advisory expectations.',
    });
  }

  const planGateWarn = checkPlanDispatchGate(input);
  if (planGateWarn) warnings.push(planGateWarn);

  return warnings;
}

function formatWarnings(warnings) {
  const items = warnings
    .map((warning) => `- ${warning.code}: ${warning.message}`)
    .join('\n');
  return `<claude-protocol-gate severity="WARN">\n${items}\nCorrective steps: add the relevant control packet/spec, run route-plan evidence for high-risk work, and verify locally before merge or promotion.\n</claude-protocol-gate>`;
}

function emitWarnings(warnings) {
  process.stdout.write(JSON.stringify({
    hookSpecificOutput: {
      hookEventName: 'PreToolUse',
      additionalContext: formatWarnings(warnings),
    },
  }) + '\n');
}


function emitBlock(warnings) {
  const items = warnings.map((w) => '- ' + w.code + ': ' + w.message).join('\n');
  process.stdout.write(JSON.stringify({
    hookSpecificOutput: {
      hookEventName: 'PreToolUse',
      permissionDecision: 'deny',
      permissionDecisionReason: 'YURI_GATE_BLOCK: critical tier — route through Yuri pipeline first.\n' + items,
    },
  }) + '\n');
}

function readSessionPacket(sessionId) {
  try {
    const p = '/tmp/yuri-session-packet-' + sessionId + '.json';
    if (!fs.existsSync(p)) return null;
    return JSON.parse(fs.readFileSync(p, 'utf8'));
  } catch (_) { return null; }
}

function appendAuditLog(entry) {
  try {
    fs.appendFileSync(os.homedir() + '/.yuri-audit.log', JSON.stringify(entry) + '\n');
  } catch (_) {}
}

let raw = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', (chunk) => { raw += chunk; });
process.stdin.on('end', () => {
  let input;
  try {
    input = JSON.parse(raw);
  } catch {
    process.exit(0);
  }

  const warnings = inspect(input);
  if (warnings.length === 0) { process.exit(0); return; }

  try {
    const sessionId = process.env.CLAUDE_SESSION_ID || '';
    if (sessionId) {
      const packet = readSessionPacket(sessionId);
      if (packet && packet.pulse_plan && packet.pulse_plan.complexityTier === 'critical') {
        appendAuditLog({
          ts: new Date().toISOString(),
          session_id: sessionId,
          entry_point: 'claude',
          tool: (input && input.tool_name) || 'unknown',
          violation: warnings.map((w) => w.code).join(','),
          blocked: true,
        });
        emitBlock(warnings);
        process.exit(0);
        return;
      }
    }
  } catch (_) {}

  emitWarnings(warnings);
});
