"""M2 item 1: hash-freeze — pinned scanner/schema/lens/config hashes + input pins.

hashfreeze.json records the immutable snapshot the grammar lenses run against:
  - scanner file hashes (all scanners/, incl. lenses)
  - schema hashes (analysis-manifest schema + lens schema)
  - engine/commit (the template commit that produced the freeze)
  - input pins (v3 deduped f5597cc3…, canonical deduped 148818ea…)
  - lens config (lens names, scope, admission thresholds)
  - fixtures hashes (lens fixtures — negative/metamorphic inputs)

verify_hashfreeze(): recomputes every hash and compares to the frozen file;
any tamper (scanner/schema/config/fixture change) => FAIL. This is the gate
the Sol sequence requires before lens runs are trustworthy.

Deterministic: hashes are content-addressed; commit pinned at freeze time.
"""
from __future__ import annotations
import hashlib
import json
from pathlib import Path

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
    return {
        "schema": "hashfreeze",
        "version": 1,
        "commit": commit,
        "input_pins": dict(sorted(FROZEN_PINS.items())),
        "lens_config_sha256": sha256_text(json.dumps(LENS_CONFIG, sort_keys=True)),
        "scanners": scanners,
        "schemas": schemas,
        "engine": engine,
        "packs": packs,
        "fixtures": fixtures,
    }


def write_hashfreeze(template_root: Path, commit: str) -> tuple[Path, dict]:
    p = template_root / "hashfreeze.json"
    freeze = build_hashfreeze(template_root=template_root, commit=commit)
    p.write_text(json.dumps(freeze, indent=2, sort_keys=True) + "\n")
    return p, freeze


def verify_hashfreeze(template_root: Path, freeze: dict | None = None) -> list[str]:
    """Recompute all hashes vs the frozen dict. Returns violations ([] = PASS)."""
    if freeze is None:
        p = template_root / "hashfreeze.json"
        if not p.exists():
            return ["hashfreeze.json missing"]
        try:
            freeze = json.loads(p.read_text())
        except Exception as e:
            return [f"hashfreeze.json unreadable: {e}"]
    cur = build_hashfreeze(template_root=template_root, commit=freeze.get("commit", ""))
    v = []
    for sec in ("scanners", "schemas", "engine", "packs", "fixtures"):
        for name, expected in freeze.get(sec, {}).items():
            got = cur[sec].get(name)
            if isinstance(expected, dict):
                # nested section (packs/<name>/ -> {file: hash}): compare leaf
                # hashes so a missing/moved pack file is reported precisely
                # (M4-FIX2: flat `expected[:12]` crashed with KeyError on the
                # nested packs dict introduced by M4-W1).
                if not isinstance(got, dict):
                    v.append(f"{sec}/{name}: frozen {len(expected)} files != current MISSING")
                    continue
                for fname, fhash in expected.items():
                    gh = got.get(fname)
                    if gh != fhash:
                        v.append(f"{sec}/{name}/{fname}: frozen {fhash[:12]}... != current {gh[:12] if gh else 'MISSING'}")
            elif got != expected:
                v.append(f"{sec}/{name}: frozen {expected[:12]}... != current {got[:12] if got else 'MISSING'}")
    if freeze.get("lens_config_sha256") != cur["lens_config_sha256"]:
        v.append("lens_config changed")
    for pin_name, pin in freeze.get("input_pins", {}).items():
        if FROZEN_PINS.get(pin_name) != pin:
            v.append(f"input_pin {pin_name} drifted")
    return v
