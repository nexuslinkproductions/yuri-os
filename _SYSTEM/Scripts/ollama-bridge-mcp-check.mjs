#!/usr/bin/env node

import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SERVER = path.join(REPO_ROOT, '.claude/mcp-servers/ollama-bridge/index.js');
const REQUIRED_TOOLS = ['ollama_explore_files', 'ollama_models', 'ollama_run'];

const failures = [];

if (!fs.existsSync(SERVER)) failures.push(`server missing: ${SERVER}`);

const contentLengthTools = await smokeMcpTools('content-length');
const newlineTools = await smokeMcpTools('newline');
for (const [mode, tools] of [
  ['content-length', contentLengthTools],
  ['newline', newlineTools],
]) {
  for (const tool of REQUIRED_TOOLS) {
    if (!tools.includes(tool)) {
      failures.push(`${mode} MCP tools/list missing ${tool}; got: ${tools.join(', ')}`);
    }
  }
}

if (failures.length > 0) {
  console.error(failures.map((failure) => `- ${failure}`).join('\n'));
  process.exit(1);
}

console.log(`OLLAMA_BRIDGE_MCP_CHECK_PASS tools=${contentLengthTools.length} modes=2`);

function smokeMcpTools(mode) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [SERVER], {
      cwd: REPO_ROOT,
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    let stdout = Buffer.alloc(0);
    let stderr = '';
    const timeout = setTimeout(() => {
      child.kill('SIGTERM');
      reject(new Error(`MCP smoke timed out: ${stderr.trim()}`));
    }, 5000);

    child.stderr.on('data', (chunk) => {
      stderr += chunk.toString('utf8');
    });

    child.stdout.on('data', (chunk) => {
      stdout = Buffer.concat([stdout, chunk]);
      const messages = drainFrames();
      for (const message of messages) {
        if (message.id === 1) {
          send({
            jsonrpc: '2.0',
            method: 'notifications/initialized',
            params: {},
          });
          send({
            jsonrpc: '2.0',
            id: 2,
            method: 'tools/list',
            params: {},
          });
        }
        if (message.id === 2) {
          clearTimeout(timeout);
          child.kill('SIGTERM');
          resolve((message.result?.tools || []).map((tool) => tool.name).sort());
        }
      }
    });

    child.on('error', (error) => {
      clearTimeout(timeout);
      reject(error);
    });

    child.on('exit', (code) => {
      if (code && code !== 143) {
        clearTimeout(timeout);
        reject(new Error(`MCP server exited ${code}: ${stderr.trim()}`));
      }
    });

    send({
      jsonrpc: '2.0',
      id: 1,
      method: 'initialize',
      params: {
        protocolVersion: '2024-11-05',
        capabilities: {},
        clientInfo: {
          name: 'yuri-ollama-bridge-mcp-check',
          version: '1.0.0',
        },
      },
    });

    function send(message) {
      const body = Buffer.from(JSON.stringify(message), 'utf8');
      if (mode === 'newline') {
        child.stdin.write(`${body.toString('utf8')}\n`);
        return;
      }
      child.stdin.write(`Content-Length: ${body.length}\r\n\r\n${body.toString('utf8')}`);
    }

    function drainFrames() {
      const messages = [];
      while (true) {
        if (mode === 'newline') {
          const newlineIndex = stdout.indexOf('\n');
          if (newlineIndex === -1) break;
          const line = stdout.subarray(0, newlineIndex).toString('utf8').replace(/\r$/, '');
          stdout = stdout.subarray(newlineIndex + 1);
          if (!line.trim()) continue;
          messages.push(JSON.parse(line));
          continue;
        }

        const headerEnd = stdout.indexOf('\r\n\r\n');
        if (headerEnd === -1) break;
        const header = stdout.subarray(0, headerEnd).toString('utf8');
        const match = header.match(/Content-Length:\s*(\d+)/i);
        if (!match) throw new Error(`bad MCP header: ${header}`);
        const length = Number(match[1]);
        const bodyStart = headerEnd + 4;
        const bodyEnd = bodyStart + length;
        if (stdout.length < bodyEnd) break;
        const body = stdout.subarray(bodyStart, bodyEnd).toString('utf8');
        stdout = stdout.subarray(bodyEnd);
        messages.push(JSON.parse(body));
      }
      return messages;
    }
  });
}
