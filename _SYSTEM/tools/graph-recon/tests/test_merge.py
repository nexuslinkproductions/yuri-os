"""M1.6 (F-040): merge id-dedup tests — keep-last policy, conflict report, zero dups."""
import json
import sys
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

from reconloop.merge import dedup_by_id  # noqa: E402
from reconloop.cli import cmd_merge  # noqa: E402


def test_dedup_keep_last_and_conflict_policy() -> None:
    lines = [
        json.dumps({"id": "file:a.py", "kind": "file", "props": {"v": 1}, "evidence": ["l1"], "src": "s1"}),
        json.dumps({"id": "file:b.py", "kind": "file", "props": {}, "evidence": ["l1"], "src": "s1"}),
        json.dumps({"id": "file:a.py", "kind": "file", "props": {"v": 2}, "evidence": ["l2"], "src": "s2"}),
        json.dumps({"from": "x", "to": "y", "kind": "tests", "props": {}, "evidence": [], "boundary": "none"}),
        # identical repeat of b
        json.dumps({"id": "file:b.py", "kind": "file", "props": {}, "evidence": ["l1"], "src": "s1"}),
    ]
    out, report = dedup_by_id(lines)
    assert report["duplicates_removed"] == 2, report
    assert report["conflicting_ids"] == 1, report  # a.py differs; b.py identical
    assert report["unique_ids"] == 2
    assert "file:a.py" in report["conflicts"]
    assert report["conflicts"]["file:a.py"]["differing"] is True
    assert report["conflicts"]["file:b.py"]["differing"] is False
    # keep-last: a.py keeps v:2 (s2)
    kept_a = json.loads([l for l in out if '"file:a.py"' in l][0])
    assert kept_a["props"]["v"] == 2 and kept_a["src"] == "s2"
    # edge passes through unchanged; one record per id
    recs = [json.loads(l) for l in out]
    ids = [r["id"] for r in recs if "id" in r and "from" not in r]
    assert len(ids) == len(set(ids)) == 2, "zero dups post-merge"
    assert any("from" in r for r in recs), "edges preserved"


def test_merge_zero_dups_fixture() -> None:
    """M1.6: cmd_merge output has zero duplicate node ids (v3 regression fixture)."""
    with tempfile.TemporaryDirectory() as td:
        td = Path(td)
        layers = td / "layers"; layers.mkdir()
        # two layers with overlapping ids (the F-040 pattern: file_inventory +
        # writers both emitting file: nodes)
        (layers / "a.jsonl").write_text(
            json.dumps({"id": "file:x.py", "kind": "file", "props": {}, "evidence": ["a"], "src": "a"}) + "\n" +
            json.dumps({"id": "file:y.py", "kind": "file", "props": {}, "evidence": ["a"], "src": "a"}) + "\n")
        (layers / "b.jsonl").write_text(
            json.dumps({"id": "file:y.py", "kind": "file", "props": {"w": 1}, "evidence": ["b"], "src": "b"}) + "\n" +
            json.dumps({"id": "file:z.py", "kind": "file", "props": {}, "evidence": ["b"], "src": "b"}) + "\n")
        graph, pin = td / "graph.jsonl", td / "graph.sha256"

        class Args:
            def __init__(self):
                self.layers = str(layers); self.graph = str(graph); self.pin = str(pin)

        rc = cmd_merge(Args())
        assert rc == 0
        recs = [json.loads(l) for l in graph.read_text().splitlines() if l.strip()]
        ids = [r["id"] for r in recs if "id" in r]
        assert len(ids) == len(set(ids)) == 3, f"zero dups expected, got {ids}"
        # keep-last: file:y.py from layer b
        y = next(r for r in recs if r.get("id") == "file:y.py")
        assert y["src"] == "b" and y["props"] == {"w": 1}
        # dup report emitted next to pin
        report = json.loads((td / "graph.dedup-report.json").read_text())
        assert report["duplicates_removed"] == 1
        assert report["conflicts"]["file:y.py"]["differing"] is True
        assert report["policy"] == "last"


def test_v3_input_dup_count_matches_orion() -> None:
    """M1.6 evidence: the pinned v3 input must carry exactly 229 duplicate node
    records and +416 net-new unique after synthesis (F-040, Orion-verified)."""
    from reconloop.context import ScanContext
    from reconloop.graphio import load_graph
    v3 = Path("/tmp/yuri-recon/m1-input-full-graph.jsonl")
    if not v3.exists():
        print("SKIP test_v3_input_dup_count_matches_orion (no local v3 input)")
        return
    raw_nodes = 0
    ids = set()
    for l in v3.read_text().splitlines():
        d = json.loads(l)
        if "id" in d:
            raw_nodes += 1
            ids.add(d["id"])
    assert raw_nodes - len(ids) == 229, (raw_nodes, len(ids))
    nodes, edges, src = load_graph(ScanContext(str(ROOT), graph_input=str(v3)))
    assert f"(+{len(nodes) - raw_nodes} net-new unique)" in src, src
    assert len(nodes) - raw_nodes == 416, len(nodes) - raw_nodes


if __name__ == "__main__":
    for fn in (test_dedup_keep_last_and_conflict_policy, test_merge_zero_dups_fixture,
               test_v3_input_dup_count_matches_orion):
        fn()
        print(f"OK {fn.__name__}")
    print("test_merge OK (all)")
