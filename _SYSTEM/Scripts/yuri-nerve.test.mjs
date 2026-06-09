#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { recordEvent, loadEvents, closeEvent, organStateDigest, mintEventId } from './yuri-nerve.mjs';

let pass = 0, fail = 0;
const ok = (c, n) => { if (c) pass++; else { fail++; console.log(`  FAIL ${n}`); } };

const STORE = path.join('/tmp', 'nerve-test-fixed.jsonl');
try { fs.unlinkSync(STORE); } catch { /* ignore */ }

// --- mintEventId: deterministic, kind-sensitive (idempotent capture) ---
ok(mintEventId({ kind: 'task', title: 'a', content: 'b' }) === mintEventId({ kind: 'task', title: 'a', content: 'b' }), 'mintEventId is deterministic');
ok(mintEventId({ kind: 'task', title: 'a' }) !== mintEventId({ kind: 'fix', title: 'a' }), 'kind changes the id');

// --- SPINE: recordEvent → one id, appended, OpenProcess-shaped, with memory link ---
const r1 = recordEvent({ kind: 'task', title: 'fix the gate', content: 'D-1', weight: 0.9, memoryLink: 'gate-hardening-fail-closed', nextCandidateAction: 'harden normalizePath' }, { store: STORE });
ok(r1.id.startsWith('nerve.task.'), 'recordEvent mints a nerve id');
ok(loadEvents(STORE).length === 1, 'one event in store');
ok(loadEvents(STORE)[0].memoryLink === 'gate-hardening-fail-closed', 'carries the memory link (meaning), not duplicated');

// --- idempotent: re-recording the SAME event supersedes, never duplicates (the O-1 dup hazard, by construction) ---
recordEvent({ kind: 'task', title: 'fix the gate', content: 'D-1', state: 'active' }, { store: STORE });
ok(loadEvents(STORE).length === 1, 're-recording the same event supersedes, not duplicates');
ok(loadEvents(STORE)[0].state === 'active', 'a later record supersedes the state');

// --- a distinct event ---
recordEvent({ kind: 'finding', title: 'gemma hallucination', content: 'proto-pollution false', weight: 0.3 }, { store: STORE });
ok(loadEvents(STORE).length === 2, 'a distinct event is added');

// --- closeEvent: state transition under the same id ---
closeEvent(r1.id, { store: STORE });
ok(loadEvents(STORE).find((e) => e.id === r1.id).state === 'closed', 'closeEvent closes the event (same id supersede)');

// --- AFFERENT: organStateDigest is compact, open-only, top-N ---
const dig = organStateDigest({ store: STORE, top: 5 });
ok(dig.openCount === 1 && dig.closedCount === 1, 'digest counts open vs closed');
ok(dig.top.length === 1 && dig.top[0].title === 'gemma hallucination', 'digest surfaces the OPEN event, not the closed one');
ok(dig.top.every((t) => 'mass' in t && 'next' in t && 'id' in t), 'digest entries are compact (id/type/title/mass/next)');

// --- robustness: a malformed store line is skipped, never crashes the read ---
fs.appendFileSync(STORE, 'not valid json\n');
ok(loadEvents(STORE).length === 2, 'malformed line skipped, read does not crash');

try { fs.unlinkSync(STORE); } catch { /* ignore */ }
console.log(`\nyuri-nerve.test: ${pass} passed, ${fail} failed`);
process.exitCode = fail === 0 ? 0 : 1;
