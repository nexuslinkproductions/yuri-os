// NEXUS backend spine, module 1 — typed object store (STIX-style) on
// node:sqlite. Zero npm deps. Draft files on disk stay the text truth; this
// store is the graph truth (typed objects + first-class relationships).
//
// DB: _SYSTEM/state/nexus/nexus.db (WAL mode), created at first use.

import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..', '..', '..');
const STATE_DIR = path.join(ROOT, '_SYSTEM', 'state', 'nexus');
const DEFAULT_DB = path.join(STATE_DIR, 'nexus.db');

export const OBJECT_TYPES = [
  'signal', 'draft', 'post', 'media', 'reference-pack',
  'benchmark', 'capture', 'decision', 'note', 'alert',
];

export const REL_TYPES = [
  'derived-from', 'references', 'approved-by',
  'posted-to', 'captured-from', 'synthesized-into',
];

const now = () => new Date().toISOString();

export function createStore(dbPath = DEFAULT_DB) {
  if (dbPath !== ':memory:') mkdirSync(path.dirname(dbPath), { recursive: true });
  const db = new DatabaseSync(dbPath);
  db.exec('PRAGMA journal_mode = WAL');
  db.exec(`
    CREATE TABLE IF NOT EXISTS objects (
      id         TEXT PRIMARY KEY,
      type       TEXT NOT NULL,
      created    TEXT NOT NULL,
      modified   TEXT NOT NULL,
      confidence INTEGER NOT NULL DEFAULT 100,
      markings   TEXT NOT NULL DEFAULT '[]',
      data       TEXT NOT NULL DEFAULT '{}'
    );
    CREATE INDEX IF NOT EXISTS idx_objects_type ON objects(type);
    CREATE TABLE IF NOT EXISTS relationships (
      from_id  TEXT NOT NULL,
      to_id    TEXT NOT NULL,
      rel_type TEXT NOT NULL,
      created  TEXT NOT NULL,
      PRIMARY KEY (from_id, to_id, rel_type)
    );
    CREATE INDEX IF NOT EXISTS idx_rel_from ON relationships(from_id);
    CREATE INDEX IF NOT EXISTS idx_rel_to   ON relationships(to_id);
  `);

  const q = {
    insert: db.prepare(
      `INSERT INTO objects (id, type, created, modified, confidence, markings, data)
       VALUES (?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET
         modified   = excluded.modified,
         confidence = excluded.confidence,
         markings   = excluded.markings,
         data       = excluded.data`
    ),
    byId: db.prepare('SELECT * FROM objects WHERE id = ?'),
    del: db.prepare('DELETE FROM objects WHERE id = ?'),
    delRels: db.prepare('DELETE FROM relationships WHERE from_id = ? OR to_id = ?'),
    byType: db.prepare('SELECT * FROM objects WHERE type = ? ORDER BY created'),
    all: db.prepare('SELECT * FROM objects ORDER BY created'),
    addRel: db.prepare(
      `INSERT INTO relationships (from_id, to_id, rel_type, created)
       VALUES (?, ?, ?, ?)
       ON CONFLICT (from_id, to_id, rel_type) DO NOTHING`
    ),
    delRel: db.prepare('DELETE FROM relationships WHERE from_id = ? AND to_id = ? AND rel_type = ?'),
    relFrom: db.prepare('SELECT * FROM relationships WHERE from_id = ? ORDER BY created'),
    relFromType: db.prepare('SELECT * FROM relationships WHERE from_id = ? AND rel_type = ? ORDER BY created'),
    relTo: db.prepare('SELECT * FROM relationships WHERE to_id = ? ORDER BY created'),
    relToType: db.prepare('SELECT * FROM relationships WHERE to_id = ? AND rel_type = ? ORDER BY created'),
    hasRel: db.prepare('SELECT 1 AS x FROM relationships WHERE from_id = ? AND to_id = ? AND rel_type = ?'),
  };

  const rowToObject = (row) => row && {
    id: row.id,
    type: row.type,
    created: row.created,
    modified: row.modified,
    confidence: row.confidence,
    markings: JSON.parse(row.markings),
    data: JSON.parse(row.data),
  };

  const store = {
    /** Insert or update a typed object. `created` is kept from the first put. */
    put(obj) {
      if (!obj || typeof obj.id !== 'string' || !obj.id) throw new Error('object_id_required');
      if (!OBJECT_TYPES.includes(obj.type)) throw new Error('unknown_object_type: ' + obj.type);
      const existing = q.byId.get(obj.id);
      const ts = now();
      const confidence = obj.confidence ?? existing?.confidence ?? 100;
      q.insert.run(
        obj.id,
        obj.type,
        existing ? existing.created : (obj.created || ts),
        ts,
        Math.max(0, Math.min(100, confidence | 0)),
        JSON.stringify(obj.markings ?? (existing ? JSON.parse(existing.markings) : [])),
        JSON.stringify(obj.data ?? {})
      );
      return store.get(obj.id);
    },

    get(id) {
      return rowToObject(q.byId.get(id)) || null;
    },

    /** Delete an object and every relationship touching it. */
    remove(id) {
      q.del.run(id);
      q.delRels.run(id, id);
    },

    /** Query objects by type and/or marking (marking matched against the markings array). */
    query({ type, marking } = {}) {
      if (type && !OBJECT_TYPES.includes(type)) throw new Error('unknown_object_type: ' + type);
      const rows = type ? q.byType.all(type) : q.all.all();
      return rows.map(rowToObject).filter(o => !marking || o.markings.includes(marking));
    },

    /** Add a first-class relationship (idempotent). */
    relate(fromId, toId, relType) {
      if (!REL_TYPES.includes(relType)) throw new Error('unknown_rel_type: ' + relType);
      q.addRel.run(fromId, toId, relType, now());
    },

    unrelate(fromId, toId, relType) {
      q.delRel.run(fromId, toId, relType);
    },

    /** Outgoing relationships from an object, optionally filtered by rel_type. */
    relsFrom(id, relType) {
      return relType ? q.relFromType.all(id, relType) : q.relFrom.all(id);
    },

    /** Incoming relationships to an object, optionally filtered by rel_type. */
    relsTo(id, relType) {
      return relType ? q.relToType.all(id, relType) : q.relTo.all(id);
    },

    hasRel(fromId, toId, relType) {
      return q.hasRel.get(fromId, toId, relType) !== undefined;
    },

    /**
     * Upsert a draft object from the on-disk draft file. The file is the text
     * truth; this call syncs the graph truth. `frontmatter` carries the parsed
     * frontmatter plus tail fields (media_needed, infographic).
     */
    indexDraft(id, frontmatter = {}, body = '') {
      const mediaNeeded = String(frontmatter.media_needed ?? '').trim();
      const data = {
        ...frontmatter,
        status: frontmatter.status || 'draft',
        body,
        chars: body.length,
        media_needed: mediaNeeded,
        media_ready: mediaNeeded === '' || mediaNeeded === 'none' || mediaNeeded.startsWith('READY'),
      };
      return store.put({
        id,
        type: 'draft',
        created: frontmatter.created ? String(frontmatter.created) : undefined,
        confidence: 100,
        markings: ['internal'],
        data,
      });
    },

    close() { db.close(); },
  };

  return store;
}

// Default singleton, opened lazily on first use so importing this module never
// touches the filesystem (tests use createStore with their own paths).
let _store = null;
export function getStore() {
  if (!_store) _store = createStore(DEFAULT_DB);
  return _store;
}

export const store = new Proxy({}, {
  get(_t, prop) {
    const s = getStore();
    const v = s[prop];
    return typeof v === 'function' ? v.bind(s) : v;
  },
});
