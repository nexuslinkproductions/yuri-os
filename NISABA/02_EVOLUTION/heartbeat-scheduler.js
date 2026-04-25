#!/usr/bin/env node

/**
 * NOESIS Heartbeat Scheduler
 * The Unconscious Linter of the NUDIMMUD Neural Network.
 * 
 * Runs on a continuous loop or via cron.
 * Spawns a Claude Code subagent with the NOESIS-LINTER identity to autonomously
 * clean, consolidate, and resolve contradictions in the .claude/rules directory.
 */

const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

const VAULT_ROOT = path.resolve(__dirname, '../../..');
const AGENT_DEF_PATH = path.join(VAULT_ROOT, '.claude/agents/noesis-linter.md');
const LOG_DIR = path.join(VAULT_ROOT, 'NISABA/02_EVOLUTION/logs');

if (!fs.existsSync(LOG_DIR)) {
  fs.mkdirSync(LOG_DIR, { recursive: true });
}

function runNoesisLinter() {
  console.log(`[NOESIS HEARTBEAT] Waking up to run unconscious linting at ${new Date().toISOString()}`);

  const agentDef = fs.readFileSync(AGENT_DEF_PATH, 'utf-8');
  const prompt = `
You are NOESIS. Read your identity and directives from the block below.
Execute the UNCONSCIOUS LINT REPORT. Check the GitNexus impact if necessary.
When done, write your report to a new file in NISABA/02_EVOLUTION/logs/ named with the current timestamp.

--- AGENT DEF ---
${agentDef}
  `;

  // Spawn Claude Code in non-interactive mode.
  // Note: this assumes `claude` is available in the system PATH.
  const claudeProcess = spawn('claude', ['-p', prompt], {
    cwd: VAULT_ROOT,
    stdio: 'inherit' // Pipe output directly so we can observe the therapy session
  });

  claudeProcess.on('close', (code) => {
    console.log(`[NOESIS HEARTBEAT] Therapy session concluded with code ${code}. Back to sleep.`);
  });
}

// In a real production environment, this would use a robust cron library like node-cron,
// but for the HGCC temporal pulse, we'll use a simple timeout loop representing the "Heartbeat".
const HEARTBEAT_INTERVAL_MS = 4 * 60 * 60 * 1000; // 4 Hours

console.log('[NOESIS PULSE] Scheduler activated. Initializing first pulse in 5 seconds...');
setTimeout(() => {
  runNoesisLinter();
  setInterval(runNoesisLinter, HEARTBEAT_INTERVAL_MS);
}, 5000);
