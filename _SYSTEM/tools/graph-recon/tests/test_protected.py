"""M4-W1: protected catalog is config-driven (reconproject.json) with the
heritage YURI catalog as default-if-absent fallback.

Two modes, both asserted:
  1. config mode — the shipped reconproject.json generic patterns drive
     is_protected (via the module-level catalog built at import).
  2. fallback mode — load_catalog(absent path) returns the built-in heritage
     catalog, which still protects the original YURI surfaces and keeps the
     October worktrees exemption.
"""
import os
import sys
import tempfile
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

# M4-W1-FIX (DEFECT 2 — test isolation): the module-level catalog is built at
# import from discovered config ($GRAPH_RECON_CONFIG first). Scope the env so
# the SHIPPED reconproject.json governs this test process regardless of any
# leaked/ambient GRAPH_RECON_CONFIG, and restore the prior value afterwards.
_CFG_HAD = "GRAPH_RECON_CONFIG" in os.environ
_CFG_PRIOR = os.environ.get("GRAPH_RECON_CONFIG")
os.environ.pop("GRAPH_RECON_CONFIG", None)
try:
    from reconloop.protected import is_protected, load_catalog  # noqa: E402
    from reconloop.context import ScanContext  # noqa: E402
finally:
    if _CFG_HAD:
        os.environ["GRAPH_RECON_CONFIG"] = _CFG_PRIOR
    else:
        os.environ.pop("GRAPH_RECON_CONFIG", None)


def test_config_driven_generic_patterns() -> None:
    """Shipped reconproject.json patterns: .env*, .git, CI secrets, cloud
    configs, credentials, secrets dirs, node_modules, keys, runtime dirs,
    agent runtime dirs."""
    assert is_protected(".env") and is_protected("backend/.env")
    assert is_protected(".env.local") and is_protected("deploy/.env.prod")
    assert is_protected(".git/config") and is_protected(".git/objects/x")
    assert is_protected(".github/workflows/ci.yml") and is_protected(".circleci/config.yml")
    assert is_protected(".aws/credentials") and is_protected(".kube/config")
    assert is_protected("credentials.json") and is_protected("auth.json")
    assert is_protected("secrets/prod.key") and is_protected(".secrets/token")
    assert is_protected("node_modules/pkg/index.js")
    assert is_protected("id_rsa") and is_protected("certs/server.pem")
    assert is_protected("backend/data/db.sqlite") and is_protected("runtime/state.db")
    assert is_protected(".claude/state/x.json") and is_protected(".codex/sessions/y.json")
    # generic surface must NOT classify ordinary project files
    assert not is_protected("_SYSTEM/Scripts/x.mjs")
    assert not is_protected("src/main.py")
    assert not is_protected("docs/README.md")


def test_context_read_guard_and_meta_only() -> None:
    """read_text returns None for protected paths; meta_only is metadata-only."""
    with tempfile.TemporaryDirectory() as td:
        td = Path(td)
        (td / "backend").mkdir()
        (td / "backend" / ".env").write_text("TOKEN=x\n")
        (td / "src").mkdir()
        (td / "src" / "app.py").write_text("print(1)\n")
        ctx = ScanContext(str(td))
        assert ctx.read_text("backend/.env") is None
        assert ctx.read_text("src/app.py") == "print(1)\n"
        meta = ctx.meta_only("backend/.env")
        assert meta["exists"] is True
        assert "content_sha256_prefix" in meta and meta["content_sha256_prefix"]
        assert "size" in meta and meta["size"] == len("TOKEN=x\n")


def test_heritage_fallback_default_if_absent() -> None:
    """Absent/malformed config => built-in heritage catalog (YURI surfaces)."""
    heritage = load_catalog(Path(tempfile.mkdtemp()) / "reconproject.json")  # does not exist
    def p(rel: str) -> bool:
        return any(r.search(rel) for r in heritage)
    assert p("_SYSTEM/OS_KERNEL/memory.db")
    assert p("Library/Application Support/October/app.db")
    assert p("Library/Application Support/October/october.sqlite3")
    assert not p("Library/Application Support/October/worktrees/w/y.mjs")
    assert p(".claude/user-auth.json")
    assert p("backend/data/db.sqlite") and p("node_modules/x/y.js")
    # malformed config file also falls back
    with tempfile.TemporaryDirectory() as td:
        bad = Path(td) / "reconproject.json"
        bad.write_text("{not json")
        fb = load_catalog(bad)
        assert any(r.search("OS_KERNEL/memory") for r in fb)


if __name__ == "__main__":
    for fn in (test_config_driven_generic_patterns, test_context_read_guard_and_meta_only,
               test_heritage_fallback_default_if_absent):
        fn()
        print(f"OK {fn.__name__}")
    print("test_protected OK (all)")
