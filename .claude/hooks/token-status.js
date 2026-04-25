#!/usr/bin/env node
const fs = require('fs');

// Module-level cache: persists across statusLine calls within same process
let _lastWrittenPct = -1;
const SESSION_STATE_FILE = '/Users/marcelspatz/NUDIMMUD/.claude/state/session-state.json';

function writeContextPct(pct) {
  if (Math.abs(pct - _lastWrittenPct) < 1) return;
  _lastWrittenPct = pct;
  try {
    const state = JSON.parse(fs.readFileSync(SESSION_STATE_FILE, 'utf8'));
    state.context.pct = pct;
    state.context.last_updated = new Date().toISOString();
    const tmp = `${SESSION_STATE_FILE}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(state, null, 2));
    fs.renameSync(tmp, SESSION_STATE_FILE);
  } catch (_) {}
}

try {
  const input = fs.readFileSync(0, 'utf-8').trim();
  if (!input) {
    console.log("⚫ Idle");
    process.exit(0);
  }

  const data = JSON.parse(input);

  const model = data?.model?.display_name || data?.model || 'Claude';
  const ctx = data?.context_window?.used_percentage || 0;
  const inputTok = data?.usage?.input_tokens || 0;
  const outputTok = data?.usage?.output_tokens || 0;
  const totalTok = data?.usage?.total_tokens || (inputTok + outputTok);
  const cost = data?.usage?.cost || 0;
  const branch = data?.git?.branch || '';
  const gitDirty = data?.git?.status === 'dirty' ? '●' : '○';
  const elapsed = data?.elapsed_time_seconds || 0;
  const mins = Math.floor(elapsed / 60);
  const secs = Math.floor(elapsed % 60);

  writeContextPct(ctx);

  let tokenmaxxingActive = false;
  try {
    const state = JSON.parse(fs.readFileSync(SESSION_STATE_FILE, 'utf8'));
    tokenmaxxingActive = state?.tokenmaxxing === true;
  } catch (_) {}

  const ctxIcon = ctx < 50 ? '🟢' : ctx < 85 ? '🟡' : '🔴';
  const costStr = cost > 0 ? `  💰 $${cost.toFixed(4)}` : '';
  const branchStr = branch ? `  ${gitDirty} ${branch}` : '';
  const timeStr = elapsed > 0 ? `  ⏱ ${mins}m${secs}s` : '';
  const tokStr = totalTok > 0 ? `  ↑${inputTok.toLocaleString()} ↓${outputTok.toLocaleString()} Σ${totalTok.toLocaleString()}` : '';
  const tmStr = tokenmaxxingActive ? '  ⚡' : '';

  console.log(`🧠 ${model}  ${ctxIcon} ${ctx.toFixed(0)}%${tokStr}${costStr}${branchStr}${timeStr}${tmStr}`);
} catch (e) {
  console.log(`HUD: ${e.message}`);
}
