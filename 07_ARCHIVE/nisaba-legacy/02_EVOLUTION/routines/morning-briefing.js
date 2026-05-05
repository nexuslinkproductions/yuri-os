#!/usr/bin/env node

/**
 * MORNING BRIEFING ROUTINE
 * Wakes up Claude to summarize recent git changes and file updates,
 * and updates the HOME.md Daily Briefing section.
 */

const { spawn } = require('child_process');
const path = require('path');

const VAULT_ROOT = path.resolve(__dirname, '../../../');

console.log(`[MORNING BRIEFING] Waking up NOESIS for the morning sync at ${new Date().toISOString()}`);

const prompt = `
You are the NOESIS Morning Briefing Agent. 
Your task is to:
1. Briefly check recent file changes in the vault (using git log or finding recently modified files).
2. Look at the current GitNexus spatial graph summary if needed.
3. Update the "## Daily Briefing" section in /Volumes/T7/NUDIMMUD/00_COMMAND-CENTER/HOME.md.
Replace the content under that heading with a concise, 3-bullet summary of what was worked on yesterday and what the focus should be today. Include today's date.
Do not use conversational filler. Be precise.
`;

const claudeProcess = spawn('claude', ['-p', prompt], {
  cwd: VAULT_ROOT,
  stdio: 'inherit'
});

claudeProcess.on('close', (code) => {
  console.log(`[MORNING BRIEFING] Routine finished with code ${code}.`);
});
