"""Lens Family V1 — writer_to_protected: negative control + metamorphic tests.

Design: lens-v1-design.md §3.7 (negative control), §3.8 (W-M1..W-M3
metamorphic mutations), §6 (test protocol). Mirrors tests/test_lenses.py.

Suspected fixture bug (reported; tests compensate without touching
lens_v1_fixtures.py): the fixture emits DUPLICATE id records for the writers
(a plain file-inventory record `{props: {tracked: true}}` plus the writer
record with write_calls/dynamic_targets) but writes the graph sorted by
canonical JSON. The plain record sorts AFTER the writer record, so
load_graph's last-wins dedup shadows the writer props — the raw fixture graph
contains ZERO dynamic writers. Tests therefore rebuild the record set from
the deduped view and restore the writer props (record modification, per the
mutation mechanics of the task) before every mutation.

Also noted (implementation vs spec, see report): witness edges are dropped
from card evidence by `ev[:3]` (spec §3.5/§3.8 wants the witness edge), and
BaseLens.card() leaves `fingerprint` empty (spec §1.2 wants
sha256({sev,dim,desc[:200]})[:16]).
"""
import json
import random
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

from reconloop.context import ScanContext  # noqa: E402
from scanners.writer_to_protected import WriterToProtectedLens  # noqa: E402
from tests.lens_v1_fixtures import build_v1_fixture  # noqa: E402

WRITER_PROPS = {
    "file:_SYSTEM/Scripts/writer-a.mjs": {
        "write_calls": 2, "literal_targets": 1, "dynamic_targets": 1,
        "note": "dynamic write targets"},
    "file:_SYSTEM/Scripts/writer-b.mjs": {
        "write_calls": 2, "literal_targets": 1, "dynamic_targets": 1,
        "note": "dynamic write targets"},
    "file:_SYSTEM/Scripts/writer-lit.mjs": {
        "write_calls": 1, "literal_targets": 1, "dynamic_targets": 0},
}


def _write_graph(graph_path: Path, recs: list) -> None:
    """Rewrite the graph JSONL, records sorted by canonical JSON."""
    with open(graph_path, "w") as f:
        for r in sorted(recs, key=lambda r: json.dumps(r, sort_keys=True)):
            f.write(json.dumps(r, sort_keys=True) + "\n")


def _load(graph_path: Path) -> tuple[dict, list]:
    nodes, edges = {}, []
    for line in graph_path.read_text().splitlines():
        d = json.loads(line)
        if "from" in d:
            edges.append(d)
        else:
            nodes[d["id"]] = d
    return nodes, edges


def _base_recs(graph_path: Path) -> list:
    """Deduped clean records with writer props restored (see module note)."""
    nodes, edges = _load(graph_path)
    recs = []
    for nid, rec in nodes.items():
        if nid in WRITER_PROPS:
            rec = {**rec, "props": dict(WRITER_PROPS[nid])}
        recs.append(rec)
    return recs + edges


def _edge(f: str, t: str, kind: str) -> dict:
    return {"from": f, "to": t, "kind": kind, "props": {},
            "evidence": ["fixture"], "boundary": "none"}


def _run(repo: Path, rev: str, graph_path: Path):
    c = ScanContext(str(repo), revision=rev, graph_input=str(graph_path))
    return WriterToProtectedLens().run(c)


def _lens_node(res):
    return next(n for n in res.nodes if n.kind == "lens")


def test_negative_control_zero_cards() -> None:
    repo, rev, graph_path = build_v1_fixture()
    c = ScanContext(str(repo), revision=rev, graph_input=str(graph_path))
    # 1) raw fixture graph as built: 0 cards
    res = WriterToProtectedLens().run(c)
    assert len(res.findings) == 0, [f.desc for f in res.findings]
    # 2) meaningful negative control: writers present-but-clean. The raw
    #    fixture shadows the writer props (module note) — restore them so the
    #    control actually exercises the writer class (2 dynamic + 1
    #    literal-only, empty protected reach => 0 cards).
    _write_graph(graph_path, _base_recs(graph_path))
    res2 = WriterToProtectedLens().run(c)
    assert len(res2.findings) == 0, [f.desc for f in res2.findings]
    props = _lens_node(res2).props
    assert props["dynamic_writers"] == 2, props
    assert props["literal_only_writers"] == 1, props
    assert props["writers_with_reach"] == 0, props
    print("negative control OK (raw + writers-present, 0 cards each)")


def test_metamorphic_mutations() -> None:
    repo, rev, graph_path = build_v1_fixture()
    base = _base_recs(graph_path)

    # ---- W-M1: env consumption into a dynamic writer ----
    _write_graph(graph_path, base + [
        _edge("env_file:backend/.env", "file:_SYSTEM/Scripts/writer-a.mjs",
              "env_to_process")])
    res = _run(repo, rev, graph_path)
    assert len(res.findings) == 1, [f.desc for f in res.findings]
    f = res.findings[0]
    assert f.sev == "medium", f.sev
    assert "env_consumption" in f.desc, f.desc
    # sub-variant: same edge to a NON-writer (consumer.sh) => 0 cards
    _write_graph(graph_path, base + [
        _edge("env_file:backend/.env", "file:_SYSTEM/Scripts/consumer.sh",
              "env_to_process")])
    res = _run(repo, rev, graph_path)
    assert len(res.findings) == 0, [f.desc for f in res.findings]

    # ---- W-M2: literal protected write by a dynamic writer ----
    _write_graph(graph_path, base + [
        _edge("file:_SYSTEM/Scripts/writer-b.mjs",
              "file:backend/data/cache.json", "file_write")])
    res = _run(repo, rev, graph_path)
    assert len(res.findings) == 1, [f.desc for f in res.findings]
    f = res.findings[0]
    assert f.sev == "high", f.sev
    assert "literal_write" in f.desc, f.desc
    # sub-variant: same edge from a literal-only writer => 0 cards (v0 domain)
    _write_graph(graph_path, base + [
        _edge("file:_SYSTEM/Scripts/writer-lit.mjs",
              "file:backend/data/cache.json", "file_write")])
    res = _run(repo, rev, graph_path)
    assert len(res.findings) == 0, [f.desc for f in res.findings]

    # ---- W-M3: flow reach (spawns + file_write) to a protected path ----
    _write_graph(graph_path, base + [
        _edge("file:_SYSTEM/Scripts/writer-b.mjs",
              "file:_SYSTEM/Scripts/helper.mjs", "spawns"),
        _edge("file:_SYSTEM/Scripts/helper.mjs",
              "file:_SYSTEM/OS_KERNEL/memory.db", "file_write")])
    res = _run(repo, rev, graph_path)
    assert len(res.findings) == 1, [f.desc for f in res.findings]
    f = res.findings[0]
    assert f.sev == "medium", f.sev
    assert "flow" in f.desc, f.desc
    assert "writer-b.mjs" in f.desc and "memory.db" in f.desc, f.desc
    print("metamorphic OK (W-M1=1 medium env_consumption / sub 0, "
          "W-M2=1 high literal_write / sub 0, W-M3=1 medium flow)")


def test_record_reorder_identical_output() -> None:
    """Shuffle graph records (random.Random(42)); findings+nodes byte-identical.

    Canonical-sorted rewrite on save (the tests/test_lenses.py convention):
    the sort key is a total order, so the written bytes are unchanged and the
    content-addressed graph label stays stable. A raw byte-order shuffle would
    change the `graph:<pin16>` label inside evidence (content-addressed by
    design) — see report.
    """
    repo, rev, graph_path = build_v1_fixture()
    base = _base_recs(graph_path)
    recs = base + [
        _edge("file:_SYSTEM/Scripts/writer-b.mjs",
              "file:backend/data/cache.json", "file_write")]
    _write_graph(graph_path, recs)
    a = _run(repo, rev, graph_path)
    assert len(a.findings) == 1, [f.desc for f in a.findings]
    shuffled = list(recs)
    random.Random(42).shuffle(shuffled)
    _write_graph(graph_path, shuffled)
    b = _run(repo, rev, graph_path)
    assert [f.to_jsonl() for f in a.findings] == [f.to_jsonl() for f in b.findings]
    assert [n.to_jsonl() for n in a.nodes] == [n.to_jsonl() for n in b.nodes]
    print("record-reorder determinism OK (findings+nodes byte-identical)")


def test_input_swap_fails_stale() -> None:
    """Different graph input => different card set (stale-input detection)."""
    repo, rev, graph_path = build_v1_fixture()
    _write_graph(graph_path, _base_recs(graph_path))
    c = ScanContext(str(repo), revision=rev, graph_input=str(graph_path))
    clean = WriterToProtectedLens().run(c)
    assert len(clean.findings) == 0
    # swapped graph: W-M2 literal protected write => 1 card
    other = Path(str(graph_path) + ".swap.jsonl")
    _write_graph(other, _base_recs(graph_path) + [
        _edge("file:_SYSTEM/Scripts/writer-b.mjs",
              "file:backend/data/cache.json", "file_write")])
    c2 = ScanContext(str(repo), revision=rev, graph_input=str(other))
    swapped = WriterToProtectedLens().run(c2)
    assert len(swapped.findings) == 1, [f.desc for f in swapped.findings]
    assert [f.id for f in clean.findings] != [f.id for f in swapped.findings]
    print("input-swap OK (clean 0 cards, swapped 1 card, ids differ)")


def test_card_schema_and_fingerprints() -> None:
    repo, rev, graph_path = build_v1_fixture()
    _write_graph(graph_path, _base_recs(graph_path) + [
        _edge("file:_SYSTEM/Scripts/writer-b.mjs",
              "file:backend/data/cache.json", "file_write")])
    c = ScanContext(str(repo), revision=rev, graph_input=str(graph_path))
    res = WriterToProtectedLens().run(c)
    assert len(res.findings) == 1, [f.desc for f in res.findings]
    card = res.findings[0]
    assert re.fullmatch(r"L-writer_to_protected-[0-9a-f]{8}", card.id), card.id
    assert card.verified is False
    assert card.status == "open"
    assert card.evidence, "card needs evidence"
    # path-independent evidence: only graph:/node:/edge: labels, never
    # absolute paths or tempdir markers
    for item in card.evidence:
        assert re.fullmatch(r"(graph|node|edge):.*", item), item
        assert not item.startswith("/"), item
        assert "lens-v1-fixture-" not in item, item
    # deterministic id across runs (stable fingerprint identity)
    res2 = WriterToProtectedLens().run(c)
    assert res2.findings[0].id == card.id
    # lens summary node cards count matches
    assert _lens_node(res).props["cards"] == 1
    print("card schema OK (id regex, verified:false, status open, "
          "path-independent evidence, lens node cards match)")


if __name__ == "__main__":
    for fn in (test_negative_control_zero_cards, test_metamorphic_mutations,
               test_record_reorder_identical_output, test_input_swap_fails_stale,
               test_card_schema_and_fingerprints):
        fn()
        print(f"OK {fn.__name__}")
    print("test_writer_to_protected OK (all)")
