# graph-recon SDK — the extension contract

This document is the complete developer contract for the graph-recon loop:
what a project looks like, how to add scanners and lenses, how to ship
scanner packs, and how to run, verify and query the loop. It is
copy-pasteable — every snippet below is runnable against a stock template
(verified: the 10-line scanner example was executed end-to-end, see
`docs/tutorial-trading.md` for a full worked example).

Runtime: Python 3.11+ (tested on 3.14), stdlib only, zero dependencies.
The engine is a **template, not a dependency**: vendor it into your repo
(`tools/graph-recon/`) and add code to it.

---

## 1. Project anatomy

```
<your-repo>/
  tools/graph-recon/            # vendored template
    reconproject.json           # per-project config (see 1.2)
    reconloop/                  # engine (stdlib only — do not fork lightly)
      cli.py                    #   scan | run | merge | verify | ledger | manifest
      model.py                  #   Node / Edge / Finding dataclasses + JSONL IO
      context.py                #   ScanContext: root, revision, read guards
      registry.py               #   scanner auto-discovery + packs
      config.py                 #   reconproject.json loader + root discovery
      protected.py              #   protected-surface catalog (metadata-only)
      determinism.py            #   sha256 pin / verify / regen
      graphio.py                #   merged-graph input loading (analytics/lenses)
      ledger.py                 #   findings fingerprint / dedup / severity
      merge.py                  #   node dedup (keep-last) + dup report
      bundle.py                 #   analysis-manifest build/validate
      hashfreeze.py             #   hash-freeze build/verify/regen
      schemas/                  #   pinned JSON schemas (+ .sha256 pins)
    scanners/                   # YOUR scanners + lenses live here
      base.py                   #   BaseScanner / ScanResult protocol
      _base_lens.py             #   BaseLens / LensResult protocol
      <name>.py                 #   one file per scanner or lens
    packs/                      # optional scanner packs (opt-in, see §4)
    tests/                      # engine tests + your lens fixtures
    hashfreeze.json             # pinned hashes (scanners/schemas/engine/packs/fixtures)
    pyproject.toml              # console entry: graph-recon
    README.md                   # quick start + rails
```

`scanners/` is the extension directory. Auto-discovery loads every
`*.py` file there (files starting with `_` are skipped; files whose source
does not reference `BaseScanner`/`BaseLens` are skipped as non-scanner
modules — which is how no-op stubs stay inert) and registers any class in
that module that defines `name` and `run`. No registration table, no
decorator, no config entry — **dropping a file in `scanners/` adds code to
the loop**.

### 1.1 The record model (`reconloop/model.py`)

Every layer file, the merged graph, and the findings store are JSONL
(one JSON object per line, keys sorted):

```python
Node(id, kind, props={}, evidence=[], src="")
#   id       "namespace:name" — stable across runs, e.g. "file:engine/x.py"
#   kind     the node class the graph grammar reasons about, e.g. "order"
#   props    typed metadata (never secret VALUES)
#   evidence list of [file:line | command | hash] — see §2.3
#   src      scanner name that produced the record

Edge(from_, to, kind, props={}, evidence=[], boundary="none")
#   from_/to node ids; kind = edge class ("risk_check", "executes_at", ...)
#   boundary "none"|"local"|"lan"|"network"|"internet" — trust boundary class

Finding(id, sev, dim, desc, evidence=[], status="open", verified=False, fingerprint="")
#   id        "L-<lens>-<sha8>" for lens cards, else scanner-chosen
#   sev       critical | high | medium | low | info
#   verified  always False at creation; human labels pin ground truth
```

### 1.2 `reconproject.json` — every section

All sections are optional; missing sections fall back to built-in
defaults, so a stock template behaves exactly like the pre-config engine.
Discovery order: `$GRAPH_RECON_CONFIG` (explicit path) → the file next to
the engine (`<template_root>/reconproject.json`). Loads fail open: a
missing or malformed config degrades to defaults.

| section | shape | meaning |
|---|---|---|
| `root.markers` | `["pyproject.toml", ...]` | project-root discovery markers, used when `--root` is not passed (`discover_root` walks up from CWD) |
| `protected.patterns` | `[regex, ...]` | protected-path catalog. **Default-if-absent**: the built-in heritage catalog in `reconloop/protected.py`. `ctx.read_text()` returns `None` for protected paths (fail-closed); `ctx.meta_only()` returns metadata only |
| `ephemeral.layers` | `{"<layer>": "ephemeral"}` | per-layer stability override. Ephemeral layers are freshness-stamped (`layers/<name>.meta.json`) and **excluded from the determinism pin**. Mark every layer that reads live state (ports, crontab, wall clock) ephemeral |
| `lenses.enabled` | `["lens_a", ...]` | non-empty list = allowlist: only these lenses run. Empty = all lenses run |
| `lenses.disabled` | `["lens_b", ...]` | exclusion list (applied after `enabled`) |
| `lenses.admission` | `{"<lens>": "<threshold string>"}` | per-lens admission-threshold override; overwrites the lens class `admission` (recorded in the lens summary node) |
| `review.max_findings_per_layer` | int (default 100) | findings budget per layer; excess is truncated and reported in `findings/<layer>.review.json` |
| `packs` | `["yuri", ...]` | scanner packs to auto-load from `<template_root>/packs/<name>/` (also loadable via `--packs`; union of both) |

Environment variables: `GRAPH_RECON_CONFIG` (config path), `GRAPH_RECON_GRAPH`
(graph input fallback), `GRAPH_RECON_NET_AUDIT=1` (enables `deps_audit`),
`GRAPH_RECON_LIVE_PROBE=1` (enables `network_probe`).

### 1.3 Where outputs land

Given `--layers out/layers --graph out/graph.jsonl --pin out/graph.sha256
--findings-dir out/findings`:

```
out/layers/<name>.jsonl            # one layer file per scanner/lens
out/layers/<name>.ERROR.jsonl      # fail-closed error layer (run exits 1)
out/layers/<name>.meta.json        # freshness stamp (ephemeral layers)
out/layers/analysis-manifest.json  # run metadata (schema-pinned, never pinned itself)
out/graph.jsonl                    # merged stable layers, deduped by node id
out/graph.sha256                   # sha256 pin of out/graph.jsonl
out/graph.dedup-report.json        # duplicate-id conflict report
out/findings/<name>.jsonl          # findings per layer, deduped by fingerprint
out/findings/<name>.review.json    # budget-truncation note
```

---

## 2. How to add a scanner

### 2.1 Minimal example (10 lines)

`scanners/hello.py`:

```python
from .base import BaseScanner, ScanResult
from reconloop.model import Node

class HelloScanner(BaseScanner):
    name = "hello"; dim = "static"
    def run(self, ctx) -> ScanResult:
        r = ScanResult()
        r.nodes.append(Node(id="hello:world", kind="greeting",
                            props={"who": "world"},
                            evidence=["hello.py:1"], src="hello"))
        return r
```

That is the whole contract. The next `run` auto-discovers it, writes
`out/layers/hello.jsonl`, merges it into the graph and re-pins.
Verified end-to-end:

```
$ python3 -m reconloop.cli scan --root . --scanners-dir scanners
[scan] 28 scanners loaded: ..., hello, ...
$ python3 -m reconloop.cli run --root . --scanners-dir scanners --layers out/layers \
    --graph out/graph.jsonl --pin out/graph.sha256 --graph-input <seed>
[run] hello: 1 records
[merge] 26 stable layers (27 total) -> 73 raw / 73 deduped records | sha256 6451fe503fe75dde... | dups 0
```

### 2.2 Full protocol (`scanners/base.py`)

```python
class BaseScanner:
    name: str = "base"            # layer name; must be unique in the registry
    dim: str = "static"           # semantic dimension (static/protected/history/lens/...)
    requires_graph: bool = False  # True = fail-closed without graph input
    layer_stability: str = "stable"  # "stable" feeds the pin; "ephemeral" is freshness-stamped

    def run(self, ctx) -> ScanResult:  # raise NotImplementedError in base
        ...

@dataclass
class ScanResult:
    nodes: list      # Node records
    edges: list      # Edge records
    findings: list   # Finding records
    notes: str       # free-text run note, printed by `run` (truncated 60 chars)
```

`run(ctx)` receives a `ScanContext`:

```python
ctx.root          # resolved repo root (Path)
ctx.revision      # pinned git revision (default "origin/main") — scan THIS, not the worktree
ctx.graph_input   # merged-graph input path (analytics/lenses)
ctx.abs(rel)      # root-relative Path
ctx.is_protected(rel)   # protected-catalog classification
ctx.meta_only(rel)      # stat metadata only (path/size/mtime/perm/sha256-prefix)
ctx.read_text(rel)      # file content — returns None for protected paths (fail-closed)
```

Behavioral rules that bind every scanner:

- **Evidence on every record.** `evidence` is a list of
  `file:line | command | hash` strings — e.g. `["config/feeds.json feed:binance-btc-book"]`,
  `["git grep order call sites"]`, `["git ls-tree -r HEAD"]`. Content-addressed
  graph evidence is `graph:<pin16>` (never an absolute path — see §2.4).
- **Sorted emission.** Emit nodes/edges sorted (by id / by (from,to,kind)),
  or rely on deterministic iteration — the engine does not sort your layer
  for you, and byte-identical output across runs is the contract.
- **Determinism.** No timestamps, PIDs, wall-clock reads or worktree state
  in record ids or props that affect output. Read filesystem state at
  `ctx.revision` (rev-pinning, §2.5), not from the live worktree.
- **No secret VALUES.** Location/type/context/hash only. `props` carries
  metadata, never key material; `ctx.read_text()` refuses protected paths.
- **Findings start unverified.** Every finding is created with
  `verified=False`, `status="open"`; fingerprints are assigned by the engine
  at write time (`sha256({sev, dim, desc[:200]})[:16]`), then findings are
  deduped by fingerprint and sorted by (severity, id).

### 2.3 Graph-input scanners (analytics + lenses)

Scanners with `requires_graph = True` read the **merged graph** through
`reconloop.graphio.load_graph(ctx)`, which returns
`(nodes_by_id, edges_sorted, source_label)`. Input resolution order:
`--graph-input <path>` → `$GRAPH_RECON_GRAPH` →
`<root>/_SYSTEM/graph-ecosystem/full-graph.jsonl`. A missing input is
**fail-closed**: `GraphInputRequiredError` → `layers/<name>.ERROR.jsonl`,
run exits 1, no merge/pin is emitted — never a silent empty layer.
`load_graph` itself never raises: dangling edge endpoints are synthesized
as minimal node records, deterministically, so every edge endpoint is
addressable; the source label is content-addressed:
`graph:<sha256-prefix-of-input> (+N net-new unique)`.

### 2.4 Determinism rules (the pin contract)

- The merged graph covers the **stable** subset only. Ephemeral layers
  (freshness-stamped) are excluded from the pin by construction — put any
  scanner that reads live state (lsof, crontab, clocks) in the ephemeral
  set (`layer_stability = "ephemeral"` or `ephemeral.layers` in config).
- `run` writes `out/graph.sha256` = sha256 of the merged graph.
- `verify --graph ... --pin ...` compares the file against the pin.
- `verify --rerun ...` re-runs the full pipeline and compares the
  regenerated hash against the stored pin (`--layers` is required).
  First run sets the baseline; any drift → exit 1.
- Merged node records are deduped by id with a **keep-last** policy
  (later layer wins, layers ordered by name); the conflict report lands in
  `out/graph.dedup-report.json`. If two scanners emit the same id, the
  lexically later layer's record wins — keep cross-scanner id namespaces
  disjoint, or document the shadowing.
- Cross-machine reproducibility: filesystem layers are rev-pinned at
  `ctx.revision` (git objects, not the worktree) so the same revision yields
  identical layers on any machine. Machine-local stable layers (e.g. a
  launchd scanner) make pins machine-local — mark them ephemeral or accept
  the property.

### 2.5 Rev-pinning

Deterministic scans read the repository at `ctx.revision`:

```
git ls-tree -r --name-only <ctx.revision>     # tracked file inventory
git show <ctx.revision>:<rel>                 # file content at the revision
git rev-list <ctx.revision> --count           # history depth
```

The index (`git ls-files`) is the documented fallback when the revision is
unavailable. Working-tree state must never enter stable layers.

### 2.6 Protected surfaces

The active catalog is `reconproject.json → protected.patterns` (each string
is a regex, matched against slash-normalized relative paths); when absent,
the built-in heritage catalog in `reconloop/protected.py` applies
(default-if-absent). `protected_paths` scanner emits `protected_path:` nodes
(metadata only). For a new project, put your patterns in the config, not in
`protected.py`.

### 2.7 Fail-closed

Any scanner exception → error layer `<name>.ERROR.jsonl` with the error
message (truncated 500 chars) + the run exits 1 and **no merge/pin is
emitted**. A crashed scanner is loud, never a silent empty layer. If any
scanner is not applicable to your repo, return early with a `notes` string,
don't raise.

### 2.8 Findings budget

`review.max_findings_per_layer` caps deduped findings per layer; excess is
truncated and reported in `findings/<layer>.review.json`
(`{budget, total, truncated}`). Raise the budget when a layer legitimately
emits more.

### 2.9 Hash-freeze (template-level gate)

`hashfreeze.json` pins content hashes of every scanner, schema, engine
module, pack file and test fixture, plus the lens config digest and the
frozen input pins. Regenerate after adding or editing scanners/lenses:

```bash
python3 -c "from reconloop.hashfreeze import write_hashfreeze; \
from pathlib import Path; write_hashfreeze(Path('.'), commit='<commit>')"
```

Verify:

```bash
python3 -c "from reconloop.hashfreeze import verify_hashfreeze; \
from pathlib import Path; v = verify_hashfreeze(Path('.')); print(v or 'hashfreeze PASS')"
```

Semantics (verified): `verify_hashfreeze` compares every file recorded in
the freeze against its current hash — any tamper fails with a precise
`<section>/<file>: frozen <sha12>... != current <sha12>...` message. New
scanner files are folded into the pinned set by regenerating (regen is the
**add** path; tampering a frozen file is the **fail** path). Regen also
recomputes the `input_pins` from `FROZEN_PINS`; if your project's frozen
inputs differ, update the module constant first.

---

## 3. How to add a lens

A lens is a scanner subclass (`dim = "lens"`, `requires_graph = True`)
that reads **only the pinned graph input** (plus optionally rev-pinned
registry files via `git_show`) — never live state — and emits violation
cards (findings with `verified: false`). Lenses implement executable
grammar: "orders reaching execution must pass a risk rule", "env files
must have a consumer", "feeds must be fresh".

### 3.1 `BaseLens` pattern (`scanners/_base_lens.py`)

```python
from ._base_lens import BaseLens, LensResult
from reconloop.graphio import load_graph

class MyLens(BaseLens):
    name = "my_lens"
    invariant = "one-sentence grammar rule this lens enforces"
    scope = "which node/edge classes the lens reads"
    admission = "the exact condition that counts as a violation"

    def run(self, ctx) -> LensResult:
        r = LensResult(lens_name=self.name, invariant=self.invariant,
                       scope=self.scope, admission=self.admission)
        nodes, edges, src = load_graph(ctx)
        cards = []
        for ...:   # deterministic, sorted iteration
            cards.append(self.card(r, node_ids=[...], evidence=[...],
                                   sev="high", desc="human-readable violation"))
        return self.finish(r, src=src, cards=cards, extra_props={...})
```

- `self.card(...)` builds the card: id `L-<lens>-<sha8>` (sha8 of the
  canonical `{lens, node, desc}` JSON), `verified=False`, `status="open"`,
  fingerprint set, evidence sorted. For path-shaped witnesses, build a
  path-aware id canon so distinct witnesses never collide (see
  `scanners/security_path.py`).
- `self.finish(...)` appends the lens summary node
  (`id="lens:<name>"`, `kind="lens"`, props `{invariant, scope, admission,
  cards, <extra>}`, evidence `[graph:<pin16>]`) and sorts nodes/edges/
  findings.
- `self.git_show(ctx, rel)` reads a tracked file at `ctx.revision`
  (`git show <revision>:<rel>`) — the same revision the graph's file layer
  came from. Absent files return `None`: set `r.notes` and emit zero cards
  (documented fail-open for missing registry files, never a crash).
- Missing graph input → fail-closed (error layer + exit 1), matching §2.3.

### 3.2 Violation cards

Card record shape (schema pinned at `reconloop/schemas/lens-card.schema.json`
+ `.sha256`):

```json
{"id": "L-<lens>-<sha8>", "sev": "high", "dim": "lens",
 "desc": "[<lens>] ...", "evidence": ["graph:<pin16>", "node:<id>", "edge:<from>-><to> <kind>"],
 "status": "open", "verified": false, "fingerprint": "<16 hex>"}
```

Evidence must be path-independent (`graph:<pin16>`, `node:<id>`,
`edge:<from>-><to> <kind>`). Cards land in `findings/<lens>.jsonl`
(deduped by fingerprint, budget-capped) and the lens summary node lands in
the merged graph.

### 3.3 Config gates and admission overrides

- `lenses.enabled: ["my_lens"]` — allowlist (other lenses print
  `lens disabled by config (lenses.enabled allowlist)` and do not run).
- `lenses.disabled: ["my_lens"]` — exclusion.
- `lenses.admission: {"my_lens": "..."}` — overwrites the class admission
  string (recorded in the summary node; use it to document the threshold
  your deployment runs with).

### 3.4 Negative control + metamorphic test protocol

Every lens ships with fixture tests (pattern: `tests/lens_fixtures.py`,
`tests/lens_v1_fixtures.py`, `tests/lens_fixtures_trading.py` — the last is
a complete worked example). The protocol per lens:

1. **Negative control** — a clean fixture where every class the lens reads
   is present-but-clean: the lens must produce **zero cards**. A passing
   negative control is meaningful only if the fixture exercises all
   classes (absence would mask bugs).
2. **Metamorphic mutations** — N mutations of the fixture, each producing
   **exactly one expected card** (assert count, id regex, severity,
   `verified is False`, description). Mutate only the graph file; keep the
   repo revision fixed.
3. **Record-reorder** — shuffle the graph records with a fixed seed: output
   must be byte-identical (sorted-traversal invariant).
4. **Input-swap** — a different graph must yield a different card set
   (stale-input detection).
5. **Card schema** — id matches `L-[a-z_]+-[0-9a-f]{8}`, `verified:false`,
   `status:"open"`, non-empty path-independent evidence, fingerprint set,
   lens node `props.cards` matches.

Runnable via `python3 tests/lens_fixtures_trading.py` (no pytest needed;
plain functions with a `__main__` runner, matching the engine's test style).

---

## 4. Packs

Core `scanners/` stays project-agnostic; project-specific or
organization-specific scanners ship as optional packs:

```
packs/<name>/
  manifest.json     # {"schema": "reconpack-manifest", "name": ..., "version": ...,
                    #  "scanners": [...], "requires": {"core": "graphrecon >= 1.1"},
                    #  "load": [...]}
  *.py              # scanner/lens modules (see note below)
```

- Load via `--packs <name>` on the CLI or `"packs": ["<name>"]` in
  `reconproject.json` (union of both). Registry auto-discovery loads
  `scanners/` (core) only — packs never load implicitly.
- Pack modules use **absolute imports** (`from scanners.base import ...`)
  because they do not live inside the core `scanners/` package.
- Pack files are hashed into `hashfreeze.json` under `packs` (nested
  per-pack file map) and covered by `verify_hashfreeze`.
- The shipped `packs/yuri/` (organs, registries, memory_schema,
  formula_banks) demonstrates the pattern; `scanners/` carries no-op stubs
  for those names so the core set is exactly the neutral core.

---

## 5. Run, verify, query

All commands run from the template root (`tools/graph-recon/`), or via the
installed console script `graph-recon` (pip install -e .). The module form
is shown here; flags are identical.

### 5.1 List loaded scanners

```bash
python3 -m reconloop.cli scan --root <repo> [--scanners-dir scanners] [--packs yuri]
# [scan] 31 scanners loaded: articulation, base, ..., <yours>
```

### 5.2 Run the loop

```bash
python3 -m reconloop.cli run \
  --root <repo> --scanners-dir scanners \
  --layers out/layers --graph out/graph.jsonl --pin out/graph.sha256 \
  --findings-dir out/findings \
  --graph-input <seed-or-previous-merged-graph> \
  --revision HEAD
```

- Executes every scanner in sorted order → per-scanner layer files →
  findings (deduped, budget-capped) → merges stable layers (dedup by id,
  keep-last) → writes the graph + sha256 pin + dedup report →
  `analysis-manifest.json` (run metadata: input pin, scanner hashes, layer
  stability, root context; schema-pinned, never part of the pin).
- `--revision` defaults to `origin/main`; `HEAD`/`main` are the usual
  choices in a fresh repo.
- Analytics/lenses need `--graph-input` (or `$GRAPH_RECON_GRAPH`, or the
  default `<root>/_SYSTEM/graph-ecosystem/full-graph.jsonl`); without one
  they fail closed and the run exits 1. In a fresh project, pass a seed
  graph; on later iterations, pass the previous merged graph.

### 5.3 Merge layers manually

```bash
python3 -m reconloop.cli merge --layers out/layers --graph out/graph.jsonl --pin out/graph.sha256
```

Merges the stable layer files present in `--layers` (ephemeral/error/
manifest files excluded) into the graph + pin + dedup report.

### 5.4 Verify

```bash
python3 -m reconloop.cli verify --graph out/graph.jsonl --pin out/graph.sha256
# VERIFY PASS | VERIFY FAIL

python3 -m reconloop.cli verify --rerun --root <repo> --scanners-dir scanners \
  --layers out/layers --graph out/graph.jsonl --pin out/graph.sha256 \
  --findings-dir out/findings --graph-input <input> --revision HEAD
# VERIFY --rerun PASS (baseline set)          — first run
# VERIFY --rerun PASS (regen matches stored pin) — determinism re-check
# VERIFY --rerun FAIL (regen <h> != stored <h>)  — drift detected
```

`--rerun` requires `--layers` and re-runs the full pipeline, then compares
the regenerated hash against the stored pin. Two consecutive runs must
produce identical pins.

### 5.5 Ledger

```bash
python3 -m reconloop.cli ledger --findings out/findings/<layer>.jsonl
# {"high": 1}   — severity summary for ONE findings file
```

`--findings` takes a single findings **file** (a directory raises
`IsADirectoryError`). Aggregate across layers with a one-liner:

```bash
python3 -c "import json,glob,collections; c=collections.Counter();
for f in glob.glob('out/findings/*.jsonl'):
    [c.update([json.loads(l)['sev']]) for l in open(f) if l.strip()]
print(dict(sorted(c.items())))"
```

### 5.6 Manifest

```bash
python3 -m reconloop.cli manifest --manifest out/layers/analysis-manifest.json
# [manifest] PASS
```

Validates the run manifest against the schema pinned at
`reconloop/schemas/analysis-manifest.schema.json` (+ sha256, asserted by
tests).

### 5.7 Querying the graph

There is **no `query` subcommand** in v1.1.0 — the merged graph and the
findings are plain JSONL, so query them with stdlib/jq. Worked examples:

```bash
# node-kind census
python3 -c "import json,collections; c=collections.Counter();
[ c.update([json.loads(l)['kind']]) for l in open('out/graph.jsonl') if '\"id\"' in l]
print(dict(sorted(c.items())))"

# all violation cards, severity-ordered
python3 -c "import json,glob; cards=[json.loads(l) for f in glob.glob('out/findings/*.jsonl') for l in open(f)];
order={'critical':0,'high':1,'medium':2,'low':3,'info':4};
[print(c['sev'], c['id'], c['desc'][:80]) for c in sorted(cards, key=lambda c:(order.get(c['sev'],9), c['id']))]"

# one edge kind
grep '\"kind\": \"risk_check\"' out/graph.jsonl

# lens summary nodes
grep '\"kind\": \"lens\"' out/graph.jsonl
```

Analytics also emit query tables as nodes (`query:<name>`, kind
`surface_query` / `cross_layer_link` with aggregated counts) — e.g. the
`cross_layer_links` scanner's `query:writers`, `query:secrets`,
`query:memory_bus` tables.

---

## 6. Rails (binding for every extension)

- Read-only scans. **No secret VALUES** in any output — location/type/
  context/hash only (sha256-prefix is a hash, not a value).
- **No egress** — network is disallowed unless a scanner is explicitly
  network-gated (shipped example: `deps_audit` behind
  `GRAPH_RECON_NET_AUDIT=1`).
- Protected surfaces: metadata-only via `ctx.meta_only()`; `ctx.read_text()`
  returns `None` for protected paths (fail-closed).
- Deterministic outputs: sorted emission, no timestamps/PIDs in ids,
  rev-pinned reads, content-addressed evidence.
- Tracked promotion via PRs only.
