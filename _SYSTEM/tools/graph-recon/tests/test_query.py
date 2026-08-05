"""M4-W2 query CLI tests — touchers / exec-path / protected / counts.

Tiny synthetic graph (deterministic constant, inline — no fixture file):
10 nodes, 10 edges. Exercises bidirectional touchers, dangling endpoints,
the exec/spawns/network edge vocabulary, a 2-hop shortest path with a
parallel candidate, unreachable + not_found negative controls, kind
filtering, per-kind counts, and byte-level determinism across runs.
"""
import io
import json
import subprocess
import sys
import tempfile
from contextlib import redirect_stdout
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

from reconloop.cli import cmd_query  # noqa: E402

NODES = [
    {"id": "script:run.sh", "kind": "script", "props": {}, "evidence": ["fixture"], "src": "q"},
    {"id": "file:main.py", "kind": "file", "props": {"exec_capable": True}, "evidence": ["fixture"], "src": "q"},
    {"id": "file:lib.py", "kind": "file", "props": {}, "evidence": ["fixture"], "src": "q"},
    {"id": "file:orphan.py", "kind": "file", "props": {}, "evidence": ["fixture"], "src": "q"},
    {"id": "service:svc", "kind": "service", "props": {}, "evidence": ["fixture"], "src": "q"},
    {"id": "process:p1", "kind": "process", "props": {}, "evidence": ["fixture"], "src": "q"},
    {"id": "protected_path:secret.pem", "kind": "protected_path", "props": {}, "evidence": ["fixture"], "src": "q"},
    {"id": "protected_path:.env", "kind": "protected_path", "props": {}, "evidence": ["fixture"], "src": "q"},
    {"id": "env_file:.env", "kind": "env_file", "props": {}, "evidence": ["fixture"], "src": "q"},
    {"id": "port:8080", "kind": "port", "props": {}, "evidence": ["fixture"], "src": "q"},
]
EDGES = [
    {"from": "script:run.sh", "to": "file:main.py", "kind": "spawns", "props": {}, "evidence": ["fixture"], "boundary": "none"},
    {"from": "file:main.py", "to": "file:lib.py", "kind": "executes", "props": {}, "evidence": ["fixture"], "boundary": "none"},
    {"from": "file:lib.py", "to": "service:svc", "kind": "calls", "props": {}, "evidence": ["fixture"], "boundary": "none"},
    {"from": "script:run.sh", "to": "process:p1", "kind": "exec", "props": {}, "evidence": ["fixture"], "boundary": "none"},
    {"from": "process:p1", "to": "port:8080", "kind": "network_conn", "props": {}, "evidence": ["fixture"], "boundary": "lan"},
    {"from": "process:p1", "to": "file:lib.py", "kind": "network", "props": {}, "evidence": ["fixture"], "boundary": "none"},
    {"from": "file:main.py", "to": "protected_path:secret.pem", "kind": "file_write", "props": {}, "evidence": ["fixture"], "boundary": "none"},
    {"from": "env_file:.env", "to": "file:main.py", "kind": "env_to_process", "props": {}, "evidence": ["fixture"], "boundary": "none"},
    {"from": "service:svc", "to": "host:db", "kind": "network_conn", "props": {}, "evidence": ["fixture"], "boundary": "lan"},
    {"from": "service:svc", "to": "protected_path:.env", "kind": "spawns", "props": {}, "evidence": ["fixture"], "boundary": "none"},
    # M5-W3 (defect 5): parallel non-exec edge on an exec-family hop — sorts
    # before 'exec' but must NEVER be emitted by exec-path (strict kind
    # filter on reconstruction), though it counts as a graph edge.
    {"from": "script:run.sh", "to": "process:p1", "kind": "calls", "props": {}, "evidence": ["fixture"], "boundary": "none"},
]


def write_graph() -> Path:
    """Fresh temp graph file (deterministic content; shuffled edge order to
    prove the loader sorts before answering)."""
    td = tempfile.mkdtemp(prefix="query_fixture_")
    p = Path(td) / "graph.jsonl"
    lines = [json.dumps(n, sort_keys=True) for n in NODES]
    edges_shuffled = [EDGES[2], EDGES[9], EDGES[0], EDGES[5], EDGES[1],
                      EDGES[7], EDGES[3], EDGES[8], EDGES[4], EDGES[6], EDGES[10]]
    lines += [json.dumps(e, sort_keys=True) for e in edges_shuffled]
    p.write_text("\n".join(lines) + "\n")
    return p


class Args:
    def __init__(self, graph: str, verb: str, **kw):
        self.graph = graph
        self.verb = verb
        self.node = kw.get("node")
        self.from_id = kw.get("from_id")
        self.to_id = kw.get("to_id")


def run_query(p: Path, verb: str, **kw) -> tuple[int, list]:
    out = io.StringIO()
    with redirect_stdout(out):
        rc = cmd_query(Args(str(p), verb, **kw))
    return rc, [json.loads(l) for l in out.getvalue().splitlines() if l.strip()]


def rec(id_: str) -> dict:
    return {n["id"]: n for n in NODES}[id_]


def edge(frm: str, to: str, kind: str) -> dict:
    for e in EDGES:
        if e["from"] == frm and e["to"] == to and e["kind"] == kind:
            return e
    raise AssertionError(f"edge {frm}->{to} {kind} not in fixture")


def test_query_touchers_bidirectional() -> None:
    """touchers: incoming AND outgoing edges count; output sorted by id."""
    p = write_graph()
    rc, lines = run_query(p, "touchers", node="file:main.py")
    assert rc == 0
    data, summary = lines[:-1], lines[-1]
    assert [d["id"] for d in data] == ["env_file:.env", "file:lib.py",
                                       "protected_path:secret.pem", "script:run.sh"]
    assert data[0] == rec("env_file:.env")
    assert data[1] == rec("file:lib.py")
    assert summary == {"query": "touchers", "status": "ok",
                       "node": "file:main.py", "count": 4}


def test_query_touchers_dangling_endpoint() -> None:
    """A node that exists only as an edge endpoint is a graph citizen:
    touchers host:db -> service:svc; touchers service:svc synthesizes the
    dangling neighbor record (id-prefix kind)."""
    p = write_graph()
    rc, lines = run_query(p, "touchers", node="host:db")
    assert rc == 0
    assert [d["id"] for d in lines[:-1]] == ["service:svc"]
    assert lines[-1] == {"query": "touchers", "status": "ok",
                         "node": "host:db", "count": 1}
    rc, lines = run_query(p, "touchers", node="service:svc")
    assert rc == 0
    assert [d["id"] for d in lines[:-1]] == ["file:lib.py", "host:db",
                                             "protected_path:.env"]
    synth = lines[1]
    assert synth["id"] == "host:db" and synth["kind"] == "host"
    assert synth["src"] == "query-synthetic"
    assert lines[-1] == {"query": "touchers", "status": "ok",
                         "node": "service:svc", "count": 3}


def test_query_touchers_empty_and_not_found() -> None:
    p = write_graph()
    rc, lines = run_query(p, "touchers", node="file:orphan.py")
    assert rc == 0 and lines == [{"query": "touchers", "status": "ok",
                                  "node": "file:orphan.py", "count": 0}]
    rc, lines = run_query(p, "touchers", node="file:nope.py")
    assert rc == 0 and lines == [{"query": "touchers", "status": "not_found",
                                  "node": "file:nope.py", "count": 0}]


def test_query_exec_path_shortest_two_hop() -> None:
    """run.sh -> port:8080: shortest exec-family path is run.sh --exec-->
    p1 --network_conn--> port:8080 (2 hops; the spawns/executes branch dead-
    ends on the excluded 'calls' edge)."""
    p = write_graph()
    rc, lines = run_query(p, "exec-path", from_id="script:run.sh",
                          to_id="port:8080")
    assert rc == 0
    assert lines[-1] == {"query": "exec-path", "status": "ok",
                         "from": "script:run.sh", "to": "port:8080",
                         "hops": 2, "visited": 5}
    # data = from node, edge, mid node, edge, to node (path order)
    assert [lines[0]["id"], lines[2]["id"], lines[4]["id"]] == \
        ["script:run.sh", "process:p1", "port:8080"]
    assert lines[1] == edge("script:run.sh", "process:p1", "exec")
    assert lines[3] == edge("process:p1", "port:8080", "network_conn")


def test_query_exec_path_deterministic_tie_break() -> None:
    """run.sh -> lib.py has TWO equal-length routes (spawns/executes vs
    exec/network). Sorted BFS expansion must pick the spawns->executes
    route every time."""
    p = write_graph()
    rc, lines = run_query(p, "exec-path", from_id="script:run.sh",
                          to_id="file:lib.py")
    assert rc == 0
    assert [lines[0]["id"], lines[2]["id"], lines[4]["id"]] == \
        ["script:run.sh", "file:main.py", "file:lib.py"]
    assert lines[1] == edge("script:run.sh", "file:main.py", "spawns")
    assert lines[3] == edge("file:main.py", "file:lib.py", "executes")
    assert lines[-1]["hops"] == 2
    # byte-identical on a second run (determinism)
    out1 = io.StringIO()
    with redirect_stdout(out1):
        cmd_query(Args(str(p), "exec-path", from_id="script:run.sh", to_id="file:lib.py"))
    out2 = io.StringIO()
    with redirect_stdout(out2):
        cmd_query(Args(str(p), "exec-path", from_id="script:run.sh", to_id="file:lib.py"))
    assert out1.getvalue() == out2.getvalue()


def test_query_exec_path_negative_controls() -> None:
    """unreachable (no exec-family route), not_found (unknown ids), and the
    zero-hop reflexive case."""
    p = write_graph()
    rc, lines = run_query(p, "exec-path", from_id="file:main.py",
                          to_id="port:8080")
    assert rc == 0
    assert lines == [{"query": "exec-path", "status": "unreachable",
                      "from": "file:main.py", "to": "port:8080",
                      "hops": 0, "visited": 2}]
    rc, lines = run_query(p, "exec-path", from_id="file:nope.py",
                          to_id="port:8080")
    assert rc == 0 and lines[-1]["status"] == "not_found"
    assert lines[-1]["missing"] == ["file:nope.py"]
    rc, lines = run_query(p, "exec-path", from_id="script:run.sh",
                          to_id="script:run.sh")
    assert rc == 0
    assert lines[0]["id"] == "script:run.sh" and len(lines) == 2
    assert lines[-1] == {"query": "exec-path", "status": "ok",
                         "from": "script:run.sh", "to": "script:run.sh",
                         "hops": 0, "visited": 1}


def test_query_protected_kind_filter() -> None:
    """protected = nodes of kind protected_path ONLY (env_file:.env is a
    protected surface but a different kind — excluded)."""
    p = write_graph()
    rc, lines = run_query(p, "protected")
    assert rc == 0
    assert [d["id"] for d in lines[:-1]] == ["protected_path:.env",
                                             "protected_path:secret.pem"]
    assert all(d["kind"] == "protected_path" for d in lines[:-1])
    assert lines[-1] == {"query": "protected", "status": "ok", "count": 2}


def test_query_exec_path_never_emits_excluded_parallel_kind() -> None:
    """M5-W3 (defect 5): a parallel edge whose kind is outside the exec
    vocabulary (calls — sorts before exec) must never be emitted on an
    exec-path route; reconstruction filters strictly to EXEC_PATH_KINDS."""
    p = write_graph()
    rc, lines = run_query(p, "exec-path", from_id="script:run.sh",
                          to_id="process:p1")
    assert rc == 0
    assert lines[-1] == {"query": "exec-path", "status": "ok",
                         "from": "script:run.sh", "to": "process:p1",
                         "hops": 1, "visited": 3}
    # the emitted hop edge is the exec edge, NOT the parallel calls edge
    assert lines[1] == edge("script:run.sh", "process:p1", "exec")
    # contract: every emitted edge record's kind is inside the exec vocabulary
    allowed = {"exec", "executes", "spawns", "network", "network_conn"}
    for r in lines[:-1]:
        if "from" in r and "to" in r:
            assert r["kind"] in allowed, r


def test_query_invalid_records_status_error_rc2() -> None:
    """M5-W3 (defect 5): '[]', '{"foo":1}' and other structurally invalid
    lines => a single status:error record listing the offending line numbers
    with rc 2 — never a silent ok with a partial answer."""
    td = Path(tempfile.mkdtemp(prefix="query_bad_"))
    g = td / "bad.jsonl"
    g.write_text('{"id":"a:1","kind":"node","props":{},"evidence":[],"src":"q"}\n'
                 '[]\n'
                 '{"foo":1}\n'
                 '{"id":"no-kind"}\n'
                 '{"from":"a:1","to":"b:2"}\n'
                 'not json at all\n'
                 '{"id":"b:2","kind":"node","props":{},"evidence":[],"src":"q"}\n')
    rc, lines = run_query(g, "counts")
    assert rc == 2
    assert len(lines) == 1, lines
    assert lines[0]["status"] == "error"
    assert lines[0]["lines"] == [2, 3, 4, 5, 6], lines[0]
    assert "line 2" in lines[0]["error"] and "line 6" in lines[0]["error"]
    # same record rejected for every verb (validation happens at load)
    rc2, lines2 = run_query(g, "touchers", node="a:1")
    assert rc2 == 2 and lines2[0]["lines"] == [2, 3, 4, 5, 6]
    # a valid graph still answers normally
    p = write_graph()
    rc, lines = run_query(p, "counts")
    assert rc == 0 and lines[-1]["status"] == "ok"


def test_query_counts_per_kind() -> None:
    p = write_graph()
    rc, lines = run_query(p, "counts")
    assert rc == 0
    data, summary = lines[:-1], lines[-1]
    assert summary == {"query": "counts", "status": "ok",
                       "nodes": 10, "edges": 11}
    by_key = {(d["record"], d["kind"]): d["count"] for d in data}
    assert by_key == {
        ("node", "env_file"): 1, ("node", "file"): 3, ("node", "port"): 1,
        ("node", "process"): 1, ("node", "protected_path"): 2,
        ("node", "script"): 1, ("node", "service"): 1,
        ("edge", "calls"): 2, ("edge", "env_to_process"): 1,
        ("edge", "exec"): 1, ("edge", "executes"): 1,
        ("edge", "file_write"): 1, ("edge", "network"): 1,
        ("edge", "network_conn"): 2, ("edge", "spawns"): 2,
    }
    keys = [(d["record"], d["kind"]) for d in data]
    # contract: node lines first (kinds sorted), then edge lines (kinds sorted)
    assert keys[:7] == [("node", "env_file"), ("node", "file"),
                        ("node", "port"), ("node", "process"),
                        ("node", "protected_path"), ("node", "script"),
                        ("node", "service")], keys
    assert keys[7:] == [("edge", k) for k in
                        ("calls", "env_to_process", "exec", "executes",
                         "file_write", "network", "network_conn", "spawns")], keys


def test_query_missing_graph_file_fails_closed() -> None:
    """Missing/unreadable graph => single status:error record + rc 1 (no
    partial output)."""
    rc, lines = run_query(Path("/nonexistent/graph.jsonl"), "counts")
    assert rc == 1
    assert len(lines) == 1 and lines[0]["status"] == "error"


def test_query_cli_subprocess_smoke() -> None:
    """The real CLI entrypoint: python3 -m reconloop.cli query ... counts."""
    p = write_graph()
    proc = subprocess.run([sys.executable, "-m", "reconloop.cli", "query",
                           "--graph", str(p), "counts"],
                          cwd=str(ROOT), capture_output=True, text=True,
                          timeout=120)
    assert proc.returncode == 0, proc.stderr
    lines = [json.loads(l) for l in proc.stdout.splitlines() if l.strip()]
    assert lines[-1] == {"query": "counts", "status": "ok",
                         "nodes": 10, "edges": 11}


if __name__ == "__main__":
    for fn in (test_query_touchers_bidirectional,
               test_query_touchers_dangling_endpoint,
               test_query_touchers_empty_and_not_found,
               test_query_exec_path_shortest_two_hop,
               test_query_exec_path_deterministic_tie_break,
               test_query_exec_path_negative_controls,
               test_query_exec_path_never_emits_excluded_parallel_kind,
               test_query_invalid_records_status_error_rc2,
               test_query_protected_kind_filter,
               test_query_counts_per_kind,
               test_query_missing_graph_file_fails_closed,
               test_query_cli_subprocess_smoke):
        fn()
        print(f"OK {fn.__name__}")
    print("test_query OK (all)")
