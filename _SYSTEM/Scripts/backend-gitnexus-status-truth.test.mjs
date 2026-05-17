#!/usr/bin/env node

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const serverPath = path.join(process.cwd(), 'backend/src/server.ts');
const databasePath = path.join(process.cwd(), 'backend/src/models/database.ts');

const serverSource = fs.readFileSync(serverPath, 'utf8');
const databaseSource = fs.readFileSync(databasePath, 'utf8');

assert.equal(
  /name:\s*['"]GITNEXUS_MCP['"]\s*,\s*status:\s*['"]CONNECTED['"]/.test(serverSource),
  false,
  'backend/src/server.ts must not hardcode GITNEXUS_MCP as CONNECTED'
);

assert.equal(
  /insertIntegration\.run\(\s*['"]GITNEXUS_MCP['"]\s*,\s*['"]CONNECTED['"]\s*\)/.test(databaseSource),
  false,
  'backend/src/models/database.ts must not seed GITNEXUS_MCP as CONNECTED'
);

assert.match(
  serverSource,
  /gitnexus-mcp-check\.mjs/,
  'backend/src/server.ts should derive GITNEXUS_MCP status from Scripts/gitnexus-mcp-check.mjs'
);

assert.match(
  serverSource,
  /GITNEXUS_MCP_CHECK_PASS/,
  'backend/src/server.ts should require the GitNexus probe success marker before reporting CONNECTED'
);

process.stdout.write('backend-gitnexus-status-truth: pass\n');
