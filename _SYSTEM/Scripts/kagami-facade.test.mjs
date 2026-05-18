import { test } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { tryKagami, tailKagamiStream } from './kagami-facade.mjs';

test('tryKagami returns ok:false when unreachable', async () => {
  process.env.KAGAMI_URL = 'http://127.0.0.1:1';
  const result = await tryKagami('hello', { lane: 'deepseek-v4-flash' });
  assert.equal(result.ok, false);
  assert.ok(typeof result.reason === 'string');
});

test('tailKagamiStream parses mock SSE', async () => {
  const server = http.createServer((req, res) => {
    res.setHeader('Content-Type', 'text/event-stream');
    res.writeHead(200);
    res.write('event: token\ndata: {"seq":1,"token":"hello","done":false}\n\n');
    res.write('event: token\ndata: {"seq":2,"token":" world","done":false}\n\n');
    res.write('event: end\ndata: {}\n\n');
    res.end();
  });
  await new Promise((r) => server.listen(0, r));
  const port = server.address().port;
  const text = await tailKagamiStream('http://127.0.0.1:' + port + '/stream', 5000);
  server.close();
  assert.ok(text.includes('hello'));
  assert.ok(text.includes('world'));
});
