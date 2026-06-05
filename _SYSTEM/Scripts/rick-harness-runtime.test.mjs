import assert from 'node:assert/strict';
import http from 'node:http';
import { spawn, spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { allowOnlyIfBindable } from './loopback-capability.mjs';

const REPO_ROOT = fileURLToPath(new URL('../..', import.meta.url));

function stripAnsi(text) {
  return String(text ?? '')
    .replace(/\x1b\[[0-9;?]*[ -/]*[@-~]/g, '')
    .replace(/\x1b[78]/g, '');
}

test('Rick harness modules import without starting the REPL', async () => {
  const [
    banner,
    repl,
    workerTmux,
    offloadContract,
    browserBridge,
    laneSession,
    shintaiDispatch,
    rails,
    controlPlane,
    memoryKernel,
    automationKernel,
    lanePersonaMap,
  ] = await Promise.all([
    import('./rick-banner.mjs'),
    import('./rick-repl.mjs'),
    import('./worker-tmux.mjs'),
    import('./llm-compat-contract.mjs'),
    import('./browser-harness-bridge.mjs'),
    import('./lane-session.mjs'),
    import('./shintai-dispatch.mjs'),
    import('./rails.mjs'),
    import('./yuri-control-plane.mjs'),
    import('./memory-kernel.mjs'),
    import('./automation-kernel.mjs'),
    import('./lane-persona-map.mjs'),
  ]);

  assert.equal(typeof banner.printBanner, 'function');
  assert.equal(typeof repl.__test__.detectRoute, 'function');
  assert.equal(typeof workerTmux.healthCheckAll, 'function');
  assert.equal(typeof offloadContract.healthProbe, 'function');
  assert.equal(typeof browserBridge.harnessViewport, 'function');
  assert.equal(typeof laneSession.loadLaneSession, 'function');
  assert.equal(typeof shintaiDispatch.assembleShintaiTeam, 'function');
  assert.equal(typeof rails.evaluateExecutionRails, 'function');
  assert.equal(typeof controlPlane.preflightControlPlane, 'function');
  assert.equal(typeof memoryKernel.recallMemory, 'function');
  assert.equal(typeof automationKernel.buildAutomationHealthSummary, 'function');
  assert.equal(typeof lanePersonaMap.buildRickLanePacket, 'function');
});

test('Claude worker bridge uses live tmux TUI instead of prompt route', () => {
  const registry = JSON.parse(readFileSync(new URL('./worker-tmux-registry.json', import.meta.url), 'utf8'));
  const ai = readFileSync(new URL('./ai', import.meta.url), 'utf8');
  const launcher = readFileSync(new URL('./yuri-workers-tmux.sh', import.meta.url), 'utf8');
  const bridge = readFileSync(new URL('./worker-bridge.mjs', import.meta.url), 'utf8');
  const personaMap = readFileSync(new URL('./lane-persona-map.mjs', import.meta.url), 'utf8');
  const tmux = readFileSync(new URL('./worker-tmux.mjs', import.meta.url), 'utf8');
  const rick = readFileSync(new URL('./rick-repl.mjs', import.meta.url), 'utf8');

  assert.equal(registry.laneStartCommands.claude, 'bash _SYSTEM/Scripts/ai claude');
  assert.match(ai, /YURI_CLAUDE_MODEL:-\$\{YURI_MODEL:-sonnet\}/);
  assert.match(ai, /--model "\$_claude_model"/);
  assert.match(launcher, /bash _SYSTEM\/Scripts\/ai claude/);
  assert.match(bridge, /spec\.kind === 'claude'/);
  assert.match(bridge, /buildClaudeRickPacket/);
  assert.match(personaMap, /Rick-to-Rick live lane packet/);
  assert.match(personaMap, /YURI_PRIVATE_RICK_OVERLAY/);
  assert.match(bridge, /lanePersonaForWorker/);
  assert.match(bridge, /feedWorkerTui\('claude', lanePrompt\)/);
  assert.doesNotMatch(bridge, /AI_SH, route, task\.prompt/);
  assert.match(bridge, /const PULSE_BUS = path\.join\(STATE_DIR, 'pulse-bus\.jsonl'\)/);
  assert.match(bridge, /appendKagamiEvent/);
  assert.match(bridge, /LANE_DISPATCHED/);
  assert.match(bridge, /CODEX_VERIFICATION_PASSED/);
  assert.match(rick, /INTAKE_RECORDED/);
  assert.match(rick, /GOAL_BOUND/);
  assert.match(rick, /LANE_HEALTH_PREFLIGHT/);
  assert.match(tmux, /TUI worker uses tmux\/PTY feed/);
});

test('Rick prompt context drops poisoned terminal chrome history', async () => {
  const { __test__ } = await import('./rick-repl.mjs');
  const context = __test__.buildHistoryContext([
    {
      ts: Date.now(),
      user: 'first',
      assistant: '━━ HARDBORDER ━━\nYURI-OS v1.0 | session: old | snazzy\ntokens used\n42',
    },
    {
      ts: Date.now(),
      user: 'real question',
      assistant: 'real answer',
    },
  ]);

  assert.equal(__test__.containsPromptPoison('Rick > tokens used'), true);
  assert.doesNotMatch(context, /HARDBORDER|YURI-OS v1\.0|tokens used/);
  assert.match(context, /real question/);
  assert.match(context, /real answer/);
});

test('Rick does not auto-execute shell blocks that came from user input', async () => {
  const { __test__ } = await import('./rick-repl.mjs');
  const userBlocks = __test__.extractBashBlocks('please inspect this\n```bash\necho USER_BLOCK\n```');
  const assistantBlocks = __test__.extractBashBlocks([
    'I will keep your quoted block as text.',
    '```bash',
    'echo USER_BLOCK',
    '```',
    'New diagnostic command:',
    '```bash',
    'node --check _SYSTEM/Scripts/rick-repl.mjs',
    '```',
  ].join('\n'));

  assert.deepEqual(__test__.filterExecutableShellBlocks(assistantBlocks, userBlocks), [
    'node --check _SYSTEM/Scripts/rick-repl.mjs',
  ]);
});

test('Rick routes explicit Codex and Sonnet coding aliases', async () => {
  const { __test__ } = await import('./rick-repl.mjs');

  assert.equal(__test__.detectRoute('@codex fix tests').route.lane, '@codex');
  assert.equal(__test__.detectRoute('@codex-mini fix tests').route.lane, '@codex-mini');
  assert.equal(__test__.detectRoute('@sonnet fix tests').route.lane, '@claude-sonnet-code');
  assert.equal(__test__.detectRoute('@claude-code fix tests').route.lane, '@claude-sonnet-code');
  assert.equal(__test__.detectRoute('@claude review this').route.lane, '@claude');
});

test('Rick recognizes EOT as a new-session handoff command', async () => {
  const { __test__ } = await import('./rick-repl.mjs');

  assert.equal(__test__.isEotInput('/eot'), true);
  assert.equal(__test__.isEotInput('end of transmission'), true);
  assert.equal(__test__.isEotInput('move to a new session'), true);
  assert.equal(__test__.isEotInput('handoff to new session'), true);
  assert.equal(__test__.isEotInput('/eot deep'), true);
  assert.deepEqual(__test__.parseEotInput('/eot --deepseek'), { ok: true, deep: true });
  assert.deepEqual(__test__.parseEotInput('handoff to new session with deep synthesis'), { ok: true, deep: true });
  assert.equal(__test__.isEotInput('new session later maybe'), false);
});

test('Rick deep EOT prompt is bounded to the deterministic report', async () => {
  const { __test__ } = await import('./rick-repl.mjs');
  const prompt = __test__.buildEotDeepPrompt({
    current: { branch: 'main', head: 'abc123' },
    workingTree: { changedCount: 0, sample: [] },
    validation: ['node --check pass'],
    recentEvents: [],
    nonClaims: ['no mutation performed'],
    nextRecommended: ['write a short next-session boot note only if work will resume later'],
  }, 'EOT Checkpoint\nVerdict: optional');

  assert.match(prompt, /persistent Simple Rick synthesis lane/);
  assert.match(prompt, /Use only the deterministic report below/);
  assert.match(prompt, /## Next Session First Moves/);
  assert.match(prompt, /EOT Checkpoint/);
  assert.doesNotMatch(prompt, /Claude SDK|claude -p|--print/);
});

test('Rick formats memory proposal review output without promoting memory', async () => {
  const { __test__ } = await import('./rick-repl.mjs');
  const text = __test__.formatMemoryProposals({
    ok: true,
    proposals: [{
      id: 'mem-proposal-test',
      status: 'pending',
      tags: ['rick-harness'],
      content: 'Marcel wants sensitive user-profile memory to be proposed first and reviewed before promotion.',
    }],
  });

  assert.match(text, /Memory proposals:/);
  assert.match(text, /mem-proposal-test \[pending\]/);
  assert.match(text, /tags=rick-harness/);
  assert.match(__test__.helpText(), /\/memory propose <text>/);
  assert.match(__test__.helpText(), /\/memory decide <id>/);
  assert.match(__test__.helpText(), /feed Memory Rick/);
  assert.deepEqual(
    __test__.parseMemoryDecisionCommand('mem-proposal-test keep good signal for later promotion'),
    {
      proposalId: 'mem-proposal-test',
      decision: 'keep',
      reason: 'good signal for later promotion',
    },
  );
  assert.deepEqual(__test__.parseMemoryReviewCommand('addressing'), {
    reviewer: 'memory-rick',
    query: 'addressing',
  });
  assert.deepEqual(__test__.parseMemoryReviewCommand('--simple addressing'), {
    reviewer: 'simple-rick',
    query: 'addressing',
  });
});

test('Rick builds bounded memory review prompts for advisory triage only', async () => {
  const { __test__ } = await import('./rick-repl.mjs');
  const prompt = __test__.buildMemoryReviewPrompt({
    ok: true,
    proposals: [{
      id: 'mem-proposal-test',
      status: 'pending',
      tags: ['operator-preference'],
      confidence: 0.7,
      reason: 'Marcel clarified addressing',
      content: 'Address the user as Marcel; Rick is the assistant persona.',
    }],
  }, 'addressing');

  assert.match(prompt, /YURI Memory Proposal Review/);
  assert.match(prompt, /You do not promote memory/);
  assert.match(prompt, /Codex\/main and Marcel remain approval authorities/);
  assert.match(prompt, /## Questions For Marcel/);
  assert.match(prompt, /mem-proposal-test/);
  assert.match(__test__.helpText(), /\/memory review \[q\]/);
});

test('Rick harness prompt keeps conversational personality on by default', async () => {
  const { __test__ } = await import('./rick-repl.mjs');
  const prompt = __test__.buildPrompt('help me reason through this', '', '', { inputGenome: false });

  assert.match(prompt, /Evidence-first and conversational/);
  assert.match(prompt, /spend extra tokens on useful presence/);
  assert.doesNotMatch(prompt, /Terse, evidence-first, no fluff/);
  assert.match(__test__.helpText(), /\/eot \[deep\]\s+new-session handoff/);
});

test('Rick /goal surfaces the current YURI self-improvement goal artifact', async () => {
  const { __test__ } = await import('./rick-repl.mjs');
  const goal = __test__.goalText();

  assert.match(goal, /YURI OS Disciplined Self-Improvement Goal/);
  assert.match(goal, /Goal checklist:/);
  assert.match(goal, /Task gates:/);
  assert.match(goal, /YURI_OS_DISCIPLINED_SELF_IMPROVEMENT_GOAL_2026-05-23\.md/);
});

test('Rick /status returns structured release and health fields', async () => {
  const { __test__ } = await import('./rick-repl.mjs');
  const status = JSON.parse(await __test__.statusText());

  assert.equal(status.session.startsWith('rick-'), true);
  assert.equal(Array.isArray(status.activeDispatches), true);
  assert.equal(Array.isArray(status.quarantinedLanes), true);
  assert.match(status.preflightEvidenceHash, /^[a-f0-9]{64}$/);
  assert.ok(Object.hasOwn(status, 'lastReleaseGate'));
  assert.ok(Object.hasOwn(status, 'memoryProposals'));
  assert.equal(typeof status.memoryProposals.pending, 'number');
});

test('offload wrapper streams chat SSE chunks before process close', async (t) => {
  if (!(await allowOnlyIfBindable(t))) return;
  const server = http.createServer((req, res) => {
    if (req.method !== 'POST' || !['/chat/completions', '/v1/chat/completions'].includes(req.url)) {
      res.writeHead(404);
      res.end();
      return;
    }

    let body = '';
    req.on('data', (chunk) => {
      body += chunk.toString();
    });
    req.on('end', () => {
      const parsed = JSON.parse(body || '{}');
      assert.equal(parsed.model, 'deepseek-v4-flash');
      assert.equal(parsed.stream, true);
      res.writeHead(200, {
        'content-type': 'text/event-stream',
        'cache-control': 'no-cache',
      });

      ['alpha ', 'beta ', 'gamma'].forEach((text, index) => {
        setTimeout(() => {
          res.write(`data: ${JSON.stringify({ model: 'mock', choices: [{ delta: { content: text } }] })}\n\n`);
          if (index === 2) {
            setTimeout(() => res.end('data: [DONE]\n\n'), 30);
          }
        }, 50 * (index + 1));
      });
    });
  });

  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));

  const { port } = server.address();
  const startedAt = Date.now();
  const events = [];
  const child = spawn('bash', ['_SYSTEM/Scripts/ai', '@deepseek-v4-flash', 'mock stream'], {
    cwd: REPO_ROOT,
    env: {
      ...process.env,
      DEEPSEEK_API_KEY: 'mock-key',
      DEEPSEEK_BASE_URL: `http://127.0.0.1:${port}`,
      LANE_SESSION: 'rick-runtime-test',
      LLM_COMPAT_STREAM: '1',
    },
  });

  child.stdout.on('data', (chunk) => {
    events.push({ t: Date.now() - startedAt, text: chunk.toString() });
  });

  let stderr = '';
  child.stderr.on('data', (chunk) => {
    stderr += chunk.toString();
  });

  const code = await new Promise((resolve) => child.on('close', resolve));
  server.close();

  assert.equal(code, 0, stderr);
  assert.ok(events.length >= 3, `expected streamed stdout chunks, got ${events.length}`);
  assert.equal(events.map((event) => event.text).join('').trim(), 'alpha beta gamma');
  assert.ok(events[0].t < 500, `first chunk arrived too late: ${events[0].t}ms`);
});

test('Rick startup reaches banner without import-time crashes', async () => {
  const child = spawn(process.execPath, ['_SYSTEM/Scripts/rick-repl.mjs'], {
    cwd: REPO_ROOT,
    env: { ...process.env, TERM: 'xterm-256color' },
    stdio: ['pipe', 'pipe', 'pipe'],
  });

  let stdout = '';
  let stderr = '';
  child.stdout.on('data', (chunk) => {
    stdout += chunk.toString();
  });
  child.stderr.on('data', (chunk) => {
    stderr += chunk.toString();
  });

  await new Promise((resolve) => setTimeout(resolve, 900));
  child.kill('SIGTERM');
  await new Promise((resolve) => child.on('close', resolve));

  assert.match(stdout, /KAGAMI|Welcome to Kagami/);
  assert.doesNotMatch(stderr, /ERR_MODULE_NOT_FOUND|SyntaxError|TypeError|fatal:/);
});

test('Shintai critical harness assembly uses roster, task tier, fit, and live health', async () => {
  const { assembleShintaiTeam, loadShintaiRoster } = await import('./shintai-dispatch.mjs');
  const roster = loadShintaiRoster();
  const health = [
    { id: 'codex-architect', lane: 'gpt-5.5', ok: true, stdout: 'PONG' },
    { id: 'deepseek-reasoner', lane: 'deepseek-v4-pro', ok: true, stdout: 'PONG' },
    { id: 'claude-opus-audit', lane: 'claude-opus-4-7', ok: true, stdout: 'PONG' },
    { id: 'nemotron-orchestrator', lane: 'nvidia-nemotron-120b', ok: true, stdout: 'PONG' },
    { id: 'mistral-large', lane: 'nvidia-mistral-large', ok: true, stdout: 'PONG' },
    { id: 'mistral-medium', lane: 'nvidia-mistral-medium', ok: true, stdout: 'PONG' },
    { id: 'qwen-coder', lane: 'nvidia-qwen-coder', ok: true, stdout: 'PONG' },
    { id: 'minimax-m27', lane: 'nvidia-minimax-m27', ok: true, stdout: 'PONG' },
    { id: 'kimi-context-keeper', lane: 'kimi-k2.6', ok: false, stderr: 'Missing endpoint for lane: kimi' },
    { id: 'qwen3-next-code', lane: 'nvidia-qwen3-next', ok: true, stdout: 'PONG' },
  ];

  const assembly = assembleShintaiTeam('critical Rick harness renderer Shintai integration', roster, health);

  assert.equal(assembly.tier, 'critical');
  assert.deepEqual(assembly.requiredIds, ['codex', 'deepseek']);
  assert.deepEqual(assembly.selectedIds, ['codex', 'deepseek', 'claude-opus-audit', 'nemotron', 'mistral-large', 'qwen-coder', 'minimax-m27', 'qwen3-next', 'mistral-medium']);
  assert.equal(assembly.members.some((member) => member.id === 'kimi'), false);
  assert.equal(assembly.members.some((member) => /codex-spark/i.test(member.lane)), false);
  assert.equal(assembly.members.some((member) => member.id === 'qwen-coder'), true);
  assert.equal(assembly.members.some((member) => member.id === 'minimax-m27'), true);
  assert.equal(assembly.members.some((member) => member.id === 'glm'), false);
});

test('Shintai critical assembly requires Codex and DeepSeek from the lane kernel', async () => {
  const { assembleShintaiTeam } = await import('./shintai-dispatch.mjs');
  const roster = {
    members: {
      nemotron: {
        role: 'Nemotron',
        model: 'nvidia-nemotron-120b',
        skills: [],
      },
    },
  };

  const assembly = assembleShintaiTeam('critical Rick harness Shintai production audit', roster, {});

  assert.equal(assembly.ok, true);
  assert.ok(assembly.requiredIds.includes('codex'));
  assert.ok(assembly.requiredIds.includes('deepseek'));
  assert.ok(assembly.selectedIds.includes('codex'));
  assert.ok(assembly.selectedIds.includes('deepseek'));
});

test('Shintai guardrails reject hardcoded squad defaults and Rick-owned dispatcher naming', () => {
  const repl = readFileSync(new URL('./rick-repl.mjs', import.meta.url), 'utf8');
  const dispatch = readFileSync(new URL('./shintai-dispatch.mjs', import.meta.url), 'utf8');
  const roster = readFileSync(new URL('../kagami/shintai-team.json', import.meta.url), 'utf8');

  assert.doesNotMatch(repl, /rick-shintai\.mjs/);
  assert.match(dispatch, /yuri-control-plane\.mjs/);
  assert.match(dispatch, /evaluateExecutionRails/);
  assert.doesNotMatch(dispatch, /\bDEFAULT_SQUAD\b/);
  assert.doesNotMatch(dispatch, /lane:\s*['"]@?codex-spark['"]/);
  assert.doesNotMatch(dispatch, /rick-shintai\.mjs/);
  assert.doesNotMatch(dispatch, /nvidia-[^'"\]]+['"\],\s*['"]--no-tools['"]/);
  assert.doesNotMatch(roster, /nvidia-[^"\n]+ --no-tools/);
});

test('Shintai packet prompts begin with exact Rick persona anchor', async () => {
  const { buildMemberPrompt, ensureRickPersonaAnchor } = await import('./shintai-dispatch.mjs');
  const prompt = buildMemberPrompt('audit the harness', {
    displayName: 'Codex Architect',
    lane: 'gpt-5.5',
    reasoningEffort: 'xhigh',
    skills: [],
    assignment: 'test',
    toolPolicy: null,
  });

  assert.equal(prompt.split('\n').find((line) => line.trim()), 'PERSONA: Rick');
  assert.equal(ensureRickPersonaAnchor('# Header\n---\nBody').split('\n')[2], 'PERSONA: Rick');
});

test('Shintai dispatcher does not impose short hardcoded timeouts on large lanes', () => {
  const dispatch = readFileSync(new URL('./shintai-dispatch.mjs', import.meta.url), 'utf8');

  assert.match(dispatch, /YURI_SHINTAI_TIMEOUT_MS/);
  assert.match(dispatch, /if \(Number\.isFinite\(timeoutMs\) && timeoutMs > 0\) spawnOptions\.timeout = timeoutMs/);
  assert.doesNotMatch(dispatch, /DEFAULT_TIMEOUT_MS\s*=\s*120_000/);
  assert.doesNotMatch(dispatch, /Math\.min\(timeoutMs,\s*(?:90_000|120_000)/);
});

test('Rick @shintai path delegates full health preflight without hardcoded probe timeouts', () => {
  const repl = readFileSync(new URL('./rick-repl.mjs', import.meta.url), 'utf8');

  assert.doesNotMatch(repl, /healthProbe/);
  assert.doesNotMatch(repl, /preflightShintaiHealth/);
  assert.doesNotMatch(repl, /timeout:\s*(?:90_000|120_000)/);
  assert.match(repl, /runAdvisory\(buildPrompt/);
  assert.match(repl, /Shintai health preflight/);
});

test('Rick renderer preserves cursor when configuring scroll region', () => {
  const repl = readFileSync(new URL('./rick-repl.mjs', import.meta.url), 'utf8');

  assert.match(repl, /terminalWrite\(`\\x1b7\\x1b\[1;\$\{bottom\}r\\x1b8`\)/);
  assert.match(repl, /configuredScrollBottom === bottom/);
  assert.doesNotMatch(repl, /terminalWrite\(`\\x1b\[1;\$\{scrollBottom\(\)\}r`\)/);
  assert.doesNotMatch(repl, /terminalWrite\(`\\x1b\[1;\$\{scrollBottom\(\)\}r\\x1b\[1;1H`\)/);
});

test('Rick PTY streams two turns in order and restores terminal state', { timeout: 15_000 }, async (t) => {
  if (!(await allowOnlyIfBindable(t))) return;
  const pythonCheck = spawnSync('python3', ['--version'], {
    cwd: REPO_ROOT,
    encoding: 'utf8',
  });
  if (pythonCheck.status !== 0) {
    t.skip('python3 PTY harness unavailable');
    return;
  }

  let requestCount = 0;
  const server = http.createServer((req, res) => {
    if (req.method !== 'POST' || !['/chat/completions', '/v1/chat/completions'].includes(req.url)) {
      res.writeHead(404);
      res.end();
      return;
    }

    req.resume();
    req.on('end', () => {
      requestCount += 1;
      const chunks = requestCount === 1 ? ['alpha ', 'one'] : ['beta ', 'two'];
      res.writeHead(200, {
        'content-type': 'text/event-stream',
        'cache-control': 'no-cache',
      });
      chunks.forEach((text, index) => {
        setTimeout(() => {
          res.write(`data: ${JSON.stringify({ model: 'mock', choices: [{ delta: { content: text } }] })}\n\n`);
          if (index === chunks.length - 1) {
            setTimeout(() => res.end('data: [DONE]\n\n'), 20);
          }
        }, 40 * (index + 1));
      });
    });
  });

  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address();

  const pythonHarness = String.raw`
import fcntl
import os
import pty
import re
import select
import struct
import subprocess
import sys
import termios
import time

root = os.environ["RICK_REPO_ROOT"]
master, slave = pty.openpty()
fcntl.ioctl(slave, termios.TIOCSWINSZ, struct.pack("HHHH", 32, 140, 0, 0))
proc = subprocess.Popen(
    [os.environ["NODE_BIN"], "_SYSTEM/Scripts/rick-repl.mjs"],
    cwd=root,
    stdin=slave,
    stdout=slave,
    stderr=slave,
    env=os.environ.copy(),
    close_fds=True,
)
os.close(slave)

raw = b""
first_sent = False
second_sent = False
done = False
second_due = None
started = time.time()

def clean_text():
    clean = re.sub(b"\x1b\\[[0-9;?]*[ -/]*[@-~]", b"", raw)
    return re.sub(b"\x1b[78]", b"", clean)

while time.time() - started < 12:
    ready, _, _ = select.select([master], [], [], 0.05)
    if master in ready:
        try:
            chunk = os.read(master, 4096)
        except OSError:
            break
        if not chunk:
            break
        raw += chunk
        sys.stdout.buffer.write(chunk)
        sys.stdout.buffer.flush()

    clean = clean_text()
    if not first_sent and (b"Welcome to Kagami" in clean or b"Route:" in clean):
        os.write(master, b"first pty turn\r")
        first_sent = True
    if first_sent and not second_sent and second_due is None and b"alpha" in clean and b"one" in clean:
        second_due = time.time() + 0.5
    if first_sent and not second_sent and second_due is not None and time.time() >= second_due:
        os.write(master, b"second pty turn\r")
        second_sent = True
    if second_sent and not done and b"beta" in clean and b"two" in clean:
        os.write(master, b"\x03")
        done = True
    if done and proc.poll() is not None:
        break

if not done and proc.poll() is None:
    proc.terminate()

try:
    proc.wait(timeout=3)
except subprocess.TimeoutExpired:
    proc.kill()
    proc.wait()

while True:
    ready, _, _ = select.select([master], [], [], 0)
    if master not in ready:
        break
    try:
        chunk = os.read(master, 4096)
    except OSError:
        break
    if not chunk:
        break
    raw += chunk
    sys.stdout.buffer.write(chunk)

sys.exit(0 if done and proc.returncode == 0 else 2)
`;

  const child = spawn('python3', ['-c', pythonHarness], {
    cwd: REPO_ROOT,
    env: {
      ...process.env,
      DEEPSEEK_API_KEY: 'mock-key',
      DEEPSEEK_BASE_URL: `http://127.0.0.1:${port}`,
      KAGAMI_RICK_MODE: 'rick',
      LANE_SESSION: 'rick-pty-runtime-test',
      NODE_BIN: process.execPath,
      LLM_COMPAT_STREAM: '1',
      RICK_REPO_ROOT: REPO_ROOT,
      TERM: 'xterm-256color',
    },
    stdio: ['pipe', 'pipe', 'pipe'],
  });

  let raw = '';
  let stderr = '';
  let firstSent = false;
  let secondSent = false;
  let done = false;

  child.stdout.on('data', (chunk) => {
    raw += chunk.toString();
    const clean = stripAnsi(raw);
    firstSent ||= clean.includes('first pty turn');
    secondSent ||= clean.includes('second pty turn');
    done ||= clean.includes('beta') && clean.includes('two');
  });
  child.stderr.on('data', (chunk) => {
    stderr += chunk.toString();
  });

  const fallback = setTimeout(() => {
    if (!done) child.kill('SIGTERM');
  }, 12_000);

  const closeCode = await new Promise((resolve) => child.on('close', resolve));
  clearTimeout(fallback);
  server.close();

  const clean = stripAnsi(raw);
  assert.ok(done, `expected two streamed turns, got:\n${clean.slice(-3000)}\nSTDERR:\n${stderr}`);
  const alpha = clean.indexOf('alpha');
  const one = clean.indexOf('one', alpha);
  const beta = clean.indexOf('beta', one);
  const two = clean.indexOf('two', beta);
  assert.ok(alpha >= 0 && one > alpha && beta > one && two > beta, clean);
  assert.match(raw, /\x1b\[1;\d+r/, 'scroll region was not configured');
  assert.match(raw, /\x1b7\x1b\[1;\d+r\x1b8/, 'scroll region changes must preserve cursor');
  assert.match(raw, /\x1b\[r/, 'scroll region was not reset on exit');
  assert.doesNotMatch(clean, /ctrl\+c exit[^\n]*(?:alpha one|beta two)/);
  assert.equal(closeCode, 0);
});
