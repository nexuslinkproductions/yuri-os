#!/usr/bin/env node
// SessionStart — initialize scout bus and reset throttle for new session
'use strict';
const bus = require('./scout-bus.js');

try {
  bus.initIfMissing();
  bus.resetForNewSession();
} catch (_) {}

process.exit(0);
