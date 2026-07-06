'use strict';
const fs = require('fs');
const path = require('path');

const SKILLS_DIR = path.join(process.cwd(), '.claude', 'skills');

let raw = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', c => raw += c);
process.stdin.on('end', () => {
  const skills = scanSkills();
  if (skills.length === 0) { process.exit(0); return; }

  // wave-3 H.6 (D-H4, verify-first PASSED): the harness delivers its own native
  // available-skills system-reminder in interactive sessions (verified live
  // 2026-06-11 — two independent native skill-list injections observed in a main
  // session). The full per-skill description index here duplicated ~2,900 tok of
  // it every boot. Inject only count + routing pointer.
  const content = `<startup-index>${skills.length} skills available via the Skill tool (harness lists them natively). Load an individual SKILL.md on first use; do not re-read from disk.</startup-index>`;

  const output = {
    hookSpecificOutput: {
      hookEventName: 'SessionStart',
      additionalContext: content.split('\n').join('\\n')
    }
  };

  console.log(JSON.stringify(output));
  process.exit(0);
});

function parseFrontmatter(content) {
  const match = content.match(/^---\s*\n([\s\S]*?)\n---/);
  if (!match) return {};
  const out = {};
  for (const line of match[1].split('\n')) {
    const sep = line.indexOf(':');
    if (sep === -1) continue;
    const k = line.slice(0, sep).trim();
    const v = line.slice(sep + 1).trim().replace(/^["']|["']$/g, '');
    if (k) out[k] = v;
  }
  return out;
}

function scanSkills() {
  try {
    return fs.readdirSync(SKILLS_DIR, { withFileTypes: true })
      .filter(d => d.isDirectory())
      .flatMap(d => {
        const skillPath = path.join(SKILLS_DIR, d.name, 'SKILL.md');
        try {
          const fm = parseFrontmatter(fs.readFileSync(skillPath, 'utf8'));
          if (!fm.name && !fm.description) return [];
          return [{ name: fm.name || d.name, description: fm.description || '' }];
        } catch { return []; }
      });
  } catch { return []; }
}
