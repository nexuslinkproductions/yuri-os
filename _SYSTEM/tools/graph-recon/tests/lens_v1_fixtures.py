"""Lens Family V1 fixture — shared clean fixture (lens-v1-design.md §4).

Temp git repo + hand-built graph JSONL. All classes present-but-clean so a
negative control passing is meaningful (absence would mask bugs):

security_path clean:
- port:8080 + network_conn process:p1@1 -> port:8080 (lan) — p1 NON-exec
- mcp_server:clean + mcp_registration (local) — no outgoing flow
- env_file:backend/.env + env_to_process -> file:consumer.sh — consumer non-exec
- exec scripts svc-a/svc-b/svc-c (kind script) + launchd edge (local) +
  spawns svc-a -> svc-b (none) + file_write svc-b -> /tmp/out.json (none)
- expected: 0 cards (no boundary edge reachable from a root through exec)

writer_to_protected clean:
- writer-a.mjs dynamic (write_calls 2, literal 1, dynamic 1) + file_write ->
  /tmp/log.json (not protected)
- writer-lit.mjs literal-only (dynamic 0) + file_write -> backend/data/cache.json
  (protected, but literal-only => v0's domain, must NOT card here)
- protected_path:backend/data, file:backend/data/cache.json,
  file:_SYSTEM/OS_KERNEL/memory.db present
- expected: 0 cards (dynamic writers have empty protected reach)
"""
from __future__ import annotations
import json
import subprocess
import tempfile
from pathlib import Path


def git(repo: Path, *args: str) -> None:
    subprocess.run(["git", "-C", str(repo), *args], check=True, capture_output=True)


def _node(nid: str, kind: str, props=None, evidence=None):
    return {"id": nid, "kind": kind, "props": props or {},
            "evidence": evidence or ["fixture"], "src": "fixture"}


def _edge(f: str, t: str, kind: str, boundary="none", props=None):
    return {"from": f, "to": t, "kind": kind, "props": props or {},
            "evidence": ["fixture"], "boundary": boundary}


def build_v1_fixture() -> tuple[Path, str, Path]:
    td = tempfile.mkdtemp(prefix="lens-v1-fixture-")
    repo = Path(td) / "repo"
    repo.mkdir()
    git(repo, "init", "-b", "main")
    git(repo, "config", "user.email", "t@t")
    git(repo, "config", "user.name", "t")
    files = {
        "_SYSTEM/Scripts/svc-a.mjs": "export const a = 1;\n",
        "_SYSTEM/Scripts/svc-b.mjs": "export const b = 1;\n",
        "_SYSTEM/Scripts/svc-c.mjs": "export const c = 1;\n",
        "_SYSTEM/Scripts/consumer.sh": "#!/bin/sh\necho ok\n",
        "_SYSTEM/Scripts/writer-a.mjs": "import fs from 'fs'; fs.writeFileSync(target, 'x');\n",
        "_SYSTEM/Scripts/writer-b.mjs": "import fs from 'fs'; fs.writeFileSync(target, 'x');\n",
        "_SYSTEM/Scripts/writer-lit.mjs": "fs.writeFileSync('backend/data/cache.json', 'x');\n",
        "_SYSTEM/Scripts/helper.mjs": "export const h = 1;\n",
        "backend/data/cache.json": "{}\n",
        "_SYSTEM/OS_KERNEL/memory.db": "\x00",
    }
    for rel, content in files.items():
        p = repo / rel
        p.parent.mkdir(parents=True, exist_ok=True)
        p.write_bytes(content.encode() if isinstance(content, str) else content)
    git(repo, "add", "-A")
    git(repo, "commit", "-m", "v1 clean fixture")
    rev = subprocess.run(["git", "-C", str(repo), "rev-parse", "HEAD"],
                         capture_output=True, text=True).stdout.strip()

    recs = []
    # writer files get their writer-props records below; a plain {tracked: true}
    # record would sort last (canonical JSON) and shadow the props via last-wins
    # dedup in load_graph, so skip them in the file-inventory loop.
    writer_files = {
        "_SYSTEM/Scripts/writer-a.mjs",
        "_SYSTEM/Scripts/writer-b.mjs",
        "_SYSTEM/Scripts/writer-lit.mjs",
    }
    for rel in sorted(files):
        if rel in writer_files:
            continue
        recs.append(_node(f"file:{rel}", "file", {"tracked": True}))
    # untrusted roots
    recs.append(_node("port:8080", "port"))
    recs.append(_node("process:p1@1", "process"))
    recs.append(_node("mcp_server:clean", "mcp_server"))
    recs.append(_node("harness_config:.mcp.json", "harness_config"))
    recs.append(_node("env_file:backend/.env", "env_file"))
    # exec scripts + launchd
    for s in ("svc-a.mjs", "svc-b.mjs", "svc-c.mjs"):
        recs.append(_node(f"file:_SYSTEM/Scripts/{s}", "script"))
    recs.append(_node("launchd_agent:com.clean.a", "launchd_agent",
                      props={"exec_capable": True}))
    # writers
    recs.append(_node("file:_SYSTEM/Scripts/writer-a.mjs", "file",
                      props={"write_calls": 2, "literal_targets": 1,
                             "dynamic_targets": 1, "note": "dynamic write targets"}))
    recs.append(_node("file:_SYSTEM/Scripts/writer-b.mjs", "file",
                      props={"write_calls": 2, "literal_targets": 1,
                             "dynamic_targets": 1, "note": "dynamic write targets"}))
    recs.append(_node("file:_SYSTEM/Scripts/writer-lit.mjs", "file",
                      props={"write_calls": 1, "literal_targets": 1,
                             "dynamic_targets": 0}))
    recs.append(_node("file:_SYSTEM/Scripts/helper.mjs", "file"))
    # protected surfaces
    recs.append(_node("protected_path:backend/data", "protected_path"))
    # edges (clean)
    recs.append(_edge("process:p1@1", "port:8080", "network_conn", boundary="lan"))
    recs.append(_edge("harness_config:.mcp.json", "mcp_server:clean", "mcp_registration", boundary="local"))
    recs.append(_edge("env_file:backend/.env", "file:_SYSTEM/Scripts/consumer.sh", "env_to_process"))
    recs.append(_edge("launchd_agent:com.clean.a", "file:_SYSTEM/Scripts/svc-a.mjs", "launchd_to_script", boundary="local"))
    recs.append(_edge("file:_SYSTEM/Scripts/svc-a.mjs", "file:_SYSTEM/Scripts/svc-b.mjs", "spawns"))
    recs.append(_edge("file:_SYSTEM/Scripts/svc-b.mjs", "file:/tmp/out.json", "file_write"))
    recs.append(_edge("file:_SYSTEM/Scripts/writer-lit.mjs", "file:backend/data/cache.json", "file_write"))
    recs.append(_edge("file:_SYSTEM/Scripts/writer-a.mjs", "file:/tmp/log.json", "file_write"))

    graph_path = Path(td) / "graph.jsonl"
    with open(graph_path, "w") as f:
        for r in sorted(recs, key=lambda r: json.dumps(r, sort_keys=True)):
            f.write(json.dumps(r, sort_keys=True) + "\n")
    return repo, rev, graph_path
