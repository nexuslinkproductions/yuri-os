#!/usr/bin/env node

/**
 * GRAPH OPTIMIZER ROUTINE
 * Runs nightly to rebuild the spatial memory graph.
 */

const { spawnSync } = require('child_process');
const path = require('path');

const VAULT_ROOT = path.resolve(__dirname, '../../../');
const PALACE_SCRIPT = path.join(VAULT_ROOT, '_SYSTEM/palace-rebuild.py');

console.log(`[GRAPH OPTIMIZER] Starting spatial memory rebuild at ${new Date().toISOString()}`);

// 1. Run the Python graphify script
console.log(`[GRAPH OPTIMIZER] Rebuilding Claude Palace graph...`);
const palaceRes = spawnSync('python', [PALACE_SCRIPT, '--vault', VAULT_ROOT, '--output', path.join(VAULT_ROOT, 'claude-palace-out')], { stdio: 'inherit' });

if (palaceRes.status !== 0) {
    console.error(`[GRAPH OPTIMIZER] Palace rebuild failed with status ${palaceRes.status}`);
}

// 2. Run GitNexus Indexing
console.log(`[GRAPH OPTIMIZER] Rebuilding GitNexus index...`);
const nexusRes = spawnSync('npx', ['-y', 'gitnexus@latest', 'analyze', VAULT_ROOT], { stdio: 'inherit', cwd: VAULT_ROOT });

if (nexusRes.status !== 0) {
    console.error(`[GRAPH OPTIMIZER] GitNexus rebuild failed with status ${nexusRes.status}`);
}

console.log(`[GRAPH OPTIMIZER] Graph optimization complete.`);
