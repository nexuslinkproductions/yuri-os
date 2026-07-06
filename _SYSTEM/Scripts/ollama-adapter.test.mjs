import assert from 'node:assert/strict';
import http from 'node:http';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  OLLAMA_GEMMA_MODELS,
  OLLAMA_LOCAL_MODELS,
  postOllamaEmbedding,
  resolveOllamaTimeoutMs,
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
    assert.deepEqual(OLLAMA_GEMMA_MODELS, ['gemma4:12b-it-qat']);
  }

  {
    assert.equal(resolveOllamaTimeoutMs({}), 1_200_000);
    assert.equal(resolveOllamaTimeoutMs({ LLM_COMPAT_OLLAMA_TIMEOUT_MS: '900000' }), 900_000);
    assert.equal(resolveOllamaTimeoutMs({ LLM_COMPAT_OLLAMA_TIMEOUT_MS: '-1' }), 1_200_000);
  }

  {
    const lane = resolveOllamaAdditiveLane('gemma-local', '', new Set(['gemma4:12b-it-qat']), false);
    assert.equal(lane.kind, 'local');
    assert.equal(lane.model, 'gemma4:12b-it-qat');
    assert.equal(lane.additive, true);
  }

  {
    const lane = resolveOllamaAdditiveLane('gemma-local', '', new Set(), true);
    assert.equal(lane.kind, 'local');
    assert.equal(lane.model, 'gemma4:12b-it-qat');
    assert.equal(lane.executable, false);
    assert.doesNotMatch(lane.error, /needle|e2b/i);
  }

  {
    const policyModel = OLLAMA_LOCAL_MODELS.find((model) => model && model !== 'needle') || 'llama3.2:latest';
    const lane = resolveOllamaAdditiveLane('ollama-local', '', new Set([policyModel]), false);
    assert.equal(lane.kind, 'local');
    assert.equal(lane.model, policyModel);
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
    await withMockOllama(() => ({
      status: 200,
      body: {
        model: 'gemma4:12b-it-qat',
        message: { content: 'local summary' },
        prompt_eval_count: 8,
        eval_count: 2,
      },
    }), async ({ baseUrl, requests }) => {
      process.env.OLLAMA_HOST = baseUrl;
      const output = await runOllamaLocalChat('gemma4:12b-it-qat', 'summarize', 'system', { lane: 'ollama-local', traceId: 'ollama-local-test' });
      assert.equal(output, 'local summary');
      assert.equal(requests[0].url, '/api/chat');
      assert.equal(requests[0].headers.authorization, undefined);
      assert.equal(requests[0].body.stream, true);
    });
  }

  {
    await withMockOllama(() => ({
      status: 200,
      body: {
        model: 'llama3.3:70b',
        message: { content: 'cloud summary' },
        prompt_eval_count: 9,
        eval_count: 3,
      },
    }), async ({ baseUrl, requests }) => {
      const output = await runOllamaCloudChat(`${baseUrl}/api/chat`, 'cloud-secret', 'llama3.3:70b', 'summarize', '', { lane: 'ollama-cloud', traceId: 'ollama-cloud-test' });
      assert.equal(output, 'cloud summary');
      assert.equal(requests[0].headers.authorization, 'Bearer cloud-secret');
      assert.equal(requests[0].body.stream, true);
    });
  }

  {
    await withMockOllama(() => ({
      status: 200,
      body: { embedding: [0.1, 0.2, 0.3] },
    }), async ({ baseUrl, requests }) => {
      const embedding = await postOllamaEmbedding({
        text: 'retrieval query',
        model: 'nomic-embed-text',
        baseUrl,
        traceId: 'ollama-embedding-test',
      });
      assert.deepEqual(embedding, [0.1, 0.2, 0.3]);
      assert.equal(requests[0].url, '/api/embeddings');
    });
  }

  {
    process.env.OLLAMA_HOST = 'http://127.0.0.1:9';
    await assert.rejects(
      () => runOllamaLocalChat('gemma4:12b-it-qat', 'summarize', '', { lane: 'ollama-local', traceId: 'ollama-local-down-test' }),
      /ECONNREFUSED/,
    );
  }

  console.log('ollama-adapter: pass');
} finally {
  restoreEnv();
}

async function withMockOllama(handler, callback) {
  const requests = [];
  const server = http.createServer((req, res) => {
    let raw = '';
    req.on('data', (chunk) => {
      raw += chunk;
    });
    req.on('end', () => {
      const body = raw ? JSON.parse(raw) : {};
      const request = { url: req.url, headers: req.headers, body };
      requests.push(request);
      const response = handler(request);
      res.writeHead(response.status || 200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(response.body || {}));
    });
  });

  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  const baseUrl = `http://127.0.0.1:${address.port}`;
  try {
    return await callback({ baseUrl, requests });
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}
