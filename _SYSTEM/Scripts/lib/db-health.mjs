import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const require = createRequire(import.meta.url);
const Database = require(path.join(REPO_ROOT, '_SYSTEM/backend/node_modules/better-sqlite3'));

export function unavailableDatabaseHealth(dbPath, error = 'database_not_found') {
  return {
    path: dbPath,
    exists: fs.existsSync(dbPath),
    available: false,
    integrityCheck: 'unavailable',
    quickCheck: 'unavailable',
    foreignKeyViolations: -1,
    healthy: false,
    error,
  };
}

export function inspectOpenDatabaseHealth(db, dbPath) {
  const exists = fs.existsSync(dbPath);
  try {
    const integrityCheck = String(db.pragma('integrity_check', { simple: true }) || 'unknown');
    const quickCheck = String(db.pragma('quick_check', { simple: true }) || 'unknown');
    const foreignKeyViolations = (db.pragma('foreign_key_check') || []).length;
    const healthy = integrityCheck === 'ok' && quickCheck === 'ok' && foreignKeyViolations === 0;

    return {
      path: dbPath,
      exists,
      available: true,
      integrityCheck,
      quickCheck,
      foreignKeyViolations,
      healthy,
      error: null,
    };
  } catch (error) {
    return {
      path: dbPath,
      exists,
      available: false,
      integrityCheck: 'error',
      quickCheck: 'error',
      foreignKeyViolations: -1,
      healthy: false,
      error: error?.message || 'database_health_check_failed',
    };
  }
}

export function inspectDatabaseHealth(dbPath) {
  if (!fs.existsSync(dbPath)) {
    return unavailableDatabaseHealth(dbPath);
  }

  let db = null;
  try {
    db = new Database(dbPath, { readonly: true, fileMustExist: true });
    return inspectOpenDatabaseHealth(db, dbPath);
  } catch (error) {
    return {
      path: dbPath,
      exists: true,
      available: false,
      integrityCheck: 'error',
      quickCheck: 'error',
      foreignKeyViolations: -1,
      healthy: false,
      error: error?.message || 'database_open_failed',
    };
  } finally {
    if (db) db.close();
  }
}
