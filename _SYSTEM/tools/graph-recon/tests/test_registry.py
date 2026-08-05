"""M5-W3 (Athena blocker 4): scanner import failures are fail-closed.

A scanner file that raises at import must: (1) be recorded by
registry.import_failures() with module/file/error/type, (2) produce
<name>.ERROR.jsonl in the layers dir, (3) fail `run` with rc 1 by default,
(4) be opt-outable via --tolerate-import-errors (rc 0, ERROR layers still
written, failures reported in the run summary), (5) fail `scan` with rc 1.
Never a silent '[registry] skip' with exit 0.
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

GOOD = ("from scanners.base import BaseScanner, ScanResult\n\n"
        "class TmpGood(BaseScanner):\n"
        "    name = \"tmp_good\"; dim = \"static\"\n"
        "    def run(self, ctx):\n"
        "        return ScanResult(nodes=[], edges=[], notes=\"ok\")\n")

# looks like a scanner (mentions BaseScanner) but raises at import time
BROKEN = ("from scanners.base import BaseScanner  # looks like a scanner...\n"
          "raise RuntimeError(\"m5w3 broken import\")\n")


def _make_scanners_dir(td: Path) -> Path:
    sd = td / "scanners"
    sd.mkdir()
    (sd / "broken_scanner.py").write_text(BROKEN)
    (sd / "good_scanner.py").write_text(GOOD)
    return sd


def _env() -> dict:
    env = dict(os.environ)
    env.pop("GRAPH_RECON_CONFIG", None)
    env.pop("PYTHONDONTWRITEBYTECODE", None)
    return env


def _run(td: Path, *extra: str) -> subprocess.CompletedProcess:
    cmd = [sys.executable, "-m", "reconloop.cli", "run",
           "--root", str(ROOT), "--scanners-dir", str(td / "scanners"),
           "--layers", str(td / "layers"), "--graph", str(td / "graph.jsonl"),
           "--pin", str(td / "graph.sha256"),
           "--findings-dir", str(td / "findings"),
           "--graph-input", str(FIXTURE), *extra]
    return subprocess.run(cmd, cwd=str(ROOT), capture_output=True, text=True,
                          timeout=300, env=_env())


def test_registry_records_import_failure() -> None:
    """Module level: broken file absent from the registry, failure recorded
    with file/error/type; a clean load resets the failure list."""
    from reconloop.registry import load_scanners, import_failures
    with tempfile.TemporaryDirectory() as td:
        td = Path(td)
        sd = _make_scanners_dir(td)
        reg = load_scanners(sd, template_root=str(ROOT))
        assert "tmp_good" in reg and "broken_scanner" not in reg, sorted(reg)
        fails = import_failures()
        assert [f["file"] for f in fails] == ["broken_scanner.py"], fails
        assert fails[0]["type"] == "RuntimeError"
        assert "m5w3 broken import" in fails[0]["error"]
        assert fails[0]["module"] == "scanners_broken_scanner"
        # deterministic reset: a load of a clean dir yields no failures
        clean = td / "clean_scanners"
        clean.mkdir()
        (clean / "good_scanner.py").write_text(GOOD)
        load_scanners(clean, template_root=str(ROOT))
        assert import_failures() == []


def test_run_fail_closed_on_import_error() -> None:
    """Default: rc 1, <name>.ERROR.jsonl written, no merge/pin emitted."""
    with tempfile.TemporaryDirectory() as td:
        td = Path(td)
        _make_scanners_dir(td)
        p = _run(td)
        assert p.returncode == 1, p.stdout + p.stderr
        assert "IMPORT FAIL-CLOSED" in p.stdout, p.stdout
        assert "broken_scanner.py" in p.stdout, p.stdout
        el = td / "layers" / "broken_scanner.ERROR.jsonl"
        assert el.exists(), list((td / "layers").iterdir())
        rec = json.loads(el.read_text())
        assert rec["kind"] == "error" and rec["id"] == "error:broken_scanner"
        assert "m5w3 broken import" in rec["props"]["error"]
        assert not (td / "graph.jsonl").exists(), "no merge on import failure"
        assert not (td / "graph.sha256").exists(), "no pin on import failure"


def test_run_tolerate_import_errors() -> None:
    """--tolerate-import-errors: rc 0, ERROR layers still written, failures
    reported in the run summary, merge proceeds."""
    with tempfile.TemporaryDirectory() as td:
        td = Path(td)
        _make_scanners_dir(td)
        p = _run(td, "--tolerate-import-errors")
        assert p.returncode == 0, p.stdout + p.stderr
        assert "IMPORT FAIL tolerated" in p.stdout, p.stdout
        assert "1 failure(s) tolerated" in p.stdout, p.stdout  # run summary
        assert (td / "layers" / "broken_scanner.ERROR.jsonl").exists()
        assert (td / "graph.jsonl").exists(), "tolerated run still merges"


def test_scan_fail_closed_on_import_error() -> None:
    """scan reports the missing scanner and exits 1."""
    with tempfile.TemporaryDirectory() as td:
        td = Path(td)
        _make_scanners_dir(td)
        p = subprocess.run([sys.executable, "-m", "reconloop.cli", "scan",
                            "--root", str(ROOT),
                            "--scanners-dir", str(td / "scanners")],
                           cwd=str(ROOT), capture_output=True, text=True,
                           timeout=180, env=_env())
        assert p.returncode == 1, p.stdout + p.stderr
        assert "IMPORT FAIL-CLOSED" in p.stdout and "broken_scanner.py" in p.stdout


if __name__ == "__main__":
    for fn in (test_registry_records_import_failure,
               test_run_fail_closed_on_import_error,
               test_run_tolerate_import_errors,
               test_scan_fail_closed_on_import_error):
        fn()
        print(f"OK {fn.__name__}")
    print("test_registry OK (all)")
