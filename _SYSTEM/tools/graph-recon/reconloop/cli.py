"""CLI: scan | run | merge | verify | ledger. Stdlib-only."""
from __future__ import annotations
import argparse, json, sys
from pathlib import Path
from .registry import load_scanners, import_failures
from pathlib import Path as _P
from .context import ScanContext
from .determinism import pin, verify, sha256_file
from .ledger import dedup, fingerprint
from .graphio import require_graph, resolve_graph_path
from .merge import dedup_by_id
from .config import load_reconproject, discover_root
from . import bundle


def _load_config() -> dict:
    """reconproject.json (env override / engine root). Never raises."""
    return load_reconproject()


def _resolve_packs(args) -> list[str]:
    """Config packs ∪ CLI --packs flag (both opt-in; union)."""
    cfg = _load_config()
    cfg_packs = list(cfg.get("packs") or [])
    cli_packs = [p for p in (getattr(args, "packs", "") or "").replace(",", " ").split() if p]
    return sorted(set(cfg_packs) | set(cli_packs))


def _resolve_root(args) -> str:
    """Explicit --root wins; else project root discovered via config markers."""
    root = getattr(args, "root", None)
    if root:
        return root
    cfg = _load_config()
    return str(discover_root(start=".", markers=cfg.get("root", {}).get("markers")))


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


def _write_import_error_layer(layers: Path, fail: dict) -> None:
    """M5-W3 (defect 4): scanner import failure -> <name>.ERROR.jsonl so the
    missing scanner is visible in the layer dir, never a silent skip."""
    from .model import Node
    stem = fail["file"][:-3] if fail["file"].endswith(".py") else fail["file"]
    (layers / f"{stem}.ERROR.jsonl").write_text(Node(
        id=f"error:{stem}",
        kind="error",
        props={"error": fail["error"][:500], "type": fail["type"],
               "module": fail["module"]},
        evidence=["registry import fail-closed (M5-W3)"],
        src="cli",
    ).to_jsonl() + "\n")


def _write_config_error_layer(layers: Path, errors: list) -> None:
    """M5-W3 (defect 7): invalid configured regex -> config.ERROR.jsonl with
    each bad pattern named; the run fails closed (rc 1)."""
    from .model import Node
    lines = []
    for e in errors:
        lines.append(Node(
            id="error:config",
            kind="error",
            props={"error": e["error"][:500], "pattern": e["pattern"][:200],
                   "type": "re.error", "source": "protected.patterns"},
            evidence=["config validation fail-closed (M5-W3)"],
            src="cli",
        ).to_jsonl())
    (layers / "config.ERROR.jsonl").write_text("\n".join(lines) + "\n")


def cmd_run(args) -> int:
    cfg = _load_config()
    packs = _resolve_packs(args)
    scanners = load_scanners(_P(args.scanners_dir), template_root=_P(__file__).resolve().parent.parent,
                             packs=packs)
    args.root = _resolve_root(args)  # record resolved root (config markers) in manifest
    ctx = ScanContext(args.root, revision=args.revision, graph_input=args.graph_input)
    layers = _P(args.layers); layers.mkdir(parents=True, exist_ok=True)
    findings_dir = _P(args.findings_dir); findings_dir.mkdir(parents=True, exist_ok=True)
    # M5-W3 (defect 7): invalid configured regex -> config error record + rc 1,
    # never a crash mid-import (protected.py compiles per-pattern, records
    # errors, and the run fails closed naming the bad pattern).
    from . import protected as _protected  # noqa: E402
    ce = _protected.config_errors()
    if ce:
        _write_config_error_layer(layers, ce)
        pats = ", ".join(repr(e.get("pattern", "?")) for e in ce)
        print(f"[run] CONFIG FAIL-CLOSED: invalid protected.patterns regex(es): "
              f"{pats}; no merge/pin emitted")
        return 1
    # M5-W3 (defect 4): scanner import failures -> <name>.ERROR.jsonl + rc 1
    # (fail-closed); --tolerate-import-errors opts out (layers still written,
    # failures reported in the run summary).
    imp_failures = import_failures()
    tolerate = bool(getattr(args, "tolerate_import_errors", False))
    if imp_failures:
        for f in imp_failures:
            _write_import_error_layer(layers, f)
            print(f"[run] IMPORT FAIL: {f['file']}: {f['error']}")
        if not tolerate:
            print(f"[run] IMPORT FAIL-CLOSED: {len(imp_failures)} scanner(s) failed "
                  f"to import; no merge/pin emitted "
                  f"(--tolerate-import-errors to override)")
            return 1
        print(f"[run] IMPORT FAIL tolerated: {len(imp_failures)} scanner(s) missing "
              f"from the registry (ERROR layers written)")
    # M4-W1 config: per-layer stability overrides + lens gates + review budget
    ephem_ovr = cfg.get("ephemeral", {}).get("layers", {}) or {}
    lens_cfg = cfg.get("lenses", {}) or {}
    lens_allow = lens_cfg.get("enabled") or []
    lens_deny = set(lens_cfg.get("disabled") or [])
    lens_admission = lens_cfg.get("admission") or {}
    budget = int(cfg.get("review", {}).get("max_findings_per_layer", 100) or 100)
    total = 0
    failures = 0
    stability: dict[str, str] = {}
    layer_files: dict[str, str] = {}
    pinned_layers: list[str] = []
    for name, cls in sorted(scanners.items()):
        if name == "base":
            continue
        if cls.dim == "lens":  # config gates: enable/disable lenses
            if lens_allow and name not in lens_allow:
                print(f"[run] {name}: lens disabled by config (lenses.enabled allowlist)")
                continue
            if name in lens_deny:
                print(f"[run] {name}: lens disabled by config (lenses.disabled)")
                continue
        stability[name] = ephem_ovr.get(name, cls.layer_stability)
        try:
            inst = cls()
            adv = lens_admission.get(name)
            if adv and hasattr(inst, "admission"):  # config admission threshold override
                inst.admission = str(adv)
            res = inst.run(ctx)
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
        if stability[name] == "stable":
            pinned_layers.append(name)
        # M1.5 item 7: ephemeral layers carry a freshness stamp
        if stability[name] == "ephemeral":
            (layers / f"{name}.meta.json").write_text(json.dumps({
                "layer": name, "stability": "ephemeral", "pinned": False,
                "freshness": __import__("datetime").datetime.now().isoformat(timespec="seconds"),
            }, indent=2, sort_keys=True) + "\n")
        # M1.5 item 1: findings -> findings/<name>.jsonl, dedup by fingerprint
        if res.findings:
            for f in res.findings:
                f.fingerprint = fingerprint(f)
            deduped = dedup(res.findings)
            # M4-W1 config: review budget — cap findings per layer, report truncation
            if len(deduped) > budget:
                (findings_dir / f"{name}.review.json").write_text(json.dumps({
                    "layer": name, "budget": budget, "total": len(deduped),
                    "truncated": len(deduped) - budget,
                }, indent=2, sort_keys=True) + "\n")
                deduped = deduped[:budget]
            (findings_dir / f"{name}.jsonl").write_text(
                "".join(f.to_jsonl() + "\n" for f in deduped))
        total += len(recs)
        print(f"[run] {name}: {len(recs)} records {('| ' + res.notes[:60]) if res.notes else ''}")
    if failures:
        print(f"[run] FAIL-CLOSED: {failures} scanner(s) errored; no merge/pin emitted")
        return 1

    # M1.5 item 7: pin covers the STABLE subset only; ephemeral layers excluded.
    # M1.6 (F-040): dedup merged node records by id (keep-last) + dup report.
    merged_raw = []
    for name in sorted(pinned_layers):
        merged_raw.extend((layers / f"{name}.jsonl").read_text().splitlines())
    merged, dup_report = dedup_by_id(merged_raw)
    graph = _P(args.graph)
    graph.write_text("\n".join(merged) + "\n")
    s = pin(graph, _P(args.pin))
    # M1.6: write dup report next to the pin
    (graph.parent / "graph.dedup-report.json").write_text(
        json.dumps(dup_report, indent=2, sort_keys=True) + "\n")
    # M5-W3 (defect 4): tolerated import failures are reported in the run
    # summary (fail-closed default already returned above).
    imp_tail = ""
    if imp_failures:
        imp_tail = f" | imports: {len(imp_failures)} failure(s) tolerated (ERROR layers written)"
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
        layer_files=layer_files, stability=stability, pinned_layers=pinned_layers,
        packs=packs)
    bundle.write_manifest(layers, man)
    print(f"[merge] {len(pinned_layers)} stable layers ({len(stability)} total) -> "
          f"{len(merged_raw)} raw / {len(merged)} deduped records | "
          f"sha256 {s[:16]}... | dups {dup_report['duplicates_removed']}{imp_tail}")
    return 0


def cmd_merge(args) -> int:
    # M1.5 item 7: merge only stable layers (ephemeral carry freshness stamps)
    layers = sorted(Path(args.layers).glob("*.jsonl"))
    stable = [lf for lf in layers if not lf.name.endswith((".ERROR.jsonl", ".meta.json"))
              and lf.name != "analysis-manifest.json"]
    # exclude ephemeral layers by checking their .meta.json sibling
    stable = [lf for lf in stable
              if not (Path(args.layers) / f"{lf.stem}.meta.json").exists()]
    raw = []
    for lf in sorted(stable):
        raw.extend(lf.read_text().splitlines())
    # M1.6 (F-040): dedup by id (keep-last), emit dup report
    merged, dup_report = dedup_by_id([l for l in raw if l.strip()])
    with open(args.graph, "w") as out:
        out.write("\n".join(merged) + "\n")
    (Path(args.graph).parent / "graph.dedup-report.json").write_text(
        json.dumps(dup_report, indent=2, sort_keys=True) + "\n")
    s = pin(Path(args.graph), Path(args.pin))
    print(f"[merge] {len(stable)} stable layers -> {len(raw)} raw / {len(merged)} deduped "
          f"records | sha256 {s[:16]}... | dups {dup_report['duplicates_removed']}")
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


def cmd_init(args) -> int:
    """M4-W2: scaffold a NEW graph-recon project at <target>.

    Idempotent: refuses to overwrite a non-empty target unless --force;
    prints first-run instructions on success.
    """
    from .scaffold import scaffold_project, ScaffoldError, ScaffoldSafetyError  # noqa: E402
    try:
        info = scaffold_project(args.target, force=args.force)
    except ScaffoldSafetyError as e:
        print(f"[init] REFUSE (safety): {e}")
        return 2
    except ScaffoldError as e:
        print(f"[init] REFUSE: {e}")
        return 1
    tgt = info["target"]
    print(f"[init] scaffolded graph-recon project at {tgt}")
    print(f"[init] template {info['template']} | wrote: {', '.join(info['files'])}")
    print("[init] first run:")
    print(f"[init]   cd {tgt}")
    print("[init]   python3 -m reconloop.cli scan --root .")
    print("[init]   python3 -m reconloop.cli run --root . --scanners-dir scanners "
          "--layers out/layers --graph out/graph.jsonl --pin out/graph.sha256 "
          "--graph-input <merged-graph.jsonl>   # analytics scanners need a graph input")
    print("[init]   python3 -m reconloop.cli verify --graph out/graph.jsonl "
          "--pin out/graph.sha256")
    print("[init]   python3 -m reconloop.cli query --graph out/graph.jsonl counts")
    print("[init] edit reconproject.json: protected.patterns, lenses, "
          "root.markers (reconproject.json is the project self marker)")
    return 0


def _verb_args(args) -> dict:
    """Per-verb keyword args for the query engine (deterministic)."""
    if args.verb == "touchers":
        return {"node_id": args.node}
    if args.verb == "exec-path":
        return {"from_id": args.from_id, "to_id": args.to_id}
    return {}


def cmd_query(args) -> int:
    """M4-W2: read-only queries over a merged graph JSONL (deterministic
    JSONL to stdout). Data records first (sorted), then one terminal status
    record. rc: 0 = ran (ok/not_found/unreachable), 1 = input error
    (missing/unreadable graph), 2 = structurally invalid record(s) (the
    error record lists the offending line numbers) or unknown verb."""
    from .query import load_graph, VERBS, QueryError, InvalidRecordError  # noqa: E402
    try:
        nodes, edges = load_graph(args.graph)
    except InvalidRecordError as e:
        print(json.dumps({"query": getattr(args, "verb", None),
                          "status": "error", "error": str(e),
                          "lines": e.lines}, sort_keys=True))
        return 2
    except QueryError as e:
        print(json.dumps({"query": getattr(args, "verb", None),
                          "status": "error", "error": str(e)}, sort_keys=True))
        return 1
    fn = VERBS.get(args.verb)
    if fn is None:
        print(json.dumps({"query": args.verb, "status": "error",
                          "error": f"unknown verb: {args.verb}"}, sort_keys=True))
        return 2
    _status, recs, summary = fn(nodes, edges, **_verb_args(args))
    for r in recs:
        print(json.dumps(r, sort_keys=True))
    print(json.dumps(summary, sort_keys=True))
    return 0


def main() -> int:
    p = argparse.ArgumentParser(prog="graph-recon")
    sub = p.add_subparsers(dest="cmd", required=True)
    sp = sub.add_parser("scan"); sp.add_argument("--root", default=None); sp.add_argument("--scanners-dir", default="scanners"); sp.add_argument("--packs", default="", help="comma/space-separated optional scanner packs (e.g. yuri)")
    sp = sub.add_parser("run"); sp.add_argument("--root", default=None); sp.add_argument("--scanners-dir", default="scanners"); sp.add_argument("--layers", required=True); sp.add_argument("--graph", required=True); sp.add_argument("--pin", required=True); sp.add_argument("--findings-dir", default="findings"); sp.add_argument("--revision", default="origin/main"); sp.add_argument("--graph-input", default=""); sp.add_argument("--packs", default="", help="comma/space-separated optional scanner packs (e.g. yuri)"); sp.add_argument("--tolerate-import-errors", action="store_true", help="continue (rc 0) when a scanner file fails to import; ERROR layers are still written and reported")
    sp = sub.add_parser("merge"); sp.add_argument("--layers", required=True); sp.add_argument("--graph", required=True); sp.add_argument("--pin", required=True)
    sp = sub.add_parser("verify"); sp.add_argument("--graph", required=True); sp.add_argument("--pin", required=True); sp.add_argument("--rerun", action="store_true"); sp.add_argument("--root", default=None); sp.add_argument("--scanners-dir", default="scanners"); sp.add_argument("--layers", default=None); sp.add_argument("--findings-dir", default="findings"); sp.add_argument("--revision", default="origin/main"); sp.add_argument("--graph-input", default=""); sp.add_argument("--packs", default="", help="comma/space-separated optional scanner packs (e.g. yuri)"); sp.add_argument("--tolerate-import-errors", action="store_true", help="continue (rc 0) when a scanner file fails to import (verify --rerun forwards to run)")
    sp = sub.add_parser("ledger"); sp.add_argument("--findings", required=True)
    sp = sub.add_parser("manifest"); sp.add_argument("--manifest", required=True)
    sp = sub.add_parser("init", help="scaffold a NEW graph-recon project at <target> (idempotent; --force to regenerate)")
    sp.add_argument("target")
    sp.add_argument("--force", action="store_true",
                    help="regenerate scaffold files in a non-empty target")
    qp = sub.add_parser("query", help="read-only queries over a merged graph JSONL (deterministic JSONL to stdout)")
    qp.add_argument("--graph", required=True, help="merged graph JSONL (node + edge records)")
    qverbs = qp.add_subparsers(dest="verb", required=True,
                               help="touchers | exec-path | protected | counts")
    qv1 = qverbs.add_parser("touchers", help="nodes connected to <node> by any edge (bidirectional)")
    qv1.add_argument("node")
    qv2 = qverbs.add_parser("exec-path", help="shortest directed path via exec/spawns/network edges")
    qv2.add_argument("from_id")
    qv2.add_argument("to_id")
    qverbs.add_parser("protected", help="all protected-path nodes (kind protected_path)")
    qverbs.add_parser("counts", help="nodes/edges per kind + totals")
    args = p.parse_args()
    if args.cmd == "verify" and args.rerun:
        if args.layers is None:
            print("verify --rerun requires --layers"); return 1
    return {"scan": cmd_scan, "run": cmd_run, "merge": cmd_merge, "verify": cmd_verify, "ledger": cmd_ledger, "manifest": cmd_manifest, "init": cmd_init, "query": cmd_query}[args.cmd](args)


def cmd_scan(args) -> int:
    scanners = load_scanners(_P(args.scanners_dir), template_root=_P(__file__).resolve().parent.parent,
                             packs=_resolve_packs(args))
    args.root = _resolve_root(args)
    ctx = ScanContext(args.root)
    print(f"[scan] {len(scanners)} scanners loaded: {', '.join(sorted(scanners))}")
    # M5-W3 (defect 4/7): scan is a validation surface too — a broken scanner
    # import or an invalid configured regex must not be a silent no-op.
    fails = import_failures()
    if fails:
        for f in fails:
            print(f"[scan] IMPORT FAIL: {f['file']}: {f['error']}")
        print(f"[scan] IMPORT FAIL-CLOSED: {len(fails)} scanner(s) failed to import")
        return 1
    from . import protected as _protected  # noqa: E402
    ce = _protected.config_errors()
    if ce:
        print("[scan] CONFIG FAIL-CLOSED: invalid protected.patterns regex(es): "
              + ", ".join(repr(e.get("pattern", "?")) for e in ce))
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
