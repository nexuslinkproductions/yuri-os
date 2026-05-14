#!/usr/bin/env node
import { writeFileSync, existsSync } from 'fs';
import { join } from 'path';

const dir = '.claude/commands';
const skills = {
  'ai-pipeline-offloading': 'Invoke the `ai-pipeline-offloading` skill — global offload routing map and lane command facade.',
  'anthropic-managed-agents': 'Invoke the `anthropic-managed-agents` skill — research Anthropic managed agents, sessions, events, tools, and distill into a portable agent brief.',
  'codebase-to-course': 'Invoke the `codebase-to-course` skill — turn any codebase into a beautiful interactive single-page HTML course.',
  'deepseek-offload': 'Invoke the `deepseek-offload` skill — offload task to DeepSeek neural lane.',
  'design-master': 'Invoke the `design-master` skill — dedicated design artist agent. Reads design-memory.json, enforces the HUD design system, executes UI/CSS/visual work with full depth.',
  'design-source-pack': 'Invoke the `design-source-pack` skill — turn a design system or reference into a reusable pack and portable skill.',
  'execution-domain-core': 'Invoke the `execution-domain-core` skill — scoped execution environment, task policy, and exit criteria.',
  'failure-evolution-loop': 'Invoke the `failure-evolution-loop` skill — real failure capture, root-cause analysis, regression creation, memory-driven improvement.',
  'frontend-design': 'Invoke the `frontend-design` skill — Anthropic UI/UX skill enforcing high-end intentional design systems. Use for any UI build, landing page, or visual interface.',
  'gitnexus': 'Invoke the `gitnexus` skill — code intelligence hub: query, context, impact, detect changes.',
  'gitnexus-cli': 'Invoke the `gitnexus-cli` skill — run GitNexus CLI commands: analyze, index, status, clean, generate wiki, list repos.',
  'gitnexus-debugging': 'Invoke the `gitnexus-debugging` skill — trace bugs, find error sources, debug failing code via GitNexus.',
  'gitnexus-exploring': 'Invoke the `gitnexus-exploring` skill — understand architecture, trace execution flows, explore unfamiliar codebase areas.',
  'gitnexus-guide': 'Invoke the `gitnexus-guide` skill — GitNexus tools reference, graph schema, MCP resources, workflow guide.',
  'gitnexus-impact-analysis': 'Invoke the `gitnexus-impact-analysis` skill — blast radius analysis, safety check before editing code.',
  'gitnexus-pr-review': 'Invoke the `gitnexus-pr-review` skill — review a pull request, assess risk, check test coverage.',
  'gitnexus-refactoring': 'Invoke the `gitnexus-refactoring` skill — rename, extract, split, move, or restructure code safely.',
  'gpt-oss-local-runtime': 'Invoke the `gpt-oss-local-runtime` skill — set up local gpt-oss runtime via Ollama or LM Studio.',
  'kimi-k2-6-server-adapter': 'Invoke the `kimi-k2-6-server-adapter` skill — plan Kimi K2.6 as a self-hosted OpenAI-compatible endpoint.',
  'math-curve-loaders': 'Invoke the `math-curve-loaders` skill — catalog of math-based loading animations, formulas, and motion patterns.',
  'non-destructive-infinity-guard': 'Invoke the `non-destructive-infinity-guard` skill — action boundary, risk classifier, and mutation approval gate.',
  'openai-codex-workflow': 'Invoke the `openai-codex-workflow` skill — research and apply OpenAI/Codex workflow guidance, config, subagents, and memory.',
  'openclaw-offload': 'Invoke the `openclaw-offload` skill — OpenClaw offload lane (09OC bridge advisory research).',
  'parallel-clone-orchestrator': 'Invoke the `parallel-clone-orchestrator` skill — budgeted multi-agent decomposition, specialist execution, and synthesis.',
  'pattern-mirror-core': 'Invoke the `pattern-mirror-core` skill — artifact perception, pattern extraction, weakness detection, and reconstruction.',
  'probabilistic-decision-core': 'Invoke the `probabilistic-decision-core` skill — operational probability, calibration, and expected-value discipline.',
  'research-artifact-factory': 'Invoke the `research-artifact-factory` skill — convert mature research notes into draft Codex skills and tool scaffolds.',
  'swarm-coordination': 'Invoke the `swarm-coordination` skill — global swarm orchestration across agents, model lanes, and handoff steps.',
};

let created = 0, skipped = 0;
for (const [name, desc] of Object.entries(skills)) {
  const fp = join(dir, name + '.md');
  if (!existsSync(fp)) {
    writeFileSync(fp, desc + '\n');
    console.log('CREATED:', name);
    created++;
  } else {
    skipped++;
  }
}
console.log(`\nDone: ${created} created, ${skipped} skipped`);
