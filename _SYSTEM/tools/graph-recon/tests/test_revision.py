"""Fixture: file layer is revision-pinned and branch-independent (Orion fix 2026-08-04)."""
import subprocess, sys, tempfile
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from reconloop.context import ScanContext
from scanners.file_inventory import FileInventoryScanner

def git(repo: Path, *args: str) -> None:
    subprocess.run(["git", "-C", str(repo), *args], check=True, capture_output=True)

with tempfile.TemporaryDirectory() as td:
    repo = Path(td) / "fixture"
    repo.mkdir()
    git(repo, "init", "-b", "main")
    git(repo, "config", "user.email", "t@t"); git(repo, "config", "user.name", "t")
    (repo / "a.py").write_text("x")
    git(repo, "add", "a.py"); git(repo, "commit", "-m", "a")
    rev_a = subprocess.run(["git","-C",str(repo),"rev-parse","HEAD"],capture_output=True,text=True).stdout.strip()
    (repo / "b.py").write_text("y")
    git(repo, "add", "b.py"); git(repo, "commit", "-m", "b")
    rev_b = subprocess.run(["git","-C",str(repo),"rev-parse","HEAD"],capture_output=True,text=True).stdout.strip()
    ca = ScanContext(str(repo), revision=rev_a)
    cb = ScanContext(str(repo), revision=rev_b)
    na = FileInventoryScanner().run(ca); na2 = FileInventoryScanner().run(ca)
    nb = FileInventoryScanner().run(cb)
    assert len(na.nodes) == 1 and len(nb.nodes) == 2, f"revA={len(na.nodes)} revB={len(nb.nodes)}"
    assert len(na.nodes) == len(na2.nodes), "stable across runs"
    assert [n.id for n in na.nodes] != [n.id for n in nb.nodes], "revisions differ"
    print(f"test_revision OK (revA={len(na.nodes)} revB={len(nb.nodes)}, stable)")
