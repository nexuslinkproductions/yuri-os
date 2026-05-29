#!/usr/bin/env node
'use strict';

const assert = require('assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');

const repoRoot = path.resolve(__dirname, '../../..');

// Stub offload.sh BEFORE requiring scout-runner — scout-runner reads SCOUT_OFFLOAD_SH at module load.
const offloadStubDir = fs.mkdtempSync(path.join(os.tmpdir(), 'scout-offload-stub-'));
const offloadLogFile = path.join(offloadStubDir, 'offload.log');
const offloadStub = path.join(offloadStubDir, 'offload.sh');
fs.writeFileSync(offloadStub, [
  '#!/usr/bin/env bash',
  `printf "%s\\n" "$*" >> "${offloadLogFile}"`,
  'printf "SEVERITY: WARN\\n"',
  'printf "FINDING: yuri-risk model path invoked.\\n"',
  '',
].join('\n'));
fs.chmodSync(offloadStub, 0o755);
process.env.SCOUT_OFFLOAD_SH = offloadStub;

const runner = require(path.join(repoRoot, '.claude/hooks/scout-runner.js'));
const bus = require(path.join(repoRoot, '.claude/hooks/scout-bus.js'));

const previousBus = fs.existsSync(bus.BUS_PATH)
  ? fs.readFileSync(bus.BUS_PATH, 'utf8')
  : null;

function writeContext(body) {
  const file = path.join(os.tmpdir(), `scout-runner-test-${Date.now()}-${Math.random().toString(36).slice(2)}.txt`);
  fs.writeFileSync(file, body);
  return file;
}

function baseContext(toolName, input, overrides = {}) {
  return [
    `TOOL: ${toolName}`,
    `INPUT: ${JSON.stringify(input || {})}`,
    `RESULT (error=${overrides.error ? 'YES' : 'NO'}): ${overrides.result || 'ok'}`,
    '',
    'SESSION CONTEXT:',
    '  branch: codex/native-function-scouts',
    `  context_pct: ${overrides.contextPct || 25}%`,
    '  tools_used_count: 4',
    `  files_written_recent: ${overrides.filesWritten || 'none'}`,
    '  last_error: none',
    '',
    'PEER FINDINGS (other scouts, last 3 min):',
    '  None',
  ].join('\n');
}

function entries() {
  return bus.readBus().ring;
}

try {
  bus.writeBus(bus.createEmpty());

  const argusContext = writeContext(baseContext('Write', {
    file_path: '_SYSTEM/OS_KERNEL/memory.db',
    content: 'raw mutation',
  }));
  assert.equal(runner.runScout('ARGUS', argusContext), 0);
  assert.equal(fs.existsSync(offloadLogFile), false, 'ARGUS must not invoke offload lane');
  const argusEntry = entries().at(-1);
  assert.equal(argusEntry.scout, 'ARGUS');
  assert.equal(argusEntry.runtime_kind, 'native_function');
  assert.equal(argusEntry.severity, 'HIGH');

  const riskContext = writeContext(baseContext('Bash', { command: 'chmod 777 tmp' }));
  assert.equal(runner.runScout('YURI-RISK', riskContext), 0);
  assert.equal(fs.existsSync(offloadLogFile), true, 'YURI-RISK should invoke offload model path');
  const riskEntry = entries().at(-1);
  assert.equal(riskEntry.scout, 'YURI-RISK');
  assert.equal(riskEntry.runtime_kind, 'model_agent');
  assert.equal(riskEntry.severity, 'WARN');

  // Verify the offload stub was invoked with the expected lane args.
  const logContents = fs.readFileSync(offloadLogFile, 'utf8');
  assert.ok(/-m deepseek/.test(logContents), 'offload invocation must request -m deepseek');
  assert.ok(/--no-tools/.test(logContents), 'offload invocation must include --no-tools');

  fs.rmSync(offloadStubDir, { recursive: true, force: true });
  console.log('scout-runner.dispatch: pass');
} finally {
  if (previousBus === null) {
    fs.rmSync(bus.BUS_PATH, { force: true });
  } else {
    fs.mkdirSync(path.dirname(bus.BUS_PATH), { recursive: true });
    fs.writeFileSync(bus.BUS_PATH, previousBus);
  }
  delete process.env.SCOUT_OFFLOAD_SH;
}
