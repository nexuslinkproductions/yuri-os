#!/usr/bin/env node
'use strict';

const assert = require('assert/strict');
const { execFileSync } = require('child_process');

function runHook(input = '') {
  return JSON.parse(execFileSync(
    process.execPath,
    ['.claude/hooks/soul-persona-inject.js'],
    {
      input,
      encoding: 'utf8',
      cwd: process.env.YURI_ROOT || require('path').resolve(__dirname, '..', '..', '..'),
    },
  ).trim());
}

const startup = runHook();
assert.equal(startup.hookSpecificOutput.hookEventName, 'SessionStart');
assert.ok(startup.hookSpecificOutput.additionalContext.includes('<soul-persona'));
assert.ok(startup.hookSpecificOutput.additionalContext.includes('adversarial ally'));
assert.ok(startup.hookSpecificOutput.additionalContext.includes('polymathic transfer'));
assert.ok(startup.hookSpecificOutput.additionalContext.includes('contextual edge'));

const subagent = runHook(JSON.stringify({ event_type: 'SubagentStart', agent_type: 'reviewer' }));
assert.equal(subagent.hookSpecificOutput.hookEventName, 'SubagentStart');
assert.ok(subagent.hookSpecificOutput.additionalContext.includes('monotropic depth'));

process.stdout.write('soul-persona-inject: pass\n');
