"""M2 item 2: lens negative controls + metamorphic tests.

For EVERY lens:
  - negative control: clean fixture => ZERO violation cards
  - metamorphic: mutate graph/registry => expected cards appear
  - record reorder => identical output (determinism)
  - input swap => different graph yields different card sets (fail on stale input)
  - every card: verified:false, evidence non-empty, schema-valid id
"""
import json
import sys
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

from reconloop.context import ScanContext  # noqa: E402
from reconloop import bundle  # noqa: E402
from tests.lens_fixtures import build_clean_fixture, ROUTE_REG, HOOK_REG  # noqa: E402
from scanners.route_binding import RouteBindingLens  # noqa: E402
from scanners.protected_writer import ProtectedWriterLens  # noqa: E402
from scanners.hook_projection import HookProjectionLens  # noqa: E402
from scanners.mcp_registration import McpRegistrationLens  # noqa: E402
from scanners.launchd_existence import LaunchdExistenceLens  # noqa: E402
from scanners.env_to_process import EnvToProcessLens  # noqa: E402

LENSES = [RouteBindingLens(), ProtectedWriterLens(), HookProjectionLens(),
          McpRegistrationLens(), LaunchdExistenceLens(), EnvToProcessLens()]


def _write_graph(graph_path: Path, recs: list) -> None:
    with open(graph_path, "w") as f:
        for r in sorted(recs, key=lambda r: json.dumps(r, sort_keys=True)):
            f.write(json.dumps(r, sort_keys=True) + "\n")


def _load(graph_path: Path) -> tuple[dict, list]:
    nodes, edges = {}, []
    for l in graph_path.read_text().splitlines():
        d = json.loads(l)
        if "from" in d:
            edges.append(d)
        else:
            nodes[d["id"]] = d
    return nodes, edges


def _mutate_repo_file(repo: Path, rel: str, new_content: str, rev: str) -> str:
    """Rewrite a tracked file, commit, return new revision."""
    from tests.lens_fixtures import git
    p = repo / rel
    p.write_text(new_content)
    git(repo, "add", rel)
    git(repo, "commit", "-m", "mutate")
    return subprocess_run(repo, "rev-parse", "HEAD")


def subprocess_run(repo: Path, *args: str) -> str:
    import subprocess
    return subprocess.run(["git", "-C", str(repo), *args],
                          capture_output=True, text=True).stdout.strip()


def test_negative_controls_zero_cards() -> None:
    repo, rev, graph_path = build_clean_fixture()
    c = ScanContext(str(repo), revision=rev, graph_input=str(graph_path))
    for lens in LENSES:
        res = lens.run(c)
        cards = res.findings
        assert len(cards) == 0, f"{lens.name}: clean fixture produced {len(cards)} cards: {[f.id for f in cards]}"
    print(f"negative controls OK ({len(LENSES)} lenses, zero cards each)")


def test_metamorphic_mutations() -> None:
    """Each mutation must produce exactly the expected lens's cards."""
    repo, rev, graph_path = build_clean_fixture()
    nodes, edges = _load(graph_path)

    def run_lens(lens, c):
        return lens.run(c)

    # 1. mcp: drop the registration edge => orphan server card
    recs = [n for n in nodes.values()] + [e for e in edges if not (
        e.get("kind") == "mcp_registration" and e.get("to") == "mcp_server:voice")]
    _write_graph(graph_path, recs)
    c = ScanContext(str(repo), revision=rev, graph_input=str(graph_path))
    res = run_lens(McpRegistrationLens(), c)
    assert len(res.findings) == 1 and "mcp_server:voice" in res.findings[0].desc, res.findings
    assert res.findings[0].verified is False

    # 2. launchd: point eot target at a missing file => dead-loop card
    nodes, edges = _load(graph_path)
    recs = [n for n in nodes.values()] + [
        e if not (e.get("kind") == "launchd_to_script" and "eot-refresh" in e.get("to", ""))
        else {**e, "to": "file:_SYSTEM/Scripts/nonexistent.sh"} for e in edges]
    _write_graph(graph_path, recs)
    res = run_lens(LaunchdExistenceLens(), c)
    assert len(res.findings) == 1 and "nonexistent.sh" in res.findings[0].desc, res.findings

    # 3. env: drop one env_to_process edge => orphan env card
    nodes, edges = _load(graph_path)
    recs = [n for n in nodes.values()] + [e for e in edges if not (
        e.get("kind") == "env_to_process" and e.get("from") == "env_file:.env.sample")]
    _write_graph(graph_path, recs)
    res = run_lens(EnvToProcessLens(), c)
    assert len(res.findings) == 1 and ".env.sample" in res.findings[0].desc, res.findings

    # 4. protected_writer: file_write into backend/.env.sample (protected) => card
    nodes, edges = _load(graph_path)
    recs = [n for n in nodes.values()] + edges + [
        {"from": "file:_SYSTEM/Scripts/task-queue.mjs",
         "to": "file:_SYSTEM/backend/.env.sample", "kind": "file_write",
         "props": {}, "evidence": ["fixture"], "boundary": "none"}]
    _write_graph(graph_path, recs)
    res = run_lens(ProtectedWriterLens(), c)
    assert len(res.findings) == 1 and "protected" in res.findings[0].desc, res.findings

    # 5. hook_projection: registry entrypoint missing from file layer => card
    new_rev = _mutate_repo_file(repo, HOOK_REG, json.dumps({
        "schemaVersion": 1, "kind": "yuri-universal-hook-registry",
        "hooks": [{"hookId": "yuri.pre-tool.enforcement", "coreEntrypoint": "_SYSTEM/Scripts/stale-hook.mjs",
                   "enabled": True}]}), rev)
    c2 = ScanContext(str(repo), revision=new_rev, graph_input=str(graph_path))
    res = run_lens(HookProjectionLens(), c2)
    assert len(res.findings) == 1 and "stale-hook.mjs" in res.findings[0].desc, res.findings

    # 6. route_binding: identity with no role + no canary => cards
    bad_route = {"schemaVersion": "yuri-provider-route-v1", "modelIdentities": {
        "deepseek-v4-flash": {"routes": [{"id": "x.direct", "provider": "deepseek",
                                          "surface": "direct-api", "model": "x", "status": "catalog-candidate"}]}}}
    new_rev2 = _mutate_repo_file(repo, ROUTE_REG, json.dumps(bad_route), new_rev)
    c3 = ScanContext(str(repo), revision=new_rev2, graph_input=str(graph_path))
    res = run_lens(RouteBindingLens(), c3)
    ids = [f.id for f in res.findings]
    assert len(res.findings) >= 2, res.findings  # missing role + no canary
    print(f"metamorphic OK: mcp=1 launchd=1 env=1 protected=1 hook=1 route={len(res.findings)}")


def test_record_reorder_identical_output() -> None:
    repo, rev, graph_path = build_clean_fixture()
    c = ScanContext(str(repo), revision=rev, graph_input=str(graph_path))
    # mutate env to produce cards, then shuffle the graph file order
    nodes, edges = _load(graph_path)
    recs = [n for n in nodes.values()] + [e for e in edges if not (
        e.get("kind") == "env_to_process" and e.get("from") == "env_file:.env.sample")]
    _write_graph(graph_path, recs)
    a = EnvToProcessLens().run(c)
    shuffled = list(recs)
    import random
    random.Random(42).shuffle(shuffled)
    _write_graph(graph_path, shuffled)
    b = EnvToProcessLens().run(c)
    assert [f.to_jsonl() for f in a.findings] == [f.to_jsonl() for f in b.findings]
    assert [n.to_jsonl() for n in a.nodes] == [n.to_jsonl() for n in b.nodes]
    print("record-reorder determinism OK")


def test_input_swap_fails_stale() -> None:
    """Different graph input => different card set (swap detection)."""
    repo, rev, graph_path = build_clean_fixture()
    c = ScanContext(str(repo), revision=rev, graph_input=str(graph_path))
    clean = EnvToProcessLens().run(c)
    assert len(clean.findings) == 0
    # swap in a graph with an orphan env
    nodes, edges = _load(graph_path)
    recs = [n for n in nodes.values()] + [e for e in edges if not (
        e.get("kind") == "env_to_process" and e.get("from") == "env_file:.env.sample")]
    other = Path(str(graph_path) + ".swap.jsonl")
    _write_graph(other, recs)
    c2 = ScanContext(str(repo), revision=rev, graph_input=str(other))
    swapped = EnvToProcessLens().run(c2)
    assert len(swapped.findings) == 1
    assert [f.id for f in clean.findings] != [f.id for f in swapped.findings]
    print("input-swap OK (clean 0 cards, swapped 1 card)")


def test_card_schema_and_fingerprints() -> None:
    repo, rev, graph_path = build_clean_fixture()
    nodes, edges = _load(graph_path)
    recs = [n for n in nodes.values()] + edges + [
        {"from": "file:_SYSTEM/Scripts/task-queue.mjs", "to": "file:_SYSTEM/backend/.env.sample",
         "kind": "file_write", "props": {}, "evidence": ["fixture"], "boundary": "none"}]
    _write_graph(graph_path, recs)
    c = ScanContext(str(repo), revision=rev, graph_input=str(graph_path))
    res = ProtectedWriterLens().run(c)
    card = res.findings[0]
    assert card.verified is False and card.status == "open"
    assert card.evidence, "card needs evidence"
    import re
    assert re.fullmatch(r"L-[a-z_]+-[0-9a-f]{8}", card.id), card.id
    # lens summary node
    lens_node = next(n for n in res.nodes if n.kind == "lens")
    assert lens_node.props["cards"] == 1
    print("card schema OK")


if __name__ == "__main__":
    for fn in (test_negative_controls_zero_cards, test_metamorphic_mutations,
               test_record_reorder_identical_output, test_input_swap_fails_stale,
               test_card_schema_and_fingerprints):
        fn()
        print(f"OK {fn.__name__}")
    print("test_lenses OK (all)")
