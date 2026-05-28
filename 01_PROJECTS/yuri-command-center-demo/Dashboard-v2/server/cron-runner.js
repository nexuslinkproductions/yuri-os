/**
 * cron-runner.js — PM2 cron job trigger
 *
 * Called by PM2 on schedule with the endpoint path as argv[2].
 * POSTs to the local API server to invoke the scheduled function.
 *
 * Usage: node cron-runner.js /_internal/scheduled/telegram-digest
 */

import http from 'http';

const PORT = process.env.PORT || 3001;
const path = process.argv[2];

if (!path) {
  console.error('[cron-runner] missing endpoint path argument');
  process.exit(1);
}

const req = http.request({
  hostname: '127.0.0.1',
  port: PORT,
  path,
  method: 'POST',
  headers: { 'Content-Type': 'application/json', 'Content-Length': '2' },
}, (res) => {
  let body = '';
  res.on('data', d => body += d);
  res.on('end', () => {
    console.log(`[cron-runner] ${path} → ${res.statusCode} ${body.slice(0, 200)}`);
    process.exit(res.statusCode < 400 ? 0 : 1);
  });
});

req.on('error', err => {
  console.error(`[cron-runner] ${path} request failed:`, err.message);
  process.exit(1);
});

req.write('{}');
req.end();
