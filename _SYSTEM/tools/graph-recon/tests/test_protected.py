"""M4-W1: protected catalog is config-driven (reconproject.json) with the
heritage YURI catalog as default-if-absent fallback.

Two modes, both asserted:
  1. config mode — the shipped reconproject.json generic patterns drive
     is_protected (via the module-level catalog built at import).
  2. fallback mode — load_catalog(absent path) returns the built-in heritage
     catalog, which still protects the original YURI surfaces and keeps the
     October worktrees exemption.
"""
import json
import os
import subprocess
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
    from reconloop.protected import is_protected, load_catalog, meta_only  # noqa: E402
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


def test_invalid_configured_regex_never_crashes() -> None:
    """M5-W3 (defect 7): a bad regex in protected.patterns must not crash
    import: it is recorded via config_errors() with the pattern named, the
    valid remainder stays active, and reload restores a clean state."""
    from reconloop.protected import config_errors, reload_catalog, is_protected  # noqa: E402
    had = "GRAPH_RECON_CONFIG" in os.environ
    prior = os.environ.get("GRAPH_RECON_CONFIG")
    os.environ.pop("GRAPH_RECON_CONFIG", None)
    try:
        with tempfile.TemporaryDirectory() as td:
            cfg = Path(td) / "reconproject.json"
            cfg.write_text(json.dumps({"protected": {"patterns": [
                r"\.env($|\.|/)", "(unclosed[", r"credentials\.json$"]}}))
            pats = reload_catalog(cfg)
            errs = config_errors()
            assert len(errs) == 1, errs
            assert errs[0]["pattern"] == "(unclosed[", errs
            assert "unterminated" in errs[0]["error"], errs
            # valid patterns still compiled and active
            assert any(r.search("x/.env") for r in pats)
            assert is_protected(".env") and is_protected("credentials.json")
        # restore the shipped config: errors cleared
        reload_catalog()
        assert config_errors() == []
        assert is_protected(".env")
    finally:
        if had:
            os.environ["GRAPH_RECON_CONFIG"] = prior
        else:
            os.environ.pop("GRAPH_RECON_CONFIG", None)


def test_run_fail_closed_on_invalid_regex() -> None:
    """CLI: a run with an invalid configured regex => config.ERROR.jsonl
    naming the bad pattern + rc 1 — never a crash mid-import."""
    with tempfile.TemporaryDirectory() as td:
        td = Path(td)
        cfg = td / "reconproject.json"
        cfg.write_text(json.dumps({"protected": {"patterns": ["(bad[", r"\.env($|\.|/)"]}}))
        env = dict(os.environ)
        env.pop("PYTHONDONTWRITEBYTECODE", None)
        env["GRAPH_RECON_CONFIG"] = str(cfg)
        cmd = [sys.executable, "-m", "reconloop.cli", "run",
               "--root", str(Path(__file__).resolve().parent.parent),
               "--scanners-dir", str(Path(__file__).resolve().parent.parent / "scanners"),
               "--layers", str(td / "layers"), "--graph", str(td / "graph.jsonl"),
               "--pin", str(td / "graph.sha256"),
               "--findings-dir", str(td / "findings"),
               "--graph-input", str(Path(__file__).resolve().parent / "fixtures" / "analytics_graph.jsonl")]
        p = subprocess.run(cmd, cwd=str(Path(__file__).resolve().parent.parent),
                           capture_output=True, text=True, timeout=300, env=env)
        assert p.returncode == 1, p.stdout + p.stderr
        assert "CONFIG FAIL-CLOSED" in p.stdout, p.stdout
        assert "(bad[" in p.stdout, p.stdout  # bad pattern named
        el = td / "layers" / "config.ERROR.jsonl"
        assert el.exists(), list((td / "layers").iterdir()) if (td / "layers").exists() else "no layers dir"
        recs = [json.loads(l) for l in el.read_text().splitlines() if l.strip()]
        assert len(recs) == 1, recs
        assert recs[0]["props"]["pattern"] == "(bad[", recs
        assert not (td / "graph.jsonl").exists(), "no merge on config error"


 
 
# ---- M5-W4: hash gate (protected.hash_content / protected.hash_bytes) ----

class ReadGuard(Path):
    """Path stub that records every open() attempt instead of opening.

    Lets the fixture PROVE the gate: hash_content=false must never call
    open() on a protected canary; hash_content=true must call it exactly
    once (fixture soundness — the guard can actually detect opens).
    """
    opened: int = 0

    def open(self, *a, **k):
        type(self).opened += 1
        raise PermissionError("ReadGuard: canary content is not readable")


def test_meta_only_gate_off_never_opens_canary() -> None:
    """Gate off => stat only: ReadGuard.open() is NEVER called on the canary."""
    with tempfile.TemporaryDirectory() as td:
        canary = Path(td) / ".env"
        canary.write_text("TOKEN=super-secret\n")
        ReadGuard.opened = 0
        meta = meta_only(ReadGuard(str(canary)), hash_content=False, hash_bytes=1048576)
        assert ReadGuard.opened == 0, "open() called with hash_content=false"
        assert meta["exists"] is True
        assert meta["hash_content"] is False
        assert meta["hash_bytes"] == 1048576
        assert meta["content_sha256_prefix"] == ""
        assert meta["size"] == len("TOKEN=super-secret\n")
        assert meta["perm_octal"] == oct(canary.stat().st_mode & 0o777)
        # control: with the gate ON the same guard must observe the open
        ReadGuard.opened = 0
        meta_on = meta_only(ReadGuard(str(canary)), hash_content=True, hash_bytes=1048576)
        assert ReadGuard.opened == 1, "gate-on fixture must detect the open"
        assert meta_on["content_sha256_prefix"] == ""  # guard refuses reads; degrades empty, never raises


def test_meta_only_gate_on_prefix_recorded() -> None:
    """Gate on => sha256-16 prefix of the first hash_bytes content bytes."""
    import hashlib
    with tempfile.TemporaryDirectory() as td:
        canary = Path(td) / "secrets.env"
        payload = "TOKEN=super-secret\n"
        canary.write_text(payload)
        meta = meta_only(canary, hash_content=True, hash_bytes=1048576)
        assert meta["hash_content"] is True
        assert meta["content_sha256_prefix"] == hashlib.sha256(payload.encode()).hexdigest()[:16]
        # hash_bytes window: only the first N bytes are hashed
        meta_small = meta_only(canary, hash_content=True, hash_bytes=4)
        assert meta_small["content_sha256_prefix"] == hashlib.sha256(payload[:4].encode()).hexdigest()[:16]
        assert meta_small["hash_bytes"] == 4
        # default args honor the shipped config gate (env cleared => engine config)
        ReadGuard.opened = 0
        meta_default = meta_only(canary)
        assert meta_default["hash_content"] is True
        assert meta_default["hash_bytes"] == 1048576
        assert meta_default["content_sha256_prefix"] == hashlib.sha256(payload.encode()).hexdigest()[:16]


def test_meta_only_config_gate_off_via_reconproject() -> None:
    """reconproject.json protected.hash_content=false => stat only, even for a
    permission-denied canary (chmod 000): no open, no crash, empty prefix."""
    import json
    with tempfile.TemporaryDirectory() as td:
        td = Path(td)
        cfg = td / "reconproject.json"
        cfg.write_text(json.dumps({"protected": {"patterns": [r"\.env($|\.|/)"],
                                                "hash_content": False,
                                                "hash_bytes": 1048576}}))
        canary = td / ".env"
        canary.write_text("TOKEN=super-secret\n")
        canary.chmod(0o000)  # permission-denied sentinel: only stat() may succeed
        try:
            os.environ["GRAPH_RECON_CONFIG"] = str(cfg)
            meta = meta_only(canary)  # gate read from config at call time
            assert meta["exists"] is True
            assert meta["hash_content"] is False
            assert meta["content_sha256_prefix"] == ""
            assert meta["size"] == len("TOKEN=super-secret\n")
        finally:
            os.environ.pop("GRAPH_RECON_CONFIG", None)
            canary.chmod(0o644)
        # control: same config, gate ON => hash fails closed to empty prefix
        cfg.write_text(json.dumps({"protected": {"patterns": [r"\.env($|\.|/)"],
                                                "hash_content": True,
                                                "hash_bytes": 1048576}}))
        canary.chmod(0o000)  # re-apply permission-denied sentinel
        os.environ["GRAPH_RECON_CONFIG"] = str(cfg)
        try:
            meta_on = meta_only(canary)
            assert meta_on["hash_content"] is True
            assert meta_on["content_sha256_prefix"] == ""  # unreadable => no prefix, no exception
        finally:
            os.environ.pop("GRAPH_RECON_CONFIG", None)
            canary.chmod(0o644)


def test_config_gate_defaults_and_shipped() -> None:
    """protected.hash_content defaults true; hash_bytes defaults 1048576;
    shipped reconproject.json carries the gate explicitly."""
    import json
    from reconloop.config import load_reconproject, DEFAULTS
    assert DEFAULTS["protected"]["hash_content"] is True
    assert DEFAULTS["protected"]["hash_bytes"] == 1048576
    # partial user config keeps gate defaults (shallow merge)
    with tempfile.TemporaryDirectory() as td:
        cfg = Path(td) / "reconproject.json"
        cfg.write_text(json.dumps({"protected": {"patterns": [r"\.env$"]}}))
        merged = load_reconproject(cfg)["protected"]
        assert merged["hash_content"] is True and merged["hash_bytes"] == 1048576
    shipped = load_reconproject(Path(__file__).resolve().parent.parent / "reconproject.json")
    assert shipped["protected"]["hash_content"] is True
    assert shipped["protected"]["hash_bytes"] == 1048576


def test_scanner_records_hash_content_per_node() -> None:
    """protected_paths scanner honors the gate and records hash_content per node:
    gate on => prefix recorded; gate off => stat only, empty prefix."""
    import hashlib
    import json
    from scanners.protected_paths import ProtectedPathsScanner
    with tempfile.TemporaryDirectory() as td:
        root = Path(td)
        (root / ".env").write_text("TOKEN=super-secret\n")
        (root / "src").mkdir()
        (root / "src" / "app.py").write_text("print(1)\n")
        ctx = ScanContext(str(root))
        # gate ON (shipped config): prefix recorded, hash_content True
        nodes = ProtectedPathsScanner().run(ctx).nodes
        env = [n for n in nodes if n.id == "protected_path:.env"]
        assert len(env) == 1
        assert env[0].props["hash_content"] is True
        assert len(env[0].props["content_sha256_prefix"]) == 16
        assert env[0].props["content_sha256_prefix"] == hashlib.sha256(b"TOKEN=super-secret\n").hexdigest()[:16]
        # gate OFF (temp config via GRAPH_RECON_CONFIG): stat only
        cfg = root / "reconproject.json"
        cfg.write_text(json.dumps({"protected": {"patterns": [r"\.env($|\.|/)"],
                                                "hash_content": False,
                                                "hash_bytes": 1048576}}))
        os.environ["GRAPH_RECON_CONFIG"] = str(cfg)
        try:
            nodes_off = ProtectedPathsScanner().run(ctx).nodes
        finally:
            os.environ.pop("GRAPH_RECON_CONFIG", None)
        env_off = [n for n in nodes_off if n.id == "protected_path:.env"]
        assert len(env_off) == 1
        assert env_off[0].props["hash_content"] is False
        assert env_off[0].props["content_sha256_prefix"] == ""
        assert env_off[0].props["size"] == len("TOKEN=super-secret\n")
        # non-protected files are never hashed by this scanner (no node at all)
        assert not any(n.id == "protected_path:src/app.py" for n in nodes)


if __name__ == "__main__":
     for fn in (test_config_driven_generic_patterns, test_context_read_guard_and_meta_only,
               test_heritage_fallback_default_if_absent,
               test_meta_only_gate_off_never_opens_canary,
               test_meta_only_gate_on_prefix_recorded,
               test_meta_only_config_gate_off_via_reconproject,
               test_config_gate_defaults_and_shipped,
               test_scanner_records_hash_content_per_node):
         fn()
         print(f"OK {fn.__name__}")
     print("test_protected OK (all)")


if __name__ == "__main__":
    for fn in (test_config_driven_generic_patterns, test_context_read_guard_and_meta_only,
               test_heritage_fallback_default_if_absent,
               test_invalid_configured_regex_never_crashes,
               test_run_fail_closed_on_invalid_regex):
        fn()
        print(f"OK {fn.__name__}")
    print("test_protected OK (all)")
