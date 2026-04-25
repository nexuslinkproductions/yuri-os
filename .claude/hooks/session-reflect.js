'use strict';
const fs = require('fs');
const path = require('path');
const os = require('os');

const STATE_FILE = path.join(__dirname, '..', 'state', 'session-state.json');
const SKILLS_DIR = path.join(__dirname, '..', 'skills');
const MEMORY_DIR = path.join(os.homedir(), '.claude', 'projects', '-Users-marcelspatz-NUDIMMUD', 'memory');
const JOURNAL_FILE = path.join(MEMORY_DIR, 'session-journal.md');
const MEMORY_INDEX = path.join(MEMORY_DIR, 'MEMORY.md');

const MID_SESSION = process.argv.includes('--mid-session');

function readState() {
  try { return JSON.parse(fs.readFileSync(STATE_FILE, 'utf8')); } catch { return null; }
}

function writeState(state) {
  const tmp = `${STATE_FILE}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(state, null, 2));
  fs.renameSync(tmp, STATE_FILE);
}

function summarizeTools(toolsUsed) {
  const counts = {};
  let successes = 0;
  for (const t of toolsUsed) {
    const base = (t.tool || 'unknown').split('__')[0];
    counts[base] = (counts[base] || 0) + 1;
    if (t.success) successes++;
  }
  const parts = Object.entries(counts)
    .sort((a, b) => b[1] - a[1])
    .map(([k, v]) => `${k}×${v}`)
    .join(', ');
  const rate = toolsUsed.length
    ? `${Math.round((successes / toolsUsed.length) * 100)}%`
    : 'n/a';
  return { summary: parts || 'none', rate, total: toolsUsed.length, successes };
}

function buildHint(state) {
  const parts = [];
  if (state.git?.branch) parts.push(`branch=${state.git.branch}`);
  const files = (state.files_written || []).slice(-3);
  if (files.length) parts.push(`files=${files.map(f => path.basename(f)).join(',')}`);
  if (state.aversions?.length) parts.push(`aversion="${state.aversions.slice(-1)[0]}"`);
  return `/compact Preserve: ${parts.join(' | ')}`;
}

function updateSkillNotes(state) {
  const updated = [];
  const today = new Date().toISOString().slice(0, 10);
  const durationMin = Math.round((Date.now() - new Date(state.start_time).getTime()) / 60000);
  const peakPct = state.compact_history.length
    ? Math.max(...state.compact_history.map(h => h.pct), state.context?.pct || 0)
    : (state.context?.pct || 0);
  const compactCount = state.compact_history.filter(h => h.action !== 'logged').length;
  const toolSummary = summarizeTools(state.tools_used);
  const corrections = ''; // populated by nisaba dream; not available here
  const errors = state.errors.length ? state.errors.map(e => e.snippet).slice(0, 2).join('; ') : 'none';

  const noteBlock =
    `### ${today}\n` +
    `- session: ${durationMin}m | peak ctx: ${peakPct.toFixed(0)}% | compacts: ${compactCount}` +
    (MID_SESSION ? ' (mid-session)' : '') + '\n' +
    `- tools: ${toolSummary.summary || 'none'}\n` +
    `- corrections: ${corrections || 'none'}\n` +
    `- errors: ${errors}\n`;

  for (const skillName of state.skills_read) {
    const skillFile = path.join(SKILLS_DIR, skillName, 'SKILL.md');
    if (!fs.existsSync(skillFile)) continue;

    // mtime guard: skip if modified in last 30s (active edit)
    try {
      const mtime = fs.statSync(skillFile).mtimeMs;
      if (Date.now() - mtime < 30000) continue;
    } catch { continue; }

    try {
      let content = fs.readFileSync(skillFile, 'utf8');
      const NOTES_HEADER = '\n\n## Session Notes\n\n';

      if (content.includes('## Session Notes')) {
        // Insert after the header
        content = content.replace('## Session Notes\n', `## Session Notes\n\n${noteBlock}`);
      } else {
        content = content.trimEnd() + NOTES_HEADER + noteBlock;
      }

      const tmp = `${skillFile}.tmp`;
      fs.writeFileSync(tmp, content);
      fs.renameSync(tmp, skillFile);
      updated.push(skillName);
    } catch (_) {}
  }

  return updated;
}

function buildJournalEntry(state, skillsUpdated) {
  const today = new Date().toISOString().slice(0, 10);
  const durationMin = Math.round((Date.now() - new Date(state.start_time).getTime()) / 60000);
  const peakPct = state.compact_history.length
    ? Math.max(...state.compact_history.map(h => h.pct), state.context?.pct || 0)
    : (state.context?.pct || 0);
  const compactCount = state.compact_history.filter(h => h.action !== 'logged').length;
  const toolInfo = summarizeTools(state.tools_used);
  const hint = buildHint(state);

  const compactLines = state.compact_history
    .map(h => `- Tier ${h.tier} @ ${h.pct.toFixed(0)}% → ${h.action}`)
    .join('\n') || '- none';

  const errorLines = state.errors.length
    ? state.errors.slice(0, 3).map(e => `- ${e.tool}: ${e.snippet?.slice(0, 80) || 'error'}`).join('\n')
    : '- none';

  const label = MID_SESSION ? ' (mid-session snapshot)' : '';

  const entry =
    `## ${today} | Session ${state.session_id} | ${durationMin}m | peak ${peakPct.toFixed(0)}% | compacts: ${compactCount}${label}\n\n` +
    `**Branch:** ${state.git?.branch || 'unknown'} | **Cwd:** ${state.git?.cwd || ''}\n\n` +
    `**Skills used:** ${state.skills_read.join(', ') || 'none'}\n` +
    `**Skills updated:** ${skillsUpdated.join(', ') || 'none'}\n\n` +
    `**Tools:** ${toolInfo.summary} | **Success rate:** ${toolInfo.rate}\n\n` +
    `**Errors:**\n${errorLines}\n\n` +
    `**Compact history:**\n${compactLines}\n\n` +
    `**Compact hint for next /compact:**\n\`${hint}\`\n\n` +
    `---\n`;

  return { entry, hint };
}

function writeJournal(entry) {
  fs.mkdirSync(MEMORY_DIR, { recursive: true });
  let existing = '';
  try { existing = fs.readFileSync(JOURNAL_FILE, 'utf8'); } catch (_) {}

  const header = existing.startsWith('<!-- session-journal')
    ? ''
    : '<!-- session-journal: newest entry first -->\n\n';

  const newContent = header + entry + (existing ? '\n' + existing.replace(/^<!-- session-journal[^\n]*\n\n/, '') : '');
  const tmp = `${JOURNAL_FILE}.tmp`;
  fs.writeFileSync(tmp, newContent);
  fs.renameSync(tmp, JOURNAL_FILE);
}

function updateMemoryIndex() {
  try {
    const content = fs.readFileSync(MEMORY_INDEX, 'utf8');
    if (content.includes('session-journal.md')) return;
    const pointer = '- [Session Journal](session-journal.md) — dated session entries, skills used, compact hints (auto-generated)\n';
    const tmp = `${MEMORY_INDEX}.tmp`;
    fs.writeFileSync(tmp, content.trimEnd() + '\n' + pointer);
    fs.renameSync(tmp, MEMORY_INDEX);
  } catch (_) {}
}

function run() {
  const state = readState();
  if (!state) return { hint: null, entry: null };

  const skillsUpdated = updateSkillNotes(state);
  const { entry, hint } = buildJournalEntry(state, skillsUpdated);
  writeJournal(entry);
  updateMemoryIndex();

  if (!MID_SESSION) {
    state.status = 'closed';
    writeState(state);
  }

  return { hint, entry };
}

// Script entry point
if (require.main === module) {
  try {
    const { hint, entry } = run();
    if (hint) {
      console.log('\n── Session Reflection ──────────────────────────────');
      console.log(entry);
      console.log('── Compact hint ────────────────────────────────────');
      console.log(hint);
      console.log('────────────────────────────────────────────────────\n');
    }
  } catch (e) {
    process.exit(0);
  }
} else {
  module.exports = { run };
}
