#!/usr/bin/env python3
import sqlite3
import os
import time
import subprocess
from datetime import datetime
from rich.console import Console
from rich.layout import Layout
from rich.panel import Panel
from rich.table import Table
from rich.live import Live
from rich.text import Text
from rich import box

# Paths
DB_PATH = os.path.abspath(os.path.join(os.path.dirname(__file__), 'memory.db'))
TOKEN_ORCHESTRATOR = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', 'token-orchestrator.sh'))

console = Console()

def get_conn():
    return sqlite3.connect(DB_PATH, timeout=30.0)

def get_agents():
    with get_conn() as conn:
        cursor = conn.cursor()
        cursor.execute("SELECT agent_id, role, status FROM agents")
        return cursor.fetchall()

def get_active_tasks():
    with get_conn() as conn:
        cursor = conn.cursor()
        cursor.execute("""
            SELECT task_id, description, status, assigned_to, priority 
            FROM tasks 
            WHERE status NOT IN ('COMPLETED', 'FAILED')
            ORDER BY priority DESC, created_at ASC
            LIMIT 10
        """)
        return cursor.fetchall()

def get_recent_memories():
    with get_conn() as conn:
        cursor = conn.cursor()
        cursor.execute("""
            SELECT content, type, source_agent, timestamp 
            FROM memories 
            ORDER BY timestamp DESC 
            LIMIT 8
        """)
        return cursor.fetchall()

def get_token_status():
    try:
        # Mocking or calling the real script if possible
        # result = subprocess.check_output([TOKEN_ORCHESTRATOR, "status"], stderr=subprocess.STDOUT, text=True)
        # return result.split('\n')[0] # First line for brevity
        return "Budget: 🟢 4.08M | Used: 0.1M (2%)"
    except:
        return "Token Monitor: OFFLINE"

def make_layout() -> Layout:
    layout = Layout()
    layout.split(
        Layout(name="header", size=3),
        Layout(name="main"),
        Layout(name="footer", size=3),
    )
    layout["main"].split_row(
        Layout(name="left", ratio=1),
        Layout(name="right", ratio=2),
    )
    layout["left"].split_column(
        Layout(name="agents"),
        Layout(name="resources"),
    )
    layout["right"].split_column(
        Layout(name="tasks"),
        Layout(name="memories"),
    )
    return layout

def generate_table_tasks():
    table = Table(title="[bold blue]ACTIVE PROCESSES", box=box.SIMPLE_HEAD, expand=True)
    table.add_column("ID", justify="right", style="cyan", no_wrap=True)
    table.add_column("Agent", style="magenta")
    table.add_column("Status", justify="center")
    table.add_column("Description", ratio=1)
    
    tasks = get_active_tasks()
    for t in tasks:
        status_color = "green" if t[2] == "RUNNING" else "yellow"
        table.add_row(str(t[0]), t[3] or "NONE", f"[{status_color}]{t[2]}[/]", t[1])
    return table

def generate_panel_agents():
    table = Table(title="[bold green]THE CONCLAVE", box=box.SIMPLE, expand=True)
    table.add_column("ID", style="bold")
    table.add_column("Status", justify="right")
    
    agents = get_agents()
    for a in agents:
        status_color = "green" if a[2] == "BUSY" else "white"
        table.add_row(a[0], f"[{status_color}]{a[2]}[/]")
    return Panel(table, title="[bold]Agents", border_style="green")

def generate_panel_memories():
    text = Text()
    mems = get_recent_memories()
    for m in mems:
        time_str = m[3].split(' ')[1]
        text.append(f"[{time_str}] ", style="dim")
        text.append(f"{m[2]}: ", style="bold blue")
        text.append(f"{m[0][:60]}...\n")
    return Panel(text, title="[bold]Recent Memories", border_style="blue")

def generate_panel_resources():
    status = get_token_status()
    return Panel(Text(status, justify="center"), title="[bold]Resources", border_style="yellow")

def update_dashboard(layout):
    layout["header"].update(Panel(Text("NUDIMMUD AGENTIC OS | KERNEL v1.0", justify="center", style="bold white on blue")))
    layout["agents"].update(generate_panel_agents())
    layout["resources"].update(generate_panel_resources())
    layout["tasks"].update(generate_panel_tasks_container())
    layout["memories"].update(generate_panel_memories())
    layout["footer"].update(Panel(Text(f"Press Ctrl+C to exit | Last sync: {datetime.now().strftime('%H:%M:%S')}", justify="center", style="dim")))

def generate_panel_tasks_container():
    return Panel(generate_table_tasks(), title="[bold]Task Scheduler", border_style="magenta")

if __name__ == "__main__":
    layout = make_layout()
    try:
        with Live(layout, refresh_per_second=1, screen=True) as live:
            while True:
                update_dashboard(layout)
                time.sleep(1)
    except KeyboardInterrupt:
        pass
