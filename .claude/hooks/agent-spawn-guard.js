#!/usr/bin/env node
// .claude/hooks/agent-spawn-guard.js — PATCH 023
// Hard-block Agent() spawns with Anthropic models (Claude/Haiku/Sonnet/Opus).
// Memory rule: memory/feedback_no_anthropic_agents.md
// Bypass (rare, explicit): NUDIMMUD_ALLOW_AGENT=1 in environment.

'use strict';

let stdin = '';
process.stdin.on('data', (chunk) => {
  stdin += chunk;
});

process.stdin.on('end', () => {
  let payload;
  try {
    payload = JSON.parse(stdin || '{}');
  } catch (_err) {
    // Malformed payload — pass through silently
    process.exit(0);
  }

  if (payload.tool_name !== 'Agent') {
    process.exit(0);
  }

  // Explicit bypass for rare cases (e.g., user-approved one-off)
  if (process.env.NUDIMMUD_ALLOW_AGENT === '1') {
    console.error('[agent-spawn-guard] NUDIMMUD_ALLOW_AGENT=1 — Agent spawn allowed (logged)');
    process.exit(0);
  }

  const subagentType = (payload.tool_input && payload.tool_input.subagent_type) || '<unspecified>';
  const description = (payload.tool_input && payload.tool_input.description) || '';
  const model = (payload.tool_input && payload.tool_input.model) || 'inherited';

  const reason = [
    'NUDIMMUD policy: Agent() with Anthropic models (Claude/Haiku/Sonnet/Opus) is BANNED.',
    'Memory rule: memory/feedback_no_anthropic_agents.md',
    `Attempted spawn: subagent_type="${subagentType}" model="${model}" description="${description}"`,
    '',
    'USE THESE LANES INSTEAD:',
    '  • Codex implementation: bash Scripts/offload.sh -m gpt-5.4-mini "<CODEX TASK SPEC>" (or gpt-5.5 for complex)',
    '  • DeepSeek analysis (1M ctx + tools): bash Scripts/offload.sh -m deepseek-v4-pro --reasoning high "<bounded prompt per PATCH 011>"',
    '  • Raw GitHub source (research_pipeline.md Tier 2): curl -s "https://raw.githubusercontent.com/<owner>/<repo>/main/<path>" | head -200',
    '  • Local exploration: Read tool / Bash grep / mcp__ollama-bridge__ollama_explore_files',
    '  • Local subagent (Ollama): mcp__ollama-bridge__ollama_run',
    '',
    'Bypass (rare/explicit only): NUDIMMUD_ALLOW_AGENT=1',
  ].join('\n');

  const output = {
    hookSpecificOutput: {
      hookEventName: 'PreToolUse',
      permissionDecision: 'deny',
      permissionDecisionReason: reason,
    },
  };

  console.log(JSON.stringify(output));
  process.exit(0);
});
