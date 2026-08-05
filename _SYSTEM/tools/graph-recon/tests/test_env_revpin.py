"""M2.2: env scanners are REVISION-PINNED — same revision at two different
working trees => identical output (env_files + env_process_edges).

Covers:
- tracked env-file enumeration via git ls-tree (glob semantics *.env*,
  node_modules/.venv excluded) — untracked/ignored working-tree env files
  are NOT scanned, tracked ones are found even when absent from the tree.
- metadata from git blobs: size + sha256-prefix (hash only — secret VALUES
  never appear in output); mtime:null, perm:null; deterministic across trees.
- env_process_edges consumes the SAME inventory (untracked env referenced by
  a consumer => no edge; tracked env => edge).
- revision pinning: output unchanged after working-tree mutation, changes
  only when the REVISION changes.
"""
import subprocess
import sys
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

from reconloop.context import ScanContext  # noqa: E402
from scanners.env_files import EnvFilesScanner, tracked_env_files  # noqa: E402
from scanners.env_process_edges import EnvProcessEdgesScanner  # noqa: E402

FIXTURE_PAYLOAD = "SENTINEL_VALUE=do-not-emit-me-please\n"


def git(repo: Path, *args: str) -> None:
    subprocess.run(["git", "-C", str(repo), *args], check=True, capture_output=True)


def build_fixture() -> tuple[Path, str, str]:
    """Temp repo with tracked env files (real + template + nested + excluded
    node_modules/.venv) and consumers. Returns (repo, rev1, rev2)."""
    td = tempfile.mkdtemp(prefix="env-revpin-")
    repo = Path(td) / "repo"
    repo.mkdir()
    git(repo, "init", "-b", "main")
    git(repo, "config", "user.email", "t@t")
    git(repo, "config", "user.name", "t")
    files = {
        ".env": FIXTURE_PAYLOAD + "OTHER=x\n",
        "backend/.env": "BACKEND_KEY=1\n",
        "backend/.env.local": "DB_URL=postgres://localhost:5432/x\n",
        ".env.example": "# template\nFOO=\n",
        "docs/setup.env.backup": "OLD=1\n",
        "node_modules/pkg/.env": "IGNORED=1\n",       # excluded: node_modules
        ".venv/lib/.env": "IGNORED=2\n",              # excluded: .venv
        "run.sh": "#!/bin/sh\nsource backend/.env\n",
        "service.json": '{"env_file": "backend/.env"}\n',
        "orphan.sh": "#!/bin/sh\nsource extra.env\n",  # refs an env NOT tracked
    }
    for rel, content in files.items():
        p = repo / rel
        p.parent.mkdir(parents=True, exist_ok=True)
        p.write_text(content)
    git(repo, "add", "-A")
    git(repo, "commit", "-m", "fixture")
    rev1 = subprocess.run(["git", "-C", str(repo), "rev-parse", "HEAD"],
                          capture_output=True, text=True).stdout.strip()
    # rev2 adds a tracked env file
    (repo / "new.env").write_text("NEW=1\n")
    git(repo, "add", "new.env")
    git(repo, "commit", "-m", "add new.env")
    rev2 = subprocess.run(["git", "-C", str(repo), "rev-parse", "HEAD"],
                          capture_output=True, text=True).stdout.strip()
    return repo, rev1, rev2


def clone(repo: Path, name: str) -> Path:
    w = Path(tempfile.mkdtemp(prefix=f"env-revpin-{name}-")) / "w"
    subprocess.run(["git", "clone", "-q", str(repo), str(w)], check=True)
    return w


def dump_env_files(ctx) -> list:
    return sorted(n.to_jsonl() for n in EnvFilesScanner().run(ctx).nodes)


def dump_env_edges(ctx) -> list:
    res = EnvProcessEdgesScanner().run(ctx)
    return (sorted(e.to_jsonl() for e in res.edges) +
            sorted(n.to_jsonl() for n in res.nodes))


def test_revpin_two_working_trees_identical() -> None:
    repo, rev1, rev2 = build_fixture()
    w1, w2 = clone(repo, "w1"), clone(repo, "w2")
    c1 = ScanContext(str(w1), revision=rev1)
    c2 = ScanContext(str(w2), revision=rev1)
    assert dump_env_files(c1) == dump_env_files(c2), "env_files identical across trees"
    assert dump_env_edges(c1) == dump_env_edges(c2), "env_process_edges identical across trees"
    print("  two working trees, same revision -> identical output")


def test_working_tree_mutation_ignored() -> None:
    repo, rev1, rev2 = build_fixture()
    w1, w2 = clone(repo, "w1"), clone(repo, "w2")
    c1 = ScanContext(str(w1), revision=rev1)
    # mutate w2: untracked env file, deleted tracked env file, altered content
    (w2 / "untracked.env").write_text("NEW=1\n")
    (w2 / "backend" / ".env.local").unlink()
    (w2 / ".env").write_text("MUTATED=1\n")
    c2 = ScanContext(str(w2), revision=rev1)
    assert dump_env_files(c1) == dump_env_files(c2), "working-tree state must not matter"
    assert dump_env_edges(c1) == dump_env_edges(c2), "edges stable under working-tree mutation"
    print("  working-tree mutation (add/delete/edit env) -> identical output")


def test_revision_changes_inventory() -> None:
    repo, rev1, rev2 = build_fixture()
    w = clone(repo, "w")
    c1 = ScanContext(str(w), revision=rev1)
    c2 = ScanContext(str(w), revision=rev2)
    ids1 = {n.id for n in EnvFilesScanner().run(c1).nodes}
    ids2 = {n.id for n in EnvFilesScanner().run(c2).nodes}
    assert "env_file:new.env" not in ids1, "rev1 must not see rev2's file"
    assert "env_file:new.env" in ids2, "rev2 sees new.env"
    assert ids1 <= ids2 and len(ids2) == len(ids1) + 1
    # env_process_edges inventory follows the same pin
    res1 = EnvProcessEdgesScanner().run(c1)
    s1 = next(n for n in res1.nodes if n.kind == "layer")
    res2 = EnvProcessEdgesScanner().run(c2)
    s2 = next(n for n in res2.nodes if n.kind == "layer")
    assert s1.props["env_files_inventory"] == 5 and s2.props["env_files_inventory"] == 6, (
        s1.props["env_files_inventory"], s2.props["env_files_inventory"])
    print("  inventory follows the pinned revision (rev1=5, rev2=6)")


def test_metadata_from_blobs_hash_only() -> None:
    repo, rev1, rev2 = build_fixture()
    w = clone(repo, "w")
    c = ScanContext(str(w), revision=rev1)
    nodes = {n.id: n for n in EnvFilesScanner().run(c).nodes}
    assert len(nodes) == 5, sorted(nodes)
    assert nodes["env_file:.env"].props["size"] == len(FIXTURE_PAYLOAD) + len("OTHER=x\n")
    assert nodes["env_file:.env"].props["content_sha256_prefix"] == "248f147e07510870", \
        nodes["env_file:.env"].props["content_sha256_prefix"]
    assert nodes["env_file:.env"].props["mtime"] is None
    assert nodes["env_file:.env"].props["perm"] is None
    assert nodes["env_file:.env"].props["exists"] is True
    assert nodes["env_file:.env"].props["revision"] == rev1
    assert nodes["env_file:.env"].props["path"] == ".env"  # repo-relative, not abs
    assert all(n.props["size"] is not None for n in nodes.values())
    assert all(len(n.props["content_sha256_prefix"]) == 16 for n in nodes.values())
    # hash-only: no secret VALUE anywhere in emitted records
    blob = "\n".join(n.to_jsonl() for n in nodes.values())
    assert FIXTURE_PAYLOAD.strip() not in blob and "do-not-emit-me" not in blob
    assert "SENTINEL_VALUE" not in blob and "DB_URL" not in blob
    print("  metadata from git blobs: size + 16-hex sha256 prefix, mtime/perm null, no values")


def test_env_process_edges_same_inventory() -> None:
    repo, rev1, rev2 = build_fixture()
    w = clone(repo, "w")
    c = ScanContext(str(w), revision=rev1)
    res = EnvProcessEdgesScanner().run(c)
    edges = {(e.from_, e.to) for e in res.edges if e.kind == "env_to_process"}
    assert ("env_file:backend/.env", "file:run.sh") in edges, edges
    assert ("env_file:backend/.env", "file:service.json") in edges, edges
    # orphan.sh references extra.env — untracked => NOT an edge (same inventory)
    assert not any(e.to == "file:orphan.sh" for e in res.edges), res.edges
    summary = next(n for n in res.nodes if n.kind == "layer")
    assert summary.props["env_files_inventory"] == len(tracked_env_files(c))
    assert summary.props["env_files_inventory"] == 5
    print("  env_process_edges consumes the SAME revision-pinned inventory (untracked refs skipped)")


if __name__ == "__main__":
    for fn in (test_revpin_two_working_trees_identical,
               test_working_tree_mutation_ignored,
               test_revision_changes_inventory,
               test_metadata_from_blobs_hash_only,
               test_env_process_edges_same_inventory):
        fn()
        print(f"OK {fn.__name__}")
    print("test_env_revpin OK (all)")
