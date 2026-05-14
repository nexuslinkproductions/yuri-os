#!/usr/bin/env node

import { randomUUID } from 'node:crypto';

const TOOL_MAP = Object.freeze({
  screenshot: 'mcp__computer-use__screenshot',
  click: 'mcp__computer-use__left_click',
  type: 'mcp__computer-use__type',
  navigate: 'mcp__computer-use__navigate',
});

const argv = process.argv.slice(2);
const dryRun = argv.includes('--dry-run');
const prompt = resolvePrompt(argv);

if (!prompt && !dryRun) {
  writeJson({ offload: 'comet', error: 'Missing prompt', prompt: '' });
  process.exit(0);
}

writeJson(buildPlan(prompt, dryRun));

function resolvePrompt(args) {
  const envPrompt = (process.env.OFFLOAD_PROMPT_TEXT || '').trim();
  if (envPrompt) return envPrompt;
  return (args.find((arg) => arg !== '--dry-run') || '').trim();
}

function buildPlan(originalPrompt, previewOnly) {
  const plannedActions = planActions(originalPrompt);
  return {
    offload: 'comet',
    ...(previewOnly ? { preview: true } : { dispatchId: randomUUID() }),
    originalPrompt,
    plannedActions,
    contextNote: plannedActions.length
      ? 'Plan only. Main Claude session must execute actions through MCP computer-use tools.'
      : 'No supported browser action keyword found. Plan contains no executable actions.',
    generatedAt: new Date().toISOString(),
  };
}

function planActions(originalPrompt) {
  const promptText = originalPrompt.toLowerCase();
  const actions = [];

  if (hasWord(promptText, 'screenshot')) {
    actions.push(action(TOOL_MAP.screenshot, {}, 'Capture the current browser viewport.'));
  }
  if (hasWord(promptText, 'click')) {
    actions.push(action(TOOL_MAP.click, {
      target: extractAfter(originalPrompt, /\bclick\b/i) || 'requested target',
    }, 'Click the target described in the prompt.'));
  }
  if (hasWord(promptText, 'type')) {
    actions.push(action(TOOL_MAP.type, {
      text: extractAfter(originalPrompt, /\btype\b/i) || '',
    }, 'Type the text described in the prompt.'));
  }

  const navigationTarget = extractNavigationTarget(originalPrompt);
  if (navigationTarget !== null) {
    actions.push(action(TOOL_MAP.navigate, {
      url: navigationTarget || 'requested destination',
    }, 'Navigate to the destination described in the prompt.'));
  }
  return actions;
}

function action(tool, args, description) {
  return { tool, args, description };
}

function extractNavigationTarget(text) {
  const match = text.match(/\b(?:navigate|go to)\b\s*(.*)$/i);
  return match ? match[1].trim() : null;
}

function extractAfter(text, pattern) {
  const match = text.match(pattern);
  if (!match || match.index === undefined) return '';
  return text.slice(match.index + match[0].length).trim();
}

function hasWord(text, word) {
  return new RegExp(`\\b${word}\\b`, 'i').test(text);
}

function writeJson(value) {
  process.stdout.write(`${JSON.stringify(value, null, 2)}\n`);
}
