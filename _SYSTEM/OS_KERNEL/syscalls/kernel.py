#!/usr/bin/env python3
import sqlite3
import os
import sys
import json
import argparse
from datetime import datetime

# Path to the shared RAM
DB_PATH = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', 'memory.db'))

def get_conn():
    conn = sqlite3.connect(DB_PATH, timeout=30.0)
    conn.execute("PRAGMA journal_mode=WAL;")
    return conn

def task_create(description, priority=1, assigned_to=None, parent_id=None, metadata=None):
    with get_conn() as conn:
        cursor = conn.cursor()
        cursor.execute("""
            INSERT INTO tasks (description, priority, assigned_to, parent_id, metadata_json)
            VALUES (?, ?, ?, ?, ?)
        """, (description, priority, assigned_to, parent_id, json.dumps(metadata) if metadata else None))
        task_id = cursor.lastrowid
        print(f"Task {task_id} created: {description}")
        return task_id

def task_update(task_id, status, result=None):
    with get_conn() as conn:
        cursor = conn.cursor()
        cursor.execute("""
            UPDATE tasks 
            SET status = ?, result = ?, updated_at = CURRENT_TIMESTAMP
            WHERE task_id = ?
        """, (status, result, task_id))
        print(f"Task {task_id} updated to {status}")

def mem_log(content, mem_type='episodic', source_agent=None, tags=None, importance=1):
    with get_conn() as conn:
        cursor = conn.cursor()
        cursor.execute("""
            INSERT INTO memories (content, type, source_agent, tags, importance)
            VALUES (?, ?, ?, ?, ?)
        """, (content, mem_type, source_agent, json.dumps(tags) if tags else None, importance))
        mem_id = cursor.lastrowid
        print(f"Memory {mem_id} logged [{mem_type}]: {content[:50]}...")
        return mem_id

def handoff(task_id, from_agent, to_agent, note, snapshot=None):
    with get_conn() as conn:
        cursor = conn.cursor()
        cursor.execute("""
            INSERT INTO context_switches (task_id, from_agent, to_agent, handoff_note, snapshot_path)
            VALUES (?, ?, ?, ?, ?)
        """, (task_id, from_agent, to_agent, note, snapshot))
        print(f"Handoff recorded for Task {task_id}: {from_agent} -> {to_agent}")

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="NUDIMMUD OS Kernel Syscall Interface")
    subparsers = parser.add_subparsers(dest="command")

    # task-create
    p_tc = subparsers.add_parser("task-create")
    p_tc.add_argument("description")
    p_tc.add_argument("--priority", type=int, default=1)
    p_tc.add_argument("--agent")
    p_tc.add_argument("--parent", type=int)

    # task-update
    p_tu = subparsers.add_parser("task-update")
    p_tu.add_argument("task_id", type=int)
    p_tu.add_argument("status", choices=["PENDING", "RUNNING", "COMPLETED", "FAILED"])
    p_tu.add_argument("--result")

    # mem-log
    p_ml = subparsers.add_parser("mem-log")
    p_ml.add_argument("content")
    p_ml.add_argument("--type", default="episodic")
    p_ml.add_argument("--agent")
    p_ml.add_argument("--importance", type=int, default=1)

    # handoff
    p_ho = subparsers.add_parser("handoff")
    p_ho.add_argument("task_id", type=int)
    p_ho.add_argument("from_agent")
    p_ho.add_argument("to_agent")
    p_ho.add_argument("note")

    args = parser.parse_args()

    if args.command == "task-create":
        task_create(args.description, args.priority, args.agent, args.parent)
    elif args.command == "task-update":
        task_update(args.task_id, args.status, args.result)
    elif args.command == "mem-log":
        mem_log(args.content, args.type, args.agent, importance=args.importance)
    elif args.command == "handoff":
        handoff(args.task_id, args.from_agent, args.to_agent, args.note)
    else:
        parser.print_help()
