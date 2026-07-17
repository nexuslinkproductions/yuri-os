#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

import {
  CANONICAL_BROKER_PATH,
  CANONICAL_IMAGE_PATH,
  main as runGuard,
} from './backend-storage-guard.mjs';

function fail(message) {
  throw new Error(`PHASE1_FIXTURE_REFUSED: ${message}`);
}

async function main() {
  if (process.env.YURI_PHASE1_REAL !== '1') fail('YURI_PHASE1_REAL=1 is required');
  const [configPath, separator, ...writer] = process.argv.slice(2);
  if (!configPath || separator !== '--' || writer.length === 0) fail('config path and writer argv are required');
  if (!path.isAbsolute(configPath) || path.resolve(configPath) !== configPath) fail('config path must be normalized');
  const realConfig = fs.realpathSync.native(configPath);
  if (realConfig !== configPath || !realConfig.startsWith('/private/tmp/yuri-phase1-apfs-')) {
    fail('config must be a real file below the owned Phase-1 fixture root');
  }
  const config = JSON.parse(fs.readFileSync(realConfig, 'utf8'));
  const fixtureRoot = path.dirname(realConfig);
  const expectedMountPoint = path.join(fixtureRoot, 'mount');
  if (config.mountPoint !== expectedMountPoint) fail('fixture config mountpoint mismatch');
  if (config.imagePath !== CANONICAL_IMAGE_PATH || config.brokerPath !== CANONICAL_BROKER_PATH) {
    fail('fixture config must use the canonical enrolled image and broker');
  }

  return runGuard(['supervise', '--config', realConfig, '--', ...writer], {
    expectedCanonicalMountPoint: expectedMountPoint,
    expectedImagePath: CANONICAL_IMAGE_PATH,
    expectedBrokerPath: CANONICAL_BROKER_PATH,
  });
}

main().then(
  (code) => { process.exitCode = Number.isInteger(code) ? code : 0; },
  (error) => {
    process.stderr.write(`${JSON.stringify({ ok: false, error: error.message })}\n`);
    process.exitCode = 1;
  },
);
