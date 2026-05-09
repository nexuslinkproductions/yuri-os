#!/usr/bin/env node

import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import path from 'node:path';

const REPO_ROOT = '/Users/marcelspatz/NUDIMMUD';
const OFFLOAD_SH = path.join(REPO_ROOT, 'Scripts/offload.sh');
const KERNEL_PY = path.join(REPO_ROOT, '_SYSTEM/OS_KERNEL/syscalls/kernel.py');
const TOOL_NAME = 'nudimmud.offload_task';

const TOOL = {
  name: TOOL_NAME,
  description: 'Route a Codex task through the NUDIMMUD offload spine with OS_KERNEL task logging.',
  inputSchema: {
    type: 'object',
    additionalProperties: false,
    required: ['prompt'],
    properties: {
      prompt: { type: 'string', minLength: 1 },
      intent: {
        type: 'string',
        enum: [
          'code_edit_small',
          'code_edit_large',
          'research_repo',
          'summarization',
          'extraction',
          'architecture_review',
          'audit_security',
          'custom',
        ],
      },
      lane_hint: { type: 'string', minLength: 1 },
      fanout_lanes: { type: 'array', items: { type: 'string', minLength: 1 } },
      files: { type: 'array', items: { type: 'string' } },
      budget_tokens: { type: 'number', minimum: 1 },
      mutation_allowed: { type: 'boolean' },
      dry_run: { type: 'boolean' },
    },
  },
};

let buffer = '';

process.stdin.setEncoding('utf8');
process.stdin.on('data', (chunk) => {
  buffer += chunk;
  let newlineIndex = buffer.indexOf('\n');
  while (newlineIndex !== -1) {
    const line = buffer.slice(0, newlineIndex).trim();
    buffer = buffer.slice(newlineIndex + 1);
    if (line) handleLine(line);
    newlineIndex = buffer.indexOf('\n');
  }
});

function handleLine(line) {
  let request;
  try {
    request = JSON.parse(line);
  } catch (error) {
    sendError(null, -32700, `Parse error: ${error.message}`);
    return;
  }

  handleRequest(request).catch((error) => {
    if (request.id !== undefined) {
      sendError(request.id, -32603, error.message);
    }
  });
}

async function handleRequest(request) {
  if (!request || request.jsonrpc !== '2.0') {
    sendError(request?.id ?? null, -32600, 'Invalid JSON-RPC request');
    return;
  }

  if (request.method === 'initialize') {
    sendResult(request.id, {
      protocolVersion: request.params?.protocolVersion || '2024-11-05',
      capabilities: { tools: {} },
      serverInfo: { name: 'nudimmud-offload', version: '1.0.0' },
    });
    return;
  }

  if (request.method === 'notifications/initialized') {
    return;
  }

  if (request.method === 'tools/list') {
    sendResult(request.id, { tools: [TOOL] });
    return;
  }

  if (request.method === 'tools/call') {
    const result = await callTool(request.params || {});
    sendResult(request.id, result);
    return;
  }

  if (request.id !== undefined) {
    sendError(request.id, -32601, `Method not found: ${request.method}`);
  }
}

async function callTool(params) {
  if (params.name !== TOOL_NAME) {
    return toolError(`Unknown tool: ${params.name}`);
  }

  const input = validateInput(params.arguments || {});
  if (input.mutation_allowed) {
    return toolError('mutation_allowed=true is blocked until Codex safety parity is active.');
  }

  const lane = selectLane(input);
  const promptHash = createHash('sha256').update(input.prompt).digest('hex').slice(0, 16);
  const taskId = createTask(input, lane, promptHash);

  try {
    logMemory(taskId, input, lane, promptHash, 'dispatch_started');
    const routed = runOffload(input, taskId);
    const status = routed.status === 0 ? 'COMPLETED' : 'FAILED';
    updateTask(taskId, status, summarizeResult(routed));
    logMemory(taskId, input, lane, promptHash, `dispatch_${status.toLowerCase()}`);

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            task_id: taskId,
            lane,
            dry_run: !!input.dry_run,
            status,
            exit_code: routed.status,
            stdout: routed.stdout.trim(),
            stderr: routed.stderr.trim(),
          }, null, 2),
        },
      ],
      isError: status !== 'COMPLETED',
    };
  } catch (error) {
    updateTask(taskId, 'FAILED', error.message);
    logMemory(taskId, input, lane, promptHash, `dispatch_failed: ${error.message}`);
    return toolError(error.message);
  }
}

function validateInput(raw) {
  const input = {
    prompt: raw.prompt,
    intent: raw.intent || 'custom',
    lane_hint: raw.lane_hint || '',
    fanout_lanes: Array.isArray(raw.fanout_lanes) ? raw.fanout_lanes : [],
    files: Array.isArray(raw.files) ? raw.files : [],
    budget_tokens: raw.budget_tokens,
    mutation_allowed: raw.mutation_allowed === true,
    dry_run: raw.dry_run === true,
  };

  if (typeof input.prompt !== 'string' || input.prompt.trim().length === 0) {
    throw new Error('prompt must be a non-empty string');
  }
  if (!TOOL.inputSchema.properties.intent.enum.includes(input.intent)) {
    throw new Error(`unsupported intent: ${input.intent}`);
  }
  if (input.files.some((file) => typeof file !== 'string')) {
    throw new Error('files must be an array of strings');
  }
  if (input.fanout_lanes.some((lane) => typeof lane !== 'string' || lane.trim().length === 0)) {
    throw new Error('fanout_lanes must be non-empty lane strings');
  }
  if (input.lane_hint && input.fanout_lanes.length > 0) {
    throw new Error('Use lane_hint or fanout_lanes, not both');
  }

  input.prompt = input.prompt.trim();
  input.lane_hint = input.lane_hint.trim();
  input.fanout_lanes = input.fanout_lanes.map((lane) => lane.trim());
  return input;
}

function selectLane(input) {
  if (input.fanout_lanes.length > 0) return input.fanout_lanes.join(',');
  if (input.lane_hint) return input.lane_hint;
  return 'auto';
}

function createTask(input, lane, promptHash) {
  const description = `Codex offload ${input.intent}: ${input.prompt.slice(0, 120)} [${promptHash}]`;
  const args = ['task-create', description, '--agent', lane];
  const result = runKernel(args);
  const match = result.stdout.match(/Task\s+(\d+)\s+created/);
  if (!match) {
    throw new Error(`Could not parse task id from kernel output: ${result.stdout || result.stderr}`);
  }
  return match[1];
}

function updateTask(taskId, status, result) {
  runKernel(['task-update', String(taskId), status, '--result', result.slice(0, 800)]);
}

function logMemory(taskId, input, lane, promptHash, event) {
  const payload = {
    task_id: taskId,
    channel: 'codex-offload',
    source: 'nudimmud-offload-mcp',
    event,
    intent: input.intent,
    lane,
    prompt_hash: promptHash,
    files: input.files,
    dry_run: !!input.dry_run,
    mutation_allowed: !!input.mutation_allowed,
  };
  runKernel(['mem-log', JSON.stringify(payload), '--agent', 'ENKI', '--importance', '2']);
}

function runKernel(args) {
  const result = spawnSync('python3', [KERNEL_PY, ...args], {
    cwd: REPO_ROOT,
    encoding: 'utf8',
  });
  if (result.status !== 0) {
    throw new Error(`kernel.py failed: ${(result.stderr || result.stdout).trim()}`);
  }
  return result;
}

function runOffload(input, taskId) {
  const args = [OFFLOAD_SH];
  args.push('--intent', input.intent);
  if (input.fanout_lanes.length > 0) {
    args.push('--swarm', input.fanout_lanes.join(','));
  } else if (input.lane_hint) {
    args.push('--model', input.lane_hint);
  }
  if (input.dry_run) args.push('--dry-run');
  args.push(input.prompt);

  return spawnSync('bash', args, {
    cwd: REPO_ROOT,
    env: { ...process.env, OFFLOAD_TASK_ID: String(taskId), OFFLOAD_INTENT: input.intent },
    encoding: 'utf8',
    maxBuffer: 10 * 1024 * 1024,
  });
}

function summarizeResult(result) {
  return JSON.stringify({
    exit_code: result.status,
    stdout: result.stdout.slice(0, 1000),
    stderr: result.stderr.slice(0, 1000),
  });
}

function toolError(message) {
  return {
    content: [{ type: 'text', text: `Error: ${message}` }],
    isError: true,
  };
}

function sendResult(id, result) {
  writeMessage({ jsonrpc: '2.0', id, result });
}

function sendError(id, code, message) {
  writeMessage({ jsonrpc: '2.0', id, error: { code, message } });
}

function writeMessage(message) {
  process.stdout.write(`${JSON.stringify(message)}\n`);
}
