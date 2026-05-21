#!/usr/bin/env node

import net from 'node:net';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

let cachedDefault = null;

export async function canBindLocalhost(options = {}) {
  const host = options.host || '127.0.0.1';
  if (host === '127.0.0.1' && cachedDefault && options.cache !== false) return cachedDefault;

  const result = await new Promise((resolve) => {
    const server = net.createServer();
    let settled = false;
    const finish = (value) => {
      if (settled) return;
      settled = true;
      resolve(value);
    };

    server.once('error', (error) => {
      finish({
        ok: false,
        host,
        code: error?.code || '',
        error: error?.message || String(error),
      });
    });

    server.listen(0, host, () => {
      const address = server.address();
      server.close(() => {
        finish({
          ok: true,
          host,
          port: typeof address === 'object' && address ? address.port : null,
        });
      });
    });
  });

  if (host === '127.0.0.1' && options.cache !== false) cachedDefault = result;
  return result;
}

export async function allowOnlyIfBindable(t, options = {}) {
  const result = await canBindLocalhost(options);
  if (result.ok) return true;
  const reason = `[loopback unavailable] ${result.code || result.error || 'cannot bind 127.0.0.1'}`;
  if (t && typeof t.skip === 'function') t.skip(reason);
  return false;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const result = await canBindLocalhost({ cache: false });
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  process.exit(result.ok ? 0 : 2);
}
