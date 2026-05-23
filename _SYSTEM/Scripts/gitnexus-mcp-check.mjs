#!/usr/bin/env node

import { spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const WRAPPER = path.join(REPO_ROOT, '_SYSTEM/Scripts/gitnexus-mcp.mjs');
const LOCAL_CLI = path.join(REPO_ROOT, 'NEURAL-NETWORK/GitNexus/gitnexus/dist/cli/index.js');
const CODEX_PROJECT = path.join(REPO_ROOT, '.codex/config.toml');
const VSCODE_MCP = path.join(REPO_ROOT, '.vscode/mcp.json');
const CODEX_GLOBAL = path.join(os.homedir(), '.codex/config.toml');
const CLAUDE_GLOBAL = path.join(os.homedir(), '.claude.json');
const REQUIRED_TOOLS = ['list_repos', 'query', 'context', 'impact', 'detect_changes'];
const INCLUDE_GLOBAL_CONFIG = process.argv.includes('--include-global-config');

const failures = [];
const warnings = [];

checkFile('wrapper exists', WRAPPER);
checkFile('local GitNexus CLI exists', LOCAL_CLI);
checkStatus();
checkCodexConfig('project Codex MCP', CODEX_PROJECT);
checkJsonMcpConfig('VS Code workspace MCP', VSCODE_MCP, { optional: true });
if (INCLUDE_GLOBAL_CONFIG) {
  checkCodexConfig('global Codex MCP', CODEX_GLOBAL);
  checkJsonMcpConfig('Claude global MCP', CLAUDE_GLOBAL);
} else {
  warnings.push('global MCP config checks skipped; pass --include-global-config to inspect user-level Codex/Claude config');
}

const tools = await smokeMcpTools();
for (const tool of REQUIRED_TOOLS) {
  if (!tools.includes(tool)) {
    failures.push(`MCP tools/list missing ${tool}; got: ${tools.join(', ')}`);
  }
}

if (failures.length > 0) {
  console.error(failures.map((failure) => `- ${failure}`).join('\n'));
  process.exit(1);
}

for (const warning of warnings) {
  console.warn(`WARN ${warning}`);
}
console.log(`GITNEXUS_MCP_CHECK_PASS tools=${tools.length}`);

function checkFile(label, filePath) {
  if (!fs.existsSync(filePath)) failures.push(`${label}: ${filePath} missing`);
}

function checkStatus() {
  const result = spawnSync(process.execPath, [WRAPPER, 'status'], {
    cwd: REPO_ROOT,
    encoding: 'utf8',
    maxBuffer: 1024 * 1024,
  });
  if (result.status !== 0) {
    failures.push(`gitnexus status failed: ${(result.stderr || result.stdout || '').trim()}`);
    return;
  }
  if (!result.stdout.includes('Status:')) {
    failures.push('gitnexus status output did not include Status marker');
  }
}

function checkCodexConfig(label, configPath) {
  if (!fs.existsSync(configPath)) {
    failures.push(`${label}: ${configPath} missing`);
    return;
  }
  const text = fs.readFileSync(configPath, 'utf8');
  if (!text.includes('[mcp_servers.gitnexus]')) {
    failures.push(`${label}: missing [mcp_servers.gitnexus]`);
  }
  if (!/command\s*=\s*"node"/.test(text)) {
    failures.push(`${label}: gitnexus command should be node`);
  }
  if (!text.includes(WRAPPER)) {
    failures.push(`${label}: missing wrapper path ${WRAPPER}`);
  }
}

function checkJsonMcpConfig(label, configPath, options = {}) {
  if (!fs.existsSync(configPath)) {
    if (options.optional) {
      warnings.push(`${label}: ${configPath} missing; skipping optional workspace-editor MCP check`);
      return;
    }
    failures.push(`${label}: ${configPath} missing`);
    return;
  }
  let parsed;
  try {
    parsed = JSON.parse(fs.readFileSync(configPath, 'utf8'));
  } catch (error) {
    failures.push(`${label}: invalid JSON: ${error.message}`);
    return;
  }
  const entry = parsed.mcpServers?.gitnexus;
  if (!entry) {
    failures.push(`${label}: missing mcpServers.gitnexus`);
    return;
  }
  if (entry.command !== 'node') {
    failures.push(`${label}: gitnexus command should be node`);
  }
  if (!Array.isArray(entry.args) || !entry.args.includes(WRAPPER)) {
    failures.push(`${label}: gitnexus args should include ${WRAPPER}`);
  }
}

function smokeMcpTools() {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [WRAPPER], {
      cwd: REPO_ROOT,
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    let stdout = Buffer.alloc(0);
    let stderr = '';
    const timeout = setTimeout(() => {
      child.kill('SIGTERM');
      reject(new Error(`MCP smoke timed out: ${stderr.trim()}`));
    }, 10000);

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
          name: 'yuri-gitnexus-mcp-check',
          version: '1.0.0',
        },
      },
    });

    function send(message) {
      const body = Buffer.from(JSON.stringify(message), 'utf8');
      child.stdin.write(`Content-Length: ${body.length}\r\n\r\n`);
      child.stdin.write(body);
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
