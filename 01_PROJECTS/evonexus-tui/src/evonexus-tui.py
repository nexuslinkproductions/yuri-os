#!/usr/bin/env python3
import sqlite3
import os
import time
import sys
from datetime import datetime
from rich.console import Console
from rich.layout import Layout
from rich.panel import Panel
from rich.table import Table
from rich.live import Live
from rich.text import Text
from rich import box
from rich.syntax import Syntax
from rich.align import Align

# Constants
DB_PATH = "/Users/marcelspatz/YURI/_SYSTEM/OS_KERNEL/memory.db"
PROJECT_DIR = "/Users/marcelspatz/YURI"

console = Console()

class EvoNexusTUI:
    def __init__(self):
        self.layout = self.make_layout()
        self.start_time = time.time()

    def make_layout(self) -> Layout:
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
            Layout(name="agents", ratio=1),
            Layout(name="resources", size=5),
        )
        layout["right"].split_column(
            Layout(name="tasks", ratio=2),
            Layout(name="memories", ratio=1),
        )
        return layout

    def get_conn(self):
        return sqlite3.connect(DB_PATH, timeout=30.0)

    def fetch_agents(self):
        try:
            with self.get_conn() as conn:
                cursor = conn.cursor()
                cursor.execute("SELECT agent_id, role, status FROM agents")
                return cursor.fetchall()
        except:
            return []

    def fetch_active_tasks(self):
        try:
            with self.get_conn() as conn:
                cursor = conn.cursor()
                cursor.execute("""
                    SELECT task_id, description, status, assigned_to, priority 
                    FROM tasks 
                    WHERE status NOT IN ('COMPLETED', 'FAILED')
                    ORDER BY priority DESC, created_at ASC
                    LIMIT 10
                """)
                return cursor.fetchall()
        except:
            return []

    def fetch_recent_memories(self):
        try:
            with self.get_conn() as conn:
                cursor = conn.cursor()
                cursor.execute("""
                    SELECT content, type, source_agent, timestamp 
                    FROM memories 
                    ORDER BY timestamp DESC 
                    LIMIT 10
                """)
                return cursor.fetchall()
        except:
            return []

    def generate_header(self):
        grid = Table.grid(expand=True)
        grid.add_column(justify="left", ratio=1)
        grid.add_column(justify="center", ratio=1)
        grid.add_column(justify="right", ratio=1)
        grid.add_row(
            f"[bold blue]YURI[/] [dim]v1.1.0[/]",
            "[bold white]EVONEXUS VESSEL COMMAND CENTER[/]",
            f"[dim]{datetime.now().strftime('%Y-%m-%d %H:%M:%S')}[/வதற்காக"
        )
        return Panel(grid, style="white on blue")

    def generate_agents_panel(self):
        table = Table(box=box.SIMPLE, expand=True)
        table.add_column("AGENT", style="bold cyan")
        table.add_column("ROLE", style="magenta")
        table.add_column("STATUS", justify="right")
        
        agents = self.fetch_agents()
        if not agents:
            table.add_row("No agents found", "", "")
        for a in agents:
            status_style = "green" if a[2] == "BUSY" else "white"
            table.add_row(a[0], a[1] or "UNASSIGNED", f"[{status_style}]{a[2]}[/]")
        return Panel(table, title="[bold green]THE CONCLAVE[/]", border_style="green")

    def generate_tasks_panel(self):
        table = Table(box=box.ROUNDED, expand=True)
        table.add_column("ID", justify="right", style="dim", width=4)
        table.add_column("DESCRIPTION", ratio=1)
        table.add_column("STATUS", justify="center")
        table.add_column("OWNER", style="magenta")
        
        tasks = self.fetch_active_tasks()
        for t in tasks:
            status_color = "green" if t[2] == "RUNNING" else "yellow"
            table.add_row(str(t[0]), t[1], f"[{status_color}]{t[2]}[/]", t[3] or "N/A")
        return Panel(table, title="[bold magenta]TASK SCHEDULER[/]", border_style="magenta")

    def generate_memories_panel(self):
        text = Text()
        mems = self.fetch_recent_memories()
        for m in mems:
            time_str = m[3].split(' ')[1] if ' ' in m[3] else m[3]
            text.append(f"[{time_str}] ", style="dim")
            text.append(f"{m[2]}: ", style="bold blue")
            text.append(f"{m[0][:100]}...\n")
        return Panel(text, title="[bold cyan]NEURAL MEMORY STREAM[/]", border_style="cyan")

    def generate_resources_panel(self):
        uptime = int(time.time() - self.start_time)
        uptime_str = f"{uptime // 3600:02}:{(uptime % 3600) // 60:02}:{uptime % 60:02}"
        grid = Table.grid(expand=True)
        grid.add_row(f"[bold]UPTIME:[/] {uptime_str}")
        grid.add_row(f"[bold]BUDGET:[/] [green]🟢 4.08M[/]")
        grid.add_row(f"[bold]BURN RATE:[/] 0.02 $/hr")
        return Panel(grid, title="[bold yellow]SYSTEM STATS[/]", border_style="yellow")

    def generate_footer(self):
        return Panel(
            Align.center("[dim]Press Ctrl+C to disconnect | [bold]LOGS:[/] _SYSTEM/OS_KERNEL/memory.db[/]"),
            style="white on black"
        )

    def update(self):
        self.layout["header"].update(self.generate_header())
        self.layout["agents"].update(self.generate_agents_panel())
        self.layout["tasks"].update(self.generate_tasks_panel())
        self.layout["memories"].update(self.generate_memories_panel())
        self.layout["resources"].update(self.generate_resources_panel())
        self.layout["footer"].update(self.generate_footer())

    def run(self):
        with Live(self.layout, refresh_per_second=2, screen=True) as live:
            while True:
                self.update()
                time.sleep(0.5)

if __name__ == "__main__":
    tui = EvoNexusTUI()
    try:
        tui.run()
    except KeyboardInterrupt:
        console.print("\n[bold red]SYSTEM DISCONNECTED[/]")
        sys.exit(0)
