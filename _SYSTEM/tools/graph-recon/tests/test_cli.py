"""M1.5 CLI tests — fail-closed errors, findings dir, --rerun, manifest, stability.

Fixture-based and deterministic: all CLI runs use the template's own repo root
as the scan root but with a temp layers/findings/graph output dir, so nothing
touches tracked files. The analytics scanners get the pinned fixture as graph
input; live_ports is ephemeral and must not enter the pinned merge.
"""
import json
import sys
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

from reconloop.cli import cmd_run, cmd_verify, cmd_manifest  # noqa: E402
from reconloop import bundle  # noqa: E402

FIXTURE = ROOT / "tests" / "fixtures" / "analytics_graph.jsonl"


class Args:
    def __init__(self, **kw):
        self.root = str(ROOT)
        self.scanners_dir = str(ROOT / "scanners")
        self.revision = "origin/main"
        self.graph_input = str(FIXTURE)
        self.findings_dir = ""
        self.rerun = True  # verify subcommand flag
        self.layers = None
        self.__dict__.update(kw)


def run_once(td: Path, graph_input: str = str(FIXTURE)):
    layers, graph, pin = td / "layers", td / "graph.jsonl", td / "graph.sha256"
    findings = td / "findings"
    args = Args(layers=str(layers), graph=str(graph), pin=str(pin),
                findings_dir=str(findings), graph_input=graph_input)
    rc = cmd_run(args)
    return rc, layers, graph, pin, findings, args


def test_run_fail_closed_missing_graph_input() -> None:
    """M1.5 items 1+3: analytics scanner without graph input => error layer + rc 1,
    no merged graph/pin emitted."""
    with tempfile.TemporaryDirectory() as td:
        td = Path(td)
        rc, layers, graph, pin, findings, _ = run_once(td, graph_input="")
        assert rc == 1, f"expected fail-closed rc=1, got {rc}"
        errs = list(layers.glob("*.ERROR.jsonl"))
        assert len(errs) == 4, [p.name for p in layers.glob("*")]
        assert all(p.name.startswith(("connected_components", "articulation",
                                      "cross_layer_links", "exec_centrality"))
                   for p in errs)
        assert not graph.exists() and not pin.exists(), "no merge/pin on failure"
        assert (findings / "connected_components.jsonl").exists() is False


def test_run_writes_findings_deduped() -> None:
    """M1.5 item 1: findings written to findings/<scanner>.jsonl, dedup by fingerprint."""
    with tempfile.TemporaryDirectory() as td:
        td = Path(td)
        rc, layers, graph, pin, findings, _ = run_once(td)
        assert rc == 0
        # exec_centrality emits 2 findings (high for d, info for launchd-persisted b)
        f_ec = findings / "exec_centrality.jsonl"
        assert f_ec.exists(), list(findings.iterdir()) if findings.exists() else "no findings dir"
        recs = [json.loads(l) for l in f_ec.read_text().splitlines() if l.strip()]
        assert len(recs) == 2, recs
        fps = {r["fingerprint"] for r in recs}
        assert len(fps) == 2, "fingerprints must be unique after dedup"
        assert all(r["verified"] is False for r in recs)


def test_verify_rerun_baseline_then_match() -> None:
    """M1.5 item 2: verify --rerun re-runs the pipeline; first run sets baseline,
    second run must match the stored pin (determinism re-check)."""
    with tempfile.TemporaryDirectory() as td:
        td = Path(td)
        rc, layers, graph, pin, findings, args = run_once(td)
        assert rc == 0
        stored = pin.read_text().strip()
        assert len(stored) == 64
        # baseline verify (no prior pin) must pass
        args2 = Args(layers=str(layers), graph=str(graph), pin=str(pin),
                     findings_dir=str(findings), graph_input=str(FIXTURE))
        assert cmd_verify(args2) == 0, "plain verify after run"
        # rerun: pipeline re-runs, hash must equal stored pin
        assert cmd_verify(args2) == 0, "rerun verify baseline"
        # tamper: regen differs => rerun must FAIL
        (layers / "connected_components.jsonl").write_text("junk\n")
        # re-pin the graph with tampered layer? no — rerun regenerates layers from
        # scanners, so tampering layers alone does not change regen output. To
        # force mismatch, tamper the stored pin file itself.
        pin.write_text("0" * 64 + "\n")
        assert cmd_verify(args2) == 1, "rerun must fail on pin mismatch"


def test_analysis_manifest_written_and_valid() -> None:
    """M1.5 item 6: layers/analysis-manifest.json written, validates against the
    pinned schema; input pin is content-addressed (no path)."""
    with tempfile.TemporaryDirectory() as td:
        td = Path(td)
        rc, layers, graph, pin, findings, args = run_once(td)
        assert rc == 0
        mp = layers / "analysis-manifest.json"
        assert mp.exists()
        man = json.loads(mp.read_text())
        schema = ROOT / "reconloop" / "schemas" / "analysis-manifest.schema.json"
        assert bundle.validate_manifest(man, schema) == []
        assert man["input_graph"]["resolved"] is True
        assert man["input_graph"]["label"].startswith("graph:"), man["input_graph"]
        assert "/" not in man["input_graph"]["label"], "label must be path-independent"
        # M1.5 item 8: root context recorded (path, git HEAD, revision)
        assert man["root"]["path"].endswith("graph-recon"), man["root"]
        assert len(man["root"]["git_head"]) == 40, man["root"]["git_head"]
        assert man["root"]["revision"] == "origin/main"
        assert "connected_components" in man["scanners"]
        assert len(man["scanners"]["connected_components"]) == 64
        # CLI manifest validator agrees
        class MArgs:
            manifest = str(mp)
        assert cmd_manifest(MArgs()) == 0


def test_ephemeral_layer_excluded_from_pin() -> None:
    """M1.5 item 7: live_ports is ephemeral — freshness-stamped, NOT in the
    pinned merged graph; stable layers are pinned."""
    with tempfile.TemporaryDirectory() as td:
        td = Path(td)
        rc, layers, graph, pin, findings, _ = run_once(td)
        assert rc == 0
        meta = layers / "live_ports.meta.json"
        assert meta.exists(), "ephemeral layer must carry freshness stamp"
        m = json.loads(meta.read_text())
        assert m["stability"] == "ephemeral" and m["pinned"] is False
        assert "freshness" in m
        merged = graph.read_text()
        # live_ports emits kind=port nodes; analytics may mention ports only in
        # props (top_members etc.), never as port-kind records
        assert '"kind": "port"' not in merged, "live ports must not enter pinned merge"
        assert (layers / "live_ports.jsonl").exists(), "ephemeral layer file kept"
        man = json.loads((layers / "analysis-manifest.json").read_text())
        assert man["layers"]["stability"]["live_ports"] == "ephemeral"
        assert "live_ports" not in man["layers"]["pinned"]
        assert "file_inventory" in man["layers"]["pinned"]


if __name__ == "__main__":
    for fn in (test_run_fail_closed_missing_graph_input, test_run_writes_findings_deduped,
               test_verify_rerun_baseline_then_match, test_analysis_manifest_written_and_valid,
               test_ephemeral_layer_excluded_from_pin):
        fn()
        print(f"OK {fn.__name__}")
    print("test_cli OK (all)")
