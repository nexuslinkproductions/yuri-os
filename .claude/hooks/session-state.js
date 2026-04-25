'use strict';
const fs = require('fs');
const path = require('path');

const STATE_FILE = path.join(__dirname, '..', 'state', 'session-state.json');

function read() {
  try {
    return JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'));
  } catch {
    return null;
  }
}

function write(state) {
  const tmp = `${STATE_FILE}.tmp`;
  fs.mkdirSync(path.dirname(STATE_FILE), { recursive: true });
  fs.writeFileSync(tmp, JSON.stringify(state, null, 2));
  fs.renameSync(tmp, STATE_FILE);
}

function update(updater) {
  const state = read();
  if (!state) return;
  updater(state);
  write(state);
}

module.exports = { read, write, update, STATE_FILE };
