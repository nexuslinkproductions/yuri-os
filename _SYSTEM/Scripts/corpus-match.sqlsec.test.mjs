#!/usr/bin/env node
// corpus-match.sqlsec.test.mjs — adversarial SQL-identifier / injection proof for the corpus adapters.
// Creates a REAL temp sqlite DB (with a `secrets` table + a `x` table to detect statement-chaining),
// then asserts every malicious table/idCol/textCol is REJECTED by ident() before interpolation, that
// LIMIT cannot chain SQL, that the parameterized MATCH query is inert, and that a legitimate load is
// NOT over-rejected. Source: Codex C2 adversarial lane (2026-06-06), verified vs live code + run green.
// Run from _SYSTEM/Scripts with: node corpus-match.sqlsec.test.mjs
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import Database from 'better-sqlite3';
import { loadFtsCorpus, ftsQuery } from './corpus-match.mjs';

let pass = 0, fail = 0;
const ok = (cond, name) => {
  if (cond) { pass++; } else { fail++; console.log(`  FAIL ${name}`); }
};
const throws = (fn, name) => { try { fn(); ok(false, name); } catch { ok(true, name); } };
const notThrows = (fn, name) => { try { fn(); ok(true, name); } catch (err) { console.log(err); ok(false, name); } };
// C8 #1: pin that the rejection happened AT ident() (message /unsafe SQL/), not via an incidental
// downstream SQL/prepare error — otherwise a mutant that removes ident() could still "throw" and pass.
const throwsMsg = (fn, re, name) => { try { fn(); ok(false, name); } catch (e) { ok(re.test(String(e && e.message)), `${name} [msg: ${String(e && e.message).slice(0, 40)}]`); } };

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'corpus-match-sqlsec-'));
const dbPath = path.join(tmp, 'sqlsec.sqlite');

try {
  const db = new Database(dbPath);
  db.exec(`
    CREATE VIRTUAL TABLE docs USING fts5(report_id, title, weakness, asset_type);
    INSERT INTO docs(report_id, title, weakness, asset_type)
      VALUES ('r1', 'safe title', 'xss', 'web'),
             ('r2', 'other title', 'sqli', 'api');

    CREATE TABLE secrets(v TEXT);
    INSERT INTO secrets(v) VALUES ('TOP_SECRET_SHOULD_NOT_LEAK');

    CREATE TABLE x(v TEXT);
    INSERT INTO x(v) VALUES ('still here');
  `);
  db.close();

  const legit = loadFtsCorpus(dbPath, 'docs', { idCol: 'report_id', textCols: ['title', 'weakness', 'asset_type'] });
  ok(legit.length === 2, 'legitimate identifiers load two rows (guard does not over-reject)');
  ok(legit[0].id === 'r1' && legit[0].text === 'safe title xss web', 'legitimate load maps id/text correctly');
  ok(!JSON.stringify(legit).includes('TOP_SECRET'), 'legitimate load does not expose secrets table');

  const badIdents = [
    '(SELECT v FROM secrets)', 't; DROP TABLE x', 't--', '"docs"', "'docs'", '`docs`', '[docs]',
    'main.docs', 'docs report_id', 'docs\nWHERE 1=1', '', null, 123, ['docs; DROP TABLE x'],
    'dоcs', // contains Cyrillic о, not ASCII o
    '💥',
  ];

  for (const v of badIdents) {
    throwsMsg(() => loadFtsCorpus(dbPath, 'docs', { idCol: v, textCols: ['title'] }), /unsafe SQL/, `malicious idCol rejected at ident(): ${JSON.stringify(v)}`);
    throwsMsg(() => loadFtsCorpus(dbPath, 'docs', { idCol: 'report_id', textCols: [v] }), /unsafe SQL/, `malicious textCol rejected at ident(): ${JSON.stringify(v)}`);
    throwsMsg(() => loadFtsCorpus(dbPath, v, { idCol: 'report_id', textCols: ['title'] }), /unsafe SQL/, `malicious table rejected at ident(): ${JSON.stringify(v)}`);
    throwsMsg(() => ftsQuery(dbPath, v, 'safe title'), /unsafe SQL/, `malicious ftsQuery table rejected at ident(): ${JSON.stringify(v)}`);
  }

  // C8 #14: prove the parameterized MATCH query MATCHES NOTHING + LEAKS NOTHING (not merely no-throw).
  { const q = ftsQuery(dbPath, 'docs', '" OR 1=1 -- TOP_SECRET_SHOULD_NOT_LEAK');
    ok(q.totalMatched === 0 && (q.returnedTop || 0) === 0 && !JSON.stringify(q).includes('TOP_SECRET'),
      'ftsQuery parameterized: injection query matches nothing + leaks nothing'); }

  throws(() => loadFtsCorpus(dbPath, 'docs', { idCol: 'report_id', textCols: ['title'], limit: '1; DROP TABLE x' }),
    'LIMIT injection string is coerced to Number and cannot append SQL');

  const db2 = new Database(dbPath, { readonly: true });
  const x = db2.prepare('SELECT v FROM x').get();
  const secret = db2.prepare('SELECT v FROM secrets').get();
  db2.close();
  ok(x.v === 'still here', 'DROP TABLE payload did not execute');
  ok(secret.v === 'TOP_SECRET_SHOULD_NOT_LEAK', 'secrets table remains intact');

  for (const v of ['select', 'from', 'where']) {
    throws(() => loadFtsCorpus(dbPath, v, { idCol: 'report_id', textCols: ['title'] }),
      `reserved word table passes regex but fails as unquoted SQL identifier: ${v}`);
  }

  const sqliteMaster = loadFtsCorpus(dbPath, 'sqlite_master', { idCol: 'name', textCols: ['sql'] });
  ok(sqliteMaster.some((row) => row.id === 'docs') && !JSON.stringify(sqliteMaster).includes('TOP_SECRET_SHOULD_NOT_LEAK'),
    'sqlite_master is regex-valid + readable but exposes only schema, not table row data');

  console.log(`\ncorpus-match.sqlsec.test: ${pass} passed, ${fail} failed`);
  process.exitCode = fail ? 1 : 0;
} finally {
  fs.rmSync(tmp, { recursive: true, force: true });
}
