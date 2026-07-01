#!/usr/bin/env node
// @capability: nano-doc-assembler
// @serves: one document many agents | shared doc dedicated sections | fragment and assemble | each nano owns a part | collaborative document | stitch agent outputs | no clobber document
// @does: the NANO SWARM "one document, each nano its own dedicated part" mechanism. A doc is declared as an ORDERED list of sections, each owned by exactly ONE nano. Each nano writes ONLY its own section to its own fragment file (atomic write -> zero shared-file RMW contention by construction). assembleDoc stitches present fragments in declared order with section markers + reports missing/complete.
// @use: when several agents must co-produce one document without clobbering each other. defineDoc(order+owners) -> each nano writeSection(its own id) -> assembleDoc() stitches. Anti-clobber comes from per-section fragment files, not locking; reach for nano-lease only if a section's ownership itself is contended.
// @exports: defineDoc, writeSection, assembleDoc, readDocManifest, assembleFromParts, listDocSections, docsDir
//
// Why fragment-per-agent instead of concurrent region-writes into one file: concurrent writes to shared
// byte-ranges of a single file are a lost-update read-modify-write race (two writers read the same base,
// each writes its region, the second overwrites the first's). Giving each owner its OWN file removes the
// shared mutable state entirely — the only shared object is the manifest, written ONCE at defineDoc.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { readJsonOrNull, atomicWriteFile } from './_lib/fs.mjs';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const DOCS_DIR = process.env.YURI_NANO_DOCS_DIR || path.join(REPO_ROOT, '_SYSTEM/state/nano/docs');

export function docsDir() { return DOCS_DIR; }
const docDir = (docId) => path.join(DOCS_DIR, sanitize(docId));
const manifestPath = (docId) => path.join(docDir(docId), 'manifest.json');
const sectionPath = (docId, sectionId) => path.join(docDir(docId), 'sections', `${sanitize(sectionId)}.md`);

// Keep ids filesystem-safe + flat (no traversal): collapse anything non-portable to '-'.
function sanitize(id) {
  const s = String(id).replace(/[^A-Za-z0-9._-]/g, '-');
  if (!s || s === '.' || s === '..') throw new Error(`invalid doc/section id: ${JSON.stringify(id)}`);
  return s;
}

/**
 * Declare a document: an ordered list of sections, each owned by exactly one nano.
 * sections: [{ id, owner, title? }]. A duplicate section id is an error (ambiguous ownership/order).
 */
export function defineDoc(docId, { title = '', sections = [] } = {}) {
  const seen = new Set();
  const norm = sections.map((s) => {
    const id = sanitize(s.id);
    if (seen.has(id)) throw new Error(`duplicate section id: ${id}`);
    seen.add(id);
    return { id, owner: String(s.owner), title: s.title || '' };
  });
  const manifest = { docId: sanitize(docId), title: String(title), sections: norm, updatedAt: new Date().toISOString() };
  atomicWriteFile(manifestPath(docId), `${JSON.stringify(manifest, null, 2)}\n`, { mkdir: true });
  return manifest;
}

export function readDocManifest(docId) {
  return readJsonOrNull(manifestPath(docId));
}

/**
 * A nano writes its OWNED section. Refuses (no write) if the doc/section is unknown or nanoId is not the
 * declared owner — so a fragment can only exist for its rightful owner. Each section is a separate file,
 * so concurrent writers of DIFFERENT sections never contend.
 */
export function writeSection(docId, sectionId, nanoId, content) {
  const manifest = readDocManifest(docId);
  if (!manifest) return { ok: false, reason: 'no-doc' };
  const sec = manifest.sections.find((s) => s.id === sanitize(sectionId));
  if (!sec) return { ok: false, reason: 'unknown-section' };
  if (sec.owner !== String(nanoId)) return { ok: false, reason: 'not-owner', owner: sec.owner };
  const body = typeof content === 'string' ? content : String(content ?? '');
  atomicWriteFile(sectionPath(docId, sectionId), body, { mkdir: true });
  return { ok: true, bytes: Buffer.byteLength(body), section: sec.id };
}

/** PURE: stitch a manifest + a { sectionId: content } map into one document + a coverage report. */
export function assembleFromParts(manifest, fragments = {}) {
  const parts = [];
  const report = [];
  const missing = [];
  for (const sec of manifest.sections) {
    const has = Object.prototype.hasOwnProperty.call(fragments, sec.id) && fragments[sec.id] != null;
    if (has) parts.push(`<!-- section:${sec.id} owner:${sec.owner} -->\n${fragments[sec.id]}`);
    else missing.push(sec.id);
    report.push({ id: sec.id, owner: sec.owner, title: sec.title, present: has, bytes: has ? Buffer.byteLength(fragments[sec.id]) : 0 });
  }
  return { markdown: parts.join('\n\n'), sections: report, missing, complete: missing.length === 0 };
}

/** Read the manifest + every present fragment from disk and assemble in declared order. */
export function assembleDoc(docId) {
  const manifest = readDocManifest(docId);
  if (!manifest) return { ok: false, reason: 'no-doc' };
  const fragments = {};
  for (const sec of manifest.sections) {
    const p = sectionPath(docId, sec.id);
    if (fs.existsSync(p)) fragments[sec.id] = fs.readFileSync(p, 'utf8');
  }
  return { ok: true, docId: manifest.docId, title: manifest.title, ...assembleFromParts(manifest, fragments) };
}

/** Section ownership + present/missing status without assembling the full body. */
export function listDocSections(docId) {
  const r = assembleDoc(docId);
  return r.ok ? r.sections : [];
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const [cmd, docId] = process.argv.slice(2);
  if (cmd === 'assemble' && docId) process.stdout.write(assembleDoc(docId).markdown || '');
  else if (cmd === 'status' && docId) process.stdout.write(`${JSON.stringify(listDocSections(docId), null, 2)}\n`);
  else process.stdout.write('usage: nano-doc-assembler.mjs [assemble|status] <docId>\n');
}
