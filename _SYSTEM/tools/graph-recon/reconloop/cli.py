"""CLI: scan | run | merge | verify | ledger. Stdlib-only."""
from __future__ import annotations
import argparse, json, sys
from pathlib import Path
from .registry import load_scanners
from pathlib import Path as _P
from .context import ScanContext
from .determinism import pin, verify, sha256_file
from .ledger import dedup, fingerprint
from .graphio import require_graph, resolve_graph_path
from . import bundle


def _write_error_layer(layers: Path, name: str, err: Exception) -> None:
    """M1.5 item 1: scanner failure -> visible error layer, never silent empty."""
    from .model import Node
    el = layers / f"{name}.ERROR.jsonl"
    el.write_text(Node(
        id=f"error:{name}",
        kind="error",
        props={"error": str(err)[:500], "type": type(err).__name__},
        evidence=["cmd_run fail-closed (M1.5)"],
        src="cli",
    ).to_jsonl() + "\n")


def cmd_run(args) -> int:
    scanners = load_scanners(_P(args.scanners_dir), template_root=_P(__file__).resolve().parent.parent)
    ctx = ScanContext(args.root, revision=args.revision, graph_input=args.graph_input)
    layers = _P(args.layers); layers.mkdir(parents=True, exist_ok=True)
    findings_dir = _P(args.findings_dir); findings_dir.mkdir(parents=True, exist_ok=True)
    total = 0
    failures = 0
    stability: dict[str, str] = {}
    layer_files: dict[str, str] = {}
    pinned_layers: list[str] = []
    for name, cls in sorted(scanners.items()):
        if name == "base":
            continue
        stability[name] = cls.layer_stability
        try:
            res = cls().run(ctx)
        except Exception as e:
            # M1.5 item 1 + 3: fail-closed — error layer + nonzero exit
            _write_error_layer(layers, name, e)
            failures += 1
            print(f"[run] {name} ERROR: {e}")
            continue
        recs = res.nodes + res.edges
        lf = layers / f"{name}.jsonl"
        lf.write_text("".join(x.to_jsonl() + "\n" for x in recs))
        layer_files[name] = lf.name
        if cls.layer_stability == "stable":
            pinned_layers.append(name)
        # M1.5 item 7: ephemeral layers carry a freshness stamp
        if cls.layer_stability == "ephemeral":
            (layers / f"{name}.meta.json").write_text(json.dumps({
                "layer": name, "stability": "ephemeral", "pinned": False,
                "freshness": __import__("datetime").datetime.now().isoformat(timespec="seconds"),
            }, indent=2, sort_keys=True) + "\n")
        # M1.5 item 1: findings -> findings/<name>.jsonl, dedup by fingerprint
        if res.findings:
            for f in res.findings:
                f.fingerprint = fingerprint(f)
            deduped = dedup(res.findings)
            (findings_dir / f"{name}.jsonl").write_text(
                "".join(f.to_jsonl() + "\n" for f in deduped))
        total += len(recs)
        print(f"[run] {name}: {len(recs)} records {('| ' + res.notes[:60]) if res.notes else ''}")
    if failures:
        print(f"[run] FAIL-CLOSED: {failures} scanner(s) errored; no merge/pin emitted")
        return 1

    # M1.5 item 7: pin covers the STABLE subset only; ephemeral layers excluded
    merged = []
    for name in sorted(pinned_layers):
        merged.extend((layers / f"{name}.jsonl").read_text().splitlines())
    graph = _P(args.graph)
    graph.write_text("\n".join(merged) + "\n")
    s = pin(graph, _P(args.pin))
    # M1.5 item 6: analysis-bundle manifest (metadata; never part of the pin)
    input_pin = ""
    input_label = ""
    try:
        gp = resolve_graph_path(ctx)
        if gp is not None and gp.exists():
            input_pin = sha256_file(gp)
            input_label = f"graph:{input_pin[:16]}"
    except Exception:
        pass
    man = bundle.build_manifest(
        template_root=_P(__file__).resolve().parent.parent, ctx=ctx, args=args,
        scanners=scanners, input_pin=input_pin, input_label=input_label,
        layer_files=layer_files, stability=stability, pinned_layers=pinned_layers)
    bundle.write_manifest(layers, man)
    print(f"[merge] {len(pinned_layers)} stable layers ({len(stability)} total) -> {len(merged)} records | sha256 {s[:16]}...")
    return 0


def cmd_merge(args) -> int:
    # M1.5 item 7: merge only stable layers (ephemeral carry freshness stamps)
    layers = sorted(Path(args.layers).glob("*.jsonl"))
    stable = [lf for lf in layers if not lf.name.endswith((".ERROR.jsonl", ".meta.json"))
              and lf.name != "analysis-manifest.json"]
    # exclude ephemeral layers by checking their .meta.json sibling
    stable = [lf for lf in stable
              if not (Path(args.layers) / f"{lf.stem}.meta.json").exists()]
    total = 0
    with open(args.graph, "w") as out:
        for lf in sorted(stable):
            for line in lf.read_text().splitlines():
                if line.strip():
                    out.write(line + "\n"); total += 1
    s = pin(Path(args.graph), Path(args.pin))
    print(f"[merge] {len(stable)} stable layers -> {total} records | sha256 {s[:16]}...")
    return 0


def cmd_verify(args) -> int:
    if args.rerun:
        # M1.5 item 2: full pipeline re-run + hash compare against stored pin
        before = ""
        try:
            before = Path(args.pin).read_text().strip()
        except FileNotFoundError:
            pass
        rc = cmd_run(args)
        if rc != 0:
            print("VERIFY --rerun FAIL (pipeline errors)")
            return 1
        after = sha256_file(Path(args.graph))
        if before and after != before:
            print(f"VERIFY --rerun FAIL (regen {after[:16]} != stored {before[:16]})")
            return 1
        print(f"VERIFY --rerun PASS ({'baseline set' if not before else 'regen matches stored pin'})")
        return 0
    ok = verify(Path(args.graph), Path(args.pin))
    print("VERIFY " + ("PASS" if ok else "FAIL"))
    return 0 if ok else 1


def cmd_ledger(args) -> int:
    try:
        data = [json.loads(l) for l in Path(args.findings).read_text().splitlines() if l.strip()]
        by_sev: dict = {}
        for d in data:
            by_sev[d.get("sev", "info")] = by_sev.get(d.get("sev", "info"), 0) + 1
        print(json.dumps(by_sev, sort_keys=True))
    except FileNotFoundError:
        print("{}"); return 1
    return 0


def cmd_manifest(args) -> int:
    """Validate layers/analysis-manifest.json against the pinned schema."""
    try:
        man = json.loads(Path(args.manifest).read_text())
    except Exception as e:
        print(f"[manifest] FAIL unreadable: {e}"); return 1
    schema = _P(__file__).resolve().parent / "schemas" / "analysis-manifest.schema.json"
    v = bundle.validate_manifest(man, schema)
    if v:
        print(f"[manifest] FAIL: {v}"); return 1
    print("[manifest] PASS")
    return 0


def main() -> int:
    p = argparse.ArgumentParser(prog="graph-recon")
    sub = p.add_subparsers(dest="cmd", required=True)
    sp = sub.add_parser("scan"); sp.add_argument("--root", default="."); sp.add_argument("--scanners-dir", default="scanners")
    sp = sub.add_parser("run"); sp.add_argument("--root", default="."); sp.add_argument("--scanners-dir", default="scanners"); sp.add_argument("--layers", required=True); sp.add_argument("--graph", required=True); sp.add_argument("--pin", required=True); sp.add_argument("--findings-dir", default="findings"); sp.add_argument("--revision", default="origin/main"); sp.add_argument("--graph-input", default="")
    sp = sub.add_parser("merge"); sp.add_argument("--layers", required=True); sp.add_argument("--graph", required=True); sp.add_argument("--pin", required=True)
    sp = sub.add_parser("verify"); sp.add_argument("--graph", required=True); sp.add_argument("--pin", required=True); sp.add_argument("--rerun", action="store_true"); sp.add_argument("--root", default="."); sp.add_argument("--scanners-dir", default="scanners"); sp.add_argument("--layers", default=None); sp.add_argument("--findings-dir", default="findings"); sp.add_argument("--revision", default="origin/main"); sp.add_argument("--graph-input", default="")
    sp = sub.add_parser("ledger"); sp.add_argument("--findings", required=True)
    sp = sub.add_parser("manifest"); sp.add_argument("--manifest", required=True)
    args = p.parse_args()
    if args.cmd == "verify" and args.rerun:
        if args.layers is None:
            print("verify --rerun requires --layers"); return 1
    return {"scan": cmd_scan, "run": cmd_run, "merge": cmd_merge, "verify": cmd_verify, "ledger": cmd_ledger, "manifest": cmd_manifest}[args.cmd](args)


def cmd_scan(args) -> int:
    scanners = load_scanners(_P(args.scanners_dir), template_root=_P(__file__).resolve().parent.parent)
    ctx = ScanContext(args.root)
    print(f"[scan] {len(scanners)} scanners loaded: {', '.join(sorted(scanners))}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
