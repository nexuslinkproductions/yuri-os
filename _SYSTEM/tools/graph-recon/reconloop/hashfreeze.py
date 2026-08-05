"""M2 item 1: hash-freeze — pinned scanner/schema/lens/config hashes + input pins.

hashfreeze.json records the immutable snapshot the grammar lenses run against:
  - scanner file hashes (all scanners/, incl. lenses)
  - schema hashes (analysis-manifest schema + lens schema)
  - engine/commit (the template commit that produced the freeze)
  - input pins (v3 deduped f5597cc3…, canonical deduped 148818ea…)
  - lens config (lens names, scope, admission thresholds)
  - fixtures hashes (lens fixtures — negative/metamorphic inputs)

verify_hashfreeze() — hashfreeze v2 (M5-W2) — recomputes every hash and
compares to the frozen file, and closes the freeze over membership and
provenance:
  - membership closure: exact set equality per section — any scanner/config/
    engine file on disk that is NOT in the freeze (new file) AND any frozen
    entry that is MISSING on disk (deletion) => violation
  - provenance: the freeze's commit must be a 40-hex git sha (the reserved
    all-zeros id is rejected — it can never be a git object); when the
    template root is inside a git repo the commit must exist as a git object
    (git cat-file -e), skipped gracefully when the root is not a repo
  - schema/version: the freeze file itself must declare schema=hashfreeze v1
Any tamper (scanner/schema/config/fixture change, membership drift,
provenance drift) => FAIL. This is the gate the Sol sequence requires
before lens runs are trustworthy.

Deterministic: hashes are content-addressed; commit pinned at freeze time;
violation lists are emitted in sorted order.
"""
from __future__ import annotations
import hashlib
import json
import re
import subprocess
from pathlib import Path

FREEZE_SCHEMA = "hashfreeze"
FREEZE_VERSION = 1
_COMMIT_RE = re.compile(r"^[0-9a-f]{40}$")
_ZERO_COMMIT = "0" * 40  # reserved null sha — never a valid git object

FROZEN_PINS = {
    "v3_deduped": "f5597cc33c3b0e5e93683b4af5f8265544f59d31b5055221b45889fc8f164475",
    "canonical_deduped": "148818ea40d5dfa37164ad58e9bed9149e4b37d6bc7bf75509de25887cbf5da8",
}

LENS_CONFIG = {
    "lenses": [
        {"name": "route_binding", "scope": "registry_entry + provider-route-registry file",
         "invariant": "route-registry entries must bind role + registry entry + canary-passing provider",
         "admission": "missing/wildcard role|provider|status=canary-proven"},
        {"name": "protected_writer", "scope": "file_write edges + protected catalog",
         "invariant": "file_write targets under protected paths must pass a gate",
         "admission": "file_write -> protected path without gate evidence"},
        {"name": "security_path", "scope": "source-to-sink paths over executable graph edges",
         "invariant": "security-sensitive paths require reviewable bounded witnesses",
         "admission": "source reaches security-sensitive sink"},
        {"name": "writer_to_protected", "scope": "dynamic writers + protected reach channels",
         "invariant": "dynamic writers must not reach protected paths",
         "admission": "dynamic writer with protected reach"},
        {"name": "hook_projection", "scope": "hook registry coreEntrypoint + file layer",
         "invariant": "registered hook commands resolve to existing files",
         "admission": "coreEntrypoint missing from file layer"},
        {"name": "mcp_registration", "scope": "mcp_server nodes + mcp_registration edges",
         "invariant": "mcp servers need a registration edge",
         "admission": "orphan mcp_server node (no incident mcp_registration edge)"},
        {"name": "launchd_existence", "scope": "launchd_to_script edges + file layer",
         "invariant": "launchd agent -> script target exists",
         "admission": "target absent from file layer"},
        {"name": "env_to_process", "scope": "env_file nodes + env_to_process edges",
         "invariant": "env files need >=1 incident env_to_process edge",
         "admission": "orphan env_file node"},
    ]
}


def sha256_file(p: Path) -> str:
    h = hashlib.sha256()
    with open(p, "rb") as f:
        for chunk in iter(lambda: f.read(1 << 20), b""):
            h.update(chunk)
    return h.hexdigest()


def sha256_text(s: str) -> str:
    return hashlib.sha256(s.encode("utf-8")).hexdigest()


def build_hashfreeze(*, template_root: Path, commit: str) -> dict:
    """Assemble the freeze dict (all content-addressed, deterministic)."""
    scanners = {}
    for p in sorted((template_root / "scanners").glob("*.py")):
        if p.name.startswith("_"):
            continue
        scanners[p.name] = sha256_file(p)
    schemas = {}
    for p in sorted((template_root / "reconloop" / "schemas").glob("*.json")):
        schemas[p.name] = sha256_file(p)
    fixtures = {}
    for p in sorted((template_root / "tests" / "fixtures").rglob("*")):
        if p.is_file() and not p.name.endswith((".sha256", ".md")):
            fixtures[str(p.relative_to(template_root / "tests" / "fixtures"))] = sha256_file(p)
    packs = {}
    for pdir in sorted((template_root / "packs").glob("*")):
        if not pdir.is_dir():
            continue
        packs[pdir.name] = {}
        for f in sorted(pdir.rglob("*")):
            if f.is_file() and not f.name.startswith("."):
                packs[pdir.name][str(f.relative_to(pdir))] = sha256_file(f)
    engine = {}
    for p in sorted((template_root / "reconloop").glob("*.py")):
        engine[p.name] = sha256_file(p)
    configs = {}
    config_file = template_root / "reconproject.json"
    if config_file.is_file():
        configs[config_file.name] = sha256_file(config_file)
    return {
        "schema": "hashfreeze",
        "version": 1,
        "commit": commit,
        "input_pins": dict(sorted(FROZEN_PINS.items())),
        "lens_config_sha256": sha256_text(json.dumps(LENS_CONFIG, sort_keys=True)),
        "scanners": scanners,
        "schemas": schemas,
        "engine": engine,
        "configs": configs,
        "packs": packs,
        "fixtures": fixtures,
    }


def write_hashfreeze(template_root: Path, commit: str) -> tuple[Path, dict]:
    p = template_root / "hashfreeze.json"
    freeze = build_hashfreeze(template_root=template_root, commit=commit)
    p.write_text(json.dumps(freeze, indent=2, sort_keys=True) + "\n")
    return p, freeze


def _inside_git_work_tree(template_root: Path) -> bool:
    """True when template_root resolves inside a git work tree.

    Any failure (no git binary, no repo, subprocess error) is treated as
    "not a repo" so the git-object check is skipped gracefully.
    """
    try:
        r = subprocess.run(["git", "-C", str(template_root), "rev-parse", "--is-inside-work-tree"],
                           capture_output=True, timeout=10)
    except (OSError, subprocess.SubprocessError):
        return False
    return r.returncode == 0 and r.stdout.strip() == b"true"


def _commit_is_git_object(template_root: Path, commit: str) -> bool:
    try:
        r = subprocess.run(["git", "-C", str(template_root), "cat-file", "-e", f"{commit}^{{commit}}"],
                           capture_output=True, timeout=10)
    except (OSError, subprocess.SubprocessError):
        return False
    return r.returncode == 0


def _verify_commit_provenance(template_root: Path, commit: str) -> list[str]:
    """v2 provenance checks: 40-hex format (all-zeros rejected — the reserved
    null sha can never be a git object) + git-object existence when the root
    is inside a git repo (skipped gracefully otherwise)."""
    v = []
    if not commit:
        v.append("provenance: freeze commit missing")
        return v
    if not _COMMIT_RE.match(commit):
        v.append(f"provenance: commit {commit!r} is not a 40-hex git sha")
        return v
    if commit == _ZERO_COMMIT:
        v.append("provenance: commit is the reserved all-zeros sha (not a valid git object)")
        return v
    if _inside_git_work_tree(template_root) and not _commit_is_git_object(template_root, commit):
        v.append(f"provenance: commit {commit} does not exist as a git object at the template root")
    return v


def verify_hashfreeze(template_root: Path, freeze: dict | None = None, *,
                      check_membership: bool = True,
                      check_provenance: bool = True) -> list[str]:
    """Recompute all hashes vs the frozen dict. Returns violations ([] = PASS).

    hashfreeze v2 adds, on top of the hash comparison:
      - membership closure (exact set equality per section): a file on disk
        that is not in the freeze (new file) and a frozen entry missing on
        disk (deletion) are both violations;
      - provenance: the freeze's commit must be a 40-hex git sha; inside a
        git repo it must exist as a git object (skipped gracefully when the
        root is not a repo);
      - schema/version: the freeze file itself must declare schema=hashfreeze
        and the supported version.

    `check_membership`/`check_provenance` disable the respective v2 checks
    for callers that want hash-only verification.
    """
    if freeze is None:
        p = template_root / "hashfreeze.json"
        if not p.exists():
            return ["hashfreeze.json missing"]
        try:
            freeze = json.loads(p.read_text())
        except Exception as e:
            return [f"hashfreeze.json unreadable: {e}"]
    v = []
    # (3) schema/version of the freeze file itself
    if freeze.get("schema") != FREEZE_SCHEMA:
        v.append(f"freeze schema: expected {FREEZE_SCHEMA!r}, got {freeze.get('schema')!r}")
    if freeze.get("version") != FREEZE_VERSION:
        v.append(f"freeze version: expected {FREEZE_VERSION}, got {freeze.get('version')!r}")
    # (2) provenance: commit format + git-object existence
    if check_provenance:
        v.extend(_verify_commit_provenance(template_root, freeze.get("commit", "")))
    cur = build_hashfreeze(template_root=template_root, commit=freeze.get("commit", ""))
    # (1) membership closure + hash comparison (flat sections)
    for sec in ("scanners", "schemas", "engine", "configs", "fixtures"):
        frozen = freeze.get(sec, {})
        current = cur.get(sec, {})
        if check_membership:
            for name in sorted(set(current) - set(frozen)):
                v.append(f"{sec}/{name}: on disk but not in freeze (regen required)")
            for name in sorted(set(frozen) - set(current)):
                v.append(f"{sec}/{name}: frozen but missing on disk (deleted)")
        for name in sorted(set(frozen) & set(current)):
            if current[name] != frozen[name]:
                v.append(f"{sec}/{name}: frozen {frozen[name][:12]}... != current {current[name][:12]}...")
    # (1) membership closure + hash comparison (nested packs section)
    frozen_packs = freeze.get("packs", {})
    current_packs = cur.get("packs", {})
    if check_membership:
        for p in sorted(set(current_packs) - set(frozen_packs)):
            v.append(f"packs/{p}: on disk but not in freeze (regen required)")
        for p in sorted(set(frozen_packs) - set(current_packs)):
            v.append(f"packs/{p}: frozen but missing on disk (deleted)")
    for p in sorted(set(frozen_packs) & set(current_packs)):
        fexp = frozen_packs.get(p) or {}
        gexp = current_packs.get(p) or {}
        if check_membership:
            for f in sorted(set(gexp) - set(fexp)):
                v.append(f"packs/{p}/{f}: on disk but not in freeze (regen required)")
            for f in sorted(set(fexp) - set(gexp)):
                v.append(f"packs/{p}/{f}: frozen but missing on disk (deleted)")
        for f in sorted(set(fexp) & set(gexp)):
            if gexp[f] != fexp[f]:
                v.append(f"packs/{p}/{f}: frozen {fexp[f][:12]}... != current {gexp[f][:12]}...")
    if freeze.get("lens_config_sha256") != cur["lens_config_sha256"]:
        v.append("lens_config changed")
    for pin_name, pin in freeze.get("input_pins", {}).items():
        if FROZEN_PINS.get(pin_name) != pin:
            v.append(f"input_pin {pin_name} drifted")
    return v
