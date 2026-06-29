#!/usr/bin/env node
// @capability: agent-native-bootstrap
// @serves: agent-native install | visual-plan skill | local clone
// @does: idempotent bootstrap for BuilderIO agent-native inside YURI — clone reference repo, install/update visual-plan skill, print status. integrations/ is gitignored; this script is the durable entry point.
// @use: node _SYSTEM/Scripts/agent-native-bootstrap.mjs [clone|install-skills|connect|status|all]

import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, '../..');
const CLONE_DIR = path.join(REPO_ROOT, 'integrations', 'agent-native');
const UPSTREAM = 'https://github.com/BuilderIO/agent-native';
const PLAN_URL = 'https://plan.agent-native.com';

function run(cmd, args, opts = {}) {
  const r = spawnSync(cmd, args, {
    stdio: 'inherit',
    cwd: opts.cwd || REPO_ROOT,
    env: process.env,
  });
  if (r.status !== 0) {
    process.exit(r.status ?? 1);
  }
}

function npx(args) {
  run('npx', ['-y', '@agent-native/core@latest', ...args]);
}

function clone() {
  fs.mkdirSync(path.dirname(CLONE_DIR), { recursive: true });
  if (fs.existsSync(path.join(CLONE_DIR, '.git'))) {
    console.log(`✓ clone present: ${CLONE_DIR}`);
    console.log('  update: git -C integrations/agent-native pull --ff-only');
    return;
  }
  console.log(`Cloning ${UPSTREAM} → integrations/agent-native (shallow)…`);
  run('git', ['clone', '--depth', '1', UPSTREAM, CLONE_DIR]);
  console.log('✓ clone complete');
}

function installSkills() {
  console.log('Installing visual-plan skill (hosted Plan MCP)…');
  npx(['skills', 'add', 'visual-plan', '--no-connect']);
  console.log('✓ visual-plan installed — use /visual-plan and /visual-recap');
  console.log(`  auth: npx @agent-native/core@latest connect ${PLAN_URL} --client all --scope user`);
}

function connect() {
  npx(['connect', PLAN_URL, '--client', 'all', '--scope', 'user']);
}

function status() {
  const skillPath = path.join(REPO_ROOT, '.claude', 'skills', 'visual-plan', 'SKILL.md');
  const metaPath = path.join(REPO_ROOT, '.claude', 'skills', 'visual-plan', 'agent-native-skill.json');
  const cloned = fs.existsSync(path.join(CLONE_DIR, 'README.md'));
  console.log('Agent-Native bootstrap status');
  console.log('─'.repeat(40));
  console.log(`Local clone:     ${cloned ? 'yes' : 'no'} (${CLONE_DIR})`);
  console.log(`visual-plan:     ${fs.existsSync(skillPath) ? 'yes' : 'no'}`);
  if (fs.existsSync(metaPath)) {
    try {
      const meta = JSON.parse(fs.readFileSync(metaPath, 'utf8'));
      console.log(`  installedAt:   ${meta.installedAt || '—'}`);
      console.log(`  mcpUrl:        ${meta.mcpUrl || '—'}`);
    } catch {
      /* ignore */
    }
  }
  console.log(`MURE dashboard:  node _SYSTEM/Scripts/work-dashboard.mjs --serve → :4270`);
  console.log(`Guide:           02_RESOURCES/GUIDES/agent-native-company-visuals.md`);
  console.log(`Spec:            _SYSTEM/reports/AGENT_NATIVE_INTEGRATION_2026-06-29.md`);
}

const cmd = process.argv[2] || 'status';
const map = { clone, 'install-skills': installSkills, connect, status, all: () => { clone(); installSkills(); status(); } };
if (!map[cmd]) {
  console.error(`Usage: node _SYSTEM/Scripts/agent-native-bootstrap.mjs [${Object.keys(map).join('|')}]`);
  process.exit(1);
}
map[cmd]();
