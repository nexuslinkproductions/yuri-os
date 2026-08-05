"""M4-W2 init CLI tests — scaffolding, idempotency, run-on-scaffold.

Runs the REAL CLI entrypoint as subprocesses (cwd = scaffold for the run,
so the scaffold's own reconloop + reconproject.json are exercised, not the
test copy). Deterministic: temp target dirs, GRAPH_RECON_CONFIG scoped
absent, fixture graph input for the analytics scanners.
"""
import json
import os
import subprocess
import sys
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

FIXTURE = ROOT / "tests" / "fixtures" / "analytics_graph.jsonl"
GRAPH_RECON_CONFIG = "GRAPH_RECON_CONFIG"


def _env() -> dict:
    env = dict(os.environ)
    env.pop(GRAPH_RECON_CONFIG, None)
    env.pop("PYTHONDONTWRITEBYTECODE", None)
    return env


def run_init(target: Path, force: bool = False) -> subprocess.CompletedProcess:
    cmd = [sys.executable, "-m", "reconloop.cli", "init", str(target)]
    if force:
        cmd.append("--force")
    return subprocess.run(cmd, cwd=str(ROOT), capture_output=True, text=True,
                          timeout=180, env=_env())


def run_scan(target: Path) -> subprocess.CompletedProcess:
    return subprocess.run([sys.executable, "-m", "reconloop.cli", "scan",
                           "--root", "."], cwd=str(target),
                          capture_output=True, text=True, timeout=180,
                          env=_env())


def run_full(target: Path) -> subprocess.CompletedProcess:
    """The README first-run command on the scaffolded project (fixture graph
    input for the analytics scanners, which fail closed without one)."""
    return subprocess.run(
        [sys.executable, "-m", "reconloop.cli", "run", "--root", ".",
         "--scanners-dir", "scanners", "--layers", "out/layers",
         "--graph", "out/graph.jsonl", "--pin", "out/graph.sha256",
         "--findings-dir", "out/findings", "--graph-input", str(FIXTURE)],
        cwd=str(target), capture_output=True, text=True, timeout=300,
        env=_env())


def test_init_scaffolds_project_files() -> None:
    """init writes reconproject.json (template defaults + self root marker),
    a starter .gitignore (env/protected/runtime), the engine, scanners, and
    pyproject.toml — with no __pycache__ artifacts."""
    with tempfile.TemporaryDirectory() as td:
        target = Path(td) / "proj"
        proc = run_init(target)
        assert proc.returncode == 0, proc.stdout + proc.stderr
        assert "scaffolded graph-recon project" in proc.stdout
        assert "first run" in proc.stdout
        for rel in ("reconproject.json", ".gitignore", "pyproject.toml",
                    "reconloop/cli.py", "reconloop/query.py",
                    "scanners/base.py", "packs/yuri/manifest.json"):
            assert (target / rel).exists(), f"missing {rel}"
        cfg = json.loads((target / "reconproject.json").read_text())
        markers = cfg["root"]["markers"]
        assert "reconproject.json" in markers, markers
        assert "pyproject.toml" in markers, markers
        assert cfg["protected"]["patterns"], "protected defaults must carry over"
        gi = (target / ".gitignore").read_text()
        for pat in (".env", "credentials.json", "node_modules/", "data/",
                    "out/", "__pycache__/"):
            assert pat in gi, f".gitignore missing {pat!r}"
        assert not list(target.rglob("__pycache__")), "no pycache in scaffold"
        # root markers make the scaffold self-discoverable
        from reconloop.config import discover_root  # noqa: E402
        found = discover_root(start=target / "out",
                              markers=cfg["root"]["markers"])
        assert found == target.resolve(), found


def test_init_run_works_on_scaffold() -> None:
    """The scaffolded project is a complete working template: scan lists the
    core scanners, run produces the merged graph + sha256 pin + manifest."""
    with tempfile.TemporaryDirectory() as td:
        target = Path(td) / "proj"
        assert run_init(target).returncode == 0
        scan = run_scan(target)
        assert scan.returncode == 0, scan.stdout + scan.stderr
        assert "27 scanners loaded" in scan.stdout, scan.stdout
        run = run_full(target)
        assert run.returncode == 0, run.stdout[-2000:] + run.stderr[-2000:]
        assert (target / "out/graph.jsonl").exists()
        assert (target / "out/graph.sha256").exists()
        assert (target / "out/layers/analysis-manifest.json").exists()
        graph = (target / "out/graph.jsonl").read_text()
        assert '"id"' in graph, "merged graph must contain node records"
        pin = (target / "out/graph.sha256").read_text().strip()
        assert len(pin) == 64, pin


def test_init_idempotent_refuse_then_force() -> None:
    """Second init without --force refuses (rc 1) and leaves the scaffold
    byte-identical; --force regenerates it (byte-identical again)."""
    with tempfile.TemporaryDirectory() as td:
        target = Path(td) / "proj"
        assert run_init(target).returncode == 0
        before = (target / "reconproject.json").read_bytes()
        gi_before = (target / ".gitignore").read_bytes()
        proc = run_init(target)
        assert proc.returncode == 1, proc.stdout + proc.stderr
        assert "REFUSE" in proc.stdout, proc.stdout
        assert (target / "reconproject.json").read_bytes() == before
        assert (target / ".gitignore").read_bytes() == gi_before
        proc = run_init(target, force=True)
        assert proc.returncode == 0, proc.stdout + proc.stderr
        assert (target / "reconproject.json").read_bytes() == before
        assert (target / ".gitignore").read_bytes() == gi_before
        assert (target / "reconloop/cli.py").exists()


def test_init_refuses_nonempty_unrelated_dir() -> None:
    """A non-empty dir with unrelated content is refused too (no clobber)."""
    with tempfile.TemporaryDirectory() as td:
        target = Path(td) / "proj"
        target.mkdir()
        (target / "README.md").write_text("keep me")
        proc = run_init(target)
        assert proc.returncode == 1 and "REFUSE" in proc.stdout
        assert (target / "README.md").read_text() == "keep me"


if __name__ == "__main__":
    for fn in (test_init_scaffolds_project_files,
               test_init_run_works_on_scaffold,
               test_init_idempotent_refuse_then_force,
               test_init_refuses_nonempty_unrelated_dir):
        fn()
        print(f"OK {fn.__name__}")
    print("test_init OK (all)")
