// url-safety-guard.test.mjs — Focused tests for OMP URL safety guard hook.
//
// Tests the hook factory (must be synchronous), handler creation, and
// URL-safety decisions using injected scanners (no network).
// Also verifies the real hook loads and registers against the shared policy module.

import { deepStrictEqual, strictEqual, ok } from 'node:assert';
import { before, describe, it } from 'node:test';

// The nested .omp/hooks/pre/package.json sets "type":"module" so .js files
// in this directory are ESM — static import works.
import hook, { createHandler } from './url-safety-guard.js';

// ---------------------------------------------------------------------------
// Fake HookAPI — captures registered handler for direct invocation.
// ---------------------------------------------------------------------------

class FakeHookAPI {
  constructor() {
    this.handlers = Object.create(null);
  }
  on(event, handler) {
    (this.handlers[event] ??= []).push(handler);
  }
  /** Invoke all tool_call handlers with `event`; return first blocking result or undefined. */
  async invokeToolCall(event) {
    for (const h of this.handlers.tool_call || []) {
      const r = await h(event);
      if (r) return r;
    }
  }
}

// ---------------------------------------------------------------------------
// Injected scanners for handler-only tests
// ---------------------------------------------------------------------------

const passScanner = () => null;
const blockScanner = (cmd) => cmd ? { url: cmd, reason: `URL blocked: private host in "${cmd}"` } : null;
const throwScanner = () => { throw new Error('simulated policy explosion'); };
const allowSafety = () => ({ allowed: true, decision: 'allow' });
const blockSafety = () => ({ allowed: false, decision: 'deny', reason: 'repo wipe blocked' });

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('hook factory (sync registration)', () => {
  it('default export is a function', () => {
    strictEqual(typeof hook, 'function');
  });

  it('sync registration returns undefined (not a Promise)', () => {
    const pi = new FakeHookAPI();
    const result = hook(pi);
    strictEqual(result, undefined, 'hook() must return undefined synchronously, not a Promise');
  });

  it('registers exactly one tool_call handler synchronously', () => {
    const pi = new FakeHookAPI();
    hook(pi);
    ok(pi.handlers.tool_call, 'tool_call handlers key exists');
    strictEqual(pi.handlers.tool_call.length, 1, 'exactly one handler registered');
  });
});

describe('createHandler (injected scanner)', () => {
  it('safe public HTTPS → no block', async () => {
    const h = createHandler(passScanner, allowSafety);
    const r = await h({ toolName: 'bash', input: { command: 'curl https://example.com/' } });
    strictEqual(r, undefined);
  });

  it('safe command with no URLs → no block', async () => {
    const h = createHandler(passScanner, allowSafety);
    const r = await h({ toolName: 'bash', input: { command: 'echo hello world' } });
    strictEqual(r, undefined);
  });

  it('empty command → no block', async () => {
    const h = createHandler(blockScanner, allowSafety);
    const r = await h({ toolName: 'bash', input: { command: '' } });
    strictEqual(r, undefined);
  });

  it('non-bash tool → no block', async () => {
    const h = createHandler(blockScanner, allowSafety);
    const r = await h({ toolName: 'Read', input: { command: 'curl http://127.0.0.1/' } });
    strictEqual(r, undefined);
  });

  it('blocked URL → { block: true, reason }', async () => {
    const h = createHandler(blockScanner, allowSafety);
    const r = await h({ toolName: 'bash', input: { command: 'curl http://127.0.0.1/' } });
    deepStrictEqual(r, { block: true, reason: 'URL blocked: private host in "curl http://127.0.0.1/"' });
  });

  it('thrown policy error → fail closed', async () => {
    const h = createHandler(throwScanner, allowSafety);
    const r = await h({ toolName: 'bash', input: { command: 'curl https://safe.example.com/' } });
    deepStrictEqual(r, { block: true, reason: 'URL guard error: simulated policy explosion' });
  });

  it('missing toolName → no block', async () => {
    const h = createHandler(blockScanner, allowSafety);
    const r = await h({ input: { command: 'curl http://127.0.0.1/' } });
    strictEqual(r, undefined);
  });

  it('missing input → no block', async () => {
    const h = createHandler(blockScanner, allowSafety);
    const r = await h({ toolName: 'bash' });
    strictEqual(r, undefined);
  });
});

describe('shared YURI safety integration', () => {
  it('blocks when the shared safety core denies a command', async () => {
    const h = createHandler(passScanner, blockSafety);
    const r = await h({ toolName: 'bash', input: { command: 'node dangerous.js' } });
    deepStrictEqual(r, { block: true, reason: 'repo wipe blocked' });
  });

  it('real safety core blocks dynamic repository deletion', async () => {
    const pi = new FakeHookAPI();
    hook(pi);
    const r = await pi.invokeToolCall({
      toolName: 'bash',
      input: { command: 'node -e "require(\'fs\').rmSync(process.cwd(), {recursive:true, force:true})"' },
    });
    ok(r?.block, 'dynamic deletion should be blocked');
    ok(r?.reason?.includes('dynamic interpreter filesystem deletion'));
  });
});

describe('hook factory (real policy module)', () => {
  it('safe public HTTPS passes through real policy', async () => {
    const pi = new FakeHookAPI();
    hook(pi);
    const r = await pi.invokeToolCall({ toolName: 'bash', input: { command: 'curl https://example.com/' } });
    strictEqual(r, undefined);
  });

  it('localhost blocks through real policy', async () => {
    const pi = new FakeHookAPI();
    hook(pi);
    const r = await pi.invokeToolCall({ toolName: 'bash', input: { command: 'curl http://localhost:8080/api' } });
    ok(r?.block, 'should block localhost');
    ok(r?.reason?.includes('private-network'), 'reason mentions private-network');
  });

  it('private IPv4 (127.0.0.1) blocks through real policy', async () => {
    const pi = new FakeHookAPI();
    hook(pi);
    const r = await pi.invokeToolCall({ toolName: 'bash', input: { command: 'curl http://127.0.0.1/' } });
    ok(r?.block, 'should block 127.0.0.1');
    ok(r?.reason?.includes('private-network'), 'reason mentions private-network');
  });

  it('private IPv4 (10.x) blocks through real policy', async () => {
    const pi = new FakeHookAPI();
    hook(pi);
    const r = await pi.invokeToolCall({ toolName: 'bash', input: { command: 'wget http://10.0.0.1/admin' } });
    ok(r?.block, 'should block 10.x');
  });

  it('private IPv4 (192.168.x) blocks through real policy', async () => {
    const pi = new FakeHookAPI();
    hook(pi);
    const r = await pi.invokeToolCall({ toolName: 'bash', input: { command: 'curl https://192.168.1.1/' } });
    ok(r?.block, 'should block 192.168.x');
  });

  it('private IPv4 (172.16.x) blocks through real policy', async () => {
    const pi = new FakeHookAPI();
    hook(pi);
    const r = await pi.invokeToolCall({ toolName: 'bash', input: { command: 'curl http://172.16.0.1/' } });
    ok(r?.block, 'should block 172.16.x');
  });

  it('IPv6 loopback (::1) blocks through real policy', async () => {
    const pi = new FakeHookAPI();
    hook(pi);
    const r = await pi.invokeToolCall({ toolName: 'bash', input: { command: 'curl http://[::1]:8080/' } });
    ok(r?.block, 'should block ::1');
  });

  it('IPv6 link-local (fe80::1) blocks through real policy', async () => {
    const pi = new FakeHookAPI();
    hook(pi);
    const r = await pi.invokeToolCall({ toolName: 'bash', input: { command: 'curl http://[fe80::1]:8080/' } });
    ok(r?.block, 'should block fe80::1');
  });

  it('IPv6 ULA (fd00::1) blocks through real policy', async () => {
    const pi = new FakeHookAPI();
    hook(pi);
    const r = await pi.invokeToolCall({ toolName: 'bash', input: { command: 'curl http://[fd00::1]:8080/' } });
    ok(r?.block, 'should block fd00::1');
  });

  it('malformed URL blocks through real policy', async () => {
    const pi = new FakeHookAPI();
    hook(pi);
    const r = await pi.invokeToolCall({ toolName: 'bash', input: { command: 'curl https://[not-an-ip]/' } });
    ok(r?.block, 'should block malformed URL');
    ok(r?.reason?.includes('malformed'), 'reason mentions malformed');
  });

  it('no-URL command passes through real policy', async () => {
    const pi = new FakeHookAPI();
    hook(pi);
    const r = await pi.invokeToolCall({ toolName: 'bash', input: { command: 'echo hello world' } });
    strictEqual(r, undefined);
  });
});
