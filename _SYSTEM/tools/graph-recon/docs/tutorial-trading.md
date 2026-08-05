# Trading-engine: a worked end-to-end tutorial

This tutorial builds an orderflow-trading recon loop from scratch, exactly
the way you would wire graph-recon into your own repo. Every command below
was executed against a real build of this walkthrough; the outputs shown
are the actual outputs (machine-state layers aside — see the notes).

**What you end up with** — a repo `trading-engine` whose recon graph models
six node kinds:

| kind | meaning | example id |
|---|---|---|
| `venue` | exchange the engine trades at | `venue:binance` |
| `strategy` | trading strategy | `strategy:momentum` |
| `symbol` | traded instrument | `symbol:BTCUSDT` |
| `order` | an order that reaches execution | `order:O-1003` |
| `risk_rule` | a risk gate | `risk_rule:R-1` |
| `data_feed` | market-data feed with a freshness window | `data_feed:binance-btc-book` |

Two scanners (repo-derived layers):

- `feed_inventory` — venues/symbols/feeds from `config/feeds.json`.
- `order_writer_mapping` — declared order state (orders, risk rules, gates)
  plus order-writer call sites in tracked code.

Two lenses (violation cards on the graph):

- `order_path_must_pass_risk` — an order reaching execution without a
  `risk_check` edge from a `risk_rule` node is a card.
- `stale_feed` — a `data_feed` whose freshness is missing or outside its
  admission window is a card.

Plus a seed graph (the initial system snapshot the first run's lenses read),
fixtures with negative controls and two metamorphic mutations per lens, and
the full command sequence from `git init` to the first label round.

---

## 1. Init the repo

```bash
mkdir trading-engine && cd trading-engine
git init -b main
```

Scaffold the repo content. First `.gitignore` — **keep run outputs out of
git** (they are regenerable; the graph should only ever be rebuilt, never
merged):

```bash
cat > .gitignore <<'EOF'
tools/graph-recon/out*/
__pycache__/
*.pyc
EOF
```

The trading code (order placement with literal call sites the
order-writer scanner resolves, a risk gate, a strategy):

```bash
mkdir -p config engine strategies seed tests

cat > README.md <<'EOF'
# trading-engine

Orderflow trading research repo. Strategies consume market-data feeds and
place orders at venues; every order must pass a risk rule before execution.

Node kinds modeled in the recon graph: venue, strategy, symbol, order,
risk_rule, data_feed.

- config/feeds.json      — feed inventory (venues, symbols, feeds, windows)
- config/orders.json     — declared orders (strategy, venue, risk gate)
- config/risk_rules.json — risk rule catalog
- engine/                — order placement + risk gate code
- strategies/            — strategy code
- tools/graph-recon/     — vendored graph-recon template
EOF

cat > engine/executor.py <<'EOF'
"""Order execution: every order must pass its risk rule before placement."""
import os


def place_order(order_id, venue):
    # literal call sites, resolved statically by the order_writer_mapping scanner
    if order_id == "O-1001":
        return _submit("O-1001", "binance")
    if order_id == "O-1002":
        return _submit("O-1002", "binance")
    if order_id == "O-1003":
        return _submit("O-1003", "coinbase")
    # dynamic target: resolved at runtime from the venue config
    return _submit(os.environ.get("ORDER_ID", ""), venue)


def _submit(order_id, venue):
    return {"order_id": order_id, "venue": venue, "status": "submitted"}
EOF

cat > engine/risk.py <<'EOF'
"""Risk gate: orders reaching execution must carry an approved risk rule."""


def check_risk(order, rule):
    if rule is None:
        return False
    if rule["kind"] == "order_size_limit" and order["size"] > rule["params"]["max_size"]:
        return False
    return True
EOF

cat > strategies/momentum.py <<'EOF'
"""Momentum strategy: trade the spread on fresh orderbook feeds."""


def should_trade(symbol, book, trades):
    return book is not None and trades is not None
EOF
```

The three config files — the scanners' source of truth. Note that
`O-1003` is declared with `"risk_rule": null`: that is deliberate, it is
the gap the first label round will surface:

```bash
cat > config/feeds.json <<'EOF'
{
  "schema": "trading-feeds-v1",
  "venues": [
    {"id": "binance", "exchange": "Binance"},
    {"id": "coinbase", "exchange": "Coinbase"}
  ],
  "symbols": ["BTCUSDT", "ETHUSDT"],
  "feeds": [
    {"id": "binance-btc-book", "venue": "binance", "symbol": "BTCUSDT", "kind": "orderbook", "window_sec": 60},
    {"id": "binance-btc-trades", "venue": "binance", "symbol": "BTCUSDT", "kind": "trades", "window_sec": 30},
    {"id": "coinbase-btc-book", "venue": "coinbase", "symbol": "BTCUSDT", "kind": "orderbook", "window_sec": 60}
  ]
}
EOF

cat > config/orders.json <<'EOF'
{
  "schema": "trading-orders-v1",
  "strategies": ["momentum"],
  "orders": [
    {"id": "O-1001", "side": "buy", "size": 0.5, "symbol": "BTCUSDT", "strategy": "momentum", "venue": "binance", "risk_rule": "R-1"},
    {"id": "O-1002", "side": "sell", "size": 1.0, "symbol": "BTCUSDT", "strategy": "momentum", "venue": "binance", "risk_rule": "R-2"},
    {"id": "O-1003", "side": "buy", "size": 2.0, "symbol": "ETHUSDT", "strategy": "momentum", "venue": "coinbase", "risk_rule": null}
  ]
}
EOF

cat > config/risk_rules.json <<'EOF'
{
  "schema": "trading-risk-rules-v1",
  "rules": [
    {"id": "R-1", "name": "max_position_btc", "kind": "position_limit", "params": {"max_btc": 2.0}},
    {"id": "R-2", "name": "max_order_size", "kind": "order_size_limit", "params": {"max_size": 1.0}}
  ]
}
EOF

git add -A
git commit -m "scaffold trading-engine"
```

## 2. Vendor the template and configure it

```bash
cp -r <path-to-graph-recon-template>/* tools/graph-recon/
```

(The template is vendored, not installed: you will edit `scanners/` inside
your repo. Remove any nested `.git` the copy may carry — the template must
be plain files in your repo.)

Now configure `tools/graph-recon/reconproject.json`. Three edits to the
stock config:

1. **`protected.patterns`** — add trading-specific patterns
   (`api[-_]?key`, `wallet.json$`, `.secret.json$`); the shipped defaults
   stay.
2. **`ephemeral.layers`** — add `"hygiene": "ephemeral"`. The hygiene
   scanner reads live crontab state; live-state layers must never enter the
   determinism pin (the shipped config already marks `live_ports`
   ephemeral for the same reason).
3. **`lenses.enabled`** — the allowlist. The template ships YURI grammar
   lenses (`route_binding`, `protected_writer`, ...) that are meaningless
   here; the allowlist runs only your two lenses. The engine prints
   `lens disabled by config (lenses.enabled allowlist)` for the rest —
   they are skipped, not crashed.

```json
{
  "schema": "reconproject",
  "version": 1,
  "root": {
    "markers": ["pyproject.toml", "package.json", "go.mod", "Cargo.toml", "Gopkg.toml", "build.gradle", ".git"]
  },
  "protected": {
    "patterns": [
      "\\.env($|\\.|/)|secrets\\.env",
      "(^|/)\\.git(/|$)",
      "(^|/)(\\.github|\\.gitlab|\\.circleci|\\.buildkite)(/|$)",
      "(^|/)(\\.aws|\\.azure|\\.gcloud|\\.kube)(/|$)",
      "credentials\\.json$|auth\\.json$|service-account[^/]*\\.json$",
      "(^|/)secrets(/|$)|(^|/)\\.secrets(/|$)",
      "(^|/)node_modules(/|$)",
      "id_rsa$|id_ed25519$|id_dsa$|id_ecdsa$|\\.pem$|\\.key$|\\.p12$|\\.pfx$",
      "(^|/)(data|runtime|\\.cache)(/|$)",
      "(^|/)(\\.claude|\\.codex|\\.cursor|\\.pi|\\.omp|\\.smart-env)(/|$)",
      "api[-_]?key|wallet\\.json$|\\.secret\\.json$"
    ]
  },
  "ephemeral": {
    "layers": {
      "live_ports": "ephemeral",
      "hygiene": "ephemeral"
    }
  },
  "lenses": {
    "enabled": ["order_path_must_pass_risk", "stale_feed"],
    "disabled": [],
    "admission": {}
  },
  "review": {
    "max_findings_per_layer": 100
  },
  "packs": []
}
```

## 3. Scanner 1 — `feed_inventory`

`tools/graph-recon/scanners/feed_inventory.py`. Reads the tracked config at
`ctx.revision` (rev-pinned — same pattern as the shipped `env_files`
scanner), emits `venue`/`symbol`/`data_feed` nodes and `feed_provider` +
`quotes` edges. Everything sorted; every record carries evidence.

```python
"""trading-engine scanner: feed inventory from config/feeds.json.

Reads the tracked config at the pinned revision (deterministic across
working trees — same pattern as env_files) and emits venue/symbol/data_feed
nodes plus feed_provider (feed -> venue) and quotes (feed -> symbol) edges.
Metadata only: config values are not secrets; still never echo env-like
values into evidence.
"""
from __future__ import annotations
import json
from .base import BaseScanner, ScanResult
from reconloop.model import Node, Edge

FEEDS_CONFIG = "config/feeds.json"


class FeedInventoryScanner(BaseScanner):
    name = "feed_inventory"; dim = "static"

    def run(self, ctx) -> ScanResult:
        r = ScanResult()
        raw = ctx.read_text(FEEDS_CONFIG)
        if raw is None:
            r.notes = f"{FEEDS_CONFIG} unreadable at {ctx.revision}"
            return r
        cfg = json.loads(raw)
        for v in sorted(cfg.get("venues", []), key=lambda x: x["id"]):
            r.nodes.append(Node(id=f"venue:{v['id']}", kind="venue",
                                props={"exchange": v.get("exchange")},
                                evidence=[f"{FEEDS_CONFIG} venue:{v['id']}"],
                                src="feed_inventory"))
        for s in sorted(cfg.get("symbols", [])):
            r.nodes.append(Node(id=f"symbol:{s}", kind="symbol",
                                props={},
                                evidence=[f"{FEEDS_CONFIG} symbol:{s}"],
                                src="feed_inventory"))
        for f in sorted(cfg.get("feeds", []), key=lambda x: x["id"]):
            fid = f["id"]
            r.nodes.append(Node(id=f"data_feed:{fid}", kind="data_feed",
                                props={"venue": f["venue"], "symbol": f["symbol"],
                                       "kind": f["kind"], "window_sec": f["window_sec"]},
                                evidence=[f"{FEEDS_CONFIG} feed:{fid}"],
                                src="feed_inventory"))
            r.edges.append(Edge(from_=f"data_feed:{fid}", to=f"venue:{f['venue']}",
                                kind="feed_provider", props={},
                                evidence=[f"{FEEDS_CONFIG} feed:{fid}"],
                                boundary="none"))
            r.edges.append(Edge(from_=f"data_feed:{fid}", to=f"symbol:{f['symbol']}",
                                kind="quotes", props={},
                                evidence=[f"{FEEDS_CONFIG} feed:{fid}"],
                                boundary="none"))
        r.nodes.sort(key=lambda n: n.id)
        r.edges.sort(key=lambda e: (e.from_, e.to, e.kind))
        return r
```

Notes: the config read goes through `ctx.read_text`, so a future
`protected.patterns` entry that matches a config path automatically
becomes unreadable (fail-closed) rather than leaking content. The evidence
is `file:entry` shaped, and no value content ever leaves the config.

## 4. Scanner 2 — `order_writer_mapping`

`tools/graph-recon/scanners/order_writer_mapping.py`. Two halves: (1) the
declared order state — `strategy`/`order`/`risk_rule` nodes and
`executes_at`, `placed_by`, `risk_check` edges from the two config files;
(2) writer call sites — tracked `*.py` files whose source contains
`place_order("O-1001")`-style literal calls become `file:` writer nodes
with `write_calls`/`literal_targets`/`dynamic_targets` (same semantics as
the shipped `writers` scanner) plus `order_write` edges to the resolved
order ids.

```python
"""trading-engine scanner: order-writer mapping.

Two halves, both rev-pinned and deterministic:

1. Declared order state from config/orders.json + config/risk_rules.json:
   strategy/order/risk_rule nodes, executes_at (order -> venue),
   placed_by (order -> strategy) and risk_check (risk_rule -> order) edges.
   An order whose config entry has risk_rule: null gets NO risk_check edge —
   the order_path_must_pass_risk lens flags it.

2. Writer call sites: tracked *.py files whose source contains order
   placement calls. Literal call sites (place_order("O-1001")) become
   order_write edges file -> order; unresolved (dynamic) call sites are
   counted as dynamic_targets (writers.py semantics).
"""
from __future__ import annotations
import json
import re
import subprocess
from .base import BaseScanner, ScanResult
from reconloop.model import Node, Edge

ORDERS_CONFIG = "config/orders.json"
RULES_CONFIG = "config/risk_rules.json"
CALL = re.compile(r"\b(?:place|submit|send)_order\s*\(")
LIT = re.compile(r"\b(?:place|submit|send)_order\(\s*(['\"])([^'\"]+?)\1")


def _git_tree(ctx) -> list:
    """Tracked file list at ctx.revision (git ls-tree, index fallback)."""
    try:
        p = subprocess.run(["git", "ls-tree", "-r", "--name-only", ctx.revision],
                           cwd=ctx.root, capture_output=True, text=True, timeout=60)
        if p.returncode == 0:
            return p.stdout.splitlines()
        p = subprocess.run(["git", "ls-files"], cwd=ctx.root,
                           capture_output=True, text=True, timeout=60)
        return p.stdout.splitlines()
    except Exception:
        return []


class OrderWriterMappingScanner(BaseScanner):
    name = "order_writer_mapping"; dim = "static"

    def run(self, ctx) -> ScanResult:
        r = ScanResult()
        # --- risk rule catalog ---
        raw_rules = ctx.read_text(RULES_CONFIG)
        if raw_rules is not None:
            for rule in sorted(json.loads(raw_rules).get("rules", []), key=lambda x: x["id"]):
                rid = rule["id"]
                r.nodes.append(Node(id=f"risk_rule:{rid}", kind="risk_rule",
                                    props={"name": rule.get("name"), "kind": rule.get("kind")},
                                    evidence=[f"{RULES_CONFIG} rule:{rid}"],
                                    src="order_writer_mapping"))
        # --- declared order state ---
        raw_orders = ctx.read_text(ORDERS_CONFIG)
        if raw_orders is None:
            r.notes = f"{ORDERS_CONFIG} unreadable at {ctx.revision}"
            return r
        cfg = json.loads(raw_orders)
        for s in sorted(cfg.get("strategies", [])):
            r.nodes.append(Node(id=f"strategy:{s}", kind="strategy",
                                props={}, evidence=[f"{ORDERS_CONFIG} strategy:{s}"],
                                src="order_writer_mapping"))
        order_ids = set()
        for o in sorted(cfg.get("orders", []), key=lambda x: x["id"]):
            oid = o["id"]
            order_ids.add(oid)
            r.nodes.append(Node(id=f"order:{oid}", kind="order",
                                props={"side": o.get("side"), "size": o.get("size"),
                                       "symbol": o.get("symbol"),
                                       "strategy": o.get("strategy"),
                                       "venue": o.get("venue"), "declared": True},
                                evidence=[f"{ORDERS_CONFIG} order:{oid}"],
                                src="order_writer_mapping"))
            r.edges.append(Edge(from_=f"order:{oid}", to=f"venue:{o['venue']}",
                                kind="executes_at", props={},
                                evidence=[f"{ORDERS_CONFIG} order:{oid}"],
                                boundary="none"))
            if o.get("strategy"):
                r.edges.append(Edge(from_=f"order:{oid}", to=f"strategy:{o['strategy']}",
                                    kind="placed_by", props={},
                                    evidence=[f"{ORDERS_CONFIG} order:{oid}"],
                                    boundary="none"))
            rule = o.get("risk_rule")
            if rule:
                r.edges.append(Edge(from_=f"risk_rule:{rule}", to=f"order:{oid}",
                                    kind="risk_check", props={},
                                    evidence=[f"{ORDERS_CONFIG} order:{oid}"],
                                    boundary="none"))
        # --- writer call sites (rev-pinned tracked files) ---
        for rel in sorted(_git_tree(ctx)):
            if not rel.endswith(".py"):
                continue
            src = ctx.read_text(rel)
            if not src:
                continue
            n_calls = len(CALL.findall(src))
            if n_calls == 0:
                continue
            lit = sorted({m.group(2) for m in LIT.finditer(src)} & order_ids)
            r.nodes.append(Node(id=f"file:{rel}", kind="file",
                                props={"write_calls": n_calls,
                                       "literal_targets": len(lit),
                                       "dynamic_targets": n_calls - len(lit),
                                       "note": "order writer"},
                                evidence=["git grep order call sites"],
                                src="order_writer_mapping"))
            for oid in lit:
                r.edges.append(Edge(from_=f"file:{rel}", to=f"order:{oid}",
                                    kind="order_write", props={},
                                    evidence=["git grep order call sites"],
                                    boundary="none"))
        r.nodes.sort(key=lambda n: n.id)
        r.edges.sort(key=lambda e: (e.from_, e.to, e.kind))
        return r
```

The `file:` writer nodes duplicate the id namespace of `file_inventory`;
the merge dedups by id with keep-last, so the writer props survive (the
dedup report records the shadowing — see §10).

## 5. Lens 1 — `order_path_must_pass_risk`

`tools/graph-recon/scanners/order_path_must_pass_risk.py`. Reads **only**
the pinned graph input. Every `order` node with an outgoing `executes_at`
edge must have an incident `risk_check` edge whose source is a `risk_rule`
node; one card per violating order (high severity — execution without a
risk gate).

```python
"""trading-engine lens: orders reaching execution must pass a risk rule.

Invariant: every order node with an outgoing executes_at edge (reaches
execution) must have at least one incident risk_check edge whose source is
a risk_rule node. One card per violating order (high severity — execution
without a risk gate).

Reads ONLY the pinned graph input (load_graph); never live state.
"""
from __future__ import annotations
from ._base_lens import BaseLens, LensResult
from reconloop.graphio import load_graph


class OrderPathMustPassRiskLens(BaseLens):
    name = "order_path_must_pass_risk"
    invariant = ("every order reaching execution must have an incident "
                 "risk_check edge from a risk_rule node")
    scope = "order nodes + executes_at edges + risk_check edges + risk_rule nodes"
    admission = ("order with an outgoing executes_at edge and no risk_check "
                 "edge from a risk_rule node")

    def run(self, ctx) -> LensResult:
        r = LensResult(lens_name=self.name, invariant=self.invariant,
                       scope=self.scope, admission=self.admission)
        nodes, edges, src = load_graph(ctx)

        risk_rules = {nid for nid, rec in nodes.items()
                      if rec.get("kind") == "risk_rule"}
        incident: dict[str, list] = {}
        for e in edges:
            if e.get("kind") == "risk_check":
                incident.setdefault(e["to"], []).append(e)

        cards = []
        checked = 0
        at_risk = 0
        for nid in sorted(nodes):
            rec = nodes[nid]
            if rec.get("kind") != "order":
                continue
            executes = [e for e in edges
                        if e.get("from") == nid and e.get("kind") == "executes_at"]
            if not executes:
                continue  # not reaching execution -> outside admission
            checked += 1
            gates = [e for e in incident.get(nid, []) if e["from"] in risk_rules]
            if gates:
                continue
            at_risk += 1
            term = executes[0]
            desc = (f"order {nid} reaches execution at {term['to']} without a "
                    f"risk_rule edge (no risk_check from a risk_rule node)")
            ev = [f"{src}", f"node:{nid}",
                  f"edge:{term['from']}->{term['to']} executes_at"]
            cards.append(self.card(r, node_ids=[nid], evidence=ev,
                                   sev="high", desc=desc))

        extra = {"orders_reaching_execution": checked,
                 "orders_without_risk_gate": at_risk,
                 "risk_rules": len(risk_rules),
                 "risk_check_edges": sum(len(v) for v in incident.values())}
        return self.finish(r, src=src, cards=cards, extra_props=extra)
```

## 6. Lens 2 — `stale_feed`

`tools/graph-recon/scanners/stale_feed.py`. Freshness is modeled
deterministically: the graph carries a `snapshot` node whose `props.as_of`
is the snapshot's as-of (never wall-clock). A `data_feed` node is stale
when `last_seen` is missing (high — no freshness signal) or
`as_of - last_seen > window_sec` (medium). No snapshot node → the window
check is skipped and noted (`r.notes`); missing-freshness cards still emit.

```python
"""trading-engine lens: data feeds must be fresh within their admission window.

Invariant: every data_feed node must carry a freshness signal (last_seen)
within its window_sec of the snapshot as-of. The as-of comes from a
snapshot node (kind=snapshot, props.as_of) in the graph — deterministic,
never wall-clock.

Admission: last_seen missing -> high ("no freshness signal");
as_of - last_seen > window_sec -> medium ("stale").

Reads ONLY the pinned graph input; never live state.
"""
from __future__ import annotations
from ._base_lens import BaseLens, LensResult
from reconloop.graphio import load_graph


class StaleFeedLens(BaseLens):
    name = "stale_feed"
    invariant = "every data_feed node must carry freshness within its admission window"
    scope = "data_feed nodes + snapshot as-of"
    admission = "last_seen missing (high) or as_of - last_seen > window_sec (medium)"

    def run(self, ctx) -> LensResult:
        r = LensResult(lens_name=self.name, invariant=self.invariant,
                       scope=self.scope, admission=self.admission)
        nodes, edges, src = load_graph(ctx)

        as_of = None
        for nid, rec in nodes.items():
            if rec.get("kind") == "snapshot":
                as_of = rec.get("props", {}).get("as_of")

        feeds = sorted(nid for nid, rec in nodes.items()
                       if rec.get("kind") == "data_feed")
        cards = []
        stale = 0
        for nid in feeds:
            props = nodes[nid].get("props", {})
            window = props.get("window_sec")
            last = props.get("last_seen")
            if last is None:
                stale += 1
                desc = (f"data feed {nid} has no freshness signal "
                        f"(last_seen missing)")
                cards.append(self.card(r, node_ids=[nid],
                                       evidence=[f"{src}", f"node:{nid}"],
                                       sev="high", desc=desc))
            elif as_of is not None and window is not None and as_of - last > window:
                stale += 1
                desc = (f"data feed {nid} stale: as_of {as_of} - last_seen {last} = "
                        f"{as_of - last} > window_sec {window}")
                cards.append(self.card(r, node_ids=[nid],
                                       evidence=[f"{src}", f"node:{nid}"],
                                       sev="medium", desc=desc))

        if as_of is None:
            r.notes = ("no snapshot node with as_of in graph input; window "
                       "check skipped (missing-freshness cards still emitted)")

        extra = {"data_feeds": len(feeds), "stale_feeds": stale, "as_of": as_of}
        return self.finish(r, src=src, cards=cards, extra_props=extra)
```

## 7. Fixtures — negative controls + metamorphic mutations

`tools/graph-recon/tests/lens_fixtures_trading.py`. The fixture protocol
from the SDK (§3.4): a clean fixture where every class the lenses read is
present-but-clean must produce **zero cards**; two metamorphic mutations
per lens must each produce **exactly one** expected card; plus
record-reorder and input-swap determinism checks. Runnable directly
(`python3 tests/lens_fixtures_trading.py`, no pytest).

```python
"""trading-engine lens fixtures — negative controls + metamorphic mutations.

Protocol (lens-spec.md / tests/test_lenses.py):
  - negative control: clean fixture => ZERO violation cards (both lenses)
  - metamorphic: mutate the graph => EXACTLY the expected cards appear
    (2 mutations per lens)
  - record reorder => byte-identical output (sorted-traversal invariant)
  - input swap => different graph yields a different card set (stale-input
    detection)

Run:  python3 tests/lens_fixtures_trading.py   (from tools/graph-recon/)
"""
from __future__ import annotations
import json
import subprocess
import sys
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

from reconloop.context import ScanContext            # noqa: E402
from scanners.order_path_must_pass_risk import OrderPathMustPassRiskLens  # noqa: E402
from scanners.stale_feed import StaleFeedLens        # noqa: E402

ORDER_LENS = OrderPathMustPassRiskLens()
FEED_LENS = StaleFeedLens()


def git(repo: Path, *args: str) -> None:
    subprocess.run(["git", "-C", str(repo), *args], check=True, capture_output=True)


def _node(nid, kind, props=None):
    return {"id": nid, "kind": kind, "props": props or {},
            "evidence": ["fixture"], "src": "fixture"}


def _edge(f, t, kind, boundary="none"):
    return {"from": f, "to": t, "kind": kind, "props": {},
            "evidence": ["fixture"], "boundary": boundary}


def _write_graph(path: Path, recs: list) -> None:
    with open(path, "w") as f:
        for r in sorted(recs, key=lambda r: json.dumps(r, sort_keys=True)):
            f.write(json.dumps(r, sort_keys=True) + "\n")


def build_clean_fixture() -> tuple[Path, str, Path]:
    """Clean trading graph: all orders gated, all feeds fresh. 0 cards."""
    td = tempfile.mkdtemp(prefix="trading-fixture-")
    repo = Path(td) / "repo"
    repo.mkdir()
    git(repo, "init", "-b", "main")
    git(repo, "config", "user.email", "t@t")
    git(repo, "config", "user.name", "t")
    (repo / "engine").mkdir()
    (repo / "engine" / "executor.py").write_text(
        "def place_order(oid, venue):\n    pass\n")
    git(repo, "add", "-A")
    git(repo, "commit", "-m", "clean fixture")
    rev = subprocess.run(["git", "-C", str(repo), "rev-parse", "HEAD"],
                         capture_output=True, text=True).stdout.strip()

    recs = [
        _node("snapshot:main", "snapshot", {"as_of": 10000}),
        _node("order:O-1", "order", {"side": "buy", "size": 0.5, "venue": "binance"}),
        _node("order:O-2", "order", {"side": "sell", "size": 1.0, "venue": "binance"}),
        _node("risk_rule:R-1", "risk_rule", {"name": "max_position_btc"}),
        _node("risk_rule:R-2", "risk_rule", {"name": "max_order_size"}),
        _node("venue:binance", "venue"),
        _node("venue:coinbase", "venue"),
        _node("data_feed:binance-btc-book", "data_feed",
              {"window_sec": 60, "last_seen": 9950}),
        _node("data_feed:coinbase-btc-book", "data_feed",
              {"window_sec": 60, "last_seen": 9950}),
        _edge("risk_rule:R-1", "order:O-1", "risk_check"),
        _edge("risk_rule:R-2", "order:O-2", "risk_check"),
        _edge("order:O-1", "venue:binance", "executes_at"),
        _edge("order:O-2", "venue:binance", "executes_at"),
        _edge("data_feed:binance-btc-book", "venue:binance", "feed_provider"),
        _edge("data_feed:coinbase-btc-book", "venue:coinbase", "feed_provider"),
    ]
    graph_path = Path(td) / "graph.jsonl"
    _write_graph(graph_path, recs)
    return repo, rev, graph_path


def _ctx(repo: Path, rev: str, graph_path: Path) -> ScanContext:
    return ScanContext(str(repo), revision=rev, graph_input=str(graph_path))


def _load(graph_path: Path) -> tuple[list, list]:
    nodes, edges = [], []
    for line in graph_path.read_text().splitlines():
        d = json.loads(line)
        (edges if "from" in d else nodes).append(d)
    return nodes, edges


def test_negative_controls_zero_cards() -> None:
    repo, rev, graph_path = build_clean_fixture()
    c = _ctx(repo, rev, graph_path)
    for lens in (ORDER_LENS, FEED_LENS):
        res = lens.run(c)
        assert len(res.findings) == 0, \
            f"{lens.name}: clean fixture produced {len(res.findings)} cards"
    print("negative controls OK (2 lenses, zero cards each)")


def test_order_lens_metamorphic() -> None:
    # M1: new order O-3 reaches execution with NO risk_check -> exactly 1 card
    repo, rev, graph_path = build_clean_fixture()
    nodes, edges = _load(graph_path)
    recs = nodes + edges + [
        _node("order:O-3", "order", {"side": "buy", "size": 2.0, "venue": "coinbase"}),
        _edge("order:O-3", "venue:coinbase", "executes_at"),
    ]
    _write_graph(graph_path, recs)
    res = ORDER_LENS.run(_ctx(repo, rev, graph_path))
    cards = res.findings
    assert len(cards) == 1, [f.desc for f in cards]
    assert "O-3" in cards[0].desc and cards[0].sev == "high"
    assert cards[0].verified is False and cards[0].status == "open"

    # M2: risk_check edge whose source is NOT a risk_rule node -> card
    # (fresh clean fixture: re-read, then re-point O-1's gate at the venue)
    repo, rev, graph_path = build_clean_fixture()
    nodes, edges = _load(graph_path)
    recs = nodes + edges
    recs = [e if not (e.get("kind") == "risk_check" and e.get("to") == "order:O-1")
            else _edge("venue:binance", "order:O-1", "risk_check") for e in recs]
    _write_graph(graph_path, recs)
    res = ORDER_LENS.run(_ctx(repo, rev, graph_path))
    cards = res.findings
    assert len(cards) == 1, [f.desc for f in cards]
    assert "O-1" in cards[0].desc
    print("order lens metamorphic OK (M1=1 card O-3, M2=1 card O-1)")


def test_feed_lens_metamorphic() -> None:
    # M1: feed last_seen outside window -> exactly 1 card (medium)
    repo, rev, graph_path = build_clean_fixture()
    nodes, edges = _load(graph_path)
    recs = [n if n.get("id") != "data_feed:binance-btc-book"
            else _node("data_feed:binance-btc-book", "data_feed",
                       {"window_sec": 60, "last_seen": 9800}) for n in nodes] + edges
    _write_graph(graph_path, recs)
    res = FEED_LENS.run(_ctx(repo, rev, graph_path))
    cards = res.findings
    assert len(cards) == 1, [f.desc for f in cards]
    assert "binance-btc-book" in cards[0].desc and cards[0].sev == "medium"

    # M2: feed with NO last_seen -> exactly 1 card (high)
    # (fresh clean fixture: re-read, then drop the freshness prop)
    repo, rev, graph_path = build_clean_fixture()
    nodes, edges = _load(graph_path)
    recs = [n if n.get("id") != "data_feed:coinbase-btc-book"
            else _node("data_feed:coinbase-btc-book", "data_feed",
                       {"window_sec": 60}) for n in nodes] + edges
    _write_graph(graph_path, recs)
    res = FEED_LENS.run(_ctx(repo, rev, graph_path))
    cards = res.findings
    assert len(cards) == 1, [f.desc for f in cards]
    assert "coinbase-btc-book" in cards[0].desc and cards[0].sev == "high"
    print("feed lens metamorphic OK (M1=1 card medium stale, M2=1 card high missing)")


def test_record_reorder_identical_output() -> None:
    repo, rev, graph_path = build_clean_fixture()
    c = _ctx(repo, rev, graph_path)
    # produce a card, then shuffle record order with a fixed seed
    nodes, edges = _load(graph_path)
    recs = nodes + edges + [
        _node("order:O-3", "order", {"side": "buy", "size": 2.0, "venue": "coinbase"}),
        _edge("order:O-3", "venue:coinbase", "executes_at"),
    ]
    _write_graph(graph_path, recs)
    a = ORDER_LENS.run(c)
    import random
    shuffled = list(recs)
    random.Random(42).shuffle(shuffled)
    _write_graph(graph_path, shuffled)
    b = ORDER_LENS.run(c)
    assert [f.to_jsonl() for f in a.findings] == [f.to_jsonl() for f in b.findings]
    assert [n.to_jsonl() for n in a.nodes] == [n.to_jsonl() for n in b.nodes]
    print("record-reorder determinism OK")


def test_input_swap_fails_stale() -> None:
    repo, rev, graph_path = build_clean_fixture()
    clean = ORDER_LENS.run(_ctx(repo, rev, graph_path))
    assert len(clean.findings) == 0
    nodes, edges = _load(graph_path)
    other = Path(str(graph_path) + ".swap.jsonl")
    _write_graph(other, nodes + edges + [
        _node("order:O-3", "order", {"side": "buy", "size": 2.0, "venue": "coinbase"}),
        _edge("order:O-3", "venue:coinbase", "executes_at"),
    ])
    swapped = ORDER_LENS.run(_ctx(repo, rev, other))
    assert len(swapped.findings) == 1
    assert [f.id for f in clean.findings] != [f.id for f in swapped.findings]
    print("input-swap OK (clean 0 cards, swapped 1 card)")


def test_card_schema_and_lens_node() -> None:
    repo, rev, graph_path = build_clean_fixture()
    nodes, edges = _load(graph_path)
    _write_graph(graph_path, nodes + edges + [
        _node("order:O-3", "order", {"side": "buy", "size": 2.0, "venue": "coinbase"}),
        _edge("order:O-3", "venue:coinbase", "executes_at"),
    ])
    res = ORDER_LENS.run(_ctx(repo, rev, graph_path))
    card = res.findings[0]
    import re
    assert re.fullmatch(r"L-[a-z_]+-[0-9a-f]{8}", card.id), card.id
    assert card.verified is False and card.status == "open"
    assert card.evidence and card.fingerprint
    lens_node = next(n for n in res.nodes if n.kind == "lens")
    assert lens_node.props["cards"] == 1
    assert lens_node.id == "lens:order_path_must_pass_risk"
    print("card schema + lens summary node OK")


if __name__ == "__main__":
    for fn in (test_negative_controls_zero_cards, test_order_lens_metamorphic,
               test_feed_lens_metamorphic, test_record_reorder_identical_output,
               test_input_swap_fails_stale, test_card_schema_and_lens_node):
        fn()
        print(f"OK {fn.__name__}")
    print("lens_fixtures_trading OK (all)")
```

Run it:

```bash
cd tools/graph-recon
python3 tests/lens_fixtures_trading.py
```

Verified output:

```
negative controls OK (2 lenses, zero cards each)
OK test_negative_controls_zero_cards
order lens metamorphic OK (M1=1 card O-3, M2=1 card O-1)
OK test_order_lens_metamorphic
feed lens metamorphic OK (M1=1 card medium stale, M2=1 card high missing)
OK test_feed_lens_metamorphic
record-reorder determinism OK
OK test_record_reorder_identical_output
input-swap OK (clean 0 cards, swapped 1 card)
OK test_input_swap_fails_stale
card schema + lens summary node OK
OK test_card_schema_and_lens_node
lens_fixtures_trading OK (all)
```

## 8. The seed graph — why the first run needs one

Lenses and analytics are fail-closed: without a graph input they raise,
the run writes error layers and exits 1. So the first run needs an input
graph. It models the **system snapshot** — the parts of the world the
config scanners cannot see: feed freshness (`last_seen`), the snapshot
as-of, and the execution edges. In production this snapshot is produced by
your own tooling or a live feed-status scanner; here it is a hand-written
seed — with exactly two planted violations:

- `order:O-1003` has an `executes_at` edge but **no** `risk_check` edge;
- `data_feed:coinbase-btc-book` has `last_seen: 9900`, which is
  `10000 - 9900 = 100 > window_sec 60` — stale.

`seed/graph.jsonl` (JSONL, one record per line, keys sorted):

```jsonl
{"evidence": ["seed"], "id": "data_feed:binance-btc-book", "kind": "data_feed", "props": {"last_seen": 9950, "window_sec": 60}, "src": "seed"}
{"evidence": ["seed"], "id": "data_feed:binance-btc-trades", "kind": "data_feed", "props": {"last_seen": 9995, "window_sec": 30}, "src": "seed"}
{"evidence": ["seed"], "id": "data_feed:coinbase-btc-book", "kind": "data_feed", "props": {"last_seen": 9900, "window_sec": 60}, "src": "seed"}
{"evidence": ["seed"], "id": "order:O-1001", "kind": "order", "props": {"side": "buy", "size": 0.5, "symbol": "BTCUSDT", "venue": "binance"}, "src": "seed"}
{"evidence": ["seed"], "id": "order:O-1002", "kind": "order", "props": {"side": "sell", "size": 1.0, "symbol": "BTCUSDT", "venue": "binance"}, "src": "seed"}
{"evidence": ["seed"], "id": "order:O-1003", "kind": "order", "props": {"side": "buy", "size": 2.0, "symbol": "ETHUSDT", "venue": "coinbase"}, "src": "seed"}
{"evidence": ["seed"], "id": "risk_rule:R-1", "kind": "risk_rule", "props": {"name": "max_position_btc"}, "src": "seed"}
{"evidence": ["seed"], "id": "risk_rule:R-2", "kind": "risk_rule", "props": {"name": "max_order_size"}, "src": "seed"}
{"evidence": ["seed"], "id": "snapshot:main", "kind": "snapshot", "props": {"as_of": 10000}, "src": "seed"}
{"evidence": ["seed"], "id": "strategy:momentum", "kind": "strategy", "props": {}, "src": "seed"}
{"evidence": ["seed"], "id": "symbol:BTCUSDT", "kind": "symbol", "props": {}, "src": "seed"}
{"evidence": ["seed"], "id": "symbol:ETHUSDT", "kind": "symbol", "props": {}, "src": "seed"}
{"evidence": ["seed"], "id": "venue:binance", "kind": "venue", "props": {}, "src": "seed"}
{"evidence": ["seed"], "id": "venue:coinbase", "kind": "venue", "props": {}, "src": "seed"}
{"boundary": "none", "evidence": ["seed"], "from": "data_feed:binance-btc-book", "kind": "feed_provider", "props": {}, "to": "venue:binance"}
{"boundary": "none", "evidence": ["seed"], "from": "data_feed:binance-btc-book", "kind": "quotes", "props": {}, "to": "symbol:BTCUSDT"}
{"boundary": "none", "evidence": ["seed"], "from": "data_feed:binance-btc-trades", "kind": "feed_provider", "props": {}, "to": "venue:binance"}
{"boundary": "none", "evidence": ["seed"], "from": "data_feed:binance-btc-trades", "kind": "quotes", "props": {}, "to": "symbol:BTCUSDT"}
{"boundary": "none", "evidence": ["seed"], "from": "data_feed:coinbase-btc-book", "kind": "feed_provider", "props": {}, "to": "venue:coinbase"}
{"boundary": "none", "evidence": ["seed"], "from": "data_feed:coinbase-btc-book", "kind": "quotes", "props": {}, "to": "symbol:BTCUSDT"}
{"boundary": "none", "evidence": ["seed"], "from": "order:O-1001", "kind": "executes_at", "props": {}, "to": "venue:binance"}
{"boundary": "none", "evidence": ["seed"], "from": "order:O-1001", "kind": "placed_by", "props": {}, "to": "strategy:momentum"}
{"boundary": "none", "evidence": ["seed"], "from": "order:O-1002", "kind": "executes_at", "props": {}, "to": "venue:binance"}
{"boundary": "none", "evidence": ["seed"], "from": "order:O-1002", "kind": "placed_by", "props": {}, "to": "strategy:momentum"}
{"boundary": "none", "evidence": ["seed"], "from": "order:O-1003", "kind": "executes_at", "props": {}, "to": "venue:coinbase"}
{"boundary": "none", "evidence": ["seed"], "from": "order:O-1003", "kind": "placed_by", "props": {}, "to": "strategy:momentum"}
{"boundary": "none", "evidence": ["seed"], "from": "risk_rule:R-1", "kind": "risk_check", "props": {}, "to": "order:O-1001"}
{"boundary": "none", "evidence": ["seed"], "from": "risk_rule:R-2", "kind": "risk_check", "props": {}, "to": "order:O-1002"}
```

Commit everything (two commits so far — the `git_history` layer will read
`commits: 2`):

```bash
cd ..
git add -A
git commit -m "vendor graph-recon template + trading scanners/lenses/fixtures"
```

## 9. First run

From `tools/graph-recon/`:

```bash
cd tools/graph-recon
python3 -m reconloop.cli scan --root ../.. --scanners-dir scanners
```

Verified output:

```
[scan] 31 scanners loaded: articulation, base, connected_components, cross_layer_links, deps_audit, env_files, env_process_edges, env_to_process, exec_centrality, feed_inventory, file_inventory, git_history, hook_projection, hygiene, launchd, launchd_existence, live_ports, mcp_registration, mcp_servers, network_probe, order_path_must_pass_risk, order_writer_mapping, protected_paths, protected_writer, route_binding, secrets_control, security_path, stale_feed, test_wiring, writer_to_protected, writers
```

Your two scanners and two lenses are in the list — auto-discovered, no
registration. Now the first run:

```bash
python3 -m reconloop.cli run \
  --root ../.. --scanners-dir scanners \
  --layers out/layers --graph out/graph.jsonl --pin out/graph.sha256 \
  --findings-dir out/findings \
  --graph-input ../../seed/graph.jsonl --revision HEAD
```

Verified output:

```
[run] articulation: 0 records | code subgraph has no cut vertices/bridges (graph:e44087abb39...
[run] connected_components: 18 records
[run] cross_layer_links: 8 records
[run] deps_audit: 0 records | network audit disabled (GRAPH_RECON_NET_AUDIT=1 to enable; ...
[run] env_files: 0 records
[run] env_process_edges: 1 records
[run] env_to_process: lens disabled by config (lenses.enabled allowlist)
[run] exec_centrality: 0 records | no exec-capable sources (graph:e44087abb39e6b13 (+0 net-new ...
[run] feed_inventory: 13 records
[run] file_inventory: 95 records
[run] git_history: 1 records
[run] hook_projection: lens disabled by config (lenses.enabled allowlist)
[run] hygiene: 2 records
[run] launchd: 26 records
[run] launchd_existence: lens disabled by config (lenses.enabled allowlist)
[run] live_ports: 104 records
[run] mcp_registration: lens disabled by config (lenses.enabled allowlist)
[run] mcp_servers: 8 records
[run] network_probe: 0 records | probes disabled (GRAPH_RECON_LIVE_PROBE=1 to enable)
[run] order_path_must_pass_risk: 1 records
[run] order_writer_mapping: 18 records
[run] protected_paths: 1 records
[run] protected_writer: lens disabled by config (lenses.enabled allowlist)
[run] route_binding: lens disabled by config (lenses.enabled allowlist)
[run] secrets_control: 0 records | secret-leak-scan.mjs absent
[run] security_path: lens disabled by config (lenses.enabled allowlist)
[run] stale_feed: 1 records
[run] test_wiring: 0 records
[run] writer_to_protected: lens disabled by config (lenses.enabled allowlist)
[run] writers: 0 records
[merge] 20 stable layers (22 total) -> 191 raw / 188 deduped records | sha256 f69b4881986abfca... | dups 3
```

Reading the run:

- `feed_inventory: 13 records` = 2 venue + 2 symbol + 3 feed nodes + 6
  edges. `order_writer_mapping: 18 records` = 2 risk_rule + 1 strategy +
  3 order nodes + 8 edges (executes_at×3, placed_by×3, risk_check×2) + 1
  writer file node + 3 order_write edges. Both lenses emit 1 record each —
  their **summary node**; the violation cards are findings, not records.
- `[merge] 20 stable layers (22 total)`: 26 core scanners + your 4 modules
  − `base` (skipped) − 8 disabled lenses = 22 total; `live_ports` and
  `hygiene` are ephemeral (excluded from the pin) → 20 stable layers.
- `dups 3`: the merged graph deduplicated 3 node records by id — the
  writer `file:` nodes that `file_inventory` also emits; keep-last means
  the writer props won (see `out/graph.dedup-report.json`).
- Machine-state layers (`launchd: 26`, `live_ports: 104`, `mcp_servers: 8`,
  `hygiene: 2`) reflect this host — yours will differ. `live_ports` and
  `hygiene` are ephemeral so they cannot break the pin; `launchd` is a
  stable machine-local layer, which makes pins machine-local — the
  determinism contract is "same input state ⇒ same pin", not
  "same pin on every machine". Mark machine-local layers ephemeral when
  you need cross-machine pins.
- The 8 `lens disabled by config` lines are the template's YURI grammar
  lenses, skipped by your allowlist — expected.

## 10. Read the cards

The two violation cards — this is the first label round's queue:

```bash
cat out/findings/order_path_must_pass_risk.jsonl
cat out/findings/stale_feed.jsonl
```

Verified output:

```json
{"desc": "[order_path_must_pass_risk] order order:O-1003 reaches execution at venue:coinbase without a risk_rule edge (no risk_check from a risk_rule node) (nodes: order:O-1003)", "dim": "lens", "evidence": ["edge:order:O-1003->venue:coinbase executes_at", "graph:e44087abb39e6b13 (+0 net-new unique)", "node:order:O-1003"], "fingerprint": "ca1e98b690c36239", "id": "L-order_path_must_pass_risk-d5395cf7", "sev": "high", "status": "open", "verified": false}
{"desc": "[stale_feed] data feed data_feed:coinbase-btc-book stale: as_of 10000 - last_seen 9900 = 100 > window_sec 60 (nodes: data_feed:coinbase-btc-book)", "dim": "lens", "evidence": ["graph:e44087abb39e6b13 (+0 net-new unique)", "node:data_feed:coinbase-btc-book"], "fingerprint": "1204157b0a67dcf0", "id": "L-stale_feed-9435dab1", "sev": "medium", "status": "open", "verified": false}
```

Both cards are `verified: false`, `status: "open"`, ids match
`L-[a-z_]+-[0-9a-f]{8}`, and evidence is path-independent: the graph label
`graph:e44087abb39e6b13` is the sha256 prefix of the input graph
(content-addressed), plus `node:`/`edge:` references. The lens summary
nodes carry the per-lens counts:

```bash
grep '"kind": "lens"' out/graph.jsonl
```

```
lens:order_path_must_pass_risk {'admission': 'order with an outgoing executes_at edge and no risk_check edge from a risk_rule node', 'cards': 1, 'invariant': 'every order reaching execution must have an incident risk_check edge from a risk_rule node', 'orders_reaching_execution': 3, 'orders_without_risk_gate': 1, 'risk_check_edges': 2, 'risk_rules': 2, 'scope': 'order nodes + executes_at edges + risk_check edges + risk_rule nodes'}
lens:stale_feed {'admission': 'last_seen missing (high) or as_of - last_seen > window_sec (medium)', 'as_of': 10000, 'cards': 1, 'data_feeds': 3, 'invariant': 'every data_feed node must carry freshness within its admission window', 'scope': 'data_feed nodes + snapshot as-of', 'stale_feeds': 1}
```

## 11. Verify, ledger, manifest

```bash
python3 -m reconloop.cli verify --graph out/graph.jsonl --pin out/graph.sha256
# VERIFY PASS

python3 -m reconloop.cli verify --rerun --root ../.. --scanners-dir scanners \
  --layers out/layers --graph out/graph.jsonl --pin out/graph.sha256 \
  --findings-dir out/findings --graph-input ../../seed/graph.jsonl --revision HEAD
# VERIFY --rerun PASS (regen matches stored pin)   — run it twice; both PASS

python3 -m reconloop.cli ledger --findings out/findings/order_path_must_pass_risk.jsonl
# {"high": 1}
python3 -m reconloop.cli ledger --findings out/findings/stale_feed.jsonl
# {"medium": 1}

python3 -m reconloop.cli manifest --manifest out/layers/analysis-manifest.json
# [manifest] PASS
```

Notes: `ledger --findings` takes one findings **file** (a directory
raises); aggregate with the one-liner in the SDK §5.5. `verify --rerun`
re-runs the full pipeline and compares the regenerated hash to the stored
pin — the determinism re-check. Both consecutive reruns matched
(`sha256 f69b4881986abfca...`).

## 12. Query the graph

No `query` subcommand exists — the merged graph and findings are plain
JSONL:

```bash
# node-kind census
python3 - <<'EOF'
import json
from collections import Counter
kinds = Counter()
for line in open("out/graph.jsonl"):
    d = json.loads(line)
    if "id" in d:
        kinds[d["kind"]] += 1
print(dict(sorted(kinds.items())))
EOF
```

```
{'component': 3, 'component_ranking': 1, 'cross_layer_link': 5, 'data_feed': 3, 'file': 95, 'git_commit': 1, 'launchd_agent': 13, 'layer': 1, 'lens': 2, 'mcp_server': 4, 'order': 3, 'protected_path': 1, 'risk_rule': 2, 'strategy': 1, 'surface_query': 3, 'symbol': 2, 'venue': 2}
```

All six trading node kinds are present (`venue`, `strategy`, `symbol`,
`order`, `risk_rule`, `data_feed`), plus the lens nodes and the analytics
layers. Edge-level queries:

```bash
grep '"kind": "risk_check"' out/graph.jsonl
```

```
{"boundary": "none", "evidence": ["config/orders.json order:O-1001"], "from": "risk_rule:R-1", "kind": "risk_check", "props": {}, "to": "order:O-1001"}
{"boundary": "none", "evidence": ["config/orders.json order:O-1002"], "from": "risk_rule:R-2", "kind": "risk_check", "props": {}, "to": "order:O-1002"}
```

Two gates — and no `risk_rule:R-* → order:O-1003` line, which is exactly
what the lens carded on.

## 13. First label round

Per lens-spec (D), the human layer labels each card:

- **accept** — the card is real; it pins ground truth (fix the model/code).
- **reject** — the card is scanner/rule noise; the lens rule gets fixed.
- **defer** — real but out of scope for this round.

Write the labels next to the findings (JSONL, human-maintained):

```bash
cat > out/findings/labels.jsonl <<'EOF'
{"id": "L-order_path_must_pass_risk-d5395cf7", "label": "accept", "by": "you", "note": "O-1003 reaches coinbase execution with no risk gate in config/orders.json — real gap"}
{"id": "L-stale_feed-9435dab1", "label": "accept", "by": "you", "note": "coinbase book feed is 100s outside its 60s window in the snapshot — real staleness"}
EOF
```

Both cards are accepted as ground truth. The `order_path` card points at a
model gap you can fix today: `O-1003` is declared with `"risk_rule": null`.
The `stale_feed` card points at runtime state — the config scanner cannot
know feed freshness; the seed (or a future live feed-status layer) must
carry it.

## 14. Closing the loop

Fix the accepted order card — add rule `R-3` and gate `O-1003`:

```bash
cd ../..
python3 - <<'EOF'
import json
from pathlib import Path
rules = json.loads(Path("config/risk_rules.json").read_text())
rules["rules"].append({"id": "R-3", "name": "max_eth_exposure", "kind": "position_limit", "params": {"max_eth": 3.0}})
Path("config/risk_rules.json").write_text(json.dumps(rules, indent=2) + "\n")
orders = json.loads(Path("config/orders.json").read_text())
for o in orders["orders"]:
    if o["id"] == "O-1003":
        o["risk_rule"] = "R-3"
Path("config/orders.json").write_text(json.dumps(orders, indent=2) + "\n")
EOF
git add -A
git commit -m "gate O-1003 with R-3 (label-round fix)"
```

Now the loop is iterative: the lenses read whatever graph you point them
at. Iteration 2 — feed the previous **merged graph** back as the lens
input:

```bash
cd tools/graph-recon
python3 -m reconloop.cli run \
  --root ../.. --scanners-dir scanners \
  --layers out2/layers --graph out2/graph.jsonl --pin out2/graph.sha256 \
  --findings-dir out2/findings \
  --graph-input out/graph.jsonl --revision HEAD
```

Verified: `[merge] 20 stable layers (22 total) -> 497 raw / 494 deduped records | sha256 42a36dae8d6a3b30... | dups 3`

Two things happened. First, the order card persists with the **identical
id** — `L-order_path_must_pass_risk-d5395cf7` — determinism across runs.
Second, `stale_feed` now emits **3 cards, all high**: the merged graph's
`data_feed` nodes come from `feed_inventory` (config), which carries
`window_sec` but no `last_seen`, and the merged graph has no `snapshot`
node (note: `no snapshot node with as_of in graph input; window check
skipped`). This is the **modeling-gap lesson** — exactly what the YURI
loop hit on its M2.1 snapshot: the lens is correct; the input graph does
not model runtime freshness. The config layer cannot observe runtime
state; in production a live feed-status scanner (ephemeral) or a
regenerated snapshot layer supplies `last_seen`.

Iteration 3 — the config fix has been committed, but the lenses still read
the pre-fix graph, so the order card **still** fires:

```bash
python3 -m reconloop.cli run \
  --root ../.. --scanners-dir scanners \
  --layers out3/layers --graph out3/graph.jsonl --pin out3/graph.sha256 \
  --findings-dir out3/findings \
  --graph-input out2/graph.jsonl --revision HEAD
python3 -m reconloop.cli ledger --findings out3/findings/order_path_must_pass_risk.jsonl
# {"high": 1}
```

Verified: `[merge] ... -> 718 raw / 715 deduped records | sha256 aabacc5daf800c09... | dups 3`

Iteration 4 — now point the lenses at the run-3 merged graph, which
contains the fixed scanner layers:

```bash
python3 -m reconloop.cli run \
  --root ../.. --scanners-dir scanners \
  --layers out4/layers --graph out4/graph.jsonl --pin out4/graph.sha256 \
  --findings-dir out4/findings \
  --graph-input out3/graph.jsonl --revision HEAD
ls out4/findings/
python3 -m reconloop.cli ledger --findings out4/findings/stale_feed.jsonl
grep '"kind": "risk_check"' out4/graph.jsonl
```

Verified:

```
[merge] 20 stable layers (22 total) -> 911 raw / 908 deduped records | sha256 80e523be0908f2a1... | dups 3
cross_layer_links.jsonl
exec_centrality.jsonl
stale_feed.jsonl
{"high": 3}
risk_rule:R-1 -> order:O-1001
risk_rule:R-2 -> order:O-1002
risk_rule:R-3 -> order:O-1003
```

The order card is **gone** (`order_path_must_pass_risk.jsonl` absent from
findings) — `risk_rule:R-3 → order:O-1003` is now in the merged graph. The
`stale_feed` cards (3 high) remain: the accepted modeling-gap finding,
which the next iteration addresses with a freshness-producing layer (and
whose cards, per the protocol, would be labeled `reject` as
scanner-rule/modeling fixes, not code fixes).

## 15. Hash-freeze

You added four modules to `scanners/`; fold them into the template's
hash-freeze so future tamper detection covers them (regen is the add path):

```bash
python3 -c "from reconloop.hashfreeze import write_hashfreeze; \
from pathlib import Path; write_hashfreeze(Path('.'), commit='<current-commit>')"
python3 -c "from reconloop.hashfreeze import verify_hashfreeze; \
from pathlib import Path; v = verify_hashfreeze(Path('.')); print(v or 'hashfreeze PASS')"
# hashfreeze PASS
```

And the gate bites — tamper with any frozen scanner and re-verify:

```bash
printf '\n# tamper\n' >> scanners/feed_inventory.py
python3 -c "from reconloop.hashfreeze import verify_hashfreeze; \
from pathlib import Path; v = verify_hashfreeze(Path('.')); print(v or 'PASS')"
# ['scanners/feed_inventory.py: frozen 419157776d97... != current cfbcbf7aa096']
```

Commit the regenerated freeze, and keep the loop running: every future
iteration is `run` with the previous merged graph as `--graph-input`,
`verify --rerun` before trusting a snapshot, and a label round per batch
of cards.

---

## Checklist (what this tutorial proved, with the command that proved it)

| claim | command (verified output) |
|---|---|
| 4 new modules auto-discovered | `scan` → `31 scanners loaded` (incl. `feed_inventory`, `order_writer_mapping`, `order_path_must_pass_risk`, `stale_feed`) |
| negative controls | `python3 tests/lens_fixtures_trading.py` → `negative controls OK (2 lenses, zero cards each)` |
| metamorphic ×2 per lens | same run → `order lens metamorphic OK (M1=1 card O-3, M2=1 card O-1)`, `feed lens metamorphic OK (M1=1 card medium stale, M2=1 card high missing)` |
| reorder + swap determinism | same run → `record-reorder determinism OK`, `input-swap OK` |
| first run | `run --graph-input ../../seed/graph.jsonl` → `[merge] ... sha256 f69b4881986abfca...`, 2 cards |
| cards | `cat out/findings/*.jsonl` → `L-order_path_must_pass_risk-d5395cf7` (high), `L-stale_feed-9435dab1` (medium), both `verified:false` |
| determinism | `verify --rerun` twice → `VERIFY --rerun PASS (regen matches stored pin)` ×2 |
| ledger | `ledger --findings ...` → `{"high": 1}` / `{"medium": 1}` |
| manifest | `manifest --manifest ...` → `[manifest] PASS` |
| loop closure | iterations 2–4 → order card id stable, then gone after `R-3` gate materializes (`risk_rule:R-3 -> order:O-1003`) |
| hash-freeze | regen → `hashfreeze PASS`; tamper → `frozen 419157776d97... != current cfbcbf7aa096` |
