#!/usr/bin/env node
/**
 * Workcell orchestration core.
 *
 * Provides DAG validation (hard gate), packet assembly, scope checking,
 * and output collection for the Sonnet workcell protocol.
 */

import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs';
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
// Memory authority
// ---------------------------------------------------------------------------

export const WORKCELL_MEMORY_OPERATIONS = Object.freeze([
  'recall',
  'propose',
  'promote',
]);

// orchestrator: full cycle — recall context, propose updates, promote approved proposals.
// Promote is included because the orchestrator is the only entity that calls
// promoteMemoryProposal() after Marcel approves; recall+propose without promote
// would leave the write cycle incomplete and Marcel would need to intervene for
// every promotion manually.
// Worker roles (builder/guardrail/registry/supercharger) are worker-deny: [].
// scout gets recall only — bounded curated recall with a per-task query cap.
// Authority roles are a separate keyspace from WORKCELL_ROLES (DAG node roles);
// orchestrator and supercharger are not valid DAG node roles.
export const WORKCELL_MEMORY_AUTHORITY = Object.freeze({
  orchestrator: Object.freeze(['recall', 'propose', 'promote']),
  scout: Object.freeze(['recall']),
  builder: Object.freeze([]),
  guardrail: Object.freeze([]),
  registry: Object.freeze([]),
  supercharger: Object.freeze([]),
});

export function isMemoryAllowed(role, operation) {
  if (!role || typeof role !== 'string') return false;
  if (!operation || typeof operation !== 'string') return false;
  if (!WORKCELL_MEMORY_OPERATIONS.includes(operation)) return false;
  const allowed = WORKCELL_MEMORY_AUTHORITY[role];
  return Array.isArray(allowed) && allowed.includes(operation);
}

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

function validateWorkcellToken(value, name) {
  if (typeof value !== 'string' || value.length === 0) return `${name} must be a non-empty string`;
  if (value.includes('/') || value.includes('\\')) return `${name} contains path separator`;
  if (value === '..' || value.includes('..')) return `${name} contains path traversal`;
  if (!/^[a-zA-Z0-9_.\-]+$/.test(value)) return `${name} contains invalid characters`;
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
// Filesystem factories — write/delete with shared guard chain
// ---------------------------------------------------------------------------

function assertSafeRepoPath(repoRoot, relPath) {
  if (!relPath || typeof relPath !== 'string') throw new Error(`path must be a non-empty string, got ${typeof relPath}`);
  const normalized = relPath.replaceAll('\\', '/');
  if (path.isAbsolute(normalized) || path.isAbsolute(relPath)) throw new Error(`absolute path not allowed: ${relPath}`);
  if (normalized.startsWith('../') || normalized.includes('/../') || normalized === '..') throw new Error(`path escapes repo root: ${relPath}`);
  if (isProtectedPath(normalized)) throw new Error(`protected path: ${relPath}`);
  const full = path.join(repoRoot, relPath);
  const root = repoRoot.endsWith(path.sep) ? repoRoot : repoRoot + path.sep;
  if (!full.startsWith(root) && full !== repoRoot) throw new Error(`path outside repo root: ${relPath}`);
  return full;
}

export function makeFilesystemWriter(repoRoot) {
  return function fsWriter(relPath, content) {
    if (typeof content !== 'string') throw new Error(`content must be a string, got ${typeof content}`);
    const full = assertSafeRepoPath(repoRoot, relPath);
    mkdirSync(path.dirname(full), { recursive: true });
    writeFileSync(full, content, 'utf8');
  };
}

export function makeFilesystemDeleter(repoRoot) {
  return function fsDeleter(relPath) {
    const full = assertSafeRepoPath(repoRoot, relPath);
    unlinkSync(full);
  };
}

// ---------------------------------------------------------------------------
// Guarded filesystem apply — applyMaterializedPatch / rollbackMaterializedPatch
// ---------------------------------------------------------------------------

function ampEmpty(extra = {}) {
  return {
    ok: false, errors: [], warnings: [],
    appliedFiles: [], skippedFiles: [],
    rollbackAttempted: false, rollbackOk: null, rollbackErrors: [],
    ...extra,
  };
}

export function applyMaterializedPatch(materialized, fsReader, fsWriter, fsDeleter, options = {}) {
  const inputErrors = [];
  if (typeof fsReader !== 'function') inputErrors.push('fsReader must be a function');
  if (typeof fsWriter !== 'function') inputErrors.push('fsWriter must be a function');
  if (typeof fsDeleter !== 'function') inputErrors.push('fsDeleter must be a function');
  if (inputErrors.length > 0) return ampEmpty({ errors: inputErrors });

  if (
    !materialized || typeof materialized !== 'object' ||
    !materialized.ok || !Array.isArray(materialized.fileResults) ||
    !materialized.rollbackManifest
  ) {
    return ampEmpty({ errors: ['materialized must be an ok:true materializePatch result with fileResults and rollbackManifest'] });
  }

  if (options.approved !== true) {
    return ampEmpty({ errors: ['apply requires options.approved === true'] });
  }

  const VALID_ACTIONS = new Set(['create', 'modify', 'delete']);
  const preflightErrors = [];
  const warnings = [...(materialized.warnings || [])];

  const rm = materialized.rollbackManifest;
  if (!rm || !Array.isArray(rm.files)) {
    preflightErrors.push('preflight: rollbackManifest.files must be an array');
  } else {
    for (const entry of rm.files) {
      if (!entry || typeof entry !== 'object') {
        preflightErrors.push('preflight: rollbackManifest entry must be a non-null object');
      } else if (entry.rollbackAction === 'restore' && typeof entry.beforeContent !== 'string') {
        preflightErrors.push(`preflight: rollbackManifest restore entry missing string beforeContent: ${entry.file}`);
      }
    }
  }

  for (const fr of materialized.fileResults) {
    const pathErr = assertSafeRelPath(fr.file);
    if (pathErr) { preflightErrors.push(`preflight path-safety: ${fr.file}: ${pathErr}`); continue; }

    if (!VALID_ACTIONS.has(fr.action)) {
      preflightErrors.push(`preflight: unknown fileResult action: ${JSON.stringify(fr.action)} for ${fr.file}`);
      continue;
    }

    if ((fr.action === 'create' || fr.action === 'modify') && typeof fr.afterContent !== 'string') {
      preflightErrors.push(`preflight: ${fr.action} requires string afterContent for ${fr.file}`);
      continue;
    }

    if (fr.action === 'create') {
      const read = safeReadFsReader(fsReader, fr.file);
      if (!read.ok) { preflightErrors.push(`preflight read-error: ${fr.file}: ${read.error}`); continue; }
      if (read.content !== null) preflightErrors.push(`preflight: create target already exists: ${fr.file}`);
      if (sha256(fr.afterContent) !== fr.afterHash) {
        preflightErrors.push(`preflight: afterContent/afterHash mismatch: ${fr.file}`);
      }
    } else if (fr.action === 'modify') {
      const read = safeReadFsReader(fsReader, fr.file);
      if (!read.ok) { preflightErrors.push(`preflight read-error: ${fr.file}: ${read.error}`); continue; }
      if (typeof read.content !== 'string') { preflightErrors.push(`preflight: file not found: ${fr.file}`); continue; }
      const normalized = read.content.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
      if (sha256(normalized) !== fr.beforeHash) {
        preflightErrors.push(`preflight: beforeHash mismatch for ${fr.file}: file has changed since materialization`);
      }
      if (sha256(fr.afterContent) !== fr.afterHash) {
        preflightErrors.push(`preflight: afterContent/afterHash mismatch: ${fr.file}`);
      }
    } else if (fr.action === 'delete') {
      const read = safeReadFsReader(fsReader, fr.file);
      if (!read.ok) { preflightErrors.push(`preflight read-error: ${fr.file}: ${read.error}`); continue; }
      if (typeof read.content !== 'string') { preflightErrors.push(`preflight: file not found for delete: ${fr.file}`); continue; }
      const normalized = read.content.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
      if (sha256(normalized) !== fr.beforeHash) {
        preflightErrors.push(`preflight: beforeHash mismatch for ${fr.file}: file has changed since materialization`);
      }
    }
  }

  if (preflightErrors.length > 0) return ampEmpty({ errors: preflightErrors, warnings });

  const creates = materialized.fileResults.filter((fr) => fr.action === 'create');
  const modifies = materialized.fileResults.filter((fr) => fr.action === 'modify');
  const deletes = materialized.fileResults.filter((fr) => fr.action === 'delete');
  const ordered = [...creates, ...modifies, ...deletes];

  const appliedFiles = [];
  const skippedFiles = [];
  const writeErrors = [];

  for (const fr of ordered) {
    if (writeErrors.length > 0) {
      skippedFiles.push({ file: fr.file, action: fr.action, reason: 'aborted-on-prior-error' });
      continue;
    }
    try {
      if (fr.action === 'delete') {
        fsDeleter(fr.file);
      } else {
        fsWriter(fr.file, fr.afterContent);
      }
      appliedFiles.push({ file: fr.file, action: fr.action, afterHash: fr.afterHash ?? null });
    } catch (err) {
      const msg = err && err.message ? err.message : String(err);
      writeErrors.push(`write-error: ${fr.file}: ${msg}`);
      skippedFiles.push({ file: fr.file, action: fr.action, reason: `write-error: ${msg}` });
    }
  }

  if (writeErrors.length === 0) {
    return {
      ok: true, errors: [], warnings,
      appliedFiles, skippedFiles,
      rollbackAttempted: false, rollbackOk: null, rollbackErrors: [],
    };
  }

  if (appliedFiles.length === 0) {
    return {
      ok: false, errors: writeErrors, warnings,
      appliedFiles, skippedFiles,
      rollbackAttempted: false, rollbackOk: null, rollbackErrors: [],
    };
  }

  const rollbackResult = rollbackMaterializedPatch(
    materialized.rollbackManifest,
    fsWriter, fsDeleter,
    { appliedFiles: appliedFiles.map((af) => af.file) },
  );

  return {
    ok: false, errors: writeErrors, warnings,
    appliedFiles, skippedFiles,
    rollbackAttempted: true,
    rollbackOk: rollbackResult.ok,
    rollbackErrors: rollbackResult.errors,
  };
}

export function rollbackMaterializedPatch(rollbackManifest, fsWriter, fsDeleter, options = {}) {
  const errors = [];
  if (typeof fsWriter !== 'function') errors.push('fsWriter must be a function');
  if (typeof fsDeleter !== 'function') errors.push('fsDeleter must be a function');
  if (errors.length > 0) return { ok: false, errors, restoredFiles: [], deletedFiles: [] };

  if (!rollbackManifest || !Array.isArray(rollbackManifest.files)) {
    return { ok: false, errors: ['rollbackManifest.files must be an array'], restoredFiles: [], deletedFiles: [] };
  }

  const scopeFiles = options.appliedFiles ?? options.files ?? null;
  let entries;
  if (Array.isArray(scopeFiles)) {
    const orderMap = new Map(scopeFiles.map((f, i) => [f, i]));
    entries = rollbackManifest.files
      .filter((e) => orderMap.has(e.file))
      .sort((a, b) => (orderMap.get(b.file) ?? 0) - (orderMap.get(a.file) ?? 0));
  } else {
    entries = [...rollbackManifest.files];
  }

  const restoredFiles = [];
  const deletedFiles = [];

  for (const entry of entries) {
    const pathErr = assertSafeRelPath(entry.file);
    if (pathErr) {
      errors.push(`rollback-path-safety: ${entry.file}: ${pathErr}`);
      continue;
    }
    try {
      if (entry.rollbackAction === 'restore') {
        if (typeof entry.beforeContent !== 'string') {
          errors.push(`rollback-error: ${entry.file}: beforeContent is not a string for restore action`);
          continue;
        }
        fsWriter(entry.file, entry.beforeContent);
        restoredFiles.push(entry.file);
      } else if (entry.rollbackAction === 'delete') {
        fsDeleter(entry.file);
        deletedFiles.push(entry.file);
      }
    } catch (err) {
      errors.push(`rollback-error: ${entry.file}: ${err && err.message ? err.message : String(err)}`);
    }
  }

  return { ok: errors.length === 0, errors, restoredFiles, deletedFiles };
}

// ---------------------------------------------------------------------------
// Materialization — yuri-patch-v0 (in-memory composition, no FS mutation)
// ---------------------------------------------------------------------------

function mpBuildRegion(r) {
  const matchedOld = r.op === 'replace_lines' ? (r.matchedOldLines ?? 1) : 0;
  const start = r.anchorLine ?? 0;
  const end = r.op === 'replace_lines' ? start + matchedOld - 1 : start;
  const spliceStart = r.op === 'insert_after' ? start + 1 : start;
  return { index: r.index, op: r.op, start, end, spliceStart, matchedOld };
}

function mpEarlyReturn(errors, extra = {}) {
  return {
    ok: false, errors, warnings: [],
    dryRun: extra.dryRun ?? null, baseState: null, fileResults: [], rollbackManifest: null,
    filesWouldModify: [], filesWouldCreate: [], filesWouldDelete: [],
  };
}

export function materializePatch(patch, fsReader, options = {}) {
  const dryRun = applyPatchDryRun(patch, fsReader, { skipValidation: options.skipValidation });
  if (!dryRun.ok) return mpEarlyReturn(dryRun.errors, { dryRun });

  const readAt = new Date().toISOString();
  const bsFiles = {};
  const baseErrors = [];

  for (const r of dryRun.results) {
    if (r.status !== 'would-apply' || Object.hasOwn(bsFiles, r.file)) continue;
    if (r.op === 'create_file') {
      bsFiles[r.file] = { beforeContent: null, beforeHash: null, beforeLines: null };
    } else {
      const read = safeReadFsReader(fsReader, r.file);
      if (!read.ok || read.content === null) {
        baseErrors.push(`base-state read failed for ${r.file}: ${read.ok ? 'returned null' : read.error}`);
        continue;
      }
      const c = read.content.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
      bsFiles[r.file] = { beforeContent: c, beforeHash: sha256(c), beforeLines: splitLines(c).length };
    }
  }

  if (baseErrors.length > 0) return mpEarlyReturn(baseErrors, { dryRun });

  const baseState = { readAt, files: bsFiles };
  const errors = [];
  const warnings = [...(dryRun.warnings || [])];
  const fileResults = [];

  const byFile = new Map();
  for (const r of dryRun.results) {
    if (r.status !== 'would-apply') continue;
    if (!byFile.has(r.file)) byFile.set(r.file, []);
    byFile.get(r.file).push(r);
  }

  for (const [file, entries] of byFile) {
    const bs = bsFiles[file];
    const creates = entries.filter((e) => e.op === 'create_file');
    const deletes = entries.filter((e) => e.op === 'delete_file');
    const editOps = entries.filter((e) => ['replace_lines', 'insert_before', 'insert_after'].includes(e.op));

    if (creates.length > 0 && (deletes.length > 0 || editOps.length > 0)) {
      errors.push(`invalid op mix for ${file}: create_file cannot be combined with other ops`);
      continue;
    }
    if (deletes.length > 0 && (creates.length > 0 || editOps.length > 0)) {
      errors.push(`invalid op mix for ${file}: delete_file cannot be combined with other ops`);
      continue;
    }
    if (creates.length > 1 || deletes.length > 1) {
      errors.push(`invalid op: duplicate create_file or delete_file for ${file}`);
      continue;
    }

    if (creates.length === 1) {
      const pe = patch.patches[creates[0].index];
      const afterContent = pe.new_lines.join('\n');
      fileResults.push({
        file, action: 'create', afterContent, afterHash: sha256(afterContent),
        afterLines: splitLines(afterContent).length, appliedEntries: [creates[0].index], beforeHash: null,
      });
      continue;
    }

    if (deletes.length === 1) {
      fileResults.push({
        file, action: 'delete', afterContent: null, afterHash: null, afterLines: null,
        appliedEntries: [deletes[0].index], beforeHash: bs.beforeHash,
      });
      continue;
    }

    const regions = editOps.map(mpBuildRegion);
    let fileError = false;
    for (let a = 0; a < regions.length; a++) {
      for (let b = a + 1; b < regions.length; b++) {
        const ra = regions[a];
        const rb = regions[b];
        if (ra.start <= rb.end && rb.start <= ra.end) {
          errors.push(`overlapping edit regions in ${file}: patches[${ra.index}] and patches[${rb.index}]`);
          fileError = true;
        } else if (ra.end + 1 === rb.start || rb.end + 1 === ra.start) {
          warnings.push(`adjacent edit regions in ${file}: patches[${ra.index}] and patches[${rb.index}]`);
        }
      }
    }
    if (fileError) continue;

    const sorted = [...regions].sort((a, b) => b.spliceStart - a.spliceStart);
    const lines = [...splitLines(bs.beforeContent)];
    for (const reg of sorted) {
      const pe = patch.patches[reg.index];
      const nl = Array.isArray(pe.new_lines) ? pe.new_lines : [];
      lines.splice(reg.spliceStart, reg.op === 'replace_lines' ? reg.matchedOld : 0, ...nl);
    }

    const afterContent = lines.join('\n');
    fileResults.push({
      file, action: 'modify', afterContent, afterHash: sha256(afterContent),
      afterLines: lines.length, appliedEntries: editOps.map((e) => e.index), beforeHash: bs.beforeHash,
    });
  }

  const patchHash = sha256(JSON.stringify(patch));
  const baseStateHash = sha256(JSON.stringify(bsFiles));
  const materializedAt = new Date().toISOString();

  const rollbackManifest = {
    schema: 'yuri.workcell.rollback.v0',
    patchHash,
    baseStateHash,
    materializedAt,
    files: fileResults.map((fr) => ({
      file: fr.file,
      action: fr.action,
      rollbackAction: fr.action === 'create' ? 'delete' : 'restore',
      beforeHash: bsFiles[fr.file]?.beforeHash ?? null,
      beforeContent: bsFiles[fr.file]?.beforeContent ?? null,
      afterHash: fr.afterHash,
    })),
  };

  return {
    ok: errors.length === 0,
    errors,
    warnings,
    dryRun,
    baseState,
    fileResults,
    rollbackManifest,
    filesWouldModify: fileResults.filter((fr) => fr.action === 'modify').map((fr) => fr.file),
    filesWouldCreate: fileResults.filter((fr) => fr.action === 'create').map((fr) => fr.file),
    filesWouldDelete: fileResults.filter((fr) => fr.action === 'delete').map((fr) => fr.file),
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
// Memory capsule validation
// ---------------------------------------------------------------------------

export function validateMemoryCapsule(capsule) {
  const errors = [];
  const warnings = [];

  if (!capsule || typeof capsule !== 'object' || Array.isArray(capsule)) {
    return { ok: false, errors: ['capsule must be a non-null object'], warnings };
  }

  if (!capsule.version || typeof capsule.version !== 'string') {
    errors.push('capsule.version must be a non-empty string');
  }
  if (!capsule.assembledAt || typeof capsule.assembledAt !== 'string') {
    errors.push('capsule.assembledAt must be a non-empty string');
  }
  if (!capsule.assembledBy || typeof capsule.assembledBy !== 'string') {
    errors.push('capsule.assembledBy must be a non-empty string');
  }

  if (!Array.isArray(capsule.contexts)) {
    errors.push('capsule.contexts must be an array');
  } else {
    for (let i = 0; i < capsule.contexts.length; i++) {
      const ctx = capsule.contexts[i];
      const cx = `capsule.contexts[${i}]`;
      if (!ctx || typeof ctx !== 'object' || Array.isArray(ctx)) {
        errors.push(`${cx} must be a non-null object`);
        continue;
      }
      if (!ctx.id || typeof ctx.id !== 'string') {
        errors.push(`${cx}.id must be a non-empty string`);
      }
      if (ctx.path != null) {
        if (typeof ctx.path !== 'string') {
          errors.push(`${cx}.path must be a string if present`);
        } else {
          const pathErr = assertSafeRelPath(ctx.path);
          if (pathErr) errors.push(`${cx}.path: ${pathErr}`);
        }
      }
      if (ctx.bytes != null && (typeof ctx.bytes !== 'number' || ctx.bytes < 0)) {
        errors.push(`${cx}.bytes must be a non-negative number if present`);
      }
    }
  }

  if (!capsule.policy || typeof capsule.policy !== 'object' || Array.isArray(capsule.policy)) {
    errors.push('capsule.policy must be an object');
  } else {
    if (capsule.policy.readOnly !== true) errors.push('capsule.policy.readOnly must be true');
    if (capsule.policy.writeAllowed !== false) errors.push('capsule.policy.writeAllowed must be false');
    if (capsule.policy.promoteAllowed !== false) errors.push('capsule.policy.promoteAllowed must be false');
    if (capsule.policy.proposalAllowed != null && typeof capsule.policy.proposalAllowed !== 'boolean') {
      errors.push('capsule.policy.proposalAllowed must be a boolean if present');
    }
    if (capsule.policy.recallAllowed != null && typeof capsule.policy.recallAllowed !== 'boolean') {
      errors.push('capsule.policy.recallAllowed must be a boolean if present');
    }
  }

  if (capsule.maxTotalBytes != null) {
    if (typeof capsule.maxTotalBytes !== 'number' || capsule.maxTotalBytes <= 0) {
      errors.push('capsule.maxTotalBytes must be a positive number if present');
    } else if (Array.isArray(capsule.contexts)) {
      let byteSum = 0;
      for (const ctx of capsule.contexts) {
        if (ctx && typeof ctx.bytes === 'number') byteSum += ctx.bytes;
      }
      if (byteSum > capsule.maxTotalBytes) {
        errors.push(`capsule context bytes (${byteSum}) exceeds maxTotalBytes (${capsule.maxTotalBytes})`);
      } else if (byteSum > capsule.maxTotalBytes * 0.8) {
        warnings.push(`capsule context bytes (${byteSum}) exceeds 80% of maxTotalBytes (${capsule.maxTotalBytes})`);
      }
    }
  }

  return { ok: errors.length === 0, errors, warnings };
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

  // riskNotes and testCommands — must be arrays of strings when present
  if (output.riskNotes != null) {
    if (!Array.isArray(output.riskNotes)) {
      errors.push('riskNotes must be an array');
    } else {
      for (let i = 0; i < output.riskNotes.length; i++) {
        if (typeof output.riskNotes[i] !== 'string') {
          errors.push(`riskNotes[${i}] must be a string`);
        }
      }
    }
  }
  if (output.testCommands != null) {
    if (!Array.isArray(output.testCommands)) {
      errors.push('testCommands must be an array');
    } else {
      for (let i = 0; i < output.testCommands.length; i++) {
        if (typeof output.testCommands[i] !== 'string') {
          errors.push(`testCommands[${i}] must be a string`);
        }
      }
    }
  }

  // memorySignals validation
  const ms = output.memorySignals;
  if (ms != null) {
    if (typeof ms !== 'object' || Array.isArray(ms)) {
      errors.push('memorySignals must be an object');
    } else {
      // proposals
      if (ms.proposals != null) {
        if (!Array.isArray(ms.proposals)) {
          errors.push('memorySignals.proposals must be an array');
        } else {
          for (let i = 0; i < ms.proposals.length; i++) {
            const p = ms.proposals[i];
            const px = `memorySignals.proposals[${i}]`;
            if (!p || typeof p !== 'object' || Array.isArray(p)) {
              errors.push(`${px} must be a non-null object`);
              continue;
            }
            if (!p.type || typeof p.type !== 'string') errors.push(`${px}.type must be a non-empty string`);
            if (!p.scope || typeof p.scope !== 'string') {
              errors.push(`${px}.scope must be a non-empty string`);
            } else if (p.scope === 'permanent') {
              errors.push(`${px}.scope 'permanent' is not allowed for worker proposals`);
            }
            if (!p.content || typeof p.content !== 'string') errors.push(`${px}.content must be a non-empty string`);
            if (typeof p.confidence !== 'number' || p.confidence < 0 || p.confidence > 1) {
              errors.push(`${px}.confidence must be a number between 0 and 1`);
            }
            if (!p.reason || typeof p.reason !== 'string') errors.push(`${px}.reason must be a non-empty string`);
          }
        }
      }

      // capsuleUsage
      if (ms.capsuleUsage != null) {
        if (typeof ms.capsuleUsage !== 'object' || Array.isArray(ms.capsuleUsage)) {
          errors.push('memorySignals.capsuleUsage must be an object');
        } else {
          const cu = ms.capsuleUsage;
          for (const field of ['contextsUsed', 'contextsIgnored', 'staleContexts']) {
            if (cu[field] != null && !Array.isArray(cu[field])) {
              errors.push(`memorySignals.capsuleUsage.${field} must be an array`);
            }
          }
          if (cu.contradictionsDetected != null) {
            if (!Array.isArray(cu.contradictionsDetected)) {
              errors.push('memorySignals.capsuleUsage.contradictionsDetected must be an array');
            } else {
              for (let i = 0; i < cu.contradictionsDetected.length; i++) {
                const cd = cu.contradictionsDetected[i];
                const cdx = `memorySignals.capsuleUsage.contradictionsDetected[${i}]`;
                if (!cd || typeof cd !== 'object' || Array.isArray(cd)) {
                  errors.push(`${cdx} must be a non-null object`);
                  continue;
                }
                for (const req of ['capsuleContextId', 'contradiction', 'currentEvidence', 'severity']) {
                  if (!cd[req] || typeof cd[req] !== 'string') {
                    errors.push(`${cdx}.${req} must be a non-empty string`);
                  }
                }
              }
            }
          }
        }
      }

      // recallLog
      if (ms.recallLog != null && !Array.isArray(ms.recallLog)) {
        errors.push('memorySignals.recallLog must be an array');
      }
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
// Pool output reader — safe, read-only surface for _SYSTEM/state/workcell
// ---------------------------------------------------------------------------

export function readPoolOutput(runId, role, options = {}) {
  const errors = [];
  const warnings = [];

  const runIdErr = validateWorkcellToken(runId, 'runId');
  if (runIdErr) {
    return { ok: false, errors: [runIdErr], warnings, runId, role, relPath: null, output: null, validation: null };
  }

  const roleErr = validateWorkcellToken(role, 'role');
  if (roleErr) {
    return { ok: false, errors: [roleErr], warnings, runId, role, relPath: null, output: null, validation: null };
  }

  if (!WORKCELL_ROLES.includes(role)) {
    warnings.push(`role '${role}' is not a standard workcell role`);
  }

  const relPath = `${WORKCELL_STATE_DIR}/${runId}/${role}/output.json`;

  const pathErr = assertSafeRelPath(relPath);
  if (pathErr) {
    return { ok: false, errors: [pathErr], warnings, runId, role, relPath, output: null, validation: null };
  }

  const root = options.root || REPO_ROOT;
  const fullPath = path.join(root, relPath);

  let raw;
  try {
    raw = readFileSync(fullPath, 'utf8');
  } catch {
    return { ok: false, errors: ['output.json not found'], warnings, runId, role, relPath, output: null, validation: null };
  }

  let output;
  try {
    output = JSON.parse(raw);
  } catch {
    return { ok: false, errors: ['output.json is malformed JSON'], warnings, runId, role, relPath, output: null, validation: null };
  }

  let validation = null;
  if (options.validate !== false) {
    const packet = options.packet || { filesInScope: [] };
    validation = validateWorkerOutput(output, packet);
    if (!validation.ok) {
      for (const ve of validation.errors) errors.push(`validation: ${ve}`);
    }
  }

  const ok = errors.length === 0;
  return { ok, errors, warnings, runId, role, relPath, output, validation };
}

// ---------------------------------------------------------------------------
// Token estimator — pure, no FS reads, no USD pricing
// ---------------------------------------------------------------------------

export function estimateWorkcellTokens(decomposition, options = {}) {
  const errors = [];
  const warnings = [];

  const earlyFail = (msg) => ({
    ok: false, errors: [msg], warnings: [],
    estimatorVersion: 'chars_div_4_v1', nodes: [],
    totalInputTokens: 0, totalOutputTokens: 0, totalTokens: 0, budget: null,
  });

  if (!decomposition || typeof decomposition !== 'object') {
    return earlyFail('decomposition must be an object');
  }
  if (!decomposition.dagValidation || !decomposition.dagValidation.ok) {
    return earlyFail('decomposition has failed or missing dagValidation');
  }
  const nodeList = decomposition.nodes;
  if (!Array.isArray(nodeList) || nodeList.length === 0) {
    return earlyFail('decomposition must have at least one node');
  }

  const capsuleBytesPerNode = options.capsuleBytesPerNode ?? 24000;
  const systemPromptBytes = options.systemPromptBytes ?? 4000;
  const fileSizeEstimate = options.fileSizeEstimate ?? 8000;
  const expectedOutputBytes = options.expectedOutputBytes ?? 12000;

  const nodeEstimates = [];
  let totalInputTokens = 0;
  let totalOutputTokens = 0;

  for (const node of nodeList) {
    const filesCount = Array.isArray(node.filesInScope) ? node.filesInScope.length : 0;
    const contextBytes = filesCount * fileSizeEstimate;
    const inputTokens = Math.ceil((capsuleBytesPerNode + systemPromptBytes + contextBytes) / 4);
    const outputTokens = Math.ceil(expectedOutputBytes / 4);
    nodeEstimates.push({
      id: node.id,
      role: node.role,
      filesInScopeCount: filesCount,
      inputTokens,
      outputTokens,
      totalTokens: inputTokens + outputTokens,
    });
    totalInputTokens += inputTokens;
    totalOutputTokens += outputTokens;
  }

  const totalTokens = totalInputTokens + totalOutputTokens;

  let budget = null;
  if (options.budget != null) {
    const { ceiling, warnAt } = options.budget;
    const withinBudget = totalTokens < ceiling;
    budget = { ceiling, actual: totalTokens, withinBudget };
    if (!withinBudget) {
      errors.push(`total tokens (${totalTokens}) exceeds budget ceiling (${ceiling})`);
    } else if (warnAt != null && totalTokens >= warnAt) {
      warnings.push(`total tokens (${totalTokens}) exceeds warnAt threshold (${warnAt})`);
    }
  }

  return {
    ok: errors.length === 0,
    errors,
    warnings,
    estimatorVersion: 'chars_div_4_v1',
    nodes: nodeEstimates,
    totalInputTokens,
    totalOutputTokens,
    totalTokens,
    budget,
  };
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
