"""M1 analytics scanner tests — fixture-based, rev-pinned, deterministic.

Fixture: tests/fixtures/analytics_graph.jsonl (see analytics-fixture.md for the
hand-computed expected structure). Rev-pinned: the fixture's sha256 is pinned in
analytics_graph.sha256 and asserted here, so a fixture change requires a
deliberate pin update. Every test double-runs the scanner and asserts identical
output (determinism), sorted emission, and non-empty evidence on every record.
"""
import hashlib
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

from reconloop.context import ScanContext  # noqa: E402
from scanners.connected_components import ConnectedComponentsScanner  # noqa: E402
from scanners.articulation import ArticulationScanner  # noqa: E402
from scanners.cross_layer_links import CrossLayerLinksScanner  # noqa: E402
from scanners.exec_centrality import ExecCentralityScanner  # noqa: E402

FIXTURE = ROOT / "tests" / "fixtures" / "analytics_graph.jsonl"
PIN = ROOT / "tests" / "fixtures" / "analytics_graph.sha256"


def sha256_file(p: Path) -> str:
    return hashlib.sha256(p.read_bytes()).hexdigest()


def ctx():
    return ScanContext(str(ROOT), graph_input=str(FIXTURE))


def canonical(records) -> list:
    return sorted((json.loads(r.to_jsonl()) for r in records), key=json.dumps)


def assert_evidence(records, label: str) -> None:
    for rec in records:
        assert rec.evidence, f"{label}: empty evidence on {getattr(rec, 'id', 'edge')}"


def test_fixture_rev_pinned() -> None:
    assert sha256_file(FIXTURE) == PIN.read_text().strip(), "fixture drifted from rev-pin"


def test_connected_components() -> None:
    sc = ConnectedComponentsScanner()
    r1 = sc.run(ctx())
    r2 = sc.run(ctx())
    assert canonical(r1.nodes) == canonical(r2.nodes), "determinism nodes"
    assert canonical(r1.edges) == canonical(r2.edges), "determinism edges"
    assert_evidence(r1.nodes, "cc-nodes")
    assert_evidence(r1.edges, "cc-edges")

    comps = {n.id: n for n in r1.nodes if n.kind == "component"}
    # 4 components; largest = 9 members
    assert len(comps) == 4, [n.id for n in r1.nodes if n.kind == "component"]
    largest = max(comps.values(), key=lambda n: n.props["size"])
    assert largest.props["size"] == 9
    # largest component: files + launchd + memory.db + env + secret
    expected_members = {
        "file:a.py", "file:b.py", "file:c.py", "file:d.py", "test_suite:t.py",
        "launchd_agent:la1", "database:memory.db", "env_file:.env",
        "protected_path:secret.pem",
    }
    top = largest.props["top_members"]
    assert set(top) == expected_members, top
    # membership edges: sum of sizes
    assert len(r1.edges) == sum(n.props["size"] for n in comps.values())
    # summary node
    summary = next(n for n in r1.nodes if n.kind == "component_ranking")
    assert summary.props["total_components"] == 4
    assert summary.props["singletons"] == 1  # governance_organ:o1


def test_articulation() -> None:
    sc = ArticulationScanner()
    r1 = sc.run(ctx())
    r2 = sc.run(ctx())
    assert canonical(r1.nodes) == canonical(r2.nodes), "determinism nodes"
    assert canonical(r1.edges) == canonical(r2.edges), "determinism edges"
    assert_evidence(r1.nodes, "art-nodes")
    assert_evidence(r1.edges, "art-edges")

    art_ids = {n.id for n in r1.nodes if n.kind == "articulation_point"}
    # cut vertices on code tree: a (splits d|t|b-c) and b (splits c)
    assert art_ids == {"art:file:a.py", "art:file:b.py"}, art_ids
    bridges = {(e.from_, e.to) for e in r1.edges if e.kind == "bridge"}
    assert bridges == {
        ("file:a.py", "file:b.py"),
        ("file:a.py", "file:d.py"),
        ("file:a.py", "test_suite:t.py"),
        ("file:b.py", "file:c.py"),
    }, bridges
    # b is launchd-persisted exec target => exec-capable articulation finding
    arts = {n.id: n for n in r1.nodes if n.kind == "articulation_point"}
    assert arts["art:file:b.py"].props["exec_capable"] is True
    assert any(f.id == "ART-file:b.py" and f.sev == "medium" for f in r1.findings)
    summary = next(n for n in r1.nodes if n.kind == "articulation_ranking")
    assert summary.props["bridges"] == 4
    assert summary.props["articulation_points"] == 2


def test_cross_layer_links() -> None:
    sc = CrossLayerLinksScanner()
    r1 = sc.run(ctx())
    r2 = sc.run(ctx())
    assert canonical(r1.nodes) == canonical(r2.nodes), "determinism nodes"
    assert_evidence(r1.nodes, "xlink-nodes")

    links = {n.id: n for n in r1.nodes if n.kind == "cross_layer_link"}
    # expected aggregates
    assert links["xlink:files->files:tests"].props["count"] == 4
    assert links["xlink:launchd->files:launchd_to_script"].props["count"] == 1
    assert links["xlink:files->memory:file_write"].props["count"] == 1
    assert links["xlink:ports->ports:network_conn"].props["count"] == 1
    assert links["xlink:harness->servers:mcp_registration"].props["count"] == 1
    assert links["xlink:files->secrets:file_read"].props["count"] == 1
    assert links["xlink:files->protected:file_read"].props["count"] == 1

    q = {n.id: n for n in r1.nodes if n.kind == "surface_query"}
    assert q["query:writers"].props["writers"] == ["file:d.py"]
    assert q["query:writers"].props["write_targets"] == ["database:memory.db"]
    assert q["query:memory_bus"].props["touching_nodes"] == ["file:d.py"]
    assert q["query:secrets"].props["incident_edges"] == 2

    # findings: file_write into database => medium; no network-secret link => no high
    assert any(f.id == "XL:file:d.py->database:memory.db:file_write"
               and f.sev == "medium" for f in r1.findings)
    assert not any(f.sev == "high" for f in r1.findings)


def test_exec_centrality() -> None:
    sc = ExecCentralityScanner()
    r1 = sc.run(ctx())
    r2 = sc.run(ctx())
    assert canonical(r1.nodes) == canonical(r2.nodes), "determinism nodes"
    assert_evidence(r1.nodes, "exec-nodes")

    srcs = {n.id: n for n in r1.nodes if n.kind == "exec_source"}
    assert set(srcs) == {"exec:file:b.py", "exec:file:d.py", "exec:mcp_server:m1"}, set(srcs)
    # b: tests b->c reach {c}=1 ; d: tests d->a->b->c + file_write d->memory.db
    #    reach {a,b,c,memory.db}=4
    assert srcs["exec:file:b.py"].props["reach"] == 1
    assert srcs["exec:file:b.py"].props["trust_crossings"] == 1  # launchd local
    assert srcs["exec:file:d.py"].props["reach"] == 4
    assert srcs["exec:file:d.py"].props["trust_crossings"] == 0
    assert srcs["exec:mcp_server:m1"].props["reach"] == 0
    assert srcs["exec:mcp_server:m1"].props["trust_crossings"] == 1  # mcp local
    # ranking: d.py (score 4) first; b.py (1) then m1 (0)
    top = next(n for n in r1.nodes if n.kind == "exec_ranking").props["top10"]
    assert top == ["exec:file:d.py", "exec:file:b.py", "exec:mcp_server:m1"], top
    # findings: b.py and m1 cross trust boundaries => medium; d.py none
    assert any(f.id == "EXEC-file:b.py" and f.sev == "medium" for f in r1.findings)
    assert any(f.id == "EXEC-mcp_server:m1" and f.sev == "medium" for f in r1.findings)
    assert not any(f.id.startswith("EXEC-file:d.py") for f in r1.findings)


def test_fail_open_no_input() -> None:
    """Analytics scanners fail open (empty result + note) without a graph input."""
    c = ScanContext(str(ROOT), graph_input="")
    for sc in (ConnectedComponentsScanner(), ArticulationScanner(),
               CrossLayerLinksScanner(), ExecCentralityScanner()):
        res = sc.run(c)
        assert res.nodes == [] and res.edges == [], sc.name
        assert res.notes, sc.name


def test_evidence_pin_path_independent() -> None:
    """M1 refinement (Orion verdict): evidence label is the content pin
    (`graph:<sha256-prefix>`), never the input path, and is byte-identical
    across environments — same input at a different path => same evidence."""
    import tempfile
    from reconloop.graphio import load_graph

    pin16 = PIN.read_text().strip()[:16]

    # 1. fixture at its canonical path: label is graph:<pin16>, no path anywhere
    c = ScanContext(str(ROOT), graph_input=str(FIXTURE))
    r = ConnectedComponentsScanner().run(c)
    for rec in r.nodes + r.edges:
        assert any(f"graph:{pin16}" in ev for ev in rec.evidence), rec.evidence
        assert str(FIXTURE) not in "".join(rec.evidence), rec.evidence

    # 2. same fixture copied to a different path: identical evidence + records
    with tempfile.TemporaryDirectory() as td:
        other = Path(td) / "copy.jsonl"
        other.write_bytes(FIXTURE.read_bytes())
        c2 = ScanContext(str(ROOT), graph_input=str(other))
        r2 = ConnectedComponentsScanner().run(c2)
        assert canonical(r.nodes) == canonical(r2.nodes), "records identical across paths"
        assert [rec.evidence for rec in r.nodes] == [rec.evidence for rec in r2.nodes], \
            "evidence identical across paths"

    # 3. load_graph itself: source label is graph:<pin16>
    nodes, edges, src = load_graph(c)
    assert nodes and edges
    assert src.startswith(f"graph:{pin16}"), src
    assert "/" not in src.split("(")[0], src


def test_real_input_pin_matches_ecosystem_sha256() -> None:
    """Real-graph evidence pin must equal the ecosystem artifact's pinned
    sha256 prefix (57931c33 for graph v3) when run against that artifact.
    This is the cross-environment determinism contract: evidence is a function
    of content only. Skipped when the pinned v3 input is not present locally."""
    v3 = ROOT.parent.parent.parent / "_SYSTEM" / "graph-ecosystem" / "full-graph.jsonl"
    if not v3.exists():
        print("SKIP test_real_input_pin_matches_ecosystem_sha256 (no local v3 artifact)")
        return
    c = ScanContext(str(ROOT), graph_input=str(v3))
    nodes, edges, src = load_graph(c)
    assert nodes and edges
    pin_path = v3.with_suffix(".sha256")
    if pin_path.exists():
        expected = pin_path.read_text().strip().split()[0][:16]
        assert src.startswith(f"graph:{expected}"), (src, expected)


if __name__ == "__main__":
    for fn in (test_fixture_rev_pinned, test_connected_components, test_articulation,
               test_cross_layer_links, test_exec_centrality, test_fail_open_no_input,
               test_evidence_pin_path_independent,
               test_real_input_pin_matches_ecosystem_sha256):
        fn()
        print(f"OK {fn.__name__}")
    print("test_analytics OK (all)")
