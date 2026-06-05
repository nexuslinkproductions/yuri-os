// Unit test: kimi native tool-call adapter against the EXACT leaked output captured live (S4 retry).
import { parseKimiToolCalls, stripKimiToolTokens } from './llm-lane.mjs';

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; } else { fail++; console.log('FAIL:', m); } };

// 1. The real captured leak (escaped quotes inside the bash arg — the hard case).
const real = '<|tool_calls_section_begin|> <|tool_call_begin|> functions.list_dir:0 <|tool_call_argument_begin|> {"path":"_SYSTEM/Scripts"} <|tool_call_end|> <|tool_call_begin|> functions.bash:1 <|tool_call_argument_begin|> {"cmd": "ls -la _SYSTEM/Scripts/nemotron-dispatch.mjs 2>/dev/null && echo \\"EXISTS\\" || echo \\"PHANTOM_CONFIRMED\\""} <|tool_call_end|> <|tool_calls_section_end|>';
const calls = parseKimiToolCalls(real);
ok(calls.length === 2, `expected 2 calls, got ${calls.length}`);
ok(calls[0].function.name === 'list_dir', `call0 name=${calls[0]?.function?.name}`);
ok(JSON.parse(calls[0].function.arguments).path === '_SYSTEM/Scripts', 'call0 args parse');
ok(calls[1].function.name === 'bash', `call1 name=${calls[1]?.function?.name}`);
ok(JSON.parse(calls[1].function.arguments).cmd.includes('PHANTOM_CONFIRMED'), 'call1 args parse w/ escaped quotes');
ok(calls.every(c => c.type === 'function' && typeof c.id === 'string'), 'all calls OpenAI-shaped (id+type)');

// 2. read_file form from attempt-1.
const rf = '<|tool_calls_section_begin|> <|tool_call_begin|> functions.read_file:0 <|tool_call_argument_begin|> {"path": "_SYSTEM/Scripts/llm-compat-contract.mjs", "max_lines": 1000} <|tool_call_end|> <|tool_calls_section_end|>';
const c2 = parseKimiToolCalls(rf);
ok(c2.length === 1 && c2[0].function.name === 'read_file', 'read_file parsed');

// 3. Inert on normal content (deepseek/nemotron never carry the signature).
ok(parseKimiToolCalls('FINDING id=1 file=x line=2 ...').length === 0, 'inert on normal prose');
ok(parseKimiToolCalls('').length === 0, 'inert on empty');
ok(parseKimiToolCalls(null).length === 0, 'inert on null');

// 4. Strip leaves clean prose (mixed prose + tokens).
const mixed = 'Here is my plan.\n<|tool_calls_section_begin|> <|tool_call_begin|> functions.bash:0 <|tool_call_argument_begin|> {"cmd":"ls"} <|tool_call_end|> <|tool_calls_section_end|>\nDone.';
const stripped = stripKimiToolTokens(mixed);
ok(!stripped.includes('<|tool_call'), 'strip removes all tokens');
ok(stripped.includes('Here is my plan') && stripped.includes('Done.'), 'strip keeps prose');

// 5. Bad JSON is fail-closed (skipped, not crashed) but valid sibling still parses.
const bad = '<|tool_call_begin|> functions.bash:0 <|tool_call_argument_begin|> {not json <|tool_call_end|> <|tool_call_begin|> functions.list_dir:1 <|tool_call_argument_begin|> {"path":"."} <|tool_call_end|>';
const c3 = parseKimiToolCalls(bad);
ok(c3.length === 1 && c3[0].function.name === 'list_dir', `bad-json skipped, good kept (got ${c3.length})`);

// 6. THE ECHO BUG (the exact live failure): kimi mimics our synthesized id `kimi-tc-1-bash` as the
//    name slot and drops the :idx — must still resolve to bash.
const echo = '<|tool_calls_section_begin|> <|tool_call_begin|> kimi-tc-1-bash <|tool_call_argument_begin|> {"cmd": "ls -la _SYSTEM/Scripts"} <|tool_call_end|> <|tool_calls_section_end|>';
const c4 = parseKimiToolCalls(echo);
ok(c4.length === 1 && c4[0].function.name === 'bash', `echo id resolves to bash (got ${c4.length}/${c4[0]?.function?.name})`);

// 7. Bare name, no functions. prefix, no :idx.
const bare = '<|tool_call_begin|> read_file <|tool_call_argument_begin|> {"path":"x"} <|tool_call_end|>';
const c5 = parseKimiToolCalls(bare);
ok(c5.length === 1 && c5[0].function.name === 'read_file', `bare name resolves (got ${c5[0]?.function?.name})`);

// 8. Unknown tool spec is fail-closed (skipped), not crashed.
const unk = '<|tool_call_begin|> totally_made_up_thing <|tool_call_argument_begin|> {"x":1} <|tool_call_end|>';
ok(parseKimiToolCalls(unk).length === 0, 'unknown tool skipped (fail-closed)');

// 9. Synthesized ids MUST embed the resolved tool name (load-bearing: kimi mirrors the id into its
//    next call's name slot, so the name-bearing id is what makes the echo turn self-heal).
ok(c4[0].id === 'kimi-tc-0-bash' && c4[0].id.includes('bash'), `name-bearing id (got ${c4[0].id})`);

// 10. MIMICRY-INDEPENDENT: spec is a bare id with NO tool name (worst case) — must still resolve via
//     argument-key inference. This is the robustness Marcel pushed for: not dependent on kimi's goodwill.
const idOnly = '<|tool_call_begin|> kc7 <|tool_call_argument_begin|> {"cmd":"ls -la"} <|tool_call_end|>';
const c6 = parseKimiToolCalls(idOnly);
ok(c6.length === 1 && c6[0].function.name === 'bash', `arg-key infers bash from id-only spec (got ${c6[0]?.function?.name})`);
const pathOnly = '<|tool_call_begin|> xyz <|tool_call_argument_begin|> {"path":"a.js"} <|tool_call_end|>';
ok(parseKimiToolCalls(pathOnly)[0]?.function?.name === 'read_file', 'arg-key infers read_file from path');
const urlOnly = '<|tool_call_begin|> 99 <|tool_call_argument_begin|> {"url":"https://x"} <|tool_call_end|>';
ok(parseKimiToolCalls(urlOnly)[0]?.function?.name === 'fetch_url', 'arg-key infers fetch_url from url');

console.log(`\nKIMI-ADAPTER TEST: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
