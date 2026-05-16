'use strict';
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const governorPy = path.join(process.cwd(), '_SYSTEM', 'OS_KERNEL', 'memory_governor.py');

let raw = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', c => raw += c);
process.stdin.on('end', () => {
  try {
    if (!fs.existsSync(governorPy)) { process.exit(0); return; }

    const result = spawnSync('python3', [governorPy, 'read', '--limit', '12'], {
      cwd: process.cwd(),
      timeout: 8000,
      encoding: 'utf8',
    });
    if (result.status !== 0 || !result.stdout) { process.exit(0); return; }

    let items;
    try { items = JSON.parse(result.stdout); } catch { process.exit(0); return; }
    if (!Array.isArray(items) || !items.length) { process.exit(0); return; }

    const lines = items
      .filter(m => m.status === 'active' && (m.canonical_summary || m.content))
      .slice(0, 10)
      .map(m => `- [${m.tier || 'episodic'}] ${(m.canonical_summary || m.content || '').slice(0, 200)}`);

    if (!lines.length) { process.exit(0); return; }

    const block = `<yuri-memory>\n${lines.join('\n')}\n</yuri-memory>`;
    const eventName = raw ? (JSON.parse(raw).event_type || 'SessionStart') : 'SessionStart';

    console.log(JSON.stringify({
      hookSpecificOutput: {
        hookEventName: eventName,
        additionalContext: block.split('\n').join('\\n'),
      },
    }));
  } catch (_) {}
  process.exit(0);
});
