"""M2 lens fixture builder — clean synthetic repo + graph (negative control).

Builds a temp git repo whose file layer + registries are all CLEAN for the 6
grammar lenses:
  - route_binding: 2 identities, each with role + canary-proven route
  - protected_writer: file_write edges only to non-protected targets
  - hook_projection: every coreEntrypoint exists as a file node
  - mcp_registration: every mcp_server has a registration edge
  - launchd_existence: every launchd target exists in the file layer
  - env_to_process: every env_file has an incident env_to_process edge

Returns (repo_root, revision, graph_path, ctx_kwargs). Deterministic.
"""
from __future__ import annotations
import json
import subprocess
import tempfile
from pathlib import Path

ROUTE_REG = "_SYSTEM/config/provider-route-registry.json"
HOOK_REG = "_SYSTEM/config/yuri-hook-registry.json"

CLEAN_ROUTE_REG = {
    "schemaVersion": "yuri-provider-route-v1",
    "modelIdentities": {
        "glm-5.2": {
            "role": "architect",
            "routes": [{"id": "glm-5.2.zai", "provider": "zai", "surface": "omp-native",
                        "model": "zai/glm-5.2", "agentId": "mure-architect",
                        "status": "canary-proven", "source": "fixture"}]
        },
        "mini-max-m3": {
            "role": "bounded-worker",
            "routes": [{"id": "m3.minimax", "provider": "minimax", "surface": "direct-api",
                        "model": "MiniMax-M3", "agentId": "m3-worker",
                        "status": "canary-passing", "source": "fixture"}]
        },
    },
}

CLEAN_HOOK_REG = {
    "schemaVersion": 1,
    "kind": "yuri-universal-hook-registry",
    "hooks": [
        {"hookId": "yuri.pre-tool.enforcement", "logicalEvent": "PreToolUse",
         "owner": "YURI", "coreEntrypoint": "_SYSTEM/Scripts/yuri-hook-adapter.mjs",
         "enabled": True, "required": True},
        {"hookId": "yuri.energy.tick", "logicalEvent": "PostToolUse",
         "owner": "YURI", "coreEntrypoint": "_SYSTEM/Scripts/energy-tick-adapter.mjs",
         "enabled": True, "required": False},
    ],
}


def git(repo: Path, *args: str) -> None:
    subprocess.run(["git", "-C", str(repo), *args], check=True, capture_output=True)


def _node(nid: str, kind: str, props=None, evidence=None):
    return {"id": nid, "kind": kind, "props": props or {},
            "evidence": evidence or ["fixture"], "src": "fixture"}


def _edge(f: str, t: str, kind: str, boundary="none", props=None):
    return {"from": f, "to": t, "kind": kind, "props": props or {},
            "evidence": ["fixture"], "boundary": boundary}


def build_clean_fixture() -> tuple[Path, str, Path]:
    """Create temp repo + clean graph. Returns (repo_root, revision, graph_path)."""
    td = tempfile.mkdtemp(prefix="lens-fixture-")
    repo = Path(td) / "repo"
    repo.mkdir()
    git(repo, "init", "-b", "main")
    git(repo, "config", "user.email", "t@t")
    git(repo, "config", "user.name", "t")
    # tracked files (the file layer)
    files = {
        "_SYSTEM/Scripts/yuri-hook-adapter.mjs": "export const x = 1;\n",
        "_SYSTEM/Scripts/energy-tick-adapter.mjs": "export const x = 1;\n",
        "_SYSTEM/Scripts/eot-refresh.sh": "#!/bin/sh\necho ok\n",
        "_SYSTEM/Scripts/task-queue.mjs": "export const q = 1;\n",
        "backend/.env": "KEY=value\n",
        "_SYSTEM/yuri-os/.env": "KEY=value\n",
        # consumer that references backend/.env (env_process_edges scanner input)
        "_SYSTEM/Scripts/consumer.sh": "#!/bin/sh\nsource backend/.env\n",
        "service.json": '{"env_file": "backend/.env"}\n',
    }
    for rel, content in files.items():
        p = repo / rel
        p.parent.mkdir(parents=True, exist_ok=True)
        p.write_text(content)
    regs = {ROUTE_REG: json.dumps(CLEAN_ROUTE_REG, indent=2),
            HOOK_REG: json.dumps(CLEAN_HOOK_REG, indent=2)}
    for rel, content in regs.items():
        p = repo / rel
        p.parent.mkdir(parents=True, exist_ok=True)
        p.write_text(content)
    git(repo, "add", "-A")
    git(repo, "commit", "-m", "clean fixture")
    rev = subprocess.run(["git", "-C", str(repo), "rev-parse", "HEAD"],
                         capture_output=True, text=True).stdout.strip()
    # clean graph: file layer + registry nodes + clean edges
    recs = []
    for rel in sorted(files):
        recs.append(_node(f"file:{rel}", "file", {"tracked": True}))
    for rel in sorted(regs):
        recs.append(_node(f"registry:{rel}", "registry_entry",
                          {"entries": 1, "scan_state": "pending"}))
    # mcp servers all registered
    recs.append(_node("mcp_server:voice", "mcp_server"))
    recs.append(_node("harness_config:.mcp.json", "harness_config"))
    recs.append(_edge("harness_config:.mcp.json", "mcp_server:voice", "mcp_registration", boundary="local"))
    # launchd targets all exist
    recs.append(_node("launchd_agent:com.test.eot", "launchd_agent"))
    recs.append(_edge("launchd_agent:com.test.eot", "file:_SYSTEM/Scripts/eot-refresh.sh",
                      "launchd_to_script", boundary="local"))
    recs.append(_node("launchd_agent:com.test.queue", "launchd_agent"))
    recs.append(_edge("launchd_agent:com.test.queue", "file:_SYSTEM/Scripts/task-queue.mjs",
                      "launchd_to_script", boundary="local"))
    # env files all connected via env_to_process
    recs.append(_edge("env_file:backend/.env", "process:svc@1", "env_to_process"))
    recs.append(_edge("env_file:_SYSTEM/yuri-os/.env", "process:svc@2", "env_to_process"))
    recs.append(_node("process:svc@1", "process"))
    recs.append(_node("process:svc@2", "process"))
    # file_write to non-protected target only
    recs.append(_edge("file:_SYSTEM/Scripts/task-queue.mjs", "file:/tmp/queue-state.json", "file_write"))
    # env_file nodes must exist as nodes too
    recs.append(_node("env_file:backend/.env", "env_file"))
    recs.append(_node("env_file:_SYSTEM/yuri-os/.env", "env_file"))
    graph_path = Path(td) / "graph.jsonl"
    with open(graph_path, "w") as f:
        for r in sorted(recs, key=lambda r: json.dumps(r, sort_keys=True)):
            f.write(json.dumps(r, sort_keys=True) + "\n")
    return repo, rev, graph_path
