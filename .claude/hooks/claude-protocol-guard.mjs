#!/usr/bin/env node
// ESM protocol-guard hook (converted from CJS 2026-05-29). The control-file list is now
// single-sourced from lane-kernel.mjs (CONTROL_FILE_PREFIXES) instead of a hardcoded copy,
// so the hook and the rest of the control plane can never drift on which core files require
// a control packet. session-state.js stays CJS and is imported via ESM default interop.

import fs from 'node:fs';
import os from 'node:os';
import ssModule from './session-state.js';
import { CONTROL_FILE_PREFIXES } from '../../_SYSTEM/Scripts/lane-kernel.mjs';
// HITL plan-review sublane (github-adoption human-review-sublane). isPlanReviewMode is the
// MUTUAL-EXCLUSION source of truth shared with post-tool-use.js's arm site. It fails SAFE
// to OFF if plan-review.mjs is absent or session-state is unreadable (try/catch below).
let isPlanReviewMode = () => false;
try {
  ({ isPlanReviewMode } = await import('../../_SYSTEM/Scripts/plan-review.mjs'));
} catch (_) { /* module absent → review mode treated OFF, autonomous gate unchanged */ }

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
  // Recognize direct Scripts/ai dispatch or llm-compat dispatch as route-plan evidence
  if (lower.includes('_system/scripts/ai route-plan') ||
      lower.includes('_system/scripts/ai auto') ||
      lower.includes('scripts/ai route-plan') ||
      lower.includes('scripts/ai auto') ||
      lower.includes('llm-compat.sh -m') ||
      lower.includes('scripts/llm-compat.sh')) return true;
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
    // MUTUAL-EXCLUSION site A of 3: when HITL plan-review mode is ON, the autonomous dispatch
    // gate must NOT fire — checkPlanReviewGate owns the pacing this event. Read the SAME state
    // object so this site and the review-gate site decide off one snapshot.
    if (isPlanReviewMode(state)) return null;
    const gate = state?.plan_dispatch_gate;
    if (!gate || !gate.armed || gate.satisfied) return null;

    // AUTO-EXPIRE (wave-3 G.5): the gate self-satisfies after PLAN_GATE_MAX_WARNS (3)
    // warns OR PLAN_GATE_TTL_MS (30min) — BY DESIGN, an escape valve so an interactive
    // session is never blocked forever. Consequence accepted as advisory-tier behavior:
    // a session can exhaust the warn budget and then proceed without route-plan evidence.
    if (gate.warn_count >= PLAN_GATE_MAX_WARNS || Date.now() - gate.armed_at > PLAN_GATE_TTL_MS) {
      const reason = gate.warn_count >= PLAN_GATE_MAX_WARNS ? 'warn-budget-exhausted' : 'ttl-expired';
      process.stderr.write(`[plan-dispatch-gate] EXPIRED: gate auto-satisfied via ${reason} — session may proceed without route-plan.\n`);
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
      message: 'ExitPlanMode approved but no route-plan dispatch — run: _SYSTEM/Scripts/ai route-plan "<task>" and dispatch to the returned lane before direct mutation. (llm-compat lane priority: @gpt-5.5 → @codex-spark → ... → @claude last resort)',
    };
  } catch (_) {
    return null;
  }
}

// HITL plan-review gate (MUTUAL-EXCLUSION site C of 3). When plan_review_mode is ON, the
// PostToolUse arm site armed `plan_review_gate` instead of plan_dispatch_gate.
// OWNER DECISION 2026-06-13 (Marcel "auto block with a reason provided"): this is now a HARD BLOCK,
// not advisory pacing. In review mode a post-ExitPlanMode mutation is DENIED until the plan is reviewed
// and approved (satisfy the gate via `plan-review.mjs approve`). The per-attempt auto-open was removed
// (a hard gate opens on APPROVAL, not on N denied attempts); a long TTL failsafe still auto-expires the
// gate so a review-mode session left on cannot wedge permanently. Block requires CLAUDE_SESSION_ID — the
// same degrade-to-WARN contract as every other block here. Fires ONLY when review mode is ON (default OFF).
function checkPlanReviewGate(input) {
  const toolName = input?.tool_name || '';
  const isMutation = MUTATION_TOOLS.has(toolName) ||
    (toolName === 'Bash' && includesAny(` ${normalize(bashCommand(input))} `, MUTATING_COMMAND_MARKERS));
  if (!isMutation) return null;

  try {
    const state = ss.read();
    // Only fire when review mode is ON — mirror image of site A's exclusion.
    if (!isPlanReviewMode(state)) return null;
    const gate = state?.plan_review_gate;
    if (!gate || !gate.armed || gate.satisfied) return null;

    // TTL failsafe ONLY (a long timeout) so a forgotten review-mode cannot wedge forever. No
    // per-attempt auto-open: the hard gate is satisfied by APPROVAL, not by repeated denied attempts.
    if (Date.now() - gate.armed_at > PLAN_GATE_TTL_MS) {
      ss.update(s => { if (s.plan_review_gate) s.plan_review_gate.satisfied = true; });
      return null;
    }

    ss.update(s => { s.plan_review_gate.block_count = (s.plan_review_gate.block_count || 0) + 1; });
    return {
      code: 'plan-review-blocked',
      block: true,
      message: 'HITL plan-review mode is ON, so this mutation is BLOCKED until the plan is reviewed and approved. Reason: an operator turned on plan-review mode — agent plans require human sign-off before any mutation. Capture + review: `_SYSTEM/Scripts/plan-review.mjs capture "<id>"`, then approve (a changes-requested verdict keeps the block). Leave review mode: `_SYSTEM/Scripts/plan-review.mjs off`.',
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
    code: 'shintai-must-use-llm-compat',
    message: 'Shintai operations MUST dispatch via llm-compat lanes — not Claude agents. Run: bash _SYSTEM/Scripts/ai auto "<task>" or bash _SYSTEM/Scripts/llm-compat.sh -m <lane> "<spec>". Claude agents are banned for Shintai. See _SYSTEM/memory/feedback_no_anthropic_agents.md.',
  };
}

function inspect(input) {
  // Sprint mode bypass: set YURI_SPRINT_MODE=1 in env to suppress WARNs during
  // authorized rapid-implementation sessions. Session-scoped only — does not persist.
  // Activate: export YURI_SPRINT_MODE=1
  // Deactivate: unset YURI_SPRINT_MODE (or open a new session)
  if (process.env.YURI_SPRINT_MODE === '1') {
    // wave-3 G.11: audit trail — the bypass is intentional, but suppression must be
    // visible in logs, not silent.
    process.stderr.write('[protocol-guard] SPRINT_MODE=1 active — all protocol checks suppressed this call\n');
    return [];
  }

  // Shintai enforcement — block before any other check
  const shintaiBlock = checkShintaiDispatch(input);
  if (shintaiBlock) return [shintaiBlock];

  const toolText = textOf(input?.tool_input);
  const lowerToolText = toolText.toLowerCase();
  const warnings = [];

  // Satisfy plan dispatch gate when route-plan evidence appears in any tool call.
  // MUTUAL-EXCLUSION site B of 3: skip this opportunistic self-satisfy entirely when HITL
  // plan-review mode is ON — in review mode the dispatch gate is not the active gate, so
  // satisfying it here would let an autonomous-path action quietly clear a gate that should
  // be dormant. The review gate is paced separately by checkPlanReviewGate.
  try {
    const state = ss.read();
    if (!isPlanReviewMode(state) &&
        state?.plan_dispatch_gate?.armed && !state.plan_dispatch_gate.satisfied &&
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

  // Exactly one of these two fires on a given mutation: checkPlanDispatchGate bails when
  // review mode is ON, checkPlanReviewGate bails when it is OFF (mutual exclusion sites A+C).
  const planGateWarn = checkPlanDispatchGate(input);
  if (planGateWarn) warnings.push(planGateWarn);

  const planReviewWarn = checkPlanReviewGate(input);
  if (planReviewWarn) warnings.push(planReviewWarn);

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
    // NOTE (wave-3 G.3): the block path requires CLAUDE_SESSION_ID — absent in
    // subagent/headless contexts → critical-tier findings fall through to WARN.
    // Visible degradation, not silent: log it when findings exist without a session id.
    if (!sessionId) {
      process.stderr.write('[protocol-guard] WARN: CLAUDE_SESSION_ID absent — critical-tier block downgraded to WARN\n');
    }
    // Owner-armed HARD gates (e.g. plan-review auto-block, Marcel 2026-06-13): a finding flagged
    // block:true DENIES the tool regardless of complexity tier — same CLAUDE_SESSION_ID requirement
    // as every other block (absent → degrades to WARN below, logged).
    const forcedBlocks = warnings.filter((w) => w.block);
    if (sessionId && forcedBlocks.length) {
      appendAuditLog({
        ts: new Date().toISOString(),
        session_id: sessionId,
        entry_point: 'claude',
        tool: (input && input.tool_name) || 'unknown',
        violation: forcedBlocks.map((w) => w.code).join(','),
        blocked: true,
      });
      emitBlock(forcedBlocks);
      process.exit(0);
      return;
    }
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
