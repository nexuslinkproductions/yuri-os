#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const cwd = process.cwd();
const sessionsDir = path.join(cwd, '.claude', 'yuri-sentinel', 'learning', 'sessions');
const governorPy = path.join(cwd, '_SYSTEM', 'OS_KERNEL', 'memory_governor.py');

if (!fs.existsSync(governorPy)) process.exit(0);

const date = new Date().toISOString().slice(0, 10);
const sessionFile = path.join(sessionsDir, `${date}.jsonl`);
if (!fs.existsSync(sessionFile)) process.exit(0);

const lines = fs.readFileSync(sessionFile, 'utf8').trim().split('\n').filter(Boolean);
if (!lines.length) process.exit(0);

let obs;
try { obs = JSON.parse(lines[lines.length - 1]); } catch { process.exit(0); }

const corrections = (obs.corrections || []).slice(0, 3).join(' | ') || 'none';
const files = (obs.files_modified || []).slice(0, 5).join(', ') || 'none';
const commits = (obs.commit_messages || []).slice(0, 3).join(' | ') || 'none';
const errors = (obs.error_snippets || []).filter(Boolean).slice(0, 2).join(' | ') || 'none';
const skills = (obs.skills_read || []).join(', ') || 'none';

const content = `session=${date} corrections=${corrections} files=${files} commits=${commits} errors=${errors} skills=${skills}`;

spawnSync('python3', [
  governorPy, 'write', content,
  '--type', 'episodic',
  '--agent', 'session',
  '--tag', 'session',
  '--importance', '2',
  '--source-kind', 'hook',
], { cwd, timeout: 15000, stdio: 'ignore' });

// Weekly consolidation: run if last run > 7 days ago
try {
  const health = spawnSync('python3', [governorPy, 'health'], { cwd, timeout: 10000, encoding: 'utf8' });
  if (health.status === 0 && health.stdout) {
    const h = JSON.parse(health.stdout);
    const lastRun = h?.last_consolidation?.finished_at;
    const age = lastRun ? Date.now() - new Date(lastRun).getTime() : Infinity;
    if (age > 7 * 86400 * 1000) {
      spawnSync('python3', [governorPy, 'manage', '--cycle', 'weekly'], { cwd, timeout: 30000, stdio: 'ignore' });
    }
  }
} catch {}
