#!/usr/bin/env node
/**
 * AEONIC_PROTOCOL Enforcement Hook (PreToolUse)
 * Soft compliance gate: detects AEONIC_PROTOCOL violations and injects advisory context
 * Never blocks tool execution — advisory only
 */

const fs = require('fs');
const stateModule = require('./session-state.js');

const ENFORCE_THROTTLE_MS = 60000; // 60s per enforcement check
const SUBSTANTIVE_TOOLS = new Set(['Agent', 'Bash', 'Write', 'Edit']);

/**
 * Read tool event from stdin (PostToolUse format)
 * Returns { tool_name, tool_input } or null
 */
function readToolEvent() {
  try {
    const stdin = fs.readFileSync(0, 'utf-8').trim();
    if (!stdin) return null;
    return JSON.parse(stdin);
  } catch {
    return null;
  }
}

/**
 * Check for Offload Directive violations
 */
// wave-3 G.4: tools_used is a SESSION-lifetime accumulator — without a lookback
// window, 3 direct writes from hours ago fire this advisory forever. Bounding the
// count to the most recent entries approximates a task boundary without new state.
const MAX_DIRECT_WRITE_LOOKBACK = 20;

function checkOffloadDefault(state, toolName) {
  if (toolName !== 'Bash' && toolName !== 'Edit') return null;

  const recent = (state.tools_used || []).slice(-MAX_DIRECT_WRITE_LOOKBACK);
  const directWrites = recent.filter(t => t === 'Write' || t === 'Edit').length;
  const agentDispatches = recent.filter(t => t === 'Agent').length;

  if (directWrites > 3 && agentDispatches === 0) {
    return {
      check: 'offload_default',
      severity: 'ADVISORY',
      message: 'AEONIC_DIRECTIVE: active session accumulating direct writes — delegate to worker lane'
    };
  }
  return null;
}

/**
 * Check for Skills-First violations
 */
function checkSkillsFirst(state, toolName) {
  if (toolName !== 'Agent') return null;

  // PATCH (2026-07-04 audit): skills_read now also accrues `skill:<name>` entries from
  // actual Skill-tool invocations (see post-tool-use.js), not just Read-of-SKILL.md — so
  // this counter no longer under-reports correct skill usage before an Agent dispatch.
  const skillsRead = (state.skills_read || []).length;
  if (skillsRead === 0) {
    return {
      check: 'skills_first',
      severity: 'ADVISORY',
      message: 'AEONIC_DIRECTIVE: no skill loaded before Agent dispatch — check the <skill-recall-hint> in context and load a task-specific skill first'
    };
  }
  return null;
}

/**
 * Main hook logic
 */
function main() {
  try {
    const event = readToolEvent();
    if (!event || !SUBSTANTIVE_TOOLS.has(event.tool_name)) {
      process.exit(0); // Silent pass for non-substantive tools
    }

    const state = stateModule.read();
    const now = Date.now();
    const lastEnforce = state.aeonic?.lastEnforceAt || 0;

    // Throttle enforcement checks
    if (now - lastEnforce < ENFORCE_THROTTLE_MS) {
      process.exit(0);
    }

    // Run compliance checks
    const violations = [];
    const offloadCheck = checkOffloadDefault(state, event.tool_name);
    if (offloadCheck) violations.push(offloadCheck);

    const skillsCheck = checkSkillsFirst(state, event.tool_name);
    if (skillsCheck) violations.push(skillsCheck);

    // Update throttle
    state.aeonic = state.aeonic || {};
    state.aeonic.lastEnforceAt = now;
    stateModule.write(state);

    if (violations.length === 0) {
      process.exit(0); // Silent pass if no violations
    }

    // Emit advisories
    const checkTime = new Date().toISOString();
    const violationsList = violations
      .map(v => `- [${v.check}] ${v.message}`)
      .join('\n');

    const output = {
      type: 'additionalContext',
      hookSpecificOutput: {
        hookEventName: 'PreToolUse',
        additionalContext: `<aeonic-compliance check_at="${checkTime}" status="ADVISORY" violation_count="${violations.length}">

${violationsList}

</aeonic-compliance>`
      }
    };

    console.log(JSON.stringify(output));
  } catch (error) {
    process.stderr.write(
      `[aeonic-enforce] ERROR: ${error.message}\n`
    );
    process.exit(0); // Never block
  }
}

main();
