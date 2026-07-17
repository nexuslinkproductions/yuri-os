#!/usr/bin/env python3
"""Non-protected Phase-1 APFS acceptance worker.

Every operation is constrained to an explicitly supplied fixture root under
/private/tmp.  This helper never discovers or opens the live backend path.
"""

from __future__ import annotations

import argparse
import errno
import fcntl
import json
import os
from pathlib import Path
import sqlite3
import stat as stat_module
import sys
import time


PRIVATE_TMP = Path("/private/tmp")


def emit(payload: dict) -> None:
    sys.stdout.write(json.dumps(payload, sort_keys=True) + "\n")
    sys.stdout.flush()


def allowed_path(raw: str, allowed_root: str) -> Path:
    root = Path(allowed_root).resolve(strict=True)
    if root == PRIVATE_TMP or PRIVATE_TMP not in root.parents:
        raise ValueError("allowed root must be a descendant of /private/tmp")

    candidate = Path(raw)
    if not candidate.is_absolute():
        raise ValueError("fixture path must be absolute")
    resolved_parent = candidate.parent.resolve(strict=True)
    resolved = resolved_parent / candidate.name
    if resolved != root and root not in resolved.parents:
        raise ValueError("fixture path escapes allowed root")
    try:
        status = os.lstat(resolved)
    except FileNotFoundError:
        status = None
    if status is not None:
        if stat_module.S_ISLNK(status.st_mode):
            raise ValueError("fixture final component must not be a symlink")
        if status.st_dev != os.stat(root).st_dev:
            raise ValueError("fixture final component changed filesystem")
    return resolved


def connect_db(db_path: Path, timeout_ms: int) -> sqlite3.Connection:
    parent_device = os.stat(db_path.parent).st_dev
    try:
        before = os.lstat(db_path)
    except FileNotFoundError:
        flags = os.O_RDWR | os.O_CREAT | os.O_EXCL | getattr(os, "O_NOFOLLOW", 0)
        descriptor = os.open(db_path, flags, 0o600)
        try:
            created = os.fstat(descriptor)
            if not stat_module.S_ISREG(created.st_mode) or created.st_nlink != 1:
                raise ValueError("SQLite fixture creation did not yield one regular file")
            if created.st_dev != parent_device:
                raise ValueError("SQLite fixture creation changed filesystem")
        finally:
            os.close(descriptor)
        before = os.lstat(db_path)
    if stat_module.S_ISLNK(before.st_mode) or not stat_module.S_ISREG(before.st_mode):
        raise ValueError("SQLite fixture must be one regular non-symlink file")
    if before.st_nlink != 1 or before.st_dev != parent_device:
        raise ValueError("SQLite fixture has unsafe link or device identity")
    conn = sqlite3.connect(
        str(db_path),
        timeout=timeout_ms / 1000,
        isolation_level=None,
    )
    conn.execute("PRAGMA foreign_keys = ON")
    conn.execute("PRAGMA busy_timeout = " + str(timeout_ms))
    conn.execute("PRAGMA synchronous = FULL")
    after = os.lstat(db_path)
    if stat_module.S_ISLNK(after.st_mode):
        conn.close()
        raise ValueError("SQLite fixture became a symlink")
    if not stat_module.S_ISREG(after.st_mode) or after.st_nlink != 1:
        conn.close()
        raise ValueError("SQLite fixture link identity changed during open")
    if after.st_dev != os.stat(db_path.parent).st_dev:
        conn.close()
        raise ValueError("SQLite fixture changed filesystem during open")
    if before is not None and (before.st_dev, before.st_ino) != (after.st_dev, after.st_ino):
        conn.close()
        raise ValueError("SQLite fixture identity changed during open")
    return conn


def sqlite_checks(conn: sqlite3.Connection) -> dict:
    integrity = conn.execute("PRAGMA integrity_check").fetchone()[0]
    quick = conn.execute("PRAGMA quick_check").fetchone()[0]
    foreign_keys = len(conn.execute("PRAGMA foreign_key_check").fetchall())
    journal_mode = conn.execute("PRAGMA journal_mode").fetchone()[0]
    event_ids = [
        row[0]
        for row in conn.execute("SELECT event_id FROM phase1_events ORDER BY event_id")
    ]
    return {
        "integrity_check": integrity,
        "quick_check": quick,
        "foreign_key_violations": foreign_keys,
        "journal_mode": journal_mode,
        "event_ids": event_ids,
    }


def command_lock_hold(args: argparse.Namespace) -> int:
    lock_path = allowed_path(args.path, args.allowed_root)
    flags = os.O_RDWR | os.O_CREAT | os.O_APPEND | getattr(os, "O_NOFOLLOW", 0)
    descriptor = os.open(lock_path, flags, 0o600)
    with os.fdopen(descriptor, "a+", encoding="utf-8") as handle:
        fcntl.flock(handle.fileno(), fcntl.LOCK_EX)
        emit({"event": "lock-held", "pid": os.getpid()})
        sys.stdin.readline()
        fcntl.flock(handle.fileno(), fcntl.LOCK_UN)
    emit({"event": "lock-released", "pid": os.getpid()})
    return 0


def command_lock_try(args: argparse.Namespace) -> int:
    lock_path = allowed_path(args.path, args.allowed_root)
    flags = os.O_RDWR | os.O_CREAT | os.O_APPEND | getattr(os, "O_NOFOLLOW", 0)
    descriptor = os.open(lock_path, flags, 0o600)
    with os.fdopen(descriptor, "a+", encoding="utf-8") as handle:
        try:
            fcntl.flock(handle.fileno(), fcntl.LOCK_EX | fcntl.LOCK_NB)
        except OSError as error:
            if error.errno not in (errno.EACCES, errno.EAGAIN):
                raise
            emit({"acquired": False, "errno": error.errno})
            return 0
        emit({"acquired": True})
        fcntl.flock(handle.fileno(), fcntl.LOCK_UN)
    return 0


def command_sqlite_init(args: argparse.Namespace) -> int:
    db_path = allowed_path(args.db, args.allowed_root)
    conn = connect_db(db_path, args.timeout_ms)
    try:
        journal_mode = conn.execute("PRAGMA journal_mode = WAL").fetchone()[0]
        conn.executescript(
            """
            CREATE TABLE IF NOT EXISTS phase1_parent (
              id INTEGER PRIMARY KEY
            );
            CREATE TABLE IF NOT EXISTS phase1_events (
              event_id TEXT PRIMARY KEY,
              parent_id INTEGER NOT NULL REFERENCES phase1_parent(id),
              payload TEXT NOT NULL
            );
            INSERT OR IGNORE INTO phase1_parent(id) VALUES (1);
            """
        )
        conn.execute(
            "INSERT OR REPLACE INTO phase1_events(event_id, parent_id, payload) "
            "VALUES (?, 1, ?)",
            ("baseline", "committed"),
        )
        checkpoint = list(conn.execute("PRAGMA wal_checkpoint(TRUNCATE)").fetchone())
        emit({"journal_mode": journal_mode, "checkpoint": checkpoint, **sqlite_checks(conn)})
    finally:
        conn.close()
    return 0


def command_sqlite_hold(args: argparse.Namespace) -> int:
    db_path = allowed_path(args.db, args.allowed_root)
    conn = connect_db(db_path, args.timeout_ms)
    try:
        conn.execute("BEGIN IMMEDIATE")
        conn.execute(
            "INSERT INTO phase1_events(event_id, parent_id, payload) VALUES (?, 1, ?)",
            (args.event_id, "held"),
        )
        emit({"event": "transaction-held", "event_id": args.event_id})
        sys.stdin.readline()
        conn.execute("COMMIT")
        emit({"event": "transaction-committed", "event_id": args.event_id})
    finally:
        conn.close()
    return 0


def command_sqlite_insert(args: argparse.Namespace) -> int:
    db_path = allowed_path(args.db, args.allowed_root)
    conn = connect_db(db_path, args.timeout_ms)
    emit({"event": "write-attempt", "event_id": args.event_id})
    started = time.monotonic()
    try:
        conn.execute("BEGIN IMMEDIATE")
        waited_ms = round((time.monotonic() - started) * 1000)
        conn.execute(
            "INSERT INTO phase1_events(event_id, parent_id, payload) VALUES (?, 1, ?)",
            (args.event_id, "contender"),
        )
        conn.execute("COMMIT")
        emit({"committed": True, "event_id": args.event_id, "waited_ms": waited_ms})
    finally:
        conn.close()
    return 0


def command_sqlite_read(args: argparse.Namespace) -> int:
    db_path = allowed_path(args.db, args.allowed_root)
    conn = connect_db(db_path, args.timeout_ms)
    try:
        event_ids = [
            row[0]
            for row in conn.execute("SELECT event_id FROM phase1_events ORDER BY event_id")
        ]
        emit({"event_ids": event_ids})
    finally:
        conn.close()
    return 0


def command_sqlite_abrupt(args: argparse.Namespace) -> int:
    db_path = allowed_path(args.db, args.allowed_root)
    conn = connect_db(db_path, args.timeout_ms)
    conn.execute("BEGIN IMMEDIATE")
    conn.execute(
        "INSERT INTO phase1_events(event_id, parent_id, payload) VALUES (?, 1, ?)",
        (args.event_id, "abrupt-after-commit"),
    )
    conn.execute("COMMIT")
    os._exit(0)


def command_sqlite_check(args: argparse.Namespace) -> int:
    db_path = allowed_path(args.db, args.allowed_root)
    conn = connect_db(db_path, args.timeout_ms)
    try:
        checkpoint = list(conn.execute("PRAGMA wal_checkpoint(TRUNCATE)").fetchone())
        emit({"checkpoint": checkpoint, **sqlite_checks(conn)})
    finally:
        conn.close()
    return 0


def parser() -> argparse.ArgumentParser:
    root = argparse.ArgumentParser()
    root.add_argument(
        "command",
        choices=[
            "lock-hold",
            "lock-try",
            "sqlite-init",
            "sqlite-hold",
            "sqlite-insert",
            "sqlite-read",
            "sqlite-abrupt",
            "sqlite-check",
        ],
    )
    root.add_argument("--allowed-root", required=True)
    root.add_argument("--path")
    root.add_argument("--db")
    root.add_argument("--event-id")
    root.add_argument("--timeout-ms", type=int, default=5000)
    return root


def main() -> int:
    args = parser().parse_args()
    if args.command.startswith("lock-") and not args.path:
        raise ValueError("--path is required for lock commands")
    if args.command.startswith("sqlite-") and not args.db:
        raise ValueError("--db is required for sqlite commands")
    if args.command in ("sqlite-hold", "sqlite-insert", "sqlite-abrupt") and not args.event_id:
        raise ValueError("--event-id is required for this command")

    handlers = {
        "lock-hold": command_lock_hold,
        "lock-try": command_lock_try,
        "sqlite-init": command_sqlite_init,
        "sqlite-hold": command_sqlite_hold,
        "sqlite-insert": command_sqlite_insert,
        "sqlite-read": command_sqlite_read,
        "sqlite-abrupt": command_sqlite_abrupt,
        "sqlite-check": command_sqlite_check,
    }
    return handlers[args.command](args)


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except Exception as error:
        emit({"ok": False, "error": type(error).__name__, "message": str(error)})
        raise SystemExit(1)
