#!/usr/bin/env python3
import sqlite3
import os
import json
import argparse
import time
from datetime import datetime
from memory_governor import health as memory_health, manage as memory_manage

DB_PATH = os.path.abspath(os.path.join(os.path.dirname(__file__), 'memory.db'))

CONCLAVE_ORDER = ['ENLIL', 'NABU', 'ENKI', 'INANNA']

def get_conn():
    return sqlite3.connect(DB_PATH, timeout=30.0)

def get_active_tasks():
    with get_conn() as conn:
        cursor = conn.cursor()
        cursor.execute("""
            SELECT task_id, description, status, assigned_to, priority 
            FROM tasks 
            WHERE status NOT IN ('COMPLETED', 'FAILED')
            ORDER BY priority DESC, created_at ASC
        """)
        return cursor.fetchall()

def suggest_next_action(tasks):
    if not tasks:
        return "No active tasks. System IDLE."
    
    top_task = tasks[0]
    task_id, desc, status, assigned, priority = top_task
    
    if status == 'PENDING' and not assigned:
        return f"ENLIL should start task {task_id}: {desc}"
    
    if status == 'RUNNING':
        return f"{assigned} is currently working on task {task_id}: {desc}"
    
    # If a task is COMPLETED by one agent, the scheduler would ideally 
    # assign the next step or agent. This logic would be expanded in Phase 4.
    return f"Task {task_id} is in state {status}. Manual intervention or handoff required."

def print_status_line():
    tasks = get_active_tasks()
    suggestion = suggest_next_action(tasks)
    governor_health = memory_health()
    
    print("\n" + "="*50)
    print(f"NUDIMMUD OS KERNEL | {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
    print(f"ACTIVE PROCESSES: {len(tasks)}")
    print(
        "MEMORY GOVERNOR: "
        f"items={governor_health['total']} "
        f"stale_ratio={governor_health['stale_ratio']} "
        f"suppressed={governor_health['suppressed']} "
        f"conflicts={governor_health['conflicts']}"
    )
    print("="*50)
    
    for t in tasks:
        print(f"[{t[2]}] ID:{t[0]} | {t[3] if t[3] else 'UNASSIGNED'} | {t[1]}")
    
    print("-" * 50)
    print(f"NEXT ACTION: {suggestion}")
    print("="*50 + "\n")

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="NUDIMMUD OS Kernel Scheduler")
    parser.add_argument("--loop", action="store_true", help="Run in continuous monitoring mode")
    parser.add_argument("--interval", type=int, default=10, help="Refresh interval for loop mode (seconds)")
    parser.add_argument("--memory-governor", choices=["daily", "weekly", "monthly"], help="Run a governed memory lifecycle cycle")
    
    args = parser.parse_args()

    if args.memory_governor:
        result = memory_manage(args.memory_governor)
        print(json.dumps(result, indent=2, default=str))
        raise SystemExit(0)
    
    if args.loop:
        try:
            while True:
                os.system('clear')
                print_status_line()
                time.sleep(args.interval)
        except KeyboardInterrupt:
            print("\nScheduler stopped.")
    else:
        print_status_line()
