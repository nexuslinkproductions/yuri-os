"""M1.5 CLI tests — fail-closed errors, findings dir, --rerun, manifest, stability.

Fixture-based and deterministic: all CLI runs use the template's own repo root
as the scan root but with a temp layers/findings/graph output dir, so nothing
touches tracked files. The analytics scanners get the pinned fixture as graph
input; live_ports is ephemeral and must not enter the pinned merge.
"""
import json
import os
import sys
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

from reconloop.cli import cmd_run, cmd_verify, cmd_manifest  # noqa: E402
from reconloop import bundle  # noqa: E402
from reconloop.registry import load_scanners  # noqa: E402

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


class _ConfigScope:
    """Save/restore GRAPH_RECON_CONFIG around one cmd_run/cmd_verify call.

    M4-W1-FIX (DEFECT 2 — test isolation): config state must never leak
    between tests or into the environment. `config` is a Path to a
    reconproject.json to activate for the scope, or None to run with the env
    var explicitly ABSENT. The prior value (or its absence) is always
    restored on exit.
    """

    def __init__(self, config: str | Path | None = None):
        self._path = str(config) if config is not None else None
        self._prior: str | None = None
        self._had = False

    def __enter__(self):
        self._had = "GRAPH_RECON_CONFIG" in os.environ
        self._prior = os.environ.get("GRAPH_RECON_CONFIG")
        if self._path is None:
            os.environ.pop("GRAPH_RECON_CONFIG", None)
        else:
            os.environ["GRAPH_RECON_CONFIG"] = self._path
        return self

    def __exit__(self, *exc):
        if self._had:
            os.environ["GRAPH_RECON_CONFIG"] = self._prior
        else:
            os.environ.pop("GRAPH_RECON_CONFIG", None)
        return False


def run_once(td: Path, graph_input: str = str(FIXTURE),
             config: str | Path | None = None):
    layers, graph, pin = td / "layers", td / "graph.jsonl", td / "graph.sha256"
    findings = td / "findings"
    args = Args(layers=str(layers), graph=str(graph), pin=str(pin),
                findings_dir=str(findings), graph_input=graph_input)
    with _ConfigScope(config):
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


def test_run_fail_closed_malformed_graph_input() -> None:
    """Malformed graph input creates error layers and blocks graph output."""
    with tempfile.TemporaryDirectory() as td:
        td = Path(td)
        scanners = load_scanners(
            ROOT / "scanners", template_root=ROOT
        )
        expected = sorted(
            f"{name}.ERROR.jsonl"
            for name, cls in scanners.items()
            if getattr(cls, "requires_graph", False)
        )
        for name, payload in {
            "syntax": b"not-json",
            "encoding": b'{"id":"bad-utf8","kind":"file","x":"\xff"}',
            "shape": b"{}\n",
        }.items():
            case = td / name
            case.mkdir()
            bad = case / "bad.graph.jsonl"
            bad.write_bytes(payload)
            rc, layers, graph, pin, findings, _ = run_once(
                case, graph_input=str(bad)
            )
            assert rc == 1, (name, rc)
            err_layers = sorted(p.name for p in layers.glob("*.ERROR.jsonl"))
            assert err_layers == expected, (name, err_layers, expected)
            assert not graph.exists() and not pin.exists(), (
                name, "no merge/pin on parse failure"
            )
            assert not findings.exists() or not (
                findings / "connected_components.jsonl"
            ).exists()


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
        # baseline verify (no prior pin) must pass — cmd_verify re-runs the
        # pipeline, so it gets the same scoped-clean env as run_once
        args2 = Args(layers=str(layers), graph=str(graph), pin=str(pin),
                     findings_dir=str(findings), graph_input=str(FIXTURE))
        with _ConfigScope(None):
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
        if man["root"]["git_head"]:
            assert len(man["root"]["git_head"]) == 40, man["root"]["git_head"]
        else:
            # Orion test-robustness note: bare git-archive extraction has no
            # .git => git_head empty; documented skip, fresh-checkout parity kept
            print("SKIP git_head assertion (root not inside a git repo)")
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


def test_packs_flag_loads_pack_scanners() -> None:
    """M4-W1: --packs yuri loads the optional pack; core runs without it.

    M4-W1-FIX (DEFECT 2): the core run is executed with GRAPH_RECON_CONFIG
    scoped absent (restored after) — a leaked config must never cause a core
    run to auto-load yuri pack scanners.
    """
    with tempfile.TemporaryDirectory() as td:
        td = Path(td)
        rc, layers, graph, pin, findings, _ = run_once(td, config=None)
        assert rc == 0
        assert not (layers / "organs.jsonl").exists(), \
            "core run must NOT load yuri pack scanners"
        # now with the pack flag (env still scoped clean — packs come from the flag)
        layers2, graph2, pin2 = td / "layers2", td / "graph2.jsonl", td / "graph2.sha256"
        findings2 = td / "findings2"
        args = Args(layers=str(layers2), graph=str(graph2), pin=str(pin2),
                    findings_dir=str(findings2), graph_input=str(FIXTURE), packs="yuri")
        with _ConfigScope(None):
            rc2 = cmd_run(args)
        assert rc2 == 0, f"pack run rc={rc2}"
        organs = layers2 / "organs.jsonl"
        assert organs.exists(), "pack scanner layer must be emitted"
        recs = [json.loads(l) for l in organs.read_text().splitlines() if l.strip()]
        assert len(recs) == 12, len(recs)  # 12 ORGANS entries (no _SYSTEM in template root)
        assert all(r["kind"] == "governance_organ" for r in recs)
        man = json.loads((layers2 / "analysis-manifest.json").read_text())
        assert man["config"]["packs"] == ["yuri"]
        assert "organs" in man["scanners"], "pack scanner hash must be in the manifest"


def test_config_overrides_ephemeral_lens_budget() -> None:
    """M4-W1: reconproject.json drives ephemeral classification, lens
    disable, and the review findings budget (via GRAPH_RECON_CONFIG).

    M4-W1-FIX (DEFECT 2): the config file lives in a temp dir and the env var
    is scoped to this test's cmd_run call only — the prior value is restored
    afterwards and the template root's reconproject.json is never touched.
    """
    had = "GRAPH_RECON_CONFIG" in os.environ
    prior = os.environ.get("GRAPH_RECON_CONFIG")
    cfg = {
        "ephemeral": {"layers": {"file_inventory": "ephemeral"}},
        "lenses": {"enabled": [], "disabled": ["env_to_process"], "admission": {}},
        "review": {"max_findings_per_layer": 1},
        "packs": [],
    }
    with tempfile.TemporaryDirectory() as td:
        td = Path(td)
        cfgp = td / "reconproject.json"
        cfgp.write_text(json.dumps(cfg))
        rc, layers, graph, pin, findings, _ = run_once(td, config=cfgp)
        assert rc == 0
        # ephemeral override: file_inventory freshness-stamped, not pinned
        meta = layers / "file_inventory.meta.json"
        assert meta.exists(), "config-ephemeral layer must carry freshness stamp"
        assert json.loads(meta.read_text())["stability"] == "ephemeral"
        man = json.loads((layers / "analysis-manifest.json").read_text())
        assert man["layers"]["stability"]["file_inventory"] == "ephemeral"
        assert "file_inventory" not in man["layers"]["pinned"]
        # lens disabled by config: no layer, no error
        assert not (layers / "env_to_process.jsonl").exists()
        assert not list(layers.glob("env_to_process.ERROR.jsonl"))
        # review budget: exec_centrality findings capped at 1 + review note
        recs = [json.loads(l) for l in (findings / "exec_centrality.jsonl").read_text().splitlines() if l.strip()]
        assert len(recs) == 1, len(recs)
        note = json.loads((findings / "exec_centrality.review.json").read_text())
        assert note["budget"] == 1 and note["truncated"] == 1
    # isolation: env restored to its prior state (here: absent)
    assert ("GRAPH_RECON_CONFIG" in os.environ) == had, "GRAPH_RECON_CONFIG leaked"
    assert os.environ.get("GRAPH_RECON_CONFIG") == prior, "GRAPH_RECON_CONFIG value leaked"


def test_core_run_clean_env_isolated() -> None:
    """M4-W1-FIX (DEFECT 2, explicit isolation assertion): a core run in a
    clean env loads ONLY core scanners (26) — no organs/registries/
    memory_schema/formula_banks layers — and leaves no config state behind:
    GRAPH_RECON_CONFIG is restored and the template root's reconproject.json
    is untouched.
    """
    had = "GRAPH_RECON_CONFIG" in os.environ
    prior = os.environ.get("GRAPH_RECON_CONFIG")
    tpl_cfg = ROOT / "reconproject.json"
    before = tpl_cfg.read_bytes() if tpl_cfg.exists() else None
    with tempfile.TemporaryDirectory() as td:
        td = Path(td)
        rc, layers, graph, pin, findings, _ = run_once(td, config=None)
        assert rc == 0
        # core-only isolation: yuri pack layers must never be emitted
        for layer in ("organs", "registries", "memory_schema", "formula_banks"):
            assert not (layers / f"{layer}.jsonl").exists(), \
                f"core run must NOT emit {layer}.jsonl (yuri pack scanner loaded)"
        man = json.loads((layers / "analysis-manifest.json").read_text())
        assert man["config"]["packs"] == [], man["config"]["packs"]
        assert len(man["scanners"]) == 26, \
            f"expected exactly 26 core scanners, got {len(man['scanners'])}: {sorted(man['scanners'])}"
        for layer in ("organs", "registries", "memory_schema", "formula_banks"):
            assert layer not in man["scanners"], f"pack scanner {layer} in core manifest"
    # isolation: env restored, template config untouched
    assert ("GRAPH_RECON_CONFIG" in os.environ) == had, "GRAPH_RECON_CONFIG leaked"
    assert os.environ.get("GRAPH_RECON_CONFIG") == prior, "GRAPH_RECON_CONFIG value leaked"
    after = tpl_cfg.read_bytes() if tpl_cfg.exists() else None
    assert before == after, "template reconproject.json must not be modified by tests"


if __name__ == "__main__":
    for fn in (test_run_fail_closed_missing_graph_input,
               test_run_fail_closed_malformed_graph_input,
               test_run_writes_findings_deduped,
               test_verify_rerun_baseline_then_match, test_analysis_manifest_written_and_valid,
               test_ephemeral_layer_excluded_from_pin, test_packs_flag_loads_pack_scanners,
               test_config_overrides_ephemeral_lens_budget, test_core_run_clean_env_isolated):
        fn()
        print(f"OK {fn.__name__}")
    print("test_cli OK (all)")
