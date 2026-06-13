#!/usr/bin/env node
// security/ast-js.mjs — hand-rolled JS/TS lexical analyzer for the skill-security SAST gate.
//
// CLEAN-ROOM: no tree-sitter, no semgrep, no acorn, no new dependency. Node builtins ONLY.
// This is a re-expression of a standard lexer→token-classifier→call-site detector, written
// from first principles for this gate. It is intentionally NOT a full ECMAScript parser — it
// is a "token-aware grep" that strips strings/comments/regex/template substitutions so the
// dangerous-construct detectors do not fire on text inside literals, then matches the call
// shapes the legacy line-regex could not (e.g. eval inside a quoted string is NOT a finding;
// eval(userInput) as a real call IS).
//
// HARDENING item 5: parse failure DEGRADES to a regex fallback over the raw source and NEVER
// throws. The orchestrator can trust analyze() to always return a result object.
// HARDENING item 1: ZERO REPO_ROOT / fs-root computation. Pure function of (source, fileName).
// It does no filesystem access at all — the orchestrator reads files and passes text in.

// --- token kinds the lexer emits ---
const T = {
  CODE: 'code', // executable token run (identifiers, punctuation, operators)
  STRING: 'string',
  TEMPLATE_TEXT: 'template_text', // literal text inside a template (not ${...})
  COMMENT: 'comment',
  REGEX: 'regex',
};

// Dangerous JS/TS call/sink patterns. Each is matched against the CODE-only stream
// (strings/comments stripped). `id` maps into corpus-threat-taxonomy categories.
// Regexes are deliberately tolerant of whitespace; they run on a normalized code string.
const JS_SINKS = [
  // dynamic / reflective code execution (additive DYNAMIC_CODE_EXEC)
  { id: 'DYNAMIC_CODE_EXEC', re: /\bimport\s*\(/, label: 'dynamic import()' },
  { id: 'DYNAMIC_CODE_EXEC', re: /\bvm\s*\.\s*(?:runInContext|runInNewContext|runInThisContext|compileFunction)\s*\(/, label: 'vm dynamic eval' },
  { id: 'DYNAMIC_CODE_EXEC', re: /\bReflect\s*\.\s*(?:apply|construct)\s*\(/, label: 'Reflect.apply/construct' },
  { id: 'DYNAMIC_CODE_EXEC', re: /\bglobalThis\s*\[/, label: 'reflective global access' },

  // supply-chain / install-time exec (legacy SUPPLY_CHAIN — keep id stable, AST-confirmed)
  { id: 'SUPPLY_CHAIN', re: /\beval\s*\(/, label: 'eval()' },
  { id: 'SUPPLY_CHAIN', re: /\bnew\s+Function\s*\(/, label: 'new Function()' },
  { id: 'SUPPLY_CHAIN', re: /(?<![.\w])Function\s*\(\s*['"`]?/, label: 'Function() constructor' },

  // child-process / shell spawn (additive CHILD_PROCESS_SPAWN)
  { id: 'CHILD_PROCESS_SPAWN', re: /\b(?:child_process|node:child_process)\b/, label: 'child_process import' },
  { id: 'CHILD_PROCESS_SPAWN', re: /\b(?:execSync|exec|execFile|execFileSync|spawn|spawnSync|fork)\s*\(/, label: 'process spawn call' },

  // network egress (legacy NETWORK_EXFILTRATION, AST-confirmed real call)
  { id: 'NETWORK_EXFILTRATION', re: /\bfetch\s*\(/, label: 'fetch()' },
  { id: 'NETWORK_EXFILTRATION', re: /\b(?:https?|node:https?)\b\s*\.\s*(?:request|get)\s*\(/, label: 'http(s) request' },
  { id: 'NETWORK_EXFILTRATION', re: /\bXMLHttpRequest\b/, label: 'XMLHttpRequest' },
  { id: 'NETWORK_EXFILTRATION', re: /\baxios\s*\.\s*(?:get|post|put|delete|request)\s*\(/, label: 'axios call' },

  // credential / secret access (legacy CREDENTIAL_ACCESS, AST-confirmed)
  { id: 'CREDENTIAL_ACCESS', re: /\bprocess\s*\.\s*env\b/, label: 'process.env access' },

  // unscoped filesystem write/delete (additive FILESYSTEM_WRITE)
  { id: 'FILESYSTEM_WRITE', re: /\bfs\s*(?:\.\s*promises)?\s*\.\s*(?:writeFile|writeFileSync|appendFile|appendFileSync|rm|rmSync|unlink|unlinkSync|rmdir|rmdirSync|rename|renameSync|chmod|chmodSync)\s*\(/, label: 'fs write/delete call' },
];

// Regex fallback (degrade path) — coarser, runs on raw source when lexing throws.
const JS_FALLBACK = [
  { id: 'SUPPLY_CHAIN', re: /\beval\s*\(/, label: 'eval() (regex-fallback)' },
  { id: 'SUPPLY_CHAIN', re: /\bnew\s+Function\s*\(/, label: 'new Function() (regex-fallback)' },
  { id: 'DYNAMIC_CODE_EXEC', re: /\bimport\s*\(/, label: 'dynamic import() (regex-fallback)' },
  { id: 'CHILD_PROCESS_SPAWN', re: /\bchild_process\b/, label: 'child_process (regex-fallback)' },
  { id: 'CHILD_PROCESS_SPAWN', re: /\b(?:execSync|spawnSync|exec|spawn)\s*\(/, label: 'spawn (regex-fallback)' },
  { id: 'NETWORK_EXFILTRATION', re: /\bfetch\s*\(/, label: 'fetch() (regex-fallback)' },
  { id: 'CREDENTIAL_ACCESS', re: /\bprocess\.env\b/, label: 'process.env (regex-fallback)' },
  { id: 'FILESYSTEM_WRITE', re: /\bfs\.(?:writeFile|rm|unlink|rename|chmod)/, label: 'fs write (regex-fallback)' },
];

const IDENT_CHAR = /[$\w]/;

// Lexer: walk the source once, classifying each char run. Returns a token array where each
// token carries {kind, value, line}. Throws on a truly unbalanced state only if it cannot
// make progress — analyze() catches that and degrades.
function lex(source) {
  const tokens = [];
  let i = 0;
  let line = 1;
  const n = source.length;
  let codeStart = -1;
  let codeStartLine = 1;
  // track the previous significant code char to decide if `/` begins a regex or is division
  let prevSignificant = '';

  const flushCode = (end) => {
    if (codeStart >= 0 && end > codeStart) {
      tokens.push({ kind: T.CODE, value: source.slice(codeStart, end), line: codeStartLine });
    }
    codeStart = -1;
  };
  const beginCode = (pos) => {
    if (codeStart < 0) {
      codeStart = pos;
      codeStartLine = line;
    }
  };

  while (i < n) {
    const c = source[i];
    const c2 = source[i + 1];

    if (c === '\n') {
      beginCode(i);
      line += 1;
      i += 1;
      continue;
    }

    // line comment
    if (c === '/' && c2 === '/') {
      flushCode(i);
      const start = i;
      const startLine = line;
      i += 2;
      while (i < n && source[i] !== '\n') i += 1;
      tokens.push({ kind: T.COMMENT, value: source.slice(start, i), line: startLine });
      continue;
    }
    // block comment
    if (c === '/' && c2 === '*') {
      flushCode(i);
      const start = i;
      const startLine = line;
      i += 2;
      while (i < n && !(source[i] === '*' && source[i + 1] === '/')) {
        if (source[i] === '\n') line += 1;
        i += 1;
      }
      i += 2; // consume */
      tokens.push({ kind: T.COMMENT, value: source.slice(start, Math.min(i, n)), line: startLine });
      continue;
    }
    // string literal (single/double)
    if (c === '"' || c === "'") {
      flushCode(i);
      const quote = c;
      const startLine = line;
      i += 1;
      let buf = '';
      while (i < n) {
        const ch = source[i];
        if (ch === '\\') { buf += ch + (source[i + 1] ?? ''); i += 2; continue; }
        if (ch === '\n') line += 1; // tolerate (invalid JS, but don't crash)
        if (ch === quote) { i += 1; break; }
        buf += ch;
        i += 1;
      }
      tokens.push({ kind: T.STRING, value: buf, line: startLine });
      prevSignificant = quote;
      continue;
    }
    // template literal — emit TEMPLATE_TEXT for literal segments, recurse code for ${...}
    if (c === '`') {
      flushCode(i);
      const startLine = line;
      i += 1;
      let buf = '';
      while (i < n) {
        const ch = source[i];
        if (ch === '\\') { buf += ch + (source[i + 1] ?? ''); i += 2; continue; }
        if (ch === '\n') line += 1;
        if (ch === '`') { i += 1; break; }
        if (ch === '$' && source[i + 1] === '{') {
          // close current template-text, then treat the ${...} body as code
          tokens.push({ kind: T.TEMPLATE_TEXT, value: buf, line: startLine });
          buf = '';
          i += 2;
          let depth = 1;
          const exprStart = i;
          const exprLine = line;
          while (i < n && depth > 0) {
            const e = source[i];
            if (e === '{') depth += 1;
            else if (e === '}') depth -= 1;
            else if (e === '\n') line += 1;
            if (depth === 0) break;
            i += 1;
          }
          tokens.push({ kind: T.CODE, value: source.slice(exprStart, i), line: exprLine });
          i += 1; // consume closing }
          continue;
        }
        buf += ch;
        i += 1;
      }
      tokens.push({ kind: T.TEMPLATE_TEXT, value: buf, line: startLine });
      prevSignificant = '`';
      continue;
    }
    // regex literal vs division: a `/` is a regex if the previous significant char allows it
    if (c === '/') {
      const regexAllowed = prevSignificant === '' || /[=(,:;{}!&|?+\-*%~^<>[]/.test(prevSignificant)
        || prevSignificant === 'return' || prevSignificant === 'typeof';
      if (regexAllowed) {
        flushCode(i);
        const startLine = line;
        i += 1;
        let inClass = false;
        let ok = true;
        while (i < n) {
          const ch = source[i];
          if (ch === '\\') { i += 2; continue; }
          if (ch === '\n') { ok = false; break; } // unterminated regex on one line -> bail
          if (ch === '[') inClass = true;
          else if (ch === ']') inClass = false;
          else if (ch === '/' && !inClass) { i += 1; break; }
          i += 1;
        }
        if (!ok) {
          // not actually a regex — treat the slash as code, rewind
          beginCode(i - 1);
          prevSignificant = '/';
          continue;
        }
        // consume flags
        while (i < n && /[a-z]/i.test(source[i])) i += 1;
        tokens.push({ kind: T.REGEX, value: '', line: startLine });
        prevSignificant = '/';
        continue;
      }
    }

    // default: code char
    beginCode(i);
    if (!/\s/.test(c)) {
      // remember the last non-space code char for regex disambiguation;
      // capture a couple of keyword tails cheaply
      if (IDENT_CHAR.test(c)) {
        // accumulate identifier to detect return/typeof keyword endings
        let j = i;
        while (j < n && IDENT_CHAR.test(source[j])) j += 1;
        const word = source.slice(i, j);
        prevSignificant = (word === 'return' || word === 'typeof') ? word : c;
      } else {
        prevSignificant = c;
      }
    }
    i += 1;
  }
  flushCode(n);
  return tokens;
}

// Build the code-only stream (strings/comments/template-text/regex removed) plus a
// line-indexed code map so a hit can be attributed to a line number.
function codeStreamFromTokens(tokens) {
  // We keep per-line code so we can report the line of a match. Group code tokens by line,
  // but since a code token can span lines, split on newline.
  const lineToCode = new Map();
  for (const tok of tokens) {
    if (tok.kind !== T.CODE) continue;
    const parts = tok.value.split('\n');
    for (let k = 0; k < parts.length; k += 1) {
      const ln = tok.line + k;
      const prev = lineToCode.get(ln) || '';
      lineToCode.set(ln, `${prev} ${parts[k]}`);
    }
  }
  return lineToCode;
}

function dedupeKey(f) {
  return `${f.id}|${f.line}|${f.label}`;
}

/**
 * analyze(source, fileName) -> { findings: [{id,label,line,evidence,engine}], degraded: boolean, error: string|null }
 * NEVER throws. On lexer failure, degrades to a raw-source regex scan (engine='regex-fallback').
 */
export function analyze(source, fileName = '<js>') {
  const src = typeof source === 'string' ? source : String(source ?? '');
  const findings = [];
  const seen = new Set();
  const push = (id, label, line, evidence, engine) => {
    const f = { id, label, line, evidence, engine };
    const key = dedupeKey(f);
    if (seen.has(key)) return;
    seen.add(key);
    findings.push(f);
  };

  let tokens;
  try {
    tokens = lex(src);
  } catch (err) {
    return regexFallback(src, fileName, err);
  }

  let lineToCode;
  try {
    lineToCode = codeStreamFromTokens(tokens);
  } catch (err) {
    return regexFallback(src, fileName, err);
  }

  for (const [line, codeText] of lineToCode) {
    const normalized = codeText.replace(/\s+/g, ' ');
    for (const sink of JS_SINKS) {
      if (sink.re.test(normalized)) {
        push(sink.id, sink.label, line, compact(normalized), 'ast');
      }
    }
  }

  return { findings, degraded: false, error: null };
}

function regexFallback(src, fileName, err) {
  const findings = [];
  const seen = new Set();
  const lines = src.split(/\r?\n/);
  for (let idx = 0; idx < lines.length; idx += 1) {
    const line = lines[idx];
    for (const sink of JS_FALLBACK) {
      if (sink.re.test(line)) {
        const f = { id: sink.id, label: sink.label, line: idx + 1, evidence: compact(line), engine: 'regex-fallback' };
        const key = dedupeKey(f);
        if (seen.has(key)) continue;
        seen.add(key);
        findings.push(f);
      }
    }
  }
  return { findings, degraded: true, error: err ? String(err.message || err) : 'lexer-degraded' };
}

function compact(line) {
  const cleaned = String(line ?? '').replace(/\s+/g, ' ').trim();
  return cleaned.length <= 180 ? cleaned : `${cleaned.slice(0, 177)}...`;
}

// CLI self-check: node ast-js.mjs <file>
if (import.meta.url === `file://${process.argv[1]}`) {
  const fs = await import('node:fs');
  const target = process.argv[2];
  if (!target) {
    process.stderr.write('usage: node ast-js.mjs <file.js>\n');
    process.exit(1);
  }
  const out = analyze(fs.readFileSync(target, 'utf8'), target);
  process.stdout.write(`${JSON.stringify(out, null, 2)}\n`);
}
