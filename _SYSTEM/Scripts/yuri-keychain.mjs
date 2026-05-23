#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const [, , command, key, ...rest] = process.argv;
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const registryPath = path.resolve(__dirname, '..', 'config', 'keychain-registry.json');
const registry = loadRegistry();
const servicePrefix = process.env.YURI_KEYCHAIN_SERVICE_PREFIX || 'YURI_OS_MUSUBI';
const account = process.env.USER || 'yuri';

function usage(exitCode = 0) {
  const out = [
    'Usage:',
    '  yuri-keychain.mjs list',
    '  yuri-keychain.mjs has <KEY>',
    '  yuri-keychain.mjs get <KEY>',
    '  yuri-keychain.mjs set <KEY> <VALUE>',
    '  yuri-keychain.mjs set-env <KEY>',
    '  yuri-keychain.mjs delete <KEY>',
    '',
    'Service name: YURI_OS_MUSUBI:<KEY>',
  ].join('\n');
  (exitCode ? console.error : console.log)(out);
  process.exit(exitCode);
}

function loadRegistry() {
  if (!existsSync(registryPath)) return { keys: {} };
  try {
    return JSON.parse(readFileSync(registryPath, 'utf8'));
  } catch {
    return { keys: {} };
  }
}

function runSecurity(args, options = {}) {
  const result = spawnSync('security', args, {
    encoding: 'utf8',
    stdio: options.stdio || ['ignore', 'pipe', 'pipe'],
  });
  return result;
}

function requireKey() {
  if (!key || !/^[A-Z0-9_]+$/.test(key)) usage(2);
  if (!registry.keys?.[key] && process.env.YURI_KEYCHAIN_ALLOW_UNREGISTERED !== '1') {
    console.error(`Unregistered key: ${key}`);
    console.error(`Add it to ${registryPath} or set YURI_KEYCHAIN_ALLOW_UNREGISTERED=1 for one-off migration.`);
    process.exit(2);
  }
}

function serviceFor(name) {
  return `${servicePrefix}:${name}`;
}

if (!command || command === '--help' || command === '-h') usage(0);
if (command === 'list') {
  for (const [name, meta] of Object.entries(registry.keys || {}).sort(([a], [b]) => a.localeCompare(b))) {
    console.log(`${name}\t${meta.owner || 'unknown'}\t${meta.missing || 'warn'}`);
  }
  process.exit(0);
}
requireKey();

const service = serviceFor(key);

if (command === 'has') {
  const result = runSecurity(['find-generic-password', '-a', account, '-s', service, '-w']);
  process.exit(result.status === 0 ? 0 : 1);
}

if (command === 'get') {
  const result = runSecurity(['find-generic-password', '-a', account, '-s', service, '-w']);
  if (result.status !== 0) process.exit(result.status || 1);
  process.stdout.write(result.stdout);
  process.exit(0);
}

if (command === 'set') {
  const value = rest.join(' ');
  if (!value) usage(2);
  const result = runSecurity([
    'add-generic-password',
    '-a', account,
    '-s', service,
    '-w', value,
    '-U',
  ]);
  if (result.status !== 0) {
    process.stderr.write(result.stderr || `security exited ${result.status}\n`);
    process.exit(result.status || 1);
  }
  console.log(`${key}=stored`);
  process.exit(0);
}

if (command === 'set-env') {
  const value = process.env[key];
  if (!value) {
    console.error(`${key}=missing from environment`);
    process.exit(1);
  }
  const result = runSecurity([
    'add-generic-password',
    '-a', account,
    '-s', service,
    '-w', value,
    '-U',
  ]);
  if (result.status !== 0) {
    process.stderr.write(result.stderr || `security exited ${result.status}\n`);
    process.exit(result.status || 1);
  }
  console.log(`${key}=stored`);
  process.exit(0);
}

if (command === 'delete') {
  const result = runSecurity(['delete-generic-password', '-a', account, '-s', service]);
  if (result.status !== 0 && !/could not be found/i.test(result.stderr || '')) {
    process.stderr.write(result.stderr || `security exited ${result.status}\n`);
    process.exit(result.status || 1);
  }
  console.log(`${key}=deleted`);
  process.exit(0);
}

usage(2);
