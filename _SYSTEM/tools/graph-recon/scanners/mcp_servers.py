"""P2 port: MCP configs -> mcp_server nodes + registration edges (mjs F-025 logic)."""
from __future__ import annotations
import glob, json, os
from .base import BaseScanner, ScanResult
from reconloop.model import Node, Edge

CONFIG_PATHS = [".mcp.json", os.path.expanduser("~/.cursor/mcp.json"), ".codex/config.toml"]

class McpServersScanner(BaseScanner):
    name = "mcp_servers"; dim = "config"
    def run(self, ctx) -> ScanResult:
        r = ScanResult()
        seen = set()
        for rel in CONFIG_PATHS:
            p = ctx.abs(rel)
            if not p.exists(): continue
            try: data = json.loads(p.read_text())
            except Exception: continue
            for name, cfg in (data.get("mcpServers") or {}).items():
                if name in seen: continue
                seen.add(name)
                r.nodes.append(Node(id=f"mcp_server:{name}", kind="mcp_server",
                                    props={"scan_state": "scanned", "disabled": cfg.get("disabled", False)},
                                    evidence=[rel], src="mcp_servers"))
                r.edges.append(Edge(from_=f"harness_config:{rel}", to=f"mcp_server:{name}",
                                    kind="mcp_registration", props={}, evidence=[rel], boundary="local"))
        return r
