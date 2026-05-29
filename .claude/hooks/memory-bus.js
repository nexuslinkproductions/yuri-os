'use strict';
const fs = require('fs');
const path = require('path');
const os = require('os');
const { execSync } = require('child_process');

const BUS_FILE = path.join(os.homedir(), '.claude', 'memory-bus.json');
// Use a separate dir so we don't collide with Claude's native session files
const SESSIONS_DIR = path.join(os.homedir(), '.claude', 'memory-sessions');

const MEMORY_PATTERNS = [
  /\/\.claude\/projects\/[^/]+\/memory\/[^/]+\.md$/,
  /\/\.claude\/yuri-sentinel\/learning\/[^/]+\.md$/,
];

// Walk the process tree: Claude → sh → node(hook). Return Claude's stable PID.
// Hook chain: Claude(A) spawns sh(B) which execs node(C). process.ppid=B, B's ppid=A.
// If Claude spawns node directly (no sh), process.ppid=A already.
function getSessionId() {
  try {
    const parentPid = process.ppid;
    const grandparentLine = execSync(`ps -p ${parentPid} -o ppid=`, {
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'ignore'],
    }).trim();
    const grandparentPid = parseInt(grandparentLine, 10);

    if (!isNaN(grandparentPid) && grandparentPid > 1) {
      // Grandparent is Claude — verify it's a long-lived node/claude process
      const grandCmd = execSync(`ps -p ${grandparentPid} -o comm=`, {
        encoding: 'utf8',
        stdio: ['pipe', 'pipe', 'ignore'],
      }).trim();
      // Grandparent is node/claude → use it as stable session key
      if (/^(node|claude)/.test(grandCmd)) {
        return `claude_${grandparentPid}`;
      }
    }
    // Fallback: parent is Claude (no intermediate sh)
    return `claude_${parentPid}`;
  } catch {
    return `claude_${process.ppid}`;
  }
}

function readBus() {
  try { return JSON.parse(fs.readFileSync(BUS_FILE, 'utf8')); }
  catch { return { sequence: 0, lastWrite: null, writerSession: null, files: [] }; }
}

function writeBus(sessionId, files) {
  const bus = readBus();
  bus.sequence = (bus.sequence || 0) + 1;
  bus.lastWrite = new Date().toISOString();
  bus.writerSession = sessionId;
  bus.files = Array.isArray(files) ? files : [files];
  const tmp = `${BUS_FILE}.tmp`;
  fs.mkdirSync(path.dirname(BUS_FILE), { recursive: true });
  fs.writeFileSync(tmp, JSON.stringify(bus, null, 2));
  fs.renameSync(tmp, BUS_FILE);
  return bus;
}

function readSession(sessionId) {
  try {
    return JSON.parse(fs.readFileSync(path.join(SESSIONS_DIR, `${sessionId}.json`), 'utf8'));
  } catch {
    // New session: initialize lastSeenSequence to 0 so it catches any existing bus writes
    return { sessionId, startTime: new Date().toISOString(), lastSeenSequence: 0 };
  }
}

function writeSession(sessionId, data) {
  fs.mkdirSync(SESSIONS_DIR, { recursive: true });
  fs.writeFileSync(path.join(SESSIONS_DIR, `${sessionId}.json`), JSON.stringify(data, null, 2));
}

function isMemoryFile(filePath) {
  return Boolean(filePath && MEMORY_PATTERNS.some(p => p.test(filePath)));
}

function cleanOldSessions() {
  try {
    const cutoff = Date.now() - 24 * 3600 * 1000;
    for (const f of fs.readdirSync(SESSIONS_DIR)) {
      if (!f.endsWith('.json')) continue;
      const full = path.join(SESSIONS_DIR, f);
      if (fs.statSync(full).mtimeMs < cutoff) fs.unlinkSync(full);
    }
  } catch {}
}

module.exports = { getSessionId, readBus, writeBus, readSession, writeSession, isMemoryFile, cleanOldSessions, BUS_FILE, SESSIONS_DIR };
