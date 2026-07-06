import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { appendJsonl, readJsonl, tailJsonl } from './jsonl.mjs';

describe('jsonl', () => {
  let tmp;

  beforeEach(() => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'lib-jsonl-'));
  });

  afterEach(() => {
    fs.rmSync(tmp, { recursive: true, force: true });
  });

  describe('appendJsonl', () => {
    it('appends one line per record and round-trips', () => {
      const f = path.join(tmp, 'a.jsonl');
      assert.equal(appendJsonl(f, { n: 1 }), true);
      assert.equal(appendJsonl(f, { n: 2 }), true);
      const lines = fs.readFileSync(f, 'utf8').trim().split('\n');
      assert.equal(lines.length, 2);
      assert.deepEqual(JSON.parse(lines[1]), { n: 2 });
    });

    it('creates parent dirs by default (mkdir:true)', () => {
      const f = path.join(tmp, 'deep', 'er', 'a.jsonl');
      assert.equal(appendJsonl(f, { ok: true }), true);
      assert.ok(fs.existsSync(f));
    });

    it('mkdir:false + missing dir fails open as false', () => {
      const f = path.join(tmp, 'nope', 'a.jsonl');
      assert.equal(appendJsonl(f, { x: 1 }, { mkdir: false }), false);
    });

    it('failOpen:false throws on error', () => {
      const f = path.join(tmp, 'nope', 'a.jsonl');
      assert.throws(() => appendJsonl(f, { x: 1 }, { mkdir: false, failOpen: false }));
    });
  });

  describe('readJsonl', () => {
    it('skips corrupt lines and counts them', () => {
      const f = path.join(tmp, 'b.jsonl');
      fs.writeFileSync(f, '{"a":1}\nnot-json\n\n{"a":2}\n{broken\n');
      const { records, corrupt } = readJsonl(f);
      assert.deepEqual(records, [{ a: 1 }, { a: 2 }]);
      assert.equal(corrupt, 2);
    });

    it('missing file fails open to empty', () => {
      const { records, corrupt } = readJsonl(path.join(tmp, 'missing.jsonl'));
      assert.deepEqual(records, []);
      assert.equal(corrupt, 0);
    });

    it('missing file with failOpen:false throws', () => {
      assert.throws(() => readJsonl(path.join(tmp, 'missing.jsonl'), { failOpen: false }));
    });

    it('limit caps returned records', () => {
      const f = path.join(tmp, 'c.jsonl');
      for (let i = 0; i < 5; i++) appendJsonl(f, { i });
      const { records } = readJsonl(f, { limit: 3 });
      assert.equal(records.length, 3);
      assert.equal(records[2].i, 2);
    });
  });

  describe('tailJsonl', () => {
    it('returns the last n records in order', () => {
      const f = path.join(tmp, 'd.jsonl');
      for (let i = 0; i < 6; i++) appendJsonl(f, { i });
      assert.deepEqual(tailJsonl(f, 2).map((r) => r.i), [4, 5]);
    });

    it('n larger than file returns all', () => {
      const f = path.join(tmp, 'e.jsonl');
      appendJsonl(f, { i: 0 });
      assert.equal(tailJsonl(f, 99).length, 1);
    });

    it('bad n or missing file returns []', () => {
      assert.deepEqual(tailJsonl(path.join(tmp, 'missing.jsonl'), 3), []);
      const f = path.join(tmp, 'f.jsonl');
      appendJsonl(f, { i: 0 });
      assert.deepEqual(tailJsonl(f, 0), []);
      assert.deepEqual(tailJsonl(f, -1), []);
    });
  });
});
