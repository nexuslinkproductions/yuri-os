#!/usr/bin/env node

const DEFAULT_BACKEND_URL = 'http://127.0.0.1:3004';
const AUTH_HEADER = 'X-API-KEY';
const DEFAULT_TIMEOUT_MS = 1200;

export function resolveEnvApiKey(env = process.env) {
  return (
    env.API_KEY ||
    env.YURI_API_KEY ||
    env.YURI_BACKEND_API_KEY ||
    env.OFFLOAD_API_KEY ||
    ''
  ).trim();
}

export async function bootstrapApiKey(backendUrl = DEFAULT_BACKEND_URL, options = {}) {
  const timeoutMs = Number(options.timeoutMs || process.env.YURI_AUTH_BOOTSTRAP_TIMEOUT_MS || DEFAULT_TIMEOUT_MS);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(`${backendUrl.replace(/\/$/, '')}/api/auth/bootstrap`, {
      method: 'GET',
      headers: { Accept: 'application/json' },
      signal: controller.signal,
    });

    if (!response.ok) return '';
    const payload = await response.json();
    return typeof payload.apiKey === 'string' ? payload.apiKey.trim() : '';
  } catch {
    return '';
  } finally {
    clearTimeout(timeout);
  }
}

export async function resolveApiKey(options = {}) {
  const envKey = resolveEnvApiKey(options.env || process.env);
  if (envKey) return envKey;
  return bootstrapApiKey(options.backendUrl || DEFAULT_BACKEND_URL, options);
}

export function curlHeaderArgs(apiKey) {
  return apiKey ? ['-H', `${AUTH_HEADER}: ${apiKey}`] : [];
}

function usage() {
  return `Usage: node Scripts/auth.mjs <command> [backend-url]

Commands:
  key             Print the resolved backend API key
  curl-headers    Print curl header args, one arg per line
  json            Print { "headers": { "X-API-KEY": "..." } }
`;
}

async function main(argv) {
  const command = argv[0] || 'curl-headers';
  const backendUrl = argv[1] || process.env.YURI_BACKEND_URL || DEFAULT_BACKEND_URL;
  const apiKey = await resolveApiKey({ backendUrl });

  if (command === 'key') {
    if (apiKey) process.stdout.write(`${apiKey}\n`);
    return;
  }

  if (command === 'curl-headers') {
    process.stdout.write(curlHeaderArgs(apiKey).join('\n'));
    if (apiKey) process.stdout.write('\n');
    return;
  }

  if (command === 'json') {
    const headers = apiKey ? { [AUTH_HEADER]: apiKey } : {};
    process.stdout.write(`${JSON.stringify({ headers }, null, 2)}\n`);
    return;
  }

  if (command === '--help' || command === '-h' || command === 'help') {
    process.stdout.write(usage());
    return;
  }

  throw new Error(`Unknown auth command: ${command}`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main(process.argv.slice(2)).catch((error) => {
    console.error(error.message);
    process.exit(1);
  });
}
