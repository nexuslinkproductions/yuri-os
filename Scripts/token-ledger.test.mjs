#!/usr/bin/env node

import assert from 'node:assert/strict';
import Database from '../backend/node_modules/better-sqlite3/lib/index.js';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  drainTokenLedger,
  enqueueTokenEvent,
  hashPayload,
  initTokenLedger,
  normalizeProviderUsage,
  reconcileProviderExport,
  recordTokenEvent,
  verifyHashChain,
  writePayloadVault,
} from './token-ledger.mjs';

const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'token-ledger-test-'));
const paths = {
  dbPath: path.join(tempRoot, 'memory.db'),
  queueDir: path.join(tempRoot, 'queue'),
  faultDir: path.join(tempRoot, 'faults'),
  vaultDir: path.join(tempRoot, 'vault'),
  lockDir: path.join(tempRoot, 'queue.lock'),
};

try {
  const db = new Database(paths.dbPath);
  initTokenLedger(db);
  db.close();

  const secretPrompt = 'SECRET_PROMPT_DO_NOT_STORE';
  const payload = writePayloadVault({ prompt: secretPrompt, output: 'SECRET_OUTPUT_DO_NOT_STORE' }, paths);
  assert.equal(payload.payload_hash.length, 64, 'payload hash should be sha256');
  assert(fs.existsSync(payload.vault_pointer), 'payload vault file missing');

  const total = 500;
  await Promise.all(Array.from({ length: total }, async (_, i) => {
    enqueueTokenEvent({
      event_id: `concurrent-${i}`,
      trace_id: `trace-${Math.floor(i / 10)}`,
      span_id: `span-${i}`,
      source_path: 'test/token-ledger',
      lane: 'test',
      provider: 'fixture',
      request_model: 'fixture-model',
      response_model: 'fixture-model',
      operation_type: 'model_call',
      status: 'ok',
      measurement_type: 'observed_provider',
      input_tokens: 10 + i,
      output_tokens: 2,
      cache_read_tokens: i % 3,
      reasoning_tokens: i % 5,
      payload_hash: payload.payload_hash,
      vault_pointer: payload.vault_pointer,
      metadata: {
        prompt_chars: secretPrompt.length,
        raw: secretPrompt,
        output: 'must redact',
      },
    }, paths);
  }));

  const drained = drainTokenLedger(paths);
  assert.equal(drained.inserted, total, '500 queued events should drain');
  let verify = verifyHashChain(paths.dbPath);
  assert.equal(verify.ok, true, `hash chain should verify: ${JSON.stringify(verify)}`);
  assert.equal(verify.rows, total, 'hash chain row count mismatch');

  const db2 = new Database(paths.dbPath);
  const count = db2.prepare('SELECT COUNT(*) AS c FROM token_ledger').get().c;
  assert.equal(count, total, 'ledger row count mismatch');
  const first = db2.prepare('SELECT metadata_json FROM token_ledger ORDER BY sequence_id LIMIT 1').get();
  assert(first.metadata_json.includes('_redacted_keys'), 'metadata redaction marker missing');
  assert.equal(first.metadata_json.includes(secretPrompt), false, 'raw prompt leaked into metadata');
  const vaultRow = db2.prepare('SELECT payload_hash, byte_size FROM token_payload_vault WHERE payload_hash = ?').get(payload.payload_hash);
  assert.equal(vaultRow.payload_hash, payload.payload_hash, 'payload vault index row missing');
  assert(vaultRow.byte_size > 0, 'payload vault byte size should be recorded');

  const rawDb = fs.readFileSync(paths.dbPath);
  assert.equal(rawDb.includes(Buffer.from(secretPrompt)), false, 'raw prompt leaked into sqlite main db');
  assert.equal(rawDb.includes(Buffer.from(payload.payload_hash)), true, 'payload hash missing from sqlite main db');

  db2.prepare('UPDATE token_ledger SET output_tokens = output_tokens + 1 WHERE sequence_id = 10').run();
  verify = verifyHashChain(paths.dbPath);
  assert.equal(verify.ok, false, 'hash chain should detect digest corruption');
  assert.equal(verify.reason, 'event_hash_mismatch');
  db2.close();

  const tamperRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'token-ledger-10k-'));
  const tamperPaths = {
    dbPath: path.join(tamperRoot, 'memory.db'),
    queueDir: path.join(tamperRoot, 'queue'),
    faultDir: path.join(tamperRoot, 'faults'),
    vaultDir: path.join(tamperRoot, 'vault'),
    lockDir: path.join(tamperRoot, 'queue.lock'),
  };
  for (let i = 0; i < 10000; i += 1) {
    enqueueTokenEvent({
      event_id: `hash-fixture-${i}`,
      trace_id: 'hash-fixture',
      span_id: `span-${i}`,
      source_path: 'test/token-ledger-10k',
      operation_type: 'model_call',
      status: 'ok',
      measurement_type: 'estimated_tokenizer',
      input_tokens: 1,
      output_tokens: 1,
      payload_hash: hashPayload({ i }),
    }, tamperPaths);
  }
  const tenKDrain = drainTokenLedger(tamperPaths);
  assert.equal(tenKDrain.inserted, 10000, '10k fixture should drain');
  const tenKVerify = verifyHashChain(tamperPaths.dbPath);
  assert.equal(tenKVerify.ok, true, '10k fixture should verify');
  assert.equal(tenKVerify.rows, 10000, '10k fixture row count mismatch');
  fs.rmSync(tamperRoot, { recursive: true, force: true });

  const badPaths = {
    ...paths,
    dbPath: tempRoot,
    queueDir: path.join(tempRoot, 'bad-queue'),
    faultDir: path.join(tempRoot, 'bad-faults'),
    lockDir: path.join(tempRoot, 'bad-queue.lock'),
  };
  const failOpen = await recordTokenEvent({
    event_id: 'fail-open',
    source_path: 'test/token-ledger',
    operation_type: 'model_call',
    status: 'error',
    measurement_type: 'unobservable',
  }, badPaths);
  assert.equal(failOpen.ok, false, 'bad db path should fail open');
  assert(fs.existsSync(badPaths.faultDir), 'fault dir should be created on write failure');

  const ollamaUsage = normalizeProviderUsage('ollama-local', { prompt_eval_count: 12, eval_count: 7 });
  assert.equal(ollamaUsage.measurement_type, 'observed_local_native', 'local Ollama should use native local counts');
  assert.equal(ollamaUsage.input_tokens, 12, 'local Ollama prompt count mismatch');
  const ollamaCloudUsage = normalizeProviderUsage('ollama-cloud', { prompt_eval_count: 9, eval_count: 4 });
  assert.equal(ollamaCloudUsage.measurement_type, 'observed_provider', 'Ollama Cloud should be provider-observed for billing reconciliation');

  const recRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'token-ledger-reconcile-'));
  const recPaths = {
    dbPath: path.join(recRoot, 'memory.db'),
    queueDir: path.join(recRoot, 'queue'),
    faultDir: path.join(recRoot, 'faults'),
    vaultDir: path.join(recRoot, 'vault'),
    lockDir: path.join(recRoot, 'queue.lock'),
  };
  await recordTokenEvent({
    event_id: 'ollama-cloud-event-1',
    trace_id: 'ollama-cloud-trace',
    source_path: 'test/token-ledger',
    lane: 'ollama-cloud',
    provider: 'ollama-cloud',
    request_model: 'llama3.3:70b',
    response_model: 'llama3.3:70b',
    operation_type: 'offload_model_call',
    status: 'ok',
    measurement_type: 'observed_provider',
    input_tokens: 9,
    output_tokens: 4,
    metadata: { billing_state: 'provisional' },
  }, recPaths);
  const recDb = new Database(recPaths.dbPath);
  const provisional = recDb.prepare('SELECT state FROM token_ledger_reconciliation WHERE event_id = ?').get('ollama-cloud-event-1');
  assert.equal(provisional.state, 'provisional', 'Ollama Cloud row should seed provisional reconciliation state');
  recDb.close();

  const rec = reconcileProviderExport('ollama-cloud', [{
    event_id: 'ollama-cloud-event-1',
    provider_export_id: 'export-1',
    input_tokens: 9,
    output_tokens: 4,
  }], recPaths);
  assert.equal(rec.matched, 1, 'provider export should match provisional Ollama Cloud row');
  const recDb2 = new Database(recPaths.dbPath);
  const matched = recDb2.prepare('SELECT state, provider_export_id FROM token_ledger_reconciliation WHERE event_id = ?').get('ollama-cloud-event-1');
  assert.equal(matched.state, 'matched', 'matched export should update reconciliation state');
  assert.equal(matched.provider_export_id, 'export-1', 'provider export id should be recorded');
  recDb2.close();
  fs.rmSync(recRoot, { recursive: true, force: true });

  process.stdout.write('token-ledger: pass\n');
} finally {
  fs.rmSync(tempRoot, { recursive: true, force: true });
}
