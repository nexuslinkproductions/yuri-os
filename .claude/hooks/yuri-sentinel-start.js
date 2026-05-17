'use strict';
const fs = require('fs');
const path = require('path');
const bus = require('./memory-bus.js');

const LEARNING_DIR = path.join(process.env.HOME || process.cwd(), '.claude', 'yuri-sentinel', 'learning');
const PROJECT_LEARNING_DIR = path.join(process.cwd(), '.claude', 'yuri-sentinel', 'learning');

let raw = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', c => raw += c);
process.stdin.on('end', () => {
  try {
    const event = JSON.parse(raw);
    const agentType = (event.agent_type || '')
      .replace(/^[^:]+:/, '').trim().toLowerCase();

    const parts = [];

    const globalGlobal = readFile(path.join(LEARNING_DIR, 'global.md'));
    if (globalGlobal) parts.push(`### Global Lessons (all projects)\n\n${globalGlobal}`);

    const projectGlobal = readFile(path.join(PROJECT_LEARNING_DIR, 'global.md'));
    if (projectGlobal) parts.push(`### Project Lessons (this project)\n\n${projectGlobal}`);

    if (agentType) {
      const globalAgent = readFile(path.join(LEARNING_DIR, 'agents', `${agentType}.md`));
      if (globalAgent) parts.push(`### Lessons for ${agentType} (all projects)\n\n${globalAgent}`);

      const projectAgent = readFile(path.join(PROJECT_LEARNING_DIR, 'agents', `${agentType}.md`));
      if (projectAgent) parts.push(`### Lessons for ${agentType} (this project)\n\n${projectAgent}`);
    }

    // Seed session state so cross-terminal writes AFTER this start are detected
    try {
      const sessionId = bus.getSessionId();
      const currentBus = bus.readBus();
      const sessFile = require('path').join(bus.SESSIONS_DIR, `${sessionId}.json`);
      if (!require('fs').existsSync(sessFile)) {
        bus.writeSession(sessionId, { sessionId, startTime: new Date().toISOString(), lastSeenSequence: currentBus.sequence });
      }
    } catch (_) {}

    if (parts.length === 0) { process.exit(0); return; }

    const attr = agentType ? ` agent="${agentType}"` : '';
    const content = `<mnemosyne${attr}>\n\n${parts.join('\n\n---\n\n')}\n\n</mnemosyne>`;

    const hookEventName = raw ? JSON.parse(raw).event_type || 'SessionStart' : 'SessionStart';
    const output = {
      hookSpecificOutput: {
        hookEventName,
        additionalContext: content.split('\n').join('\\n')
      }
    };

    console.log(JSON.stringify(output));
  } catch (e) {}
  process.exit(0);
});

function readFile(p) {
  try { return fs.readFileSync(p, 'utf8').trim(); }
  catch { return ''; }
}
