"""Analysis-bundle manifest — layers/analysis-manifest.json (M1.5 item 6).

Written by `graph-recon run` alongside the per-scanner layers. Records the
input graph pin, per-scanner file hashes, run config, layer stability, and a
generated_at freshness stamp. This manifest is run metadata — it is NOT part
of the pinned merged graph (it contains a timestamp and absolute config), so
it is excluded from the determinism pin by construction.

Schema is pinned separately: schemas/analysis-manifest.schema.json + its
sha256 pin (tests assert both).
"""
from __future__ import annotations
import hashlib
import json
from pathlib import Path

SCHEMA_REL = "reconloop/schemas/analysis-manifest.schema.json"


def sha256_file(p: Path) -> str:
    h = hashlib.sha256()
    with open(p, "rb") as f:
        for chunk in iter(lambda: f.read(1 << 20), b""):
            h.update(chunk)
    return h.hexdigest()


def build_manifest(*, template_root: Path, ctx, args, scanners: dict,
                   input_pin: str, input_label: str, layer_files: dict[str, str],
                   stability: dict[str, str], pinned_layers: list[str]) -> dict:
    """Assemble the analysis-bundle manifest dict (deterministic fields)."""
    import subprocess
    scanner_hashes = {}
    for name in sorted(scanners):
        if name == "base":
            continue
        scanner_hashes[name] = sha256_file(Path(args.scanners_dir) / f"{name}.py")
    # M1.5 item 8: root context — root path, root git HEAD, revision, input pin.
    # Root-dependent scanners read the working tree, so root HEAD matters for
    # evidence provenance (cross-env note: v2 may materialize a revision tree).
    root_head = ""
    try:
        p = subprocess.run(["git", "rev-parse", "HEAD"], cwd=ctx.root,
                           capture_output=True, text=True, timeout=30)
        if p.returncode == 0:
            root_head = p.stdout.strip()
    except Exception:
        pass
    return {
        "schema": "analysis-manifest",
        "schema_version": 2,
        "generated_at": __import__("datetime").datetime.now().isoformat(timespec="seconds"),
        "root": {
            "path": str(ctx.root),
            "git_head": root_head,
            "revision": getattr(args, "revision", "origin/main"),
        },
        "input_graph": {
            "pin16": input_pin[:16],
            "sha256": input_pin,
            "label": input_label,  # graph:<pin16>, path-independent
            "resolved": bool(input_pin),
        },
        "config": {
            "root": args.root,
            "revision": getattr(args, "revision", "origin/main"),
            "graph_input": getattr(args, "graph_input", ""),
            "scanners_dir": args.scanners_dir,
            "layers": args.layers,
            "graph": args.graph,
            "pin": args.pin,
        },
        "scanners": scanner_hashes,
        "layers": {
            "stability": dict(sorted(stability.items())),
            "files": dict(sorted(layer_files.items())),
            "pinned": sorted(pinned_layers),
        },
    }


def write_manifest(layers_dir: Path, manifest: dict) -> Path:
    """Write layers/analysis-manifest.json (metadata only, never pinned)."""
    p = layers_dir / "analysis-manifest.json"
    p.write_text(json.dumps(manifest, indent=2, sort_keys=True) + "\n")
    return p


def validate_manifest(manifest: dict, schema_path: Path) -> list[str]:
    """Lightweight structural validation against the pinned schema (stdlib).

    Returns a list of violations (empty = valid). This is a bounded schema
    check (required keys, types, enums) — not a full JSON-Schema engine,
    keeping the template stdlib-only.
    """
    try:
        schema = json.loads(schema_path.read_text())
    except Exception as e:
        return [f"schema unreadable: {e}"]
    violations: list[str] = []
    for key in ("schema", "schema_version", "generated_at", "root", "input_graph",
                "config", "scanners", "layers"):
        if key not in manifest:
            violations.append(f"missing key: {key}")
    if manifest.get("schema") != schema.get("title", "analysis-manifest"):
        violations.append("schema title mismatch")
    if manifest.get("schema_version") != schema.get("schema_version"):
        violations.append("schema_version mismatch")
    if not isinstance(manifest.get("input_graph", {}).get("pin16"), str):
        violations.append("input_graph.pin16 must be str")
    for sec in ("config", "scanners", "layers", "root"):
        if not isinstance(manifest.get(sec), dict):
            violations.append(f"{sec} must be object")
    root = manifest.get("root", {})
    for key in ("path", "git_head", "revision"):
        if not isinstance(root.get(key), str):
            violations.append(f"root.{key} must be str")
    stab = manifest.get("layers", {}).get("stability", {})
    for name, s in stab.items():
        if s not in ("stable", "ephemeral"):
            violations.append(f"layers.stability.{name} invalid: {s}")
    return violations
