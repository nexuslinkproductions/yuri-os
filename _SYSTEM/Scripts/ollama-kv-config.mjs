#!/usr/bin/env node

import path from 'node:path';
import process from 'node:process';
import { spawn, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const DEFAULT_HOST = normalizeHost(process.env.OLLAMA_HOST || process.env.OLLAMA_BASE_URL || '127.0.0.1:11434');
const DEFAULT_KV_CACHE_TYPE = process.env.OLLAMA_KV_CACHE_TYPE || 'q8_0';
const DEFAULT_FLASH_ATTENTION = parseBoolean(process.env.OLLAMA_FLASH_ATTENTION, true);
const DEFAULT_NO_CLOUD = parseBoolean(process.env.OLLAMA_NO_CLOUD, false);

const mode = process.argv[2] || 'status';
const flags = parseFlags(process.argv.slice(3));

export function buildOllamaKvProfile(input = {}) {
  const host = normalizeHost(input.host || DEFAULT_HOST);
  const kvCacheType = String(input.kvCacheType || DEFAULT_KV_CACHE_TYPE || 'q8_0');
  const flashAttention = input.flashAttention ?? DEFAULT_FLASH_ATTENTION;
  const noCloud = input.noCloud ?? DEFAULT_NO_CLOUD;

  return {
    OLLAMA_HOST: host,
    OLLAMA_FLASH_ATTENTION: flashAttention ? '1' : '0',
    OLLAMA_KV_CACHE_TYPE: kvCacheType,
    OLLAMA_NO_CLOUD: noCloud ? '1' : '0'
  };
}

export function buildLaunchctlCommands(env) {
  return Object.entries(env).map(([key, value]) => ['launchctl', 'setenv', key, String(value)]);
}

export function buildServeCommand(env) {
  return {
    command: 'ollama',
    args: ['serve'],
    env: {
      ...process.env,
      ...env
    }
  };
}

export function buildStatusPayload(env) {
  return {
    profile: env,
    macos_session: process.platform === 'darwin' ? readLaunchctlEnv(env) : null,
    server: null
  };
}

async function main() {
  if (flags.help) {
    help();
    return;
  }

  const profile = buildOllamaKvProfile({
    host: flags.host,
    kvCacheType: flags.kvCacheType,
    flashAttention: flags.flashAttention,
    noCloud: flags.noCloud
  });

  switch (mode) {
    case 'apply':
      await applyProfile(profile, { restart: flags.restart });
      break;
    case 'serve':
      await serveProfile(profile);
      break;
    case 'status':
      await printStatus(profile);
      break;
    case 'print':
      printCommands(profile);
      break;
    default:
      help();
      process.exit(mode === 'help' ? 0 : 1);
  }
}

async function applyProfile(profile, options = {}) {
  if (process.platform !== 'darwin') {
    throw new Error('launchctl profile application is only supported on macOS');
  }

  for (const [key, value] of Object.entries(profile)) {
    runCommand('launchctl', ['setenv', key, String(value)]);
  }

  const status = readLaunchctlEnv(profile);
  console.log(JSON.stringify({ applied: true, profile, launchctl: status }, null, 2));

  if (options.restart) {
    restartOllamaApp();
    await waitForServer(profile.OLLAMA_HOST, 30_000);
    console.log(JSON.stringify({ restarted: true, host: profile.OLLAMA_HOST }, null, 2));
  }
}

async function serveProfile(profile) {
  const command = buildServeCommand(profile);
  const child = spawn(command.command, command.args, {
    cwd: REPO_ROOT,
    env: command.env,
    stdio: 'inherit'
  });

  child.on('exit', code => {
    process.exit(code ?? 1);
  });
}

async function printStatus(profile) {
  const server = await probeServer(profile.OLLAMA_HOST);
  const payload = {
    applied_profile: profile,
    launchctl: process.platform === 'darwin' ? readLaunchctlEnv(profile) : null,
    server
  };
  console.log(JSON.stringify(payload, null, 2));
}

function printCommands(profile) {
  if (process.platform === 'darwin') {
    const commands = buildLaunchctlCommands(profile).map(parts => parts.join(' '));
    console.log(commands.join('\n'));
    console.log('open -a Ollama');
    return;
  }

  console.log(renderSystemdDropIn(profile));
}

function renderSystemdDropIn(profile) {
  return [
    '[Service]',
    `Environment="OLLAMA_HOST=${profile.OLLAMA_HOST}"`,
    `Environment="OLLAMA_FLASH_ATTENTION=${profile.OLLAMA_FLASH_ATTENTION}"`,
    `Environment="OLLAMA_KV_CACHE_TYPE=${profile.OLLAMA_KV_CACHE_TYPE}"`,
    `Environment="OLLAMA_NO_CLOUD=${profile.OLLAMA_NO_CLOUD}"`
  ].join('\n');
}

function readLaunchctlEnv(profile) {
  const result = {};
  for (const key of Object.keys(profile)) {
    const out = spawnSync('launchctl', ['getenv', key], { encoding: 'utf8' });
    result[key] = out.status === 0 ? String(out.stdout || '').trim() : null;
  }
  return result;
}

function restartOllamaApp() {
  runCommand('pkill', ['-f', '/Applications/Ollama.app/Contents/Resources/ollama serve'], true);
  runCommand('pkill', ['-f', 'ollama serve'], true);
  runCommand('open', ['-a', 'Ollama'], true);
}

async function waitForServer(host, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const probe = await probeServer(host);
    if (probe.ok) return probe;
    await new Promise(resolve => setTimeout(resolve, 1000));
  }
  throw new Error(`Timed out waiting for Ollama at ${host}`);
}

async function probeServer(host) {
  const url = buildBaseUrl(host);
  const startedAt = Date.now();
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 3000);
    const response = await fetch(`${url}/api/tags`, { signal: controller.signal });
    clearTimeout(timer);
    return {
      ok: response.ok,
      latency_ms: Date.now() - startedAt,
      url,
      status: response.status
    };
  } catch (error) {
    return {
      ok: false,
      latency_ms: Date.now() - startedAt,
      url,
      error: error instanceof Error ? error.message : String(error)
    };
  }
}

function buildBaseUrl(host) {
  const normalized = normalizeHost(host);
  if (normalized.startsWith('http://') || normalized.startsWith('https://')) {
    return normalized.replace(/\/$/, '');
  }
  return `http://${normalized}`;
}

function normalizeHost(value) {
  const trimmed = String(value || '').trim().replace(/\/$/, '');
  if (!trimmed) return '127.0.0.1:11434';
  if (trimmed.startsWith('http://')) return trimmed.slice('http://'.length);
  if (trimmed.startsWith('https://')) return trimmed.slice('https://'.length);
  return trimmed;
}

function parseBoolean(value, defaultValue) {
  if (value == null || value === '') return defaultValue;
  const normalized = String(value).trim().toLowerCase();
  if (['1', 'true', 'yes', 'on'].includes(normalized)) return true;
  if (['0', 'false', 'no', 'off'].includes(normalized)) return false;
  return defaultValue;
}

function parseFlags(argv) {
  const result = {
    host: null,
    kvCacheType: null,
    flashAttention: null,
    noCloud: null,
    restart: false
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--host') {
      result.host = argv[++i] || result.host;
      continue;
    }
    if (arg === '--kv-cache-type') {
      result.kvCacheType = argv[++i] || result.kvCacheType;
      continue;
    }
    if (arg === '--flash-attention') {
      result.flashAttention = true;
      continue;
    }
    if (arg === '--no-flash-attention') {
      result.flashAttention = false;
      continue;
    }
    if (arg === '--no-cloud') {
      result.noCloud = true;
      continue;
    }
    if (arg === '--cloud') {
      result.noCloud = false;
      continue;
    }
    if (arg === '--restart') {
      result.restart = true;
      continue;
    }
    if (arg === '--help' || arg === '-h') {
      result.help = true;
      continue;
    }
  }

  return result;
}

function runCommand(command, args, allowFailure = false) {
  const result = spawnSync(command, args, { stdio: 'inherit' });
  if (!allowFailure && result.status !== 0) {
    throw new Error(`${command} ${args.join(' ')} failed with code ${result.status ?? 1}`);
  }
  return result;
}

function help() {
  console.log([
    'Usage:',
    '  node _SYSTEM/Scripts/ollama-kv-config.mjs status [--host 127.0.0.1:11434] [--kv-cache-type q8_0]',
    '  node _SYSTEM/Scripts/ollama-kv-config.mjs apply [--restart] [--host ...] [--kv-cache-type ...]',
    '  node _SYSTEM/Scripts/ollama-kv-config.mjs serve [--host ...] [--kv-cache-type ...]',
    '  node _SYSTEM/Scripts/ollama-kv-config.mjs print [--host ...] [--kv-cache-type ...]',
    '',
    'Defaults:',
    `  host=${DEFAULT_HOST}`,
    `  kv_cache_type=${DEFAULT_KV_CACHE_TYPE}`,
    `  flash_attention=${DEFAULT_FLASH_ATTENTION ? '1' : '0'}`,
    `  no_cloud=${DEFAULT_NO_CLOUD ? '1' : '0'}`
  ].join('\n'));
}

const isMainModule = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isMainModule) {
  main().catch(error => {
    console.error(error instanceof Error ? error.stack || error.message : String(error));
    process.exit(1);
  });
}
