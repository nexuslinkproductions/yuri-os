"""M2 item 1: hashfreeze v2 (M5-W2) — membership closure + provenance + schema.

Fixtures: happy path (0 violations), new-file, deleted-file, tampered-hash,
tampered-commit, all-zeros-commit — every tamper/drift fixture must return
>= 1 violation.
"""
import json
import os
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

from reconloop.hashfreeze import (  # noqa: E402
    build_hashfreeze, verify_hashfreeze, write_hashfreeze, FROZEN_PINS)

# The M4-W5 freeze commit (89676dceb… = the commit hashfreeze.json pins).
REAL_COMMIT = "89676dcebb1b4e0afab6d4df273e857583f25429"


def _copy_tree(dst_root: Path) -> Path:
    """Full copy of ROOT without pycache residue (used by drift fixtures)."""
    t = dst_root / "t"
    shutil.copytree(ROOT, t, ignore=shutil.ignore_patterns("__pycache__", "*.pyc"))
    return t


def _make_git_repo(template_root: Path) -> str:
    """Seed template_root as a scratch git repo; returns HEAD sha (40-hex)."""
    env = dict(os.environ, GIT_AUTHOR_NAME="t", GIT_AUTHOR_EMAIL="t@t",
               GIT_COMMITTER_NAME="t", GIT_COMMITTER_EMAIL="t@t")
    subprocess.run(["git", "init", "-q", "-b", "main", str(template_root)], check=True)
    subprocess.run(["git", "-C", str(template_root), "add", "-A"], check=True)
    subprocess.run(["git", "-C", str(template_root), "commit", "-q", "-m", "seed"],
                   check=True, env=env)
    r = subprocess.run(["git", "-C", str(template_root), "rev-parse", "HEAD"],
                       check=True, capture_output=True, text=True)
    return r.stdout.strip()


def test_hashfreeze_write_verify_roundtrip() -> None:
    # build against the real ROOT, verify matches: happy path must stay green
    freeze = build_hashfreeze(template_root=ROOT, commit=REAL_COMMIT)
    assert freeze["input_pins"]["v3_deduped"] == FROZEN_PINS["v3_deduped"]
    assert freeze["input_pins"]["canonical_deduped"] == FROZEN_PINS["canonical_deduped"]
    assert "route_binding.py" in freeze["scanners"]
    assert "analysis-manifest.schema.json" in freeze["schemas"]
    assert "lens-card.schema.json" in freeze["schemas"]
    v = verify_hashfreeze(ROOT, freeze)
    assert v == [], v


def test_hashfreeze_on_disk_freeze_green() -> None:
    # the regenerated hashfreeze.json itself: 0 violations (v2 happy path)
    v = verify_hashfreeze(ROOT)
    assert v == [], v


def test_hashfreeze_tamper_detected() -> None:
    freeze = build_hashfreeze(template_root=ROOT, commit=REAL_COMMIT)
    for sec in ("scanners", "schemas", "engine"):
        name = next(iter(freeze[sec]))
        bad = dict(freeze)
        bad[sec] = dict(freeze[sec])
        bad[sec][name] = "0" * 64  # tamper one hash
        v = verify_hashfreeze(ROOT, bad)
        assert any(name in x for x in v), (name, v)
    # tamper lens config
    bad = dict(freeze)
    bad["lens_config_sha256"] = "0" * 64
    assert any("lens_config" in x for x in verify_hashfreeze(ROOT, bad))
    # tamper an input pin
    bad = dict(freeze)
    bad["input_pins"] = {"v3_deduped": "0" * 64, "canonical_deduped": FROZEN_PINS["canonical_deduped"]}
    assert any("input_pin" in x for x in verify_hashfreeze(ROOT, bad))
    # tamper a fixture
    bad = dict(freeze)
    bad["fixtures"] = dict(freeze["fixtures"])
    fname = next(iter(bad["fixtures"]))
    bad["fixtures"][fname] = "0" * 64
    assert any(fname in x for x in verify_hashfreeze(ROOT, bad))
    print("tamper detection OK")


def test_hashfreeze_new_file_flagged() -> None:
    # membership closure: new file on disk not present in the freeze => violation
    with tempfile.TemporaryDirectory(prefix="hf-new-") as td:
        t = _copy_tree(Path(td))
        freeze = build_hashfreeze(template_root=t, commit=REAL_COMMIT)
        assert verify_hashfreeze(t, freeze) == []
        (t / "scanners" / "evader_lens.py").write_text("# new scanner added post-freeze\n")
        (t / "reconloop" / "extra_engine.py").write_text("# new engine module post-freeze\n")
        v = verify_hashfreeze(t, freeze)
        assert any("scanners/evader_lens.py" in x and "not in freeze" in x for x in v), v
        assert any("engine/extra_engine.py" in x and "not in freeze" in x for x in v), v
    print("new-file closure OK")


def test_hashfreeze_deleted_file_flagged() -> None:
    # membership closure: frozen entry missing on disk (deletion) => violation
    with tempfile.TemporaryDirectory(prefix="hf-del-") as td:
        t = _copy_tree(Path(td))
        freeze = build_hashfreeze(template_root=t, commit=REAL_COMMIT)
        assert verify_hashfreeze(t, freeze) == []
        (t / "scanners" / "route_binding.py").unlink()
        (t / "reconloop" / "model.py").unlink()
        (t / "packs" / "yuri" / "organs.py").unlink()
        (t / "tests" / "fixtures" / "analytics_graph.jsonl").unlink()
        v = verify_hashfreeze(t, freeze)
        assert any("scanners/route_binding.py" in x and "missing on disk" in x for x in v), v
        assert any("engine/model.py" in x and "missing on disk" in x for x in v), v
        assert any("packs/yuri/organs.py" in x and "missing on disk" in x for x in v), v
        assert any("fixtures/analytics_graph.jsonl" in x and "missing on disk" in x for x in v), v
    print("deleted-file closure OK")


def test_hashfreeze_provenance_git_object() -> None:
    # in a git repo: commit must exist as a git object (git cat-file -e)
    with tempfile.TemporaryDirectory(prefix="hf-git-") as td:
        t = _copy_tree(Path(td))
        sha = _make_git_repo(t)
        freeze = build_hashfreeze(template_root=t, commit=sha)
        assert verify_hashfreeze(t, freeze) == [], verify_hashfreeze(t, freeze)
        # tampered-commit: a plausible 40-hex sha that is not a git object
        bad = dict(freeze)
        bad["commit"] = "1" * 40
        v = verify_hashfreeze(t, bad)
        assert any("commit" in x and "git object" in x for x in v), v
        # all-zeros-commit: reserved null sha — never a git object
        bad = dict(freeze)
        bad["commit"] = "0" * 40
        v = verify_hashfreeze(t, bad)
        assert any("commit" in x for x in v), v
        # toggles: hash-only verification skips the git-object check
        v = verify_hashfreeze(t, bad, check_provenance=False)
        assert not any("commit" in x for x in v), v
    print("provenance git-object OK")


def test_hashfreeze_all_zeros_commit_flagged() -> None:
    # all-zeros-commit is rejected at format level even outside a git repo
    freeze = build_hashfreeze(template_root=ROOT, commit=REAL_COMMIT)
    bad = dict(freeze)
    bad["commit"] = "0" * 40
    v = verify_hashfreeze(ROOT, bad)
    assert any("commit" in x for x in v), v
    print("all-zeros commit OK")


def test_hashfreeze_provenance_skipped_outside_repo() -> None:
    # graceful skip: not a repo => no git-object check (format still enforced)
    freeze = build_hashfreeze(template_root=ROOT, commit=REAL_COMMIT)
    bad = dict(freeze)
    bad["commit"] = "1" * 40  # 40-hex, but no repo to check against
    v = verify_hashfreeze(ROOT, bad)
    assert not any("git object" in x for x in v), v
    bad["commit"] = "89676dceb"  # abbreviated sha: format violation
    v = verify_hashfreeze(ROOT, bad)
    assert any("40-hex" in x for x in v), v
    print("provenance non-repo skip OK")


def test_hashfreeze_schema_version_flagged() -> None:
    freeze = build_hashfreeze(template_root=ROOT, commit=REAL_COMMIT)
    bad = dict(freeze)
    bad["version"] = 2
    v = verify_hashfreeze(ROOT, bad)
    assert any("freeze version" in x for x in v), v
    bad = dict(freeze)
    bad["schema"] = "other"
    v = verify_hashfreeze(ROOT, bad)
    assert any("freeze schema" in x for x in v), v
    print("schema/version check OK")


def test_hashfreeze_checks_can_be_disabled() -> None:
    # extended signature: check_membership/check_provenance toggles
    with tempfile.TemporaryDirectory(prefix="hf-off-") as td:
        t = _copy_tree(Path(td))
        freeze = build_hashfreeze(template_root=t, commit=REAL_COMMIT)
        (t / "scanners" / "evader_lens.py").write_text("# new\n")
        bad = dict(freeze)
        bad["commit"] = "0" * 40
        v = verify_hashfreeze(t, bad, check_membership=False, check_provenance=False)
        assert v == [], v
    print("checks toggles OK")


def test_lens_schema_pin() -> None:
    import hashlib
    schema = ROOT / "reconloop" / "schemas" / "lens-card.schema.json"
    pin = ROOT / "reconloop" / "schemas" / "lens-card.schema.sha256"
    assert schema.exists() and pin.exists()
    assert hashlib.sha256(schema.read_bytes()).hexdigest() == pin.read_text().strip()
    print("lens schema pin OK")


if __name__ == "__main__":
    for fn in (test_hashfreeze_write_verify_roundtrip,
               test_hashfreeze_on_disk_freeze_green,
               test_hashfreeze_tamper_detected,
               test_hashfreeze_new_file_flagged,
               test_hashfreeze_deleted_file_flagged,
               test_hashfreeze_provenance_git_object,
               test_hashfreeze_all_zeros_commit_flagged,
               test_hashfreeze_provenance_skipped_outside_repo,
               test_hashfreeze_schema_version_flagged,
               test_hashfreeze_checks_can_be_disabled,
               test_lens_schema_pin):
        fn()
        print(f"OK {fn.__name__}")
    print("test_hashfreeze OK (all)")
