#!/usr/bin/env node
/**
 * Workcell orchestration core.
 *
 * Provides DAG validation (hard gate), packet assembly, scope checking,
 * and output collection for the Sonnet workcell protocol.
 */

import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { topologicalSort } from './math/math-kernel.mjs';
import { isProtectedPath } from './lane-kernel.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const REPO_ROOT = path.resolve(__dirname, '../..');
export const WORKCELL_STATE_DIR = path.join('_SYSTEM', 'state', 'workcell');

export const WORKCELL_ROLES = Object.freeze([
  'builder',
  'scout',
  'guardrail',
  'registry',
]);

export const WORKCELL_PACKET_SCHEMA = 'yuri.workcell.packet.v0';
export const WORKCELL_DECOMPOSITION_SCHEMA = 'yuri.workcell.decomposition.v0';

export const YURI_PATCH_FORMAT = 'yuri-patch-v0';
export const YURI_PATCH_OPS = Object.freeze([
  'replace_lines',
  'insert_before',
  'insert_after',
  'create_file',
  'delete_file',
]);

// ---------------------------------------------------------------------------
// Path safety
// ---------------------------------------------------------------------------

function assertSafeRelPath(filePath) {
  if (!filePath || typeof filePath !== 'string') return `path must be a non-empty string, got ${typeof filePath}`;
  const normalized = filePath.replaceAll('\\', '/');
  if (path.isAbsolute(normalized) || path.isAbsolute(filePath)) return `absolute path not allowed: ${filePath}`;
  if (normalized.startsWith('../') || normalized.includes('/../') || normalized === '..') {
    return `path escapes repo root: ${filePath}`;
  }
  if (isProtectedPath(normalized)) return `protected path: ${filePath}`;
  return '';
}

// ---------------------------------------------------------------------------
// Patch validation — yuri-patch-v0 (pure, no FS access)
// ---------------------------------------------------------------------------

export function validatePatch(patch, scopeFiles = []) {
  if (!patch || typeof patch !== 'object') {
    return { ok: false, errors: ['patch must be a non-null object'] };
  }

  const errors = [];
  const safeScopeFiles = Array.isArray(scopeFiles) ? scopeFiles : [];

  if (patch.format !== YURI_PATCH_FORMAT) {
    errors.push(`patch.format must be '${YURI_PATCH_FORMAT}', got ${JSON.stringify(patch.format)}`);
  }

  const scopeDeclared = patch.scope_declared;
  if (!Array.isArray(scopeDeclared) || scopeDeclared.length === 0) {
    errors.push('patch.scope_declared must be a non-empty array');
  } else {
    for (const p of scopeDeclared) {
      const e = assertSafeRelPath(p);
      if (e) errors.push(`scope_declared: ${e}`);
    }
    if (safeScopeFiles.length > 0) {
      const packetSet = new Set(safeScopeFiles);
      for (const p of scopeDeclared) {
        if (!packetSet.has(p)) errors.push(`scope_declared path not in packet scope: ${p}`);
      }
    }
  }

  const rawPatches = patch.patches;
  if (!Array.isArray(rawPatches) || rawPatches.length === 0) {
    errors.push('patch.patches must be a non-empty array');
    return { ok: false, errors };
  }

  const declaredSet = new Set(Array.isArray(scopeDeclared) ? scopeDeclared : []);
  const packetSet = new Set(safeScopeFiles);
  const filesAffectedSet = new Set();

  for (let i = 0; i < rawPatches.length; i++) {
    const entry = rawPatches[i];
    const px = `patches[${i}]`;

    if (!entry || typeof entry !== 'object') {
      errors.push(`${px} must be a non-null object`);
      continue;
    }

    if (!YURI_PATCH_OPS.includes(entry.op)) {
      errors.push(`${px}.op must be one of ${YURI_PATCH_OPS.join('|')}, got ${JSON.stringify(entry.op)}`);
    }

    const fileErr = assertSafeRelPath(entry.file);
    if (fileErr) {
      errors.push(`${px}.file: ${fileErr}`);
    } else {
      if (declaredSet.size > 0 && !declaredSet.has(entry.file)) {
        errors.push(`${px}.file not in scope_declared: ${entry.file}`);
      }
      if (packetSet.size > 0 && !packetSet.has(entry.file)) {
        errors.push(`${px}.file not in packet filesInScope: ${entry.file}`);
      }
      filesAffectedSet.add(entry.file);
    }

    const op = entry.op;

    if (op === 'replace_lines') {
      if (!Array.isArray(entry.old_lines) || entry.old_lines.length === 0) {
        errors.push(`${px}.old_lines must be a non-empty array for op 'replace_lines'`);
      } else {
        for (let j = 0; j < entry.old_lines.length; j++) {
          if (typeof entry.old_lines[j] !== 'string') {
            errors.push(`${px}.old_lines[${j}] must be a string, got ${typeof entry.old_lines[j]}`);
          }
        }
      }
      if (!Array.isArray(entry.new_lines)) {
        errors.push(`${px}.new_lines must be an array for op 'replace_lines'`);
      } else {
        for (let j = 0; j < entry.new_lines.length; j++) {
          if (typeof entry.new_lines[j] !== 'string') {
            errors.push(`${px}.new_lines[${j}] must be a string, got ${typeof entry.new_lines[j]}`);
          }
        }
      }
    }

    if (op === 'insert_before') {
      if (!Array.isArray(entry.context_before) || entry.context_before.length === 0) {
        errors.push(`${px}.context_before must be a non-empty array for op 'insert_before'`);
      } else {
        for (let j = 0; j < entry.context_before.length; j++) {
          if (typeof entry.context_before[j] !== 'string') {
            errors.push(`${px}.context_before[${j}] must be a string`);
          }
        }
      }
      if (!Array.isArray(entry.new_lines) || entry.new_lines.length === 0) {
        errors.push(`${px}.new_lines must be a non-empty array for op 'insert_before'`);
      } else {
        for (let j = 0; j < entry.new_lines.length; j++) {
          if (typeof entry.new_lines[j] !== 'string') {
            errors.push(`${px}.new_lines[${j}] must be a string`);
          }
        }
      }
    }

    if (op === 'insert_after') {
      if (!Array.isArray(entry.context_after) || entry.context_after.length === 0) {
        errors.push(`${px}.context_after must be a non-empty array for op 'insert_after'`);
      } else {
        for (let j = 0; j < entry.context_after.length; j++) {
          if (typeof entry.context_after[j] !== 'string') {
            errors.push(`${px}.context_after[${j}] must be a string`);
          }
        }
      }
      if (!Array.isArray(entry.new_lines) || entry.new_lines.length === 0) {
        errors.push(`${px}.new_lines must be a non-empty array for op 'insert_after'`);
      } else {
        for (let j = 0; j < entry.new_lines.length; j++) {
          if (typeof entry.new_lines[j] !== 'string') {
            errors.push(`${px}.new_lines[${j}] must be a string`);
          }
        }
      }
    }

    if (op === 'create_file') {
      if (!Array.isArray(entry.new_lines) || entry.new_lines.length === 0) {
        errors.push(`${px}.new_lines must be a non-empty array for op 'create_file'`);
      } else {
        for (let j = 0; j < entry.new_lines.length; j++) {
          if (typeof entry.new_lines[j] !== 'string') {
            errors.push(`${px}.new_lines[${j}] must be a string`);
          }
        }
      }
      if (entry.old_lines != null && (!Array.isArray(entry.old_lines) || entry.old_lines.length > 0)) {
        errors.push(`${px}.old_lines must not be present for op 'create_file'`);
      }
    }

    if (op === 'delete_file') {
      if (entry.new_lines != null && (!Array.isArray(entry.new_lines) || entry.new_lines.length > 0)) {
        errors.push(`${px}.new_lines must not be present for op 'delete_file'`);
      }
      if (entry.old_lines != null && (!Array.isArray(entry.old_lines) || entry.old_lines.length > 0)) {
        errors.push(`${px}.old_lines must not be present for op 'delete_file'`);
      }
    }
  }

  const filesAffected = [...filesAffectedSet];
  const result = { ok: errors.length === 0, errors };
  if (errors.length === 0 && filesAffected.length > 0) result.filesAffected = filesAffected;
  return result;
}

// ---------------------------------------------------------------------------
// Dry-run patch application — yuri-patch-v0 (no file mutation)
// ---------------------------------------------------------------------------

function splitLines(content) {
  return content.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n');
}

function safeReadFsReader(fsReader, relPath) {
  try {
    const val = fsReader(relPath);
    if (val !== null && typeof val !== 'string') {
      return { ok: false, error: `reader-contract-violation: expected string or null, got ${typeof val}` };
    }
    return { ok: true, content: val };
  } catch (err) {
    return { ok: false, error: `reader-error: ${err && err.message ? err.message : String(err)}` };
  }
}

function findSequence(lines, seq) {
  const matches = [];
  if (seq.length === 0) return matches;
  const limit = lines.length - seq.length;
  for (let i = 0; i <= limit; i++) {
    let hit = true;
    for (let j = 0; j < seq.length; j++) {
      if (lines[i + j] !== seq[j]) { hit = false; break; }
    }
    if (hit) matches.push(i);
  }
  return matches;
}

function makeEntry(index, op, file, status, extra = {}) {
  return { index, op, file, status, ...extra };
}

function resolveReplace(i, entry, lines) {
  const { op, file, old_lines: ol } = entry;
  const cb = Array.isArray(entry.context_before) ? entry.context_before : [];
  const ca = Array.isArray(entry.context_after) ? entry.context_after : [];

  let seq, offset;
  if (cb.length > 0 && ca.length > 0) { seq = [...cb, ...ol, ...ca]; offset = cb.length; }
  else if (cb.length > 0) { seq = [...cb, ...ol]; offset = cb.length; }
  else if (ca.length > 0) { seq = [...ol, ...ca]; offset = 0; }
  else { seq = [...ol]; offset = 0; }

  const matches = findSequence(lines, seq);
  if (matches.length === 0) return makeEntry(i, op, file, 'error', { error: 'anchor-not-found' });
  if (matches.length > 1) {
    const positions = matches.map((m) => m + offset).join(', ');
    return makeEntry(i, op, file, 'error', { error: `anchor-ambiguity at lines ${positions}` });
  }
  const anchorLine = matches[0] + offset;
  const extra = { anchorLine, matchedOldLines: ol.length };
  if (entry.line_hint != null) {
    const drift = Math.abs((entry.line_hint - 1) - anchorLine);
    if (drift > 0) extra.lineHintDrift = drift;
  }
  return makeEntry(i, op, file, 'would-apply', extra);
}

function resolveInsertBefore(i, entry, lines) {
  const { op, file } = entry;
  const cb = Array.isArray(entry.context_before) ? entry.context_before : [];
  const matches = findSequence(lines, cb);
  if (matches.length === 0) return makeEntry(i, op, file, 'error', { error: 'anchor-not-found' });
  if (matches.length > 1) {
    return makeEntry(i, op, file, 'error', { error: `anchor-ambiguity at lines ${matches.join(', ')}` });
  }
  const anchorLine = matches[0];
  const extra = { anchorLine };
  if (entry.line_hint != null) {
    const drift = Math.abs((entry.line_hint - 1) - anchorLine);
    if (drift > 0) extra.lineHintDrift = drift;
  }
  return makeEntry(i, op, file, 'would-apply', extra);
}

function resolveInsertAfter(i, entry, lines) {
  const { op, file } = entry;
  const ca = Array.isArray(entry.context_after) ? entry.context_after : [];
  const matches = findSequence(lines, ca);
  if (matches.length === 0) return makeEntry(i, op, file, 'error', { error: 'anchor-not-found' });
  if (matches.length > 1) {
    const positions = matches.map((m) => m + ca.length - 1).join(', ');
    return makeEntry(i, op, file, 'error', { error: `anchor-ambiguity at lines ${positions}` });
  }
  const anchorLine = matches[0] + ca.length - 1;
  const extra = { anchorLine };
  if (entry.line_hint != null) {
    const drift = Math.abs((entry.line_hint - 1) - anchorLine);
    if (drift > 0) extra.lineHintDrift = drift;
  }
  return makeEntry(i, op, file, 'would-apply', extra);
}

function detectOverlaps(results, warnings) {
  const byFile = new Map();
  for (const r of results) {
    if (r.status !== 'would-apply' || typeof r.file !== 'string') continue;
    if (!byFile.has(r.file)) byFile.set(r.file, []);
    byFile.get(r.file).push(r);
  }
  for (const [file, entries] of byFile) {
    const creates = entries.filter((e) => e.op === 'create_file');
    const editOps = entries.filter((e) => ['replace_lines', 'insert_before', 'insert_after'].includes(e.op));
    if (creates.length > 0 && editOps.length > 0) {
      warnings.push(
        `create_file and edit op target same file: ${file} (patches[${creates[0].index}] and patches[${editOps[0].index}])`,
      );
    }
    const ranged = editOps
      .filter((e) => e.anchorLine != null)
      .map((e) => ({
        index: e.index,
        start: e.anchorLine,
        end: e.op === 'replace_lines' ? e.anchorLine + (e.matchedOldLines || 1) - 1 : e.anchorLine,
      }));
    for (let a = 0; a < ranged.length; a++) {
      for (let b = a + 1; b < ranged.length; b++) {
        const ra = ranged[a]; const rb = ranged[b];
        if (ra.start <= rb.end && rb.start <= ra.end) {
          warnings.push(
            `overlapping regions in ${file}: patches[${ra.index}] (lines ${ra.start}-${ra.end}) and patches[${rb.index}] (lines ${rb.start}-${rb.end})`,
          );
        }
      }
    }
  }
}

function emptyDryResult() {
  return { errors: [], warnings: [], results: [], filesWouldChange: [], filesWouldCreate: [], filesWouldDelete: [] };
}

export function applyPatchDryRun(patch, fsReader, options = {}) {
  if (typeof fsReader !== 'function') {
    return { ok: false, ...emptyDryResult(), errors: ['fsReader must be a function'] };
  }

  if (!options.skipValidation) {
    const vr = validatePatch(patch);
    if (!vr.ok) return { ok: false, ...emptyDryResult(), errors: vr.errors };
  }

  if (!patch || !Array.isArray(patch.patches) || patch.patches.length === 0) {
    return { ok: false, ...emptyDryResult(), errors: ['patch.patches must be a non-empty array'] };
  }

  const errors = [];
  const warnings = [];
  const results = [];
  const wChange = new Set();
  const wCreate = new Set();
  const wDelete = new Set();

  // Read each unique valid file exactly once — pre-patch state
  const fileCache = new Map();
  for (const entry of patch.patches) {
    if (!entry || typeof entry !== 'object' || typeof entry.file !== 'string') continue;
    if (fileCache.has(entry.file)) continue;
    const pathErr = assertSafeRelPath(entry.file);
    if (pathErr) {
      fileCache.set(entry.file, { readerError: `path-safety: ${pathErr}` });
      continue;
    }
    const read = safeReadFsReader(fsReader, entry.file);
    fileCache.set(entry.file, read.ok ? (read.content === null ? null : splitLines(read.content)) : { readerError: read.error });
  }

  for (let i = 0; i < patch.patches.length; i++) {
    const entry = patch.patches[i];
    const px = `patches[${i}]`;

    if (!entry || typeof entry !== 'object') {
      const e = 'entry must be a non-null object';
      errors.push(`${px}: ${e}`);
      results.push(makeEntry(i, '?', '?', 'error', { error: e }));
      continue;
    }

    const { op, file } = entry;

    if (typeof file !== 'string') {
      const e = 'file must be a string';
      errors.push(`${px}: ${e}`);
      results.push(makeEntry(i, String(op ?? '?'), '?', 'error', { error: e }));
      continue;
    }

    const cached = fileCache.get(file);
    if (cached && typeof cached === 'object' && 'readerError' in cached) {
      errors.push(`${px}: ${cached.readerError}`);
      results.push(makeEntry(i, op, file, 'error', { error: cached.readerError }));
      continue;
    }

    let result;
    if (op === 'create_file') {
      result = cached !== null
        ? makeEntry(i, op, file, 'error', { error: 'file-already-exists' })
        : makeEntry(i, op, file, 'would-apply');
    } else if (op === 'delete_file') {
      result = (cached === null || cached === undefined)
        ? makeEntry(i, op, file, 'error', { error: 'file-not-found' })
        : makeEntry(i, op, file, 'would-apply');
    } else if (op === 'replace_lines') {
      result = !Array.isArray(cached)
        ? makeEntry(i, op, file, 'error', { error: 'file-not-found' })
        : resolveReplace(i, entry, cached);
    } else if (op === 'insert_before') {
      result = !Array.isArray(cached)
        ? makeEntry(i, op, file, 'error', { error: 'file-not-found' })
        : resolveInsertBefore(i, entry, cached);
    } else if (op === 'insert_after') {
      result = !Array.isArray(cached)
        ? makeEntry(i, op, file, 'error', { error: 'file-not-found' })
        : resolveInsertAfter(i, entry, cached);
    } else {
      result = makeEntry(i, String(op ?? '?'), file, 'error', { error: `unknown op: ${JSON.stringify(op)}` });
    }

    results.push(result);
    if (result.status === 'error') {
      errors.push(`${px}: ${result.error}`);
    } else {
      if (op === 'create_file') wCreate.add(file);
      else if (op === 'delete_file') wDelete.add(file);
      else wChange.add(file);
    }
  }

  detectOverlaps(results, warnings);

  return {
    ok: errors.length === 0,
    errors,
    warnings,
    results,
    filesWouldChange: [...wChange],
    filesWouldCreate: [...wCreate],
    filesWouldDelete: [...wDelete],
  };
}

export function makeFilesystemReader(repoRoot) {
  return function fsReader(relPath) {
    if (!relPath || typeof relPath !== 'string') return null;
    const normalized = relPath.replaceAll('\\', '/');
    if (path.isAbsolute(normalized) || path.isAbsolute(relPath)) return null;
    if (normalized.startsWith('../') || normalized.includes('/../') || normalized === '..') return null;
    if (isProtectedPath(normalized)) return null;
    const full = path.join(repoRoot, relPath);
    const root = repoRoot.endsWith(path.sep) ? repoRoot : repoRoot + path.sep;
    if (!full.startsWith(root) && full !== repoRoot) return null;
    try {
      return readFileSync(full, 'utf8').replace(/\r\n/g, '\n').replace(/\r/g, '\n');
    } catch {
      return null;
    }
  };
}

// ---------------------------------------------------------------------------
// DAG validation — hard gate
// ---------------------------------------------------------------------------

export function validateDecompositionDag(decomposition) {
  if (!decomposition || typeof decomposition !== 'object') {
    return dagFailure('decomposition must be an object');
  }
  const nodes = decomposition.nodes;
  const edges = decomposition.edges;
  if (!Array.isArray(nodes) || nodes.length === 0) {
    return dagFailure('decomposition must have at least one node');
  }

  const errors = [];
  const nodeIds = new Set();
  for (const node of nodes) {
    if (!node || typeof node !== 'object') {
      errors.push('each node must be an object with id, role, and filesInScope');
      continue;
    }
    if (!node.id || typeof node.id !== 'string') {
      errors.push('node missing id');
      continue;
    }
    if (nodeIds.has(node.id)) {
      errors.push(`duplicate node id: ${node.id}`);
    }
    nodeIds.add(node.id);
    if (!WORKCELL_ROLES.includes(node.role)) {
      errors.push(`node ${node.id} has unknown role: ${node.role || '<missing>'}`);
    }
    if (!Array.isArray(node.filesInScope) || node.filesInScope.length === 0) {
      errors.push(`node ${node.id} must declare filesInScope`);
    }
    for (const filePath of node.filesInScope || []) {
      const pathError = assertSafeRelPath(filePath);
      if (pathError) errors.push(`node ${node.id}: ${pathError}`);
    }
  }

  if (!Array.isArray(edges)) {
    errors.push('decomposition.edges must be an array');
  }
  for (const edge of edges || []) {
    if (!edge || typeof edge !== 'object') {
      errors.push('each edge must be an object with from and to');
      continue;
    }
    if (!nodeIds.has(edge.from)) errors.push(`edge references unknown source node: ${edge.from}`);
    if (!nodeIds.has(edge.to)) errors.push(`edge references unknown target node: ${edge.to}`);
  }

  if (errors.length > 0) {
    return { ok: false, gate: 'dag-structure', errors, order: null, proof: null };
  }

  try {
    const dagInput = {
      nodes: [...nodeIds],
      edges: (edges || []).map((e) => ({ from: e.from, to: e.to })),
    };
    const result = topologicalSort(dagInput);
    return {
      ok: true,
      gate: 'dag-validation',
      errors: [],
      order: result.order,
      proof: result.proof,
      dagRoots: findDagRoots(dagInput),
    };
  } catch (err) {
    return {
      ok: false,
      gate: 'dag-cycle-detection',
      errors: [`topological sort failed: ${err.message}`],
      order: null,
      proof: null,
    };
  }
}

function findDagRoots(dag) {
  const hasIncoming = new Set();
  for (const edge of dag.edges || []) {
    hasIncoming.add(edge.to);
  }
  return dag.nodes.filter((id) => !hasIncoming.has(id));
}

function dagFailure(message) {
  return { ok: false, gate: 'dag-structure', errors: [message], order: null, proof: null };
}

// ---------------------------------------------------------------------------
// Packet assembly
// ---------------------------------------------------------------------------

export function buildWorkerPacket(node, options = {}) {
  if (!node || !node.id) throw new Error('worker packet requires a node with id');
  if (!node.role || !WORKCELL_ROLES.includes(node.role)) {
    throw new Error(`unknown worker role: ${node.role || '<missing>'}`);
  }

  const errors = [];
  for (const filePath of node.filesInScope || []) {
    const pathError = assertSafeRelPath(filePath);
    if (pathError) errors.push(pathError);
  }
  if (errors.length > 0) {
    throw new Error(`packet scope violation: ${errors.join('; ')}`);
  }

  return {
    schema: WORKCELL_PACKET_SCHEMA,
    packetId: node.id,
    role: node.role,
    goal: node.goal || options.goal || '',
    filesInScope: node.filesInScope || [],
    memoryCapsule: options.memoryCapsule || null,
    dagValidation: options.dagValidation || null,
    constraints: {
      noCommit: true,
      noProtectedAccess: true,
      noSdkCalls: true,
    },
    expectedOutputSchema: `yuri.workcell.output.${node.role}.v0`,
  };
}

// ---------------------------------------------------------------------------
// Output scope check
// ---------------------------------------------------------------------------

export function validateWorkerOutput(output, packet) {
  const errors = [];

  if (!output || typeof output !== 'object') {
    return { ok: false, errors: ['output must be an object'] };
  }
  if (!packet || typeof packet !== 'object') {
    return { ok: false, errors: ['packet must be an object'] };
  }

  const scopeSet = new Set(packet.filesInScope || []);
  const rawOutputs = output.outputs;
  const rawRefs = output.evidenceRefs;

  if (rawOutputs != null && !Array.isArray(rawOutputs)) {
    errors.push('outputs must be an array');
  }
  if (rawRefs != null && !Array.isArray(rawRefs)) {
    errors.push('evidenceRefs must be an array');
  }

  for (const entry of Array.isArray(rawOutputs) ? rawOutputs : []) {
    if (!entry || typeof entry !== 'object') {
      errors.push('output entry must be a non-null object');
      continue;
    }
    const fmt = entry.format;
    if (fmt === YURI_PATCH_FORMAT) {
      const pr = validatePatch(entry, packet.filesInScope || []);
      for (const e of pr.errors) errors.push(`patch entry: ${e}`);
    } else if (fmt === 'unified-diff' || fmt == null) {
      const entryPath = typeof entry.path === 'string' ? entry.path : '';
      const pathError = assertSafeRelPath(entryPath);
      if (pathError) {
        errors.push(`output path unsafe: ${pathError}`);
      }
      if (scopeSet.size > 0 && !scopeSet.has(entryPath)) {
        errors.push(`output path not in filesInScope: ${entryPath}`);
      }
    } else {
      errors.push(`output entry has unknown format: ${JSON.stringify(fmt)}`);
    }
  }

  for (const ref of Array.isArray(rawRefs) ? rawRefs : []) {
    const refError = assertSafeRelPath(ref);
    if (refError) {
      errors.push(`evidence ref unsafe: ${refError}`);
    }
  }

  return { ok: errors.length === 0, errors };
}

// ---------------------------------------------------------------------------
// Decomposition builder
// ---------------------------------------------------------------------------

export function buildDecomposition(options = {}) {
  const goal = String(options.goal || '').trim();
  if (!goal) throw new Error('decomposition requires a goal');

  const nodes = options.nodes || [];
  const edges = options.edges || [];
  const runId = options.runId || buildRunId(goal);
  const createdAt = options.now || new Date().toISOString();

  const dagResult = validateDecompositionDag({ nodes, edges });

  return {
    schema: WORKCELL_DECOMPOSITION_SCHEMA,
    runId,
    createdAt,
    goal,
    dagValidation: dagResult,
    nodes,
    edges,
    dispatchOrder: dagResult.ok ? dagResult.order : null,
    dagRoots: dagResult.ok ? dagResult.dagRoots : null,
  };
}

function buildRunId(goal) {
  const stamp = new Date().toISOString().replace(/[^0-9TZ]/g, '').slice(0, 16);
  return `wc_${stamp}_${sha256(goal).slice(0, 10)}`;
}

function sha256(text) {
  return createHash('sha256').update(String(text)).digest('hex');
}

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

export function runCli(argv = process.argv.slice(2), io = {}) {
  const stdout = io.stdout || process.stdout;
  const stderr = io.stderr || process.stderr;
  const [command, ...rest] = argv;

  if (command === 'validate-dag') {
    return cliValidateDag(rest, stdout, stderr);
  }
  if (command === 'build-packet') {
    return cliBuildPacket(rest, stdout, stderr);
  }
  stderr.write('Usage: yuri-workcell.mjs <validate-dag|build-packet> [options]\n');
  return 64;
}

function looksLikeFilePath(value) {
  return /[/\\.]/.test(value) && !value.startsWith('{') && !value.startsWith('[');
}

function safeReadCliJson(jsonArg) {
  if (looksLikeFilePath(jsonArg)) {
    const resolved = path.resolve(jsonArg);
    if (!resolved.startsWith(REPO_ROOT + path.sep) && resolved !== REPO_ROOT) {
      throw new Error(`file path outside repo root: ${jsonArg}`);
    }
    const relPath = path.relative(REPO_ROOT, resolved).replaceAll(path.sep, '/');
    if (isProtectedPath(relPath)) {
      throw new Error(`file path is protected: ${jsonArg}`);
    }
    if (existsSync(resolved)) {
      return JSON.parse(readFileSync(resolved, 'utf8'));
    }
  }
  return JSON.parse(jsonArg);
}

function cliValidateDag(argv, stdout, stderr) {
  const jsonArg = argv.find((a) => !a.startsWith('--'));
  if (!jsonArg) {
    stderr.write('validate-dag requires a JSON file path or inline JSON\n');
    return 64;
  }
  let decomposition;
  try {
    decomposition = safeReadCliJson(jsonArg);
  } catch (err) {
    stderr.write(`failed to parse decomposition: ${err.message}\n`);
    return 2;
  }
  const result = validateDecompositionDag(decomposition);
  stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  return result.ok ? 0 : 2;
}

function cliBuildPacket(argv, stdout, stderr) {
  const jsonArg = argv.find((a) => !a.startsWith('--'));
  if (!jsonArg) {
    stderr.write('build-packet requires a JSON node definition\n');
    return 64;
  }
  try {
    const node = safeReadCliJson(jsonArg);
    const packet = buildWorkerPacket(node);
    stdout.write(`${JSON.stringify(packet, null, 2)}\n`);
    return 0;
  } catch (err) {
    stderr.write(`[yuri-workcell] ${err.message}\n`);
    return 2;
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exit(runCli());
}
