"""CLI: scan | merge | verify | ledger. Stdlib-only."""
from __future__ import annotations
import argparse, json, sys
from pathlib import Path
from .registry import load_scanners
from pathlib import Path as _P
from .context import ScanContext
from .determinism import pin, verify

def cmd_scan(args) -> int:
    scanners = load_scanners(_P(args.scanners_dir), template_root=_P(__file__).resolve().parent.parent)
    ctx = ScanContext(args.root)
    print(f"[scan] {len(scanners)} scanners loaded: {', '.join(sorted(scanners))}")
    return 0

def cmd_run(args) -> int:
    from pathlib import Path as _P
    import json as _j
    scanners = load_scanners(_P(args.scanners_dir), template_root=_P(__file__).resolve().parent.parent)
    ctx = ScanContext(args.root)
    layers = _P(args.layers); layers.mkdir(parents=True, exist_ok=True)
    total = 0
    for name, cls in sorted(scanners.items()):
        if name == "base": continue
        try: res = cls().run(ctx)
        except Exception as e:
            print(f"[run] {name} ERROR: {e}"); continue
        recs = res.nodes + res.edges
        with open(layers / f"{name}.jsonl", "w") as f:
            for rec in recs: f.write(rec.to_jsonl() + "\n")
        total += len(recs)
        print(f"[run] {name}: {len(recs)} records {('| ' + res.notes[:60]) if res.notes else ''}")
    graph = _P(args.graph); pin_path = _P(args.pin)
    merged = []
    for lf in sorted(layers.glob("*.jsonl")):
        merged.extend(lf.read_text().splitlines())
    graph.write_text("\n".join(merged) + "\n")
    s = pin(graph, pin_path)
    print(f"[merge] {len(list(layers.glob('*.jsonl')))} layers -> {len(merged)} records | sha256 {s[:16]}...")
    return 0

def cmd_merge(args) -> int:
    graph = Path(args.graph); layers = sorted(Path(args.layers).glob("*.jsonl"))
    total = 0
    with open(graph, "w") as out:
        for lf in layers:
            for line in lf.read_text().splitlines():
                if line.strip(): out.write(line + "\n"); total += 1
    s = pin(graph, Path(args.pin))
    print(f"[merge] {len(layers)} layers -> {total} records | sha256 {s[:16]}...")
    return 0

def cmd_verify(args) -> int:
    ok = verify(Path(args.graph), Path(args.pin))
    print("VERIFY " + ("PASS" if ok else "FAIL"))
    return 0 if ok else 1

def cmd_ledger(args) -> int:
    try:
        data = [json.loads(l) for l in Path(args.findings).read_text().splitlines() if l.strip()]
        by_sev: dict = {}
        for d in data: by_sev[d.get("sev", "info")] = by_sev.get(d.get("sev", "info"), 0) + 1
        print(json.dumps(by_sev, sort_keys=True))
    except FileNotFoundError:
        print("{}"); return 1
    return 0

def main() -> int:
    p = argparse.ArgumentParser(prog="graph-recon")
    sub = p.add_subparsers(dest="cmd", required=True)
    sp = sub.add_parser("scan"); sp.add_argument("--root", default="."); sp.add_argument("--scanners-dir", default="scanners")
    sp = sub.add_parser("run"); sp.add_argument("--root", default="."); sp.add_argument("--scanners-dir", default="scanners"); sp.add_argument("--layers", required=True); sp.add_argument("--graph", required=True); sp.add_argument("--pin", required=True)
    sp = sub.add_parser("merge"); sp.add_argument("--layers", required=True); sp.add_argument("--graph", required=True); sp.add_argument("--pin", required=True)
    sp = sub.add_parser("verify"); sp.add_argument("--graph", required=True); sp.add_argument("--pin", required=True)
    sp = sub.add_parser("ledger"); sp.add_argument("--findings", required=True)
    args = p.parse_args()
    return {"scan": cmd_scan, "run": cmd_run, "merge": cmd_merge, "verify": cmd_verify, "ledger": cmd_ledger}[args.cmd](args)

if __name__ == "__main__":
    sys.exit(main())
