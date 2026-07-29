#!/usr/bin/env node
// @capability: ablation-harness
// @serves: tool-ablation episode loop | bounded ReAct subject driver | attribution scoring with source partition
// @does: drives ONE ablation episode: a subject model gets a question plus the FROZEN anonymized
//   tool descriptions for its assigned arm, emits TOOL_CALL lines or a forced terminal act
//   (ANSWER: <path> / ABSTAIN), and the harness executes calls through ablation-executors and
//   feeds byte-normalized results back until terminal, call cap, or parse failure.
//   CONTROLS (Hermes 2026-07-28): in CLEAN episodes the subject never sees the expect path (not
//   in tool descriptions, harness framing, or error text). Episodes whose QUESTION TEXT already
//   contains the expect path or a prefix of it (q041 class) cannot satisfy that control — they
//   are tagged `prompt_leak` at intake and STRATIFIED out of primary means, exactly like
//   self_ref; the tag is the honest version of the control, not a violation of it. Descriptions
//   are frozen and hashed per run; every run ends in a structured terminal act — parse failures
//   and cap exhaustion record failure_mode, never a guessed outcome. ATTRIBUTION: the first tool-result line containing the
//   expect path is recorded VERBATIM with its source file (fragment granularity), classified into
//   the frozen partition (NAV_SURFACE/REGISTRY/DOCTRINE/CORPUS for file_read; arm_output is a
//   source-kind, not a class). Outcomes: FIND / REGISTRY_HIT / C_DISK_COPY / PROMPT_COPY /
//   CONFIRM_ONLY / WRONG / ABSTAIN / TIMEOUT. R2: an appearance only in the subject's own call
//   arguments is not discovery. SELF-REF: expects matching a tool binding are tagged and
//   stratified out of primary means (q002/q003/q011 class).
// @use: import { runEpisode } or node ablation-harness.mjs --test (mock subject, zero model cost)
// @exports: runEpisode, classifyOutcome, SELF_REF_ROSTER

import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { executeTool, BYTE_BUDGET } from './ablation-executors.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..', '..', '..');
const DESCRIPTIONS_PATH = path.join(REPO_ROOT, '_SYSTEM/Scripts/atlas/ablation-descriptions.json');
const PARTITION_PATH = path.join(REPO_ROOT, '_SYSTEM/Scripts/atlas/ablation-partition.json');

export const SELF_REF_ROSTER = new Set(['atlas-resolve.mjs', 'xref-query.mjs', 'capability-recall.mjs', 'yuri-search.mjs']);

const MAX_CALLS_DEFAULT = 10;

function sha256(s) { return createHash('sha256').update(s).digest('hex'); }

function loadFrozen() {
  const descRaw = readFileSync(DESCRIPTIONS_PATH, 'utf8');
  const partRaw = readFileSync(PARTITION_PATH, 'utf8');
  return {
    descriptions: JSON.parse(descRaw),
    partition: JSON.parse(partRaw),
    descriptionsHash: sha256(descRaw),
    partitionHash: sha256(partRaw),
  };
}

// The subject-facing system prompt: anonymized descriptions ONLY. No tool names, no repo map,
// no expect, no hint which label is which. Built once per episode and hashed into the record.
function buildSubjectPrompt(descriptions, armLabels, question) {
  const blocks = armLabels.map((label) => {
    const d = descriptions.descriptions[label];
    return `${label}:\n  Purpose: ${d.purpose}\n  Inputs: ${d.inputs}\n  Outputs: ${d.outputs}\n  Failure behaviour: ${d.failure_behaviour}`;
  }).join('\n');
  return [
    'You are finding one file in a repository. You may ONLY use the tools described below.',
    'To call a tool, output exactly one line: TOOL_CALL {"tool":"<label>","args":{...}}',
    'To finish, output exactly one line: ANSWER: <repo-relative path>   or   ABSTAIN',
    'Anything else wastes a turn. You have a limited number of tool calls.',
    '',
    blocks,
    '',
    `QUESTION: ${question}`,
  ].join('\n');
}

// Classify a file_read fragment's source file into the frozen partition. Fragment granularity:
// the class attaches to the FILE the fragment came from (Hermes: INDEX.md rows vs doctrine prose
// share a file; the fragment's own line is recorded verbatim either way).
function classifySourceFile(file, partition) {
  if (!file) return 'CORPUS';
  const norm = String(file).replace(/\\/g, '/').replace(/^\.\//, '');
  for (const cls of ['NAV_SURFACE', 'REGISTRY', 'DOCTRINE']) {
    const spec = partition.classes[cls];
    if (!spec) continue;
    if ((spec.files || []).some((f) => norm === f || norm.endsWith('/' + f))) return cls;
    for (const g of spec.globs || []) {
      const re = new RegExp('^' + g.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '[^/]*') + '$');
      if (re.test(norm)) return cls;
    }
  }
  return 'CORPUS';
}

const OUTCOME_BY_CLASS = { NAV_SURFACE: 'FIND', REGISTRY: 'REGISTRY_HIT', DOCTRINE: 'C_DISK_COPY', CORPUS: 'FIND' };

// Prompt-leak detection (advisory 2026-07-28): some benchmark question TEXT contains the expect
// path or a prefix of it (q041: expect `_SYSTEM/Scripts/policy` is a substring of the question's
// embedded `_SYSTEM/Scripts/policy/yuri-safety-core.mjs`). Inserting the question verbatim hands
// the subject the answer — PROMPT_COPY contamination by construction. Detect BEFORE the prompt
// is built: full path as substring, parent prefix + distinctive leaf, or a long basename.
// Tagged and stratified (like self_ref), never silently run as clean.
export function detectExpectLeak(question, expect) {
  const q = String(question || '').toLowerCase();
  const norm = String(expect || '').toLowerCase().replace(/^\.\//, '').replace(/\/+$/, '');
  if (!norm) return { leaked: false };
  if (norm.includes('/') && q.includes(norm)) return { leaked: true, span: norm, kind: 'full-path-or-prefix' };
  const parts = norm.split('/');
  const leaf = parts[parts.length - 1].replace(/\.[a-z0-9]+$/i, '');
  for (let i = 1; i < parts.length; i++) {
    const prefix = parts.slice(0, i + 1).join('/');
    if (prefix.includes('/') && prefix.length >= 8 && q.includes(prefix) && leaf.length >= 4 && q.includes(leaf)) {
      return { leaked: true, span: `${prefix} + leaf ${leaf}`, kind: 'prefix+leaf' };
    }
  }
  const base = parts[parts.length - 1];
  if (base.length >= 8 && q.includes(base)) return { leaked: true, span: base, kind: 'basename' };
  return { leaked: false };
}

export function classifyOutcome({ answered, expect, firstAppearance, abstained, failureMode }) {
  if (answered && answered === expect) {
    if (!firstAppearance) return 'PROMPT_COPY'; // correct with no tool-output appearance: recall/injected
    if (firstAppearance.sourceKind === 'arm_output') return 'FIND';
    return OUTCOME_BY_CLASS[firstAppearance.class] || 'FIND';
  }
  // Timeout precedence (advisory): a timeout that ends navigation is TIMEOUT even if the subject
  // then abstains — the timeout is WHY it abstained. A correct answer above still wins (recovery).
  if (failureMode === 'timeout') return 'TIMEOUT';
  if (answered && answered !== expect) return firstAppearance ? 'CONFIRM_ONLY' : 'WRONG';
  if (abstained) return 'ABSTAIN';
  return 'ABSTAIN'; // parse failure / cap: the standing rule is parse failures are ABSTAIN
}

// One episode. `subject` is an adapter: async (messages) -> string reply. `messages` is the
// full conversation so far [{role, content}]; the adapter owns the model call and returns the
// raw reply text. The harness never learns what model it is except via the adapter's metadata.
export async function runEpisode({
  questionId, question, expect, arm, subject, maxCalls = MAX_CALLS_DEFAULT,
  descriptions = null, partition = null, kMeasures = 'unknown', executor = executeTool,
}) {
  const frozen = descriptions && partition
    ? { descriptions, partition, descriptionsHash: sha256(JSON.stringify(descriptions)), partitionHash: sha256(JSON.stringify(partition)) }
    : loadFrozen();
  const armLabels = Array.isArray(arm) ? arm : [arm];
  const normExpect = String(expect).replace(/^\.\//, '').replace(/\/+$/, '');
  const leak = detectExpectLeak(question, normExpect);
  const systemPrompt = buildSubjectPrompt(frozen.descriptions, armLabels, question);
  const promptHash = sha256(systemPrompt);

  const messages = [{ role: 'system', content: systemPrompt }];
  const trace = [];
  let firstAppearance = null;
  let answered = null;
  let abstained = false;
  let failureMode = null;
  let calls = 0;
  let taintedAppearances = 0;
  let totalLatency = 0;
  let totalTokens = 0;

  for (let turn = 0; turn < maxCalls + 3; turn++) { // cap + grace turns for a terminal act
    const t0 = Date.now();
    const reply = await subject(messages);
    const latency = Date.now() - t0;
    totalLatency += latency;
    const text = String(reply && reply.text !== undefined ? reply.text : reply);
    if (reply && reply.tokens) totalTokens += reply.tokens;
    trace.push({ turn, role: 'subject', latency_ms: latency, text: text.slice(0, 2000) });

    const lines = text.split('\n').map((l) => l.trim()).filter(Boolean);
    const answerLine = lines.find((l) => l.startsWith('ANSWER:'));
    const abstainLine = lines.find((l) => l === 'ABSTAIN' || l.startsWith('ABSTAIN'));
    const callLine = lines.find((l) => l.startsWith('TOOL_CALL'));

    if (answerLine) { answered = answerLine.slice('ANSWER:'.length).trim().replace(/^\.\//, ''); break; }
    if (abstainLine) { abstained = true; break; }
    if (callLine) {
      calls++;
      if (calls > maxCalls) { failureMode = 'cap'; break; }
      let parsed = null;
      try { parsed = JSON.parse(callLine.slice('TOOL_CALL'.length).trim()); } catch { /* parse */ }
      if (!parsed || typeof parsed.tool !== 'string') {
        messages.push({ role: 'harness', content: 'TOOL_ERROR: could not parse TOOL_CALL JSON. Emit TOOL_CALL {"tool":"...","args":{...}} or ANSWER:/ABSTAIN.' });
        trace.push({ turn, role: 'harness', error: 'tool_call_parse' });
        continue;
      }
      // ARM ENFORCEMENT (advisory 2026-07-28): a subject may only call tools in its assigned arm.
      // An out-of-arm call is a tool error, never executed — otherwise a tool_e arm could borrow
      // tool_a's retrieval and the ablation measures nothing.
      if (!armLabels.includes(parsed.tool)) {
        messages.push({ role: 'harness', content: `TOOL_ERROR: that tool is not available in this session. Use only the described tools, or ANSWER:/ABSTAIN.` });
        trace.push({ turn, role: 'harness', error: 'out_of_arm', tool: parsed.tool });
        continue;
      }
      // R2: note if the expect appears in the subject's own call args (never discovery).
      const argsText = JSON.stringify(parsed.args || {});
      const inArgs = argsText.includes(normExpect);
      // Executor failures are EPISODE DATA, never a process abort (advisory 2026-07-28): a
      // missing backend records status ERROR and the episode continues/scores accordingly.
      let result;
      const callT0 = Date.now();
      try {
        result = await executor(parsed.tool, parsed.args || {});
      } catch (err) {
        result = { status: 'ERROR', text: `[executor threw: ${String(err && err.message).slice(0, 300)}]`, sourceItems: [] };
      }
      // Wall time per tool call (Hermes frozen factors: latency stratified per run, never pooled).
      // Injected executors (tests) may not report elapsed_ms — measure at the call boundary.
      const callElapsed = typeof result.elapsed_ms === 'number' ? result.elapsed_ms : Date.now() - callT0;
      totalLatency += callElapsed;
      trace.push({ turn, role: 'tool', tool: parsed.tool, status: result.status, bytes: result.text.length, elapsed_ms: callElapsed });
      if (result.status === 'TIMEOUT') failureMode = 'timeout_observed';
      // First-appearance scan: the expect path in tool OUTPUT. R2 TEETH (advisory 2026-07-28):
      // if the subject passed the expect IN THE CALL ARGS, an echoed output is not discovery —
      // the subject demonstrably already knew it. Tainted appearances are counted for reporting
      // but never promoted to firstAppearance; only a clean call can establish discovery.
      if (result.text.includes(normExpect)) {
        if (inArgs) {
          taintedAppearances++;
          trace.push({ turn, role: 'harness', note: 'R2-tainted appearance (expect was in call args)', call: calls });
        } else if (!firstAppearance) {
          const hitLine = result.text.split('\n').find((l) => l.includes(normExpect)) || '';
          const src = (result.sourceItems || []).find((s) => s.line && s.line.includes(normExpect));
          const sourceKind = src ? src.kind : (armLabels.includes(parsed.tool) && parsed.tool !== 'tool_e' ? 'arm_output' : 'file_read');
          firstAppearance = {
            call: calls,
            sourceKind,
            sourceFile: src && src.file ? src.file : null,
            class: sourceKind === 'file_read' ? classifySourceFile(src && src.file, frozen.partition) : null,
            fragment: hitLine.slice(0, 500), // VERBATIM fragment, recorded regardless of class
          };
        }
      }
      messages.push({ role: 'harness', content: `TOOL_RESULT ${parsed.tool} [${result.status}]:\n${result.text}` });
      continue;
    }
    // No terminal act and no call: nudge once, then it is a parse-class abstain.
    messages.push({ role: 'harness', content: 'Emit exactly one of: TOOL_CALL {"tool":"...","args":{...}} — or ANSWER: <path> — or ABSTAIN.' });
    if (turn >= 1) { failureMode = 'no_terminal'; break; }
  }

  const outcome = classifyOutcome({ answered, expect: normExpect, firstAppearance, abstained, failureMode: (failureMode === 'cap' || failureMode === 'timeout_observed') ? 'timeout' : failureMode });
  const selfRef = SELF_REF_ROSTER.has(path.basename(normExpect));
  return {
    question_id: questionId,
    arm: armLabels,
    model: (subject && subject.modelId) || 'unknown',
    k_measures: kMeasures,
    outcome,
    answered,
    expect: normExpect,
    success: answered === normExpect,
    calls,
    latency_ms: totalLatency,
    tokens: totalTokens,
    failure_mode: failureMode,
    self_ref: SELF_REF_ROSTER.has(path.basename(normExpect)),
    prompt_leak: leak.leaked ? leak : false, // stratified out of primary means, like self_ref
    first_appearance: firstAppearance,
    r2_tainted_appearances: taintedAppearances, // expect echoes where the subject supplied it in args
    prompt_hash: promptHash,
    descriptions_hash: frozen.descriptionsHash,
    partition_hash: frozen.partitionHash,
    trace,
  };
}

// ---------------------------------------------------------------------------
// Self-test — mock subject, zero model cost. Verifies: loop, parsing, executor wiring,
// attribution, partition classes, R2, forced terminal act, self-ref tagging, JSONL shape.
// ---------------------------------------------------------------------------
async function runSelfTest() {
  let pass = true;
  const check = (name, cond, detail) => {
    console.log(`[ablation-harness --test] ${name}: ${cond ? 'PASS' : 'FAIL'}${cond ? '' : ` ${detail || ''}`}`);
    if (!cond) pass = false;
  };
  const frozen = loadFrozen();
  const scripted = (replies, meta = {}) => {
    let i = 0;
    const fn = async () => replies[Math.min(i++, replies.length - 1)];
    fn.modelId = meta.modelId || 'mock-subject';
    return fn;
  };

  // 1. FIND via tool_e contents hit on a real file.
  const ep1 = await runEpisode({
    questionId: 't1', question: 'what checks descriptions', expect: '_SYSTEM/Scripts/atlas/ablation-descriptions-check.mjs',
    arm: ['tool_e'], subject: scripted([
      'TOOL_CALL {"tool":"tool_e","args":{"operation":"contents","pattern":"ablation-descriptions-check","scope":"_SYSTEM/Scripts/atlas"}}',
      'ANSWER: _SYSTEM/Scripts/atlas/ablation-descriptions-check.mjs',
    ]),
    descriptions: frozen.descriptions, partition: frozen.partition,
  });
  check('FIND via grep hit with fragment + class recorded', ep1.success && ep1.outcome === 'FIND' && ep1.first_appearance && ep1.first_appearance.fragment.includes('ablation-descriptions-check'), JSON.stringify({ o: ep1.outcome, fa: ep1.first_appearance && ep1.first_appearance.class }));
  check('wall latency measured per tool call and aggregated', ep1.latency_ms > 0 && ep1.trace.some((t) => t.role === 'tool' && typeof t.elapsed_ms === 'number' && t.elapsed_ms >= 0), JSON.stringify({ lat: ep1.latency_ms }));

  // 2. PROMPT_COPY: answered with no tool output appearance.
  const ep2 = await runEpisode({
    questionId: 't2', question: 'q', expect: '_SYSTEM/Scripts/atlas/atlas-resolve.mjs',
    arm: ['tool_e'], subject: scripted(['ANSWER: _SYSTEM/Scripts/atlas/atlas-resolve.mjs']),
    descriptions: frozen.descriptions, partition: frozen.partition,
  });
  check('correct-without-appearance = PROMPT_COPY', ep2.outcome === 'PROMPT_COPY', ep2.outcome);

  // 3. C_DISK_COPY: grep hit inside a DOCTRINE file (fixture uses a path that appears in FULL
  // in the doctrine text — a basename-only mention is not the expect, measured by juno's probe).
  const ep3 = await runEpisode({
    questionId: 't3', question: 'what stops a commit when the scorer is touched', expect: '_SYSTEM/Scripts/propagation-scan.mjs',
    arm: ['tool_e'], subject: scripted([
      'TOOL_CALL {"tool":"tool_e","args":{"operation":"contents","pattern":"propagation-scan","scope":"CLAUDE.md"}}',
      'ANSWER: _SYSTEM/Scripts/propagation-scan.mjs',
    ]),
    descriptions: frozen.descriptions, partition: frozen.partition,
  });
  check('doctrine-file hit = C_DISK_COPY', ep3.outcome === 'C_DISK_COPY' && ep3.first_appearance.class === 'DOCTRINE', JSON.stringify({ o: ep3.outcome, c: ep3.first_appearance && ep3.first_appearance.class }));

  // 4. ABSTAIN on no terminal act.
  const ep4 = await runEpisode({
    questionId: 't4', question: 'q', expect: 'x/y.mjs',
    arm: ['tool_e'], subject: scripted(['I am not sure what to do here.', 'still thinking out loud']),
    descriptions: frozen.descriptions, partition: frozen.partition,
  });
  check('no terminal act = ABSTAIN with failure_mode', ep4.outcome === 'ABSTAIN' && !ep4.success, JSON.stringify({ o: ep4.outcome, f: ep4.failure_mode }));

  // 5. Self-ref roster tagging.
  const ep5 = await runEpisode({
    questionId: 't5', question: 'q', expect: '_SYSTEM/Scripts/xref-query.mjs',
    arm: ['tool_e'], subject: scripted(['ABSTAIN']),
    descriptions: frozen.descriptions, partition: frozen.partition,
  });
  check('self-ref roster tags tool-named expects', ep5.self_ref === true, String(ep5.self_ref));

  // 6. prompt_hash + frozen hashes recorded; expect never in subject-facing prompt.
  check('prompt_hash recorded and expect-free prompt', ep1.prompt_hash.length === 64 && ep1.descriptions_hash.length === 64 && ep1.partition_hash.length === 64, 'hash presence');
  const prompt = buildSubjectPrompt(frozen.descriptions, ['tool_a', 'tool_e'], 'where is the thing');
  check('subject prompt contains no expect path', !prompt.includes('atlas-resolve.mjs') && !prompt.includes('xref-query.mjs'), 'prompt leaked a binding name');

  // 7. arm_output classification is a pure function of classifyOutcome — assert it directly
  // (a live tool_a call needs gitignored atlas state that a clean worktree lacks; the executor
  // exception path is covered by the try/catch above, and a real tool_a smoke belongs to the
  // harness-validation run in the primary tree).
  const armOutcome = classifyOutcome({ answered: 'x/y.mjs', expect: 'x/y.mjs', firstAppearance: { sourceKind: 'arm_output' }, abstained: false, failureMode: null });
  check('arm_output first appearance classifies FIND', armOutcome === 'FIND', armOutcome);
  const regOutcome = classifyOutcome({ answered: 'x/y.mjs', expect: 'x/y.mjs', firstAppearance: { sourceKind: 'file_read', class: 'REGISTRY' }, abstained: false, failureMode: null });
  check('registry-class file_read classifies REGISTRY_HIT', regOutcome === 'REGISTRY_HIT', regOutcome);

  // 8. Arm enforcement: an out-of-arm call is rejected, never executed.
  const ep8 = await runEpisode({
    questionId: 't8', question: 'q', expect: 'x/y.mjs',
    arm: ['tool_e'], subject: scripted([
      'TOOL_CALL {"tool":"tool_a","args":{"question":"sneaky cross-arm call"}}',
      'ABSTAIN',
    ]),
    descriptions: frozen.descriptions, partition: frozen.partition,
  });
  check('out-of-arm call rejected, never executed', ep8.trace.some((t) => t.error === 'out_of_arm') && !ep8.trace.some((t) => t.role === 'tool' && t.tool === 'tool_a'), JSON.stringify(ep8.trace.filter((t) => t.error)));

  // 9. TIMEOUT outcome: a timeout sentinel maps to the declared TIMEOUT class.
  const toOutcome = classifyOutcome({ answered: null, expect: 'x/y.mjs', firstAppearance: null, abstained: false, failureMode: 'timeout' });
  check('timeout failure_mode maps to TIMEOUT outcome', toOutcome === 'TIMEOUT', toOutcome);
  // 10. Timeout through the episode: tool timeout then ABSTAIN classifies TIMEOUT, not ABSTAIN.
  const timeoutExecutor = async () => ({ status: 'TIMEOUT', text: '[TIMEOUT after 30000ms — sentinel, not an empty result]', sourceItems: [] });
  const ep10 = await runEpisode({
    questionId: 't10', question: 'q', expect: 'x/y.mjs',
    arm: ['tool_b'], subject: scripted([
      'TOOL_CALL {"tool":"tool_b","args":{"query":"anything"}}',
      'ABSTAIN',
    ]),
    descriptions: frozen.descriptions, partition: frozen.partition, executor: timeoutExecutor,
  });
  check('tool timeout then ABSTAIN classifies TIMEOUT', ep10.outcome === 'TIMEOUT', JSON.stringify({ o: ep10.outcome, f: ep10.failure_mode }));

  // 11. Prompt-leak detection (q041 class: expect is a prefix substring of the question).
  const ep11 = await runEpisode({
    questionId: 't11', question: 'which file under _SYSTEM/Scripts/policy/yuri-safety-core.mjs enforces the safety core', expect: '_SYSTEM/Scripts/policy',
    arm: ['tool_e'], subject: scripted(['ABSTAIN']),
    descriptions: frozen.descriptions, partition: frozen.partition,
  });
  check('expect-as-prefix-substring tags prompt_leak', ep11.prompt_leak && ep11.prompt_leak.leaked, JSON.stringify(ep11.prompt_leak));
  const ep11b = await runEpisode({
    questionId: 't11b', question: 'what gates commits touching the eval directory', expect: '_SYSTEM/Scripts/atlas/bench-validate.mjs',
    arm: ['tool_e'], subject: scripted(['ABSTAIN']),
    descriptions: frozen.descriptions, partition: frozen.partition,
  });
  check('generic directory mention without leaf does NOT tag', ep11b.prompt_leak === false, JSON.stringify(ep11b.prompt_leak));

  // 12. R2 teeth: expect passed in call args, echoed back — not discovery, classifies PROMPT_COPY.
  const ep12 = await runEpisode({
    questionId: 't12', question: 'q', expect: '_SYSTEM/Scripts/atlas/bench-validate.mjs',
    arm: ['tool_e'], subject: scripted([
      'TOOL_CALL {"tool":"tool_e","args":{"operation":"names","pattern":"bench-validate","scope":"_SYSTEM/Scripts/atlas/bench-validate.mjs"}}',
      'ANSWER: _SYSTEM/Scripts/atlas/bench-validate.mjs',
    ]),
    descriptions: frozen.descriptions, partition: frozen.partition,
  });
  check('args-echo appearance is tainted, not discovery (PROMPT_COPY)', ep12.outcome === 'PROMPT_COPY' && ep12.r2_tainted_appearances >= 1 && !ep12.first_appearance, JSON.stringify({ o: ep12.outcome, t: ep12.r2_tainted_appearances }));

  // 13. Injected-executor fallback timing: an executor that sleeps and reports no elapsed_ms
  // must still be timed at the call boundary (advisory: tool_e's inner run() timing is not proof).
  const sleepExecutor = async () => { await new Promise((r) => setTimeout(r, 40)); return { status: 'OK', text: '', sourceItems: [] }; };
  const ep13 = await runEpisode({
    questionId: 't13', question: 'q', expect: 'x/y.mjs',
    arm: ['tool_e'], subject: scripted(['TOOL_CALL {"tool":"tool_e","args":{"operation":"contents","pattern":"zzz","scope":"."}}', 'ABSTAIN']),
    descriptions: frozen.descriptions, partition: frozen.partition, executor: sleepExecutor,
  });
  const toolTrace13 = ep13.trace.find((t) => t.role === 'tool');
  check('injected executor without elapsed_ms is timed at the boundary (>=30ms for a 40ms sleep)',
    toolTrace13 && toolTrace13.elapsed_ms >= 30 && ep13.latency_ms >= 30,
    JSON.stringify({ trace: toolTrace13 && toolTrace13.elapsed_ms, total: ep13.latency_ms }));

  console.log(`[ablation-harness --test] overall: ${pass ? 'PASS' : 'FAIL'}`);
  return pass ? 0 : 1;
}

const isMain = process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url;
if (isMain && process.argv.includes('--test')) runSelfTest().then((c) => { process.exitCode = c; });
