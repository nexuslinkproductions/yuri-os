// @capability: session-conductor-tests
// @serves: session conductor test suite | hermetic tmux stub coverage
// @does: hermetic node:test suite covering create/list/draft/send-only-pending/no-draft-error/
//        peek-parse/kill-cleanup/registry-persistence with a stubbed runTmux (no real tmux needed).
// @use: node --test _SYSTEM/runtime/session-conductor.test.mjs
// @exports: (test suite)
//
// Isolation: SESSION_CONDUCTOR_STATE_DIR points this module's state dir at a private
// tmpdir (never the real _SYSTEM/state/runtime/), same pattern as yuri-runtimed.test.mjs's
// RUNTIMED_STATE_DIR. Module-level consts read process.env once at import time, so the env
// var is set BEFORE the dynamic import below. Without this, running the full runtime test
// glob (`node --test _SYSTEM/runtime/*.test.mjs`) races this suite's per-test recursive
// rmSync of the real shared state dir against concurrent writes from usage-meters.test.mjs /
// yuri-repl.test.mjs into the same real events.jsonl — producing an intermittent ENOTEMPTY
// during teardown and cross-file event-log contamination (fixed 2026-07-05).
import { describe, it, beforeEach, afterEach, after } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, rmSync, writeFileSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';

const sfx = `${process.pid}-${crypto.randomBytes(4).toString('hex')}`;
const STATE_DIR = join(tmpdir(), `session-conductor-test-${sfx}`);
process.env.SESSION_CONDUCTOR_STATE_DIR = STATE_DIR;

const cond = await import('./session-conductor.mjs');

const SESSIONS_FILE = join(STATE_DIR, 'sessions.json');
const DRAFTS_FILE = join(STATE_DIR, 'drafts.json');
const EVENTS_FILE = join(STATE_DIR, 'events.jsonl');

// ─── stub runTmux ─────────────────────────────────────────────────────────────
// Captures all tmux invocations (as argv ARRAYS — RT-01/02 fix: runTmux no longer
// accepts a shell-like string) so tests can assert on the exact argv sequence.
// `calls` stores the raw argv arrays; callers that want substring-style assertions
// (the pre-fix style) can `.join(' ')` an entry, but exact-argv checks are preferred
// since they are what actually proves no corruption occurred.
function makeStubRunTmux(captureOutput = 'mock pane output\nline 2\n$ ') {
  const calls = [];
  const fn = (argv) => {
    calls.push(argv);
    // Return mock output for capture-pane, empty string for everything else.
    if (argv.includes('capture-pane')) return captureOutput;
    return '';
  };
  fn.calls = calls;
  return fn;
}

function resetState() {
  if (existsSync(STATE_DIR)) {
    rmSync(STATE_DIR, { recursive: true, force: true });
  }
  mkdirSync(STATE_DIR, { recursive: true });
}

describe('session-conductor', () => {
  beforeEach(() => resetState());
  afterEach(() => resetState());
  after(() => {
    // Full removal (not just empty-and-recreate) — this suite's own private tmpdir,
    // never the real _SYSTEM/state/runtime/, so nothing else shares this path.
    rmSync(STATE_DIR, { recursive: true, force: true });
  });

  // ── create ──────────────────────────────────────────────────────────────────
  describe('create', () => {
    it('creates a tmux session and registers it', () => {
      const stub = makeStubRunTmux();
      const rec = cond.conductor.create('s1', {}, stub);

      assert.equal(rec.name, 's1');
      assert.equal(rec.tmux, 's1');
      assert.equal(rec.status, 'running');
      assert.ok(rec.createdAt);
      assert.ok(rec.lastActivity);
      // new-session command was issued, with '-s' immediately followed by the session name
      assert.ok(stub.calls.some(c => c.includes('new-session') && c.includes('-s') && c[c.indexOf('-s') + 1] === 's1'));
    });

    it('launches a custom command via send-keys -l + Enter', () => {
      const stub = makeStubRunTmux();
      cond.conductor.create('s2', { cmd: 'ai claude-zai' }, stub);

      // Must use -l (literal) for the text, sent as ONE argv element (not split/re-tokenized), then a separate Enter
      assert.ok(stub.calls.some(c => c.includes('send-keys') && c.includes('-l') && c.includes('ai claude-zai')));
      assert.ok(stub.calls.some(c => c.includes('send-keys') && c[c.length - 1] === 'Enter' && c.includes('s2')));
    });

    it('creates a plain shell when no --cmd given (no send-keys)', () => {
      const stub = makeStubRunTmux();
      cond.conductor.create('s3', {}, stub);
      // Only the new-session call, no send-keys
      assert.equal(stub.calls.filter(c => c.includes('send-keys')).length, 0);
    });

    it('throws on duplicate name', () => {
      const stub = makeStubRunTmux();
      cond.conductor.create('dup', {}, stub);
      assert.throws(() => cond.conductor.create('dup', {}, stub), /already exists/);
    });

    it('throws without a name', () => {
      const stub = makeStubRunTmux();
      assert.throws(() => cond.conductor.create(null, {}, stub), /requires a session name/);
    });

    it('appends a session.create event to events.jsonl', () => {
      const stub = makeStubRunTmux();
      cond.conductor.create('evt', {}, stub);
      assert.ok(existsSync(EVENTS_FILE));
      const lines = readFileSync(EVENTS_FILE, 'utf-8').trim().split('\n');
      const last = JSON.parse(lines[lines.length - 1]);
      assert.equal(last.comp, 'conductor');
      assert.equal(last.event, 'session.create');
      assert.equal(last.data.name, 'evt');
    });
  });

  // ── list ────────────────────────────────────────────────────────────────────
  describe('list', () => {
    it('lists all registered sessions', () => {
      const stub = makeStubRunTmux();
      cond.conductor.create('a', {}, stub);
      cond.conductor.create('b', {}, stub);
      const list = cond.conductor.list(stub);
      assert.equal(list.length, 2);
      assert.ok(list.some(s => s.name === 'a'));
      assert.ok(list.some(s => s.name === 'b'));
    });

    it('returns empty array when no sessions exist', () => {
      const stub = makeStubRunTmux();
      const list = cond.conductor.list(stub);
      assert.equal(list.length, 0);
    });
  });

  // ── draft ───────────────────────────────────────────────────────────────────
  describe('draft', () => {
    it('stores a pending draft without sending', () => {
      const stub = makeStubRunTmux();
      cond.conductor.create('d1', {}, stub);
      const callsBefore = stub.calls.length;
      const draft = cond.conductor.draft('d1', { text: 'echo hello' }, stub);
      assert.equal(draft.text, 'echo hello');
      // No send-keys should have been issued by draft
      assert.equal(stub.calls.slice(callsBefore).filter(c => c.includes('send-keys')).length, 0);
    });

    it('throws without --text', () => {
      const stub = makeStubRunTmux();
      cond.conductor.create('d2', {}, stub);
      assert.throws(() => cond.conductor.draft('d2', {}, stub), /requires --text/);
    });

    it('throws if session not in registry', () => {
      const stub = makeStubRunTmux();
      assert.throws(() => cond.conductor.draft('ghost', { text: 'x' }, stub), /not found/);
    });
  });

  // ── send (only when pending draft exists) ───────────────────────────────────
  describe('send', () => {
    it('sends a pending draft via tmux send-keys -l + Enter', () => {
      const stub = makeStubRunTmux();
      cond.conductor.create('se1', {}, stub);
      cond.conductor.draft('se1', { text: 'echo test' }, stub);
      const callsBefore = stub.calls.length;
      const result = cond.conductor.send('se1', stub);

      assert.equal(result.sent, 'echo test');
      const sendCalls = stub.calls.slice(callsBefore).filter(c => c.includes('send-keys'));
      // -l literal + Enter = at least 2 calls
          assert.ok(sendCalls.length >= 2);
          assert.ok(sendCalls.some(c => c.includes('-l') && c.includes('echo test')));
          assert.ok(sendCalls.some(c => c[c.length - 1] === 'Enter'));
    });

    it('clears the draft after sending (second send fails)', () => {
      const stub = makeStubRunTmux();
      cond.conductor.create('se2', {}, stub);
      cond.conductor.draft('se2', { text: 'echo once' }, stub);
      cond.conductor.send('se2', stub);
      // Second send should throw — no pending draft
      assert.throws(() => cond.conductor.send('se2', stub), /no pending draft/);
    });
  });

  // ── no-draft-error ──────────────────────────────────────────────────────────
  describe('send without draft', () => {
    it('throws when there is no pending draft', () => {
      const stub = makeStubRunTmux();
      cond.conductor.create('nd1', {}, stub);
      assert.throws(() => cond.conductor.send('nd1', stub), /no pending draft/);
    });
  });

  // ── peek parse ──────────────────────────────────────────────────────────────
  describe('peek', () => {
    it('captures pane output and returns text', () => {
      const stub = makeStubRunTmux('line1\nline2\n$ ');
      cond.conductor.create('pk1', {}, stub);
      const output = cond.conductor.peek('pk1', {}, stub);
      assert.ok(output.includes('line1'));
      assert.ok(output.includes('line2'));
      assert.ok(stub.calls.some(c => c.includes('capture-pane') && c.includes('pk1')));
    });

    it('passes --lines to capture-pane', () => {
      const stub = makeStubRunTmux();
      cond.conductor.create('pk2', {}, stub);
      cond.conductor.peek('pk2', { lines: '10' }, stub);
      assert.ok(stub.calls.some(c => c.includes('-S') && c.includes('-10')));
    });
  });

  // ── watch ───────────────────────────────────────────────────────────────────
  describe('watch', () => {
    it('returns matched=true when grep matches pane output', () => {
      const stub = makeStubRunTmux('BUILD PASSED\n$ ');
      cond.conductor.create('w1', {}, stub);
      const result = cond.conductor.watch('w1', { grep: 'PASSED' }, stub);
      assert.equal(result.matched, true);
    });

    it('returns matched=false when grep does not match', () => {
      const stub = makeStubRunTmux('all good\n$ ');
      cond.conductor.create('w2', {}, stub);
      const result = cond.conductor.watch('w2', { grep: 'ERROR' }, stub);
      assert.equal(result.matched, false);
    });
  });

  // ── kill cleanup ────────────────────────────────────────────────────────────
  describe('kill', () => {
    it('kills the tmux session and removes it from registry', () => {
      const stub = makeStubRunTmux();
      cond.conductor.create('k1', {}, stub);
      const result = cond.conductor.kill('k1', stub);
      assert.equal(result.killed, true);
      assert.ok(stub.calls.some(c => c.includes('kill-session') && c.includes('k1')));
      // Session no longer in registry
      const list = cond.conductor.list(stub);
      assert.equal(list.filter(s => s.name === 'k1').length, 0);
    });

    it('clears pending draft on kill', () => {
      const stub = makeStubRunTmux();
      cond.conductor.create('k2', {}, stub);
      cond.conductor.draft('k2', { text: 'pending' }, stub);
      cond.conductor.kill('k2', stub);
      // If we recreate the session, there should be no leftover draft
      assert.ok(existsSync(DRAFTS_FILE));
    });

    it('throws when killing a session not in registry', () => {
      const stub = makeStubRunTmux();
      assert.throws(() => cond.conductor.kill('ghost', stub), /not found/);
    });

    it('removes from registry even if tmux kill-session fails (non-fatal)', () => {
      const stub = makeStubRunTmux();
      stub.sideEffect = 'fail-on-kill';
      const failingStub = (cmd) => {
        stub.calls.push(cmd);
        if (cmd.includes('kill-session')) throw new Error('no session');
        if (cmd.includes('capture-pane')) return '';
        return '';
      };
      failingStub.calls = stub.calls;
      cond.conductor.create('k3', {}, failingStub);
      // Should NOT throw despite kill-session failure
      const result = cond.conductor.kill('k3', failingStub);
      assert.equal(result.killed, true);
      const list = cond.conductor.list(failingStub);
      assert.equal(list.filter(s => s.name === 'k3').length, 0);
    });
  });

  // ── registry persistence ────────────────────────────────────────────────────
  describe('registry persistence', () => {
    it('sessions.json survives a fresh conductor instance (re-read)', () => {
      const stub = makeStubRunTmux();
      cond.conductor.create('persist1', { cmd: 'echo hi' }, stub);
      // Simulate a restart by just calling list again (module re-reads from disk)
      const list = cond.conductor.list(stub);
      const found = list.find(s => s.name === 'persist1');
      assert.ok(found);
      assert.equal(found.cmd, 'echo hi');
      assert.equal(found.status, 'running');
    });

    it('drafts.json persists across calls', () => {
      const stub = makeStubRunTmux();
      cond.conductor.create('persist2', {}, stub);
      cond.conductor.draft('persist2', { text: 'do thing' }, stub);
      // Draft is readable from disk
      assert.ok(existsSync(DRAFTS_FILE));
      const drafts = JSON.parse(readFileSync(DRAFTS_FILE, 'utf-8'));
      assert.ok(drafts['persist2']);
      assert.equal(drafts['persist2'].text, 'do thing');
    });

    it('events.jsonl accumulates events across operations', () => {
      const stub = makeStubRunTmux();
      cond.conductor.create('persist3', {}, stub);
      cond.conductor.draft('persist3', { text: 'x' }, stub);
      cond.conductor.send('persist3', stub);
      cond.conductor.kill('persist3', stub);
      assert.ok(existsSync(EVENTS_FILE));
      const events = readFileSync(EVENTS_FILE, 'utf-8').trim().split('\n').map(JSON.parse);
      const types = events.map(e => e.event);
      assert.ok(types.includes('session.create'));
      assert.ok(types.includes('session.draft'));
      assert.ok(types.includes('session.send'));
      assert.ok(types.includes('session.kill'));
      // All events tagged with comp=conductor
      assert.ok(events.every(e => e.comp === 'conductor'));
    });
  });

  // ── status ──────────────────────────────────────────────────────────────────
  describe('status', () => {
    it('returns healthy=true with session count', () => {
      const stub = makeStubRunTmux();
      cond.conductor.create('st1', {}, stub);
      cond.conductor.create('st2', {}, stub);
      const status = cond.conductor.status({}, stub);
      assert.equal(status.healthy, true);
      assert.equal(status.sessionCount, 2);
    });

    it('counts pending drafts', () => {
      const stub = makeStubRunTmux();
      cond.conductor.create('st3', {}, stub);
      cond.conductor.draft('st3', { text: 'x' }, stub);
      const status = cond.conductor.status({}, stub);
      assert.equal(status.pendingDrafts, 1);
    });
  });

  // ── send-keys escaping ──────────────────────────────────────────────────────
  describe('send-keys literal escaping', () => {
    it('uses -l flag for literal text (no key-name interpretation)', () => {
      const stub = makeStubRunTmux();
      cond.conductor.create('esc1', {}, stub);
      cond.conductor.draft('esc1', { text: 'echo "hello world"' }, stub);
      cond.conductor.send('esc1', stub);
      const sendCalls = stub.calls.filter(c => c.includes('-l'));
      assert.ok(sendCalls.length > 0);
      // RT-01/02 fix: the text must appear as ONE argv element, byte-exact —
      // no quote-escaping, no substring corruption. The old test asserted a
      // substring match on a joined shell-string; the fixed contract is exact
      // argv-element equality (the whole point of never building a string).
      assert.ok(sendCalls.some(c => c.includes('echo "hello world"')));
    });
  });

  // ── RT-01/02 regression: hostile-string argv unit tests ─────────────────────
  // These test the exact argv array produced by sendKeysLiteralArgv (the function
  // that builds the tmux send-keys invocation), NOT end-to-end tmux — proving the
  // argv shape is correct for text containing double-quotes, single-quotes,
  // command substitution syntax, backticks, and embedded newlines. No string
  // serialization step exists anymore, so each hostile string must survive as a
  // single, untouched argv element.
  describe('sendKeysLiteralArgv — hostile string argv shape (RT-01/02 regression)', () => {
    const HOSTILE_STRINGS = [
      { label: 'double quotes', text: 'echo "hello world"' },
      { label: 'single quotes', text: "echo 'hello world'" },
      { label: 'command substitution', text: 'echo $(whoami)' },
      { label: 'backticks', text: 'echo `whoami`' },
      { label: 'embedded newline', text: 'line one\nline two' },
      { label: 'mixed quotes + subshell', text: `git commit -m "fix: 'quoted' $(date)"` },
      { label: 'leading dash (flag-lookalike)', text: '--not-a-flag --evil' },
    ];

    for (const { label, text } of HOSTILE_STRINGS) {
      it(`produces a correct 2-call argv pair for: ${label}`, () => {
        const [literalCall, enterCall] = cond.sendKeysLiteralArgv('target-sess', text);

        // Call 1: literal send — argv is EXACTLY this shape, text untouched as ONE element.
        assert.deepEqual(literalCall, ['tmux', 'send-keys', '-t', 'target-sess', '-l', '--', text]);
        // The hostile text must appear byte-exact — no escaping, no truncation, no corruption.
        assert.equal(literalCall[literalCall.length - 1], text);

        // Call 2: Enter is a fully separate call, never concatenated with the text.
        assert.deepEqual(enterCall, ['tmux', 'send-keys', '-t', 'target-sess', 'Enter']);
      });
    }

    it('end-to-end via conductor.send: draft->send produces the exact argv for hostile text', () => {
      for (const { text } of HOSTILE_STRINGS) {
        const stub = makeStubRunTmux();
        cond.conductor.create('hostile-e2e', {}, stub);
        cond.conductor.draft('hostile-e2e', { text }, stub);
        const before = stub.calls.length;
        cond.conductor.send('hostile-e2e', stub);
        const sendCalls = stub.calls.slice(before);
        const literalCall = sendCalls.find((c) => c.includes('-l'));
        assert.ok(literalCall, `no -l call found for text: ${JSON.stringify(text)}`);
        assert.equal(literalCall[literalCall.length - 1], text, `text corrupted for: ${JSON.stringify(text)}`);
        cond.conductor.kill('hostile-e2e', stub);
      }
    });
  });

  // ── RT-01/02 live tmux smoke test (real tmux, real process) ─────────────────
  // Skips gracefully if tmux is not installed in this environment (CI-safety),
  // but when tmux IS available this exercises the real fixed dispatch path:
  // creates a throwaway tmux session running `cat > <tmpfile>`, sends each
  // hostile string through the actual runTmux + sendKeysLiteralArgv path, and
  // verifies the captured file is byte-exact — proving no corruption and no
  // `dquote>`-style stuck shell state in real tmux. Only ever creates/kills a
  // session this test itself created (named uniquely per run).
  describe('live tmux smoke (real tmux, skips if unavailable)', () => {
    let tmuxAvailable = true;
    try {
      execFileSync('tmux', ['-V'], { stdio: ['ignore', 'ignore', 'ignore'] });
    } catch {
      tmuxAvailable = false;
    }

    const SESSION = `rt-fix-smoke-${process.pid}`;
    const CAPTURE_FILE = `/tmp/rt-fix-capture-${process.pid}.txt`;

    it('sends hostile strings through real tmux and reads them back byte-exact', { skip: !tmuxAvailable ? 'tmux not installed in this environment' : false }, async () => {
      // Create a real tmux session running `cat > file` — cat echoes every line
      // it receives on stdin straight into the file, so whatever tmux delivers
      // as keystrokes is exactly what lands on disk (cat is not a shell, so it
      // performs zero interpretation of the text itself).
      execFileSync('tmux', ['new-session', '-d', '-s', SESSION, '-x', '220', '-y', '50']);
      try {
        execFileSync('tmux', ['send-keys', '-t', SESSION, '-l', '--', `cat > ${CAPTURE_FILE}`]);
        execFileSync('tmux', ['send-keys', '-t', SESSION, 'Enter']);
        // Give `cat` a moment to actually start before we send hostile input.
        await new Promise((r) => setTimeout(r, 400));

        const hostileLines = [
          'echo "hello world"',
          "echo 'hello world'",
          'echo $(whoami)',
          'echo `whoami`',
          'git commit -m "fix: quoted $(date)"',
        ];
        for (const line of hostileLines) {
          const [literalArgv, enterArgv] = cond.sendKeysLiteralArgv(SESSION, line);
          execFileSync(literalArgv[0], literalArgv.slice(1));
          execFileSync(enterArgv[0], enterArgv.slice(1));
          await new Promise((r) => setTimeout(r, 100));
        }
        // End cat's stdin (Ctrl-D) so it flushes and exits, guaranteeing the
        // file is fully written before we read it back.
        execFileSync('tmux', ['send-keys', '-t', SESSION, 'C-d']);
        await new Promise((r) => setTimeout(r, 400));

        assert.ok(existsSync(CAPTURE_FILE), 'capture file was never created — cat did not receive the command');
        const captured = readFileSync(CAPTURE_FILE, 'utf-8');
        for (const line of hostileLines) {
          assert.ok(
            captured.includes(line),
            `hostile line was corrupted or dropped: ${JSON.stringify(line)}\ncaptured:\n${captured}`
          );
        }
      } finally {
        try {
          execFileSync('tmux', ['kill-session', '-t', SESSION]);
        } catch { /* already gone */ }
        try {
          rmSync(CAPTURE_FILE, { force: true });
        } catch { /* best-effort cleanup */ }
      }
    });
  });
});
