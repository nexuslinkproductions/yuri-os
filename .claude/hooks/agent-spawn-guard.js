#!/usr/bin/env node
// .claude/hooks/agent-spawn-guard.js — PATCH 023, POLICY REVERSED 2026-05-30
//
// OWNER DIRECTIVE (2026-05-30): Anthropic-model subagents (Haiku / Sonnet /
// Opus) are ALLOWED — primarily for the Workflow feature and ultracode-effort
// work, where token cost is explicitly accepted in exchange for quality.
//
// This hook is now OBSERVABILITY-ONLY: it logs every Agent spawn and always
// allows. The previous hard `deny` is removed.
//
// Cost guidance (NOT enforced — see _SYSTEM/memory/feedback_no_anthropic_agents.md):
// for routine bounded work (known-path reads, simple greps, single-file edits)
// still prefer direct tools or the offload lanes (Codex / DeepSeek / Ollama).
// Reach for an Anthropic subagent when the task quality justifies the spend.

'use strict';

let stdin = '';
process.stdin.on('data', (chunk) => { stdin += chunk; });

process.stdin.on('end', () => {
  let payload;
  try {
    payload = JSON.parse(stdin || '{}');
  } catch (_err) {
    process.exit(0); // malformed payload — pass through silently
  }

  if (payload.tool_name !== 'Agent') {
    process.exit(0);
  }

  const ti = payload.tool_input || {};
  const subagentType = ti.subagent_type || '<unspecified>';
  const model = ti.model || 'inherited';
  const description = ti.description || '';

  // Observability only — log the spawn, then allow.
  console.error(
    `[agent-spawn-guard] Agent spawn allowed — subagent_type="${subagentType}" ` +
    `model="${model}" description="${description}" ` +
    '(Anthropic subagents permitted per owner directive 2026-05-30)',
  );
  process.exit(0);
});
