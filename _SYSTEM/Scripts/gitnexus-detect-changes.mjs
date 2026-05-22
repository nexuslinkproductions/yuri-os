#!/usr/bin/env node

import { spawn } from 'node:child_process';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const WRAPPER = path.join(REPO_ROOT, '_SYSTEM/Scripts/gitnexus-mcp.mjs');
const repo = process.argv[2] || 'yuri-os';
const scope = process.argv[3] || 'all';

const result = await callGitNexusTool('detect_changes', { repo, scope });
console.log(JSON.stringify(result, null, 2));

function callGitNexusTool(name, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [WRAPPER], {
      cwd: REPO_ROOT,
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    let stdout = Buffer.alloc(0);
    let stderr = '';
    const timeout = setTimeout(() => {
      child.kill('SIGTERM');
      reject(new Error(`GitNexus detect_changes timed out: ${stderr.trim()}`));
    }, 15000);

    child.stderr.on('data', (chunk) => {
      stderr += chunk.toString('utf8');
    });

    child.stdout.on('data', (chunk) => {
      stdout = Buffer.concat([stdout, chunk]);
      for (const message of drainFrames()) {
        if (message.id === 1) {
          send({ jsonrpc: '2.0', method: 'notifications/initialized', params: {} });
          send({
            jsonrpc: '2.0',
            id: 2,
            method: 'tools/call',
            params: { name, arguments: args },
          });
        }
        if (message.id === 2) {
          clearTimeout(timeout);
          child.kill('SIGTERM');
          if (message.error) {
            reject(new Error(message.error.message));
          } else {
            resolve(message.result);
          }
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
        reject(new Error(`GitNexus MCP exited ${code}: ${stderr.trim()}`));
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
          name: 'yuri-gitnexus-detect-changes',
          version: '1.0.0',
        },
      },
    });

    function send(message) {
      const body = Buffer.from(JSON.stringify(message), 'utf8');
      child.stdin.write(`Content-Length: ${body.length}\r\n\r\n${body.toString('utf8')}`);
    }

    function drainFrames() {
      const messages = [];
      while (true) {
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
