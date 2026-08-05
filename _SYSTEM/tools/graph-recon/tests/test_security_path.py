"""Lens Family V1 — security_path negative control + metamorphic tests.

Spec: lens-v1-design.md §2.7 (negative control), §2.8 (S-M1/S-M2/S-M3
metamorphic mutations), §6 (test protocol), §2.6 (path-independent
evidence grammar). Fixture: tests/lens_v1_fixtures.py::build_v1_fixture
(shared clean fixture, design §4).

Protocol per lens (design §6, mirroring tests/test_lenses.py):
  1. negative control: clean fixture => ZERO violation cards
  2. metamorphic mutations: exact card counts + ids + sev + witness paths
  3. record reorder => byte-identical findings/nodes (sorted-traversal)
  4. input swap => different card set (stale-input detection)
  5. card schema: id regex, verified:false, status:open, non-empty
     path-independent evidence, lens node props.cards matches
"""
import json
import random
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

from reconloop.context import ScanContext  # noqa: E402
from tests.lens_v1_fixtures import build_v1_fixture  # noqa: E402
from scanners.security_path import SecurityPathLens  # noqa: E402

SVC_A = "file:_SYSTEM/Scripts/svc-a.mjs"
SVC_B = "file:_SYSTEM/Scripts/svc-b.mjs"
SVC_C = "file:_SYSTEM/Scripts/svc-c.mjs"


def _write_graph(graph_path: Path, recs: list) -> None:
    """Fixture-module ordering: canonical-JSON sort (design §4 determinism)."""
    with open(graph_path, "w") as f:
        for r in sorted(recs, key=lambda r: json.dumps(r, sort_keys=True)):
            f.write(json.dumps(r, sort_keys=True) + "\n")


def _load(graph_path: Path) -> list:
    return [json.loads(l) for l in graph_path.read_text().splitlines() if l.strip()]


def _node(nid: str, kind: str) -> dict:
    return {"id": nid, "kind": kind, "props": {},
            "evidence": ["fixture"], "src": "fixture"}


def _edge(f: str, t: str, kind: str, boundary: str = "none") -> dict:
    return {"from": f, "to": t, "kind": kind, "props": {},
            "evidence": ["fixture"], "boundary": boundary}


def _ctx(repo, rev, graph_path):
    return ScanContext(str(repo), revision=rev, graph_input=str(graph_path))


def test_negative_control_zero_cards() -> None:
    """Design §2.7: shared clean fixture => exactly 0 cards."""
    repo, rev, graph_path = build_v1_fixture()
    res = SecurityPathLens().run(_ctx(repo, rev, graph_path))
    assert len(res.findings) == 0, (
        f"clean fixture produced {len(res.findings)} cards: "
        f"{[(f.id, f.sev, f.desc[:90]) for f in res.findings]}")
    print("negative control OK (0 cards)")


def test_metamorphic_mutations() -> None:
    """Design §2.8: S-M1 network ingress + grading; S-M2 cycle-safety +
    exact set; S-M3 env ingress multi-hop + exec requirement."""
    repo, rev, graph_path = build_v1_fixture()
    clean = _load(graph_path)

    # ---- S-M1: network ingress + grading ----
    # add network_conn svc-a -> port:9090 (lan); svc-a exec (script + launchd target)
    recs = list(clean) + [_edge(SVC_A, "port:9090", "network_conn", boundary="lan")]
    _write_graph(graph_path, recs)
    res = SecurityPathLens().run(_ctx(repo, rev, graph_path))
    assert len(res.findings) == 1, (
        f"S-M1(lan): expected 1 card, got {len(res.findings)}: "
        f"{[(f.id, f.sev) for f in res.findings]}")
    card = res.findings[0]
    assert card.sev == "high", card.sev
    # witness [port:9090, svc-a], terminal edge svc-a->port:9090 network_conn
    assert {"node:port:9090", f"node:{SVC_A}",
            f"edge:{SVC_A}->port:9090 network_conn"} <= set(card.evidence), card.evidence
    assert "port:9090" in card.desc and SVC_A in card.desc

    # sub-variant: same listener edge, boundary network => sev critical (§1.4)
    recs = list(clean) + [_edge(SVC_A, "port:9090", "network_conn",
                                boundary="network")]
    _write_graph(graph_path, recs)
    res = SecurityPathLens().run(_ctx(repo, rev, graph_path))
    assert len(res.findings) == 1, (
        f"S-M1(network): expected 1 card, got {len(res.findings)}: "
        f"{[(f.id, f.sev) for f in res.findings]}")
    assert res.findings[0].sev == "critical", res.findings[0].sev

    # ---- S-M2: cycle-safety + exact set ----
    # spawns svc-b -> svc-a (cycle) AND network_conn svc-c -> port:8081 (local)
    recs = list(clean) + [
        _edge(SVC_B, SVC_A, "spawns"),  # cycle svc-a -> svc-b -> svc-a
        _edge(SVC_C, "port:8081", "network_conn", boundary="local"),
    ]
    _write_graph(graph_path, recs)
    res = SecurityPathLens().run(_ctx(repo, rev, graph_path))
    assert len(res.findings) == 1, (
        f"S-M2: expected 1 card, got {len(res.findings)}: "
        f"{[(f.id, f.sev) for f in res.findings]}")
    card = res.findings[0]
    assert card.sev == "medium", card.sev
    # witness [port:8081, svc-c], terminal edge svc-c->port:8081 network_conn
    assert {"node:port:8081", f"node:{SVC_C}",
            f"edge:{SVC_C}->port:8081 network_conn"} <= set(card.evidence), card.evidence
    # ids stable across reruns; no duplicate/looping cards
    res2 = SecurityPathLens().run(_ctx(repo, rev, graph_path))
    assert [f.id for f in res.findings] == [f.id for f in res2.findings]

    # ---- S-M3: env ingress multi-hop + exec requirement ----
    # env_file:prod.env -> svc-a (env_to_process) -> svc-b (spawns) ->
    # port:7070 (network_conn, lan)
    recs = list(clean) + [
        _node("env_file:prod.env", "env_file"),
        _edge("env_file:prod.env", SVC_A, "env_to_process"),
        _edge(SVC_A, SVC_B, "spawns"),
        _edge(SVC_B, "port:7070", "network_conn", boundary="lan"),
    ]
    _write_graph(graph_path, recs)
    res = SecurityPathLens().run(_ctx(repo, rev, graph_path))
    # orchestrator ruling (lens fixed: exec waypoint excludes the root): the
    # port-listener card fires under the same shape S-M1 mandates (exec owner +
    # boundary edge), so the design table's "exactly 1" was under-specified.
    # Expect exactly 2: env-path witness AND port:7070 listener witness.
    assert len(res.findings) == 2, (
        f"S-M3: expected 2 cards, got {len(res.findings)}: "
        f"{[(f.id, f.sev) for f in res.findings]}")
    assert len({f.id for f in res.findings}) == 2, (
        f"S-M3: card ids must be distinct: {[f.id for f in res.findings]}")
    assert all(f.sev == "high" for f in res.findings), (
        [(f.id, f.sev) for f in res.findings])
    # witness [env_file:prod.env, svc-a, svc-b], terminal svc-b->port:7070
    env_card = next(f for f in res.findings
                    if "node:env_file:prod.env" in f.evidence)
    assert {"node:env_file:prod.env", f"node:{SVC_A}", f"node:{SVC_B}",
            f"edge:{SVC_B}->port:7070 network_conn"} <= set(env_card.evidence), \
        env_card.evidence
    # listener witness [port:7070, svc-b], terminal edge svc-b->port:7070
    port_card = next(f for f in res.findings
                     if "node:port:7070" in f.evidence)
    assert {"node:port:7070", f"node:{SVC_B}",
            f"edge:{SVC_B}->port:7070 network_conn"} <= set(port_card.evidence), \
        port_card.evidence

    # sub-variant: svc-a AND svc-b lose exec class (kind -> file; launchd
    # target dropped; no exec_capable prop, no launchd/mcp target edge =>
    # non-exec file kind; graph edges kept) => 0 cards (exec waypoint req)
    recs = [dict(r) for r in recs
            if not (r.get("kind") == "launchd_to_script" and r.get("to") == SVC_A)]
    for r in recs:
        if r.get("id") in (SVC_A, SVC_B):
            r["kind"] = "file"
    _write_graph(graph_path, recs)
    res = SecurityPathLens().run(_ctx(repo, rev, graph_path))
    assert len(res.findings) == 0, (
        f"S-M3 sub-variant: expected 0 cards, got {len(res.findings)}: "
        f"{[(f.id, f.sev, f.desc[:90]) for f in res.findings]}")
    print("metamorphic OK (S-M1 lan/critical, S-M2 cycle+set, S-M3 env+sub-variant)")


def test_record_reorder_identical_output() -> None:
    """Design §6: shuffled graph records => byte-identical findings+nodes."""
    repo, rev, graph_path = build_v1_fixture()
    recs = _load(graph_path) + [_edge(SVC_A, "port:9090", "network_conn",
                                      boundary="lan")]
    _write_graph(graph_path, recs)
    c = _ctx(repo, rev, graph_path)
    a = SecurityPathLens().run(c)
    shuffled = list(recs)
    random.Random(42).shuffle(shuffled)
    _write_graph(graph_path, shuffled)
    b = SecurityPathLens().run(c)
    assert [f.to_jsonl() for f in a.findings] == [f.to_jsonl() for f in b.findings]
    assert [n.to_jsonl() for n in a.nodes] == [n.to_jsonl() for n in b.nodes]
    print("record-reorder determinism OK")


def test_input_swap_fails_stale() -> None:
    """Design §6: different graph => different card set (stale-input)."""
    repo, rev, graph_path = build_v1_fixture()
    c = _ctx(repo, rev, graph_path)
    clean = SecurityPathLens().run(c)
    assert len(clean.findings) == 0, [f.desc for f in clean.findings]
    # swap in the S-M1 graph (svc-a listener edge to port:9090, lan)
    recs = _load(graph_path) + [_edge(SVC_A, "port:9090", "network_conn",
                                      boundary="lan")]
    other = Path(str(graph_path) + ".swap.jsonl")
    _write_graph(other, recs)
    swapped = SecurityPathLens().run(_ctx(repo, rev, other))
    assert len(swapped.findings) == 1, [f.desc for f in swapped.findings]
    assert [f.id for f in clean.findings] != [f.id for f in swapped.findings]
    print("input-swap OK (clean 0 cards, swapped 1 card)")


def test_card_schema_and_fingerprints() -> None:
    """Design §1.2/§2.5/§2.6: id regex, verified:false, status:open,
    non-empty path-independent evidence, lens node props.cards matches."""
    repo, rev, graph_path = build_v1_fixture()
    recs = _load(graph_path) + [_edge(SVC_A, "port:9090", "network_conn",
                                      boundary="lan")]
    _write_graph(graph_path, recs)
    res = SecurityPathLens().run(_ctx(repo, rev, graph_path))
    assert res.findings, "need >=1 card to validate schema"
    for card in res.findings:
        assert re.fullmatch(r"L-security_path-[0-9a-f]{8}", card.id), card.id
        assert card.verified is False
        assert card.status == "open"
        assert card.evidence, "card needs evidence"
        for ev in card.evidence:
            # §2.6: only graph:<pin16> / node:<id> / edge:<from>-><to> <kind>;
            # no absolute paths (no leading /, no temp paths, no timestamps)
            assert not ev.startswith("/"), f"absolute path in evidence: {ev}"
            assert "/tmp" not in ev, f"absolute path in evidence: {ev}"
            assert re.match(r"^(graph|node|edge):", ev), ev
    lens_node = next(n for n in res.nodes if n.kind == "lens")
    assert lens_node.props["cards"] == len(res.findings)
    print("card schema OK")


if __name__ == "__main__":
    for fn in (test_negative_control_zero_cards, test_metamorphic_mutations,
               test_record_reorder_identical_output, test_input_swap_fails_stale,
               test_card_schema_and_fingerprints):
        fn()
        print(f"OK {fn.__name__}")
    print("test_security_path OK (all)")
