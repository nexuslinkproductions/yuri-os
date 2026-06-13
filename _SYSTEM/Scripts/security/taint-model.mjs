#!/usr/bin/env node
// security/taint-model.mjs — source → sink flow modeling for the skill-security SAST gate.
//
// CLEAN-ROOM, node builtins ONLY. This is a deliberately LIGHTWEIGHT data-flow model, not a
// full def-use / inter-procedural taint engine. It is honest about that: it flags a TAINT_FLOW
// only when a SOURCE category and a SINK category BOTH appear within the same analyzed file
// (intra-file co-occurrence), which is the composition signal a foreign skill would use to
// exfiltrate. It does not prove a real variable-level path (that would need a full AST + CFG,
// out of scope for a no-dependency gate). The finding is therefore reported at HEURISTIC
// confidence and its evidence names BOTH endpoints so a reviewer can confirm the real path.
//
// Modelled flows (the three required + one): credential→network, file→network, input→exec,
// and (additive) credential/file→child-process-spawn (exfil-via-shell).
//
// HARDENING item 1: ZERO REPO_ROOT / fs-root computation. Pure function of analyzer findings +
// the per-file source text passed in by the orchestrator. No filesystem access.

// Source categories: where tainted data originates.
const SOURCE_KINDS = Object.freeze({
  credential: ['CREDENTIAL_ACCESS'],
  file: ['FILESYSTEM_READ'], // synthetic — see classifyExtraSources below
  input: ['EXTERNAL_INPUT'], // synthetic
});

// Sink categories: where tainted data becoming dangerous.
const SINK_KINDS = Object.freeze({
  network: ['NETWORK_EXFILTRATION'],
  exec: ['DYNAMIC_CODE_EXEC', 'SUPPLY_CHAIN'],
  shell: ['CHILD_PROCESS_SPAWN'],
});

// The flows we report, in priority order. Each → a TAINT_FLOW finding.
const FLOWS = Object.freeze([
  { source: 'credential', sink: 'network', why: 'credential read reaches an outbound network call (classic key exfiltration)' },
  { source: 'file', sink: 'network', why: 'local file read reaches an outbound network call (data exfiltration)' },
  { source: 'input', sink: 'exec', why: 'external input reaches a dynamic-code / eval sink (remote code execution)' },
  { source: 'credential', sink: 'shell', why: 'credential read reaches a child-process / shell sink (exfil via shell)' },
  { source: 'file', sink: 'shell', why: 'local file read reaches a child-process / shell sink (exfil via shell)' },
]);

// Lightweight per-line regexes to detect the SYNTHETIC sources the AST analyzers don't emit
// as their own category (file-reads and external-input reads). Run on raw source text.
const FILE_READ_RE = /\bfs\s*(?:\.\s*promises)?\s*\.\s*(?:readFile|readFileSync|createReadStream|read)\s*\(|\bopen\s*\([^)]*['"]r['"]|\bcat\b/;
const EXTERNAL_INPUT_RE = /\bprocess\s*\.\s*argv\b|\bprocess\s*\.\s*stdin\b|\breq(?:uest)?\s*\.\s*(?:body|query|params)\b|\bprompt\s*\(|\binput\s*\(|\$\{?[0-9@*]/;

function detectSyntheticSources(source) {
  const found = new Set();
  const lines = String(source ?? '').split(/\r?\n/);
  for (let idx = 0; idx < lines.length; idx += 1) {
    const line = lines[idx];
    if (FILE_READ_RE.test(line)) found.add(`file:${idx + 1}`);
    if (EXTERNAL_INPUT_RE.test(line)) found.add(`input:${idx + 1}`);
  }
  return found;
}

// Group analyzer findings by which source/sink kind they satisfy.
function indexFindings(findings) {
  const byKind = { source: { credential: [], file: [], input: [] }, sink: { network: [], exec: [], shell: [] } };
  for (const f of findings) {
    for (const [kind, ids] of Object.entries(SOURCE_KINDS)) {
      if (ids.includes(f.id)) byKind.source[kind].push(f);
    }
    for (const [kind, ids] of Object.entries(SINK_KINDS)) {
      if (ids.includes(f.id)) byKind.sink[kind].push(f);
    }
  }
  return byKind;
}

/**
 * analyze({ findings, source, fileName }) -> { findings: [TAINT_FLOW...], confidence }
 * `findings` = the JS/Bash analyzer output (array of {id,label,line,...}).
 * `source` = raw file text (for synthetic source detection). NEVER throws.
 */
export function analyze({ findings = [], source = '', fileName = '<file>' } = {}) {
  const out = [];
  let byKind;
  let synthetic;
  try {
    byKind = indexFindings(findings);
    synthetic = detectSyntheticSources(source);
  } catch {
    return { findings: [], confidence: 'heuristic', degraded: true };
  }

  // fold synthetic file/input sources into the source index (as line refs)
  for (const tag of synthetic) {
    const [kind, line] = tag.split(':');
    if (byKind.source[kind]) {
      byKind.source[kind].push({ id: kind === 'file' ? 'FILESYSTEM_READ' : 'EXTERNAL_INPUT', label: `${kind} source`, line: Number(line) });
    }
  }

  const seen = new Set();
  for (const flow of FLOWS) {
    const sources = byKind.source[flow.source] || [];
    const sinks = byKind.sink[flow.sink] || [];
    if (!sources.length || !sinks.length) continue;

    // report the nearest source/sink pair (lowest line distance) as the representative evidence
    let best = null;
    for (const s of sources) {
      for (const k of sinks) {
        const dist = Math.abs((s.line || 0) - (k.line || 0));
        if (!best || dist < best.dist) best = { s, k, dist };
      }
    }
    if (!best) continue;
    const key = `${flow.source}->${flow.sink}`;
    if (seen.has(key)) continue;
    seen.add(key);

    out.push({
      id: 'TAINT_FLOW',
      label: `taint ${flow.source}→${flow.sink}`,
      line: best.s.line || best.k.line || 1,
      evidence: `${flow.why}: source @L${best.s.line ?? '?'} (${best.s.label}) → sink @L${best.k.line ?? '?'} (${best.k.label})`,
      engine: 'taint',
      confidence: 'heuristic',
      flow: key,
    });
  }

  return { findings: out, confidence: 'heuristic', degraded: false };
}

// CLI self-check expects a JSON {findings, source} on argv[2] as a file path; minimal.
if (import.meta.url === `file://${process.argv[1]}`) {
  process.stdout.write('taint-model: library module — import { analyze }. No standalone CLI scan.\n');
}
