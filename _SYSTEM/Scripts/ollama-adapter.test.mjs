import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  postOllamaEmbedding,
  resolveOllamaAdditiveLane,
  runOllamaCloudChat,
  runOllamaLocalChat,
} from './ollama-adapter.mjs';

const originalFetch = globalThis.fetch;
const originalEnv = {
  OLLAMA_API_KEY: process.env.OLLAMA_API_KEY,
  OLLAMA_CLOUD_API_KEY: process.env.OLLAMA_CLOUD_API_KEY,
  OLLAMA_HOST: process.env.OLLAMA_HOST,
  TOKEN_LEDGER_DB_PATH: process.env.TOKEN_LEDGER_DB_PATH,
  TOKEN_LEDGER_QUEUE_DIR: process.env.TOKEN_LEDGER_QUEUE_DIR,
  TOKEN_LEDGER_FAULT_DIR: process.env.TOKEN_LEDGER_FAULT_DIR,
  TOKEN_LEDGER_VAULT_DIR: process.env.TOKEN_LEDGER_VAULT_DIR,
};

function configureTempLedger() {
  const root = mkdtempSync(join(tmpdir(), 'ollama-adapter-test-'));
  process.env.TOKEN_LEDGER_DB_PATH = join(root, 'ledger.db');
  process.env.TOKEN_LEDGER_QUEUE_DIR = join(root, 'queue');
  process.env.TOKEN_LEDGER_FAULT_DIR = join(root, 'fault');
  process.env.TOKEN_LEDGER_VAULT_DIR = join(root, 'vault');
}

function restoreEnv() {
  for (const [key, value] of Object.entries(originalEnv)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  globalThis.fetch = originalFetch;
}

function jsonResponse(payload, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    async json() {
      return payload;
    },
    async text() {
      return JSON.stringify(payload);
    },
  };
}

try {
  configureTempLedger();
  process.env.OLLAMA_HOST = 'http://127.0.0.1:11434';

  {
    const lane = resolveOllamaAdditiveLane('ollama-local', '', new Set(['qwen2.5:7b']), false);
    assert.equal(lane.kind, 'local');
    assert.equal(lane.model, 'qwen2.5:7b');
    assert.equal(lane.additive, true);
  }

  {
    const lane = resolveOllamaAdditiveLane('ollama-local', '', new Set(), true);
    assert.equal(lane.kind, 'local');
    assert.equal(lane.executable, false);
    assert.match(lane.error, /No matching local Ollama model/);
  }

  {
    delete process.env.OLLAMA_API_KEY;
    delete process.env.OLLAMA_CLOUD_API_KEY;
    const lane = resolveOllamaAdditiveLane('ollama-cloud', '', new Set(), true);
    assert.equal(lane.kind, 'cloud');
    assert.equal(lane.executable, false);
    assert.match(lane.error, /Missing OLLAMA_API_KEY/);
  }

  {
    process.env.OLLAMA_API_KEY = 'test-cloud-key';
    const lane = resolveOllamaAdditiveLane('ollama', '', new Set(), false);
    assert.equal(lane.kind, 'cloud');
    assert.equal(lane.resolvedVia, 'cloud-fallback');
  }

  {
    let request;
    globalThis.fetch = async (url, options) => {
      request = { url, options };
      return jsonResponse({
        model: 'qwen2.5:7b',
        message: { content: 'local summary' },
        prompt_eval_count: 8,
        eval_count: 2,
      });
    };

    const output = await runOllamaLocalChat('qwen2.5:7b', 'summarize', 'system', { lane: 'ollama-local', traceId: 'ollama-local-test' });
    assert.equal(output, 'local summary');
    assert.equal(request.url, 'http://127.0.0.1:11434/api/chat');
    assert.equal(request.options.headers.Authorization, undefined);
    assert.equal(JSON.parse(request.options.body).stream, false);
  }

  {
    let request;
    globalThis.fetch = async (url, options) => {
      request = { url, options };
      return jsonResponse({
        model: 'llama3.3:70b',
        message: { content: 'cloud summary' },
        prompt_eval_count: 9,
        eval_count: 3,
      });
    };

    const output = await runOllamaCloudChat('https://ollama.example/api/chat', 'cloud-secret', 'llama3.3:70b', 'summarize', '', { lane: 'ollama-cloud', traceId: 'ollama-cloud-test' });
    assert.equal(output, 'cloud summary');
    assert.equal(request.options.headers.Authorization, 'Bearer cloud-secret');
  }

  {
    let request;
    globalThis.fetch = async (url, options) => {
      request = { url, options };
      return jsonResponse({ embedding: [0.1, 0.2, 0.3] });
    };

    const embedding = await postOllamaEmbedding({
      text: 'retrieval query',
      model: 'nomic-embed-text',
      baseUrl: 'http://127.0.0.1:11434',
      traceId: 'ollama-embedding-test',
    });
    assert.deepEqual(embedding, [0.1, 0.2, 0.3]);
    assert.equal(request.url, 'http://127.0.0.1:11434/api/embeddings');
  }

  {
    globalThis.fetch = async () => {
      throw new Error('ECONNREFUSED');
    };
    await assert.rejects(
      () => runOllamaLocalChat('qwen2.5:7b', 'summarize', '', { lane: 'ollama-local', traceId: 'ollama-local-down-test' }),
      /ECONNREFUSED/,
    );
  }

  console.log('ollama-adapter: pass');
} finally {
  restoreEnv();
}
