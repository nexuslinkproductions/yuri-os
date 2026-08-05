# graph-recon as a CI PR gate (`docs/ci.md`)

The template ships a GitHub Actions workflow that makes the graph a PR gate:
every pull request (and every push to `main`) rebuilds the graph from the
exact revision under review, proves the rebuild is deterministic, and fails
the build when the lens cards violate the project's severity budget.

## 1. What the gate does

`.github/workflows/graph-recon.yml` (in the template's `.github/`) runs four
phases on the **PR head sha** (the checkout is pinned to the same sha, so
rev-pinned reads see exactly the state under review):

1. **Run** — `graph-recon run --revision <head>`: every scanner and lens
   executes against the revision → per-layer files in `out/layers/` →
   findings in `findings/` → stable layers merged into `out/graph.jsonl` +
   sha256 pin `out/graph.sha256` + `out/graph.dedup-report.json` +
   `out/layers/analysis-manifest.json`.
2. **Verify regen determinism** — `graph-recon verify --rerun` re-runs the
   full pipeline with the same arguments and fails unless the regenerated
   graph hashes to the stored pin. Any scanner whose output drifts between
   two runs on the same revision fails the gate.
3. **Lens-card severity gate** — enumerates every violation card (findings
   with `dim: "lens"`, i.e. the `L-<lens>-<sha8>` cards) and fails the build
   when any card is at or above the configured severity. The full card list
   is printed to the log with severity and id.
4. **Artifacts** — `out/` + `findings/` are uploaded on every run
   (`if: always()`), so a failing gate still ships the layers, graph, pin
   and cards for inspection.

A scanner crash is fail-closed: an error layer `out/layers/<name>.ERROR.jsonl`
is written and the run exits nonzero — never a silent empty layer.

## 2. Enable

1. **Vendor the template** into your repo (`graph-recon init <dir>` or copy
   `reconloop/`, `scanners/`, `reconproject.json`, `pyproject.toml`), e.g. at
   `tools/graph-recon/` (the SDK anatomy in `docs/SDK.md`).
2. **Copy the workflow**: `cp <template>/.github/workflows/graph-recon.yml
   <your-repo>/.github/workflows/graph-recon.yml`.
3. Set repo variables (Settings → Secrets and variables → Actions →
   Variables) as needed — see the table below. The defaults work for the
   template repo itself and for projects vendoring at `tools/graph-recon/`.
4. Push the workflow to `main`. The next pull request runs the gate.

| repo variable | default | meaning |
|---|---|---|
| `GRAPH_RECON_TEMPLATE_DIR` | `tools/graph-recon` | where the vendored template lives. Set to `.` (or leave unset) when the repo **is** the template (checkout root has `reconloop/` + `pyproject.toml` — auto-detected). |
| `GRAPH_RECON_GRAPH_INPUT` | unset | explicit graph input for the run (see §3). |
| `GRAPH_RECON_CI_MAX_SEVERITY` | `high` | lens gate threshold, §4. |

## 3. The graph input (first-run contract)

Lenses and analytics scanners require a merged-graph input and **fail closed**
without one (M1.5 design): a missing input is a loud per-scanner error layer,
the run exits 1, and the gate fails with a clear message — never a silent
empty graph. The workflow resolves the input in this order:

1. `GRAPH_RECON_GRAPH_INPUT` repo variable (a committed seed or previous
   graph, e.g. `seed/graph.jsonl`);
2. the **base branch's committed graph** — `git show origin/<base>:out/graph.jsonl`
   (rev-pinned, so the input is byte-identical on every machine; this is the
   "pass the previous merged graph" iteration pattern from `docs/SDK.md` §5.2);
3. the engine default chain (`--graph-input`, then `$GRAPH_RECON_GRAPH`, then
   `<root>/_SYSTEM/graph-ecosystem/full-graph.jsonl`).

To use option 2, commit the merged graph on `main` — `out/` is gitignored by
the scaffold, so add it explicitly
(`git add -f out/graph.jsonl out/graph.sha256`) and refresh it as part of the
graph-maintenance flow (or set `GRAPH_RECON_GRAPH_INPUT` instead).

## 4. Tuning the lens gate

Severity order: `critical > high > medium > low > info`. The gate fails the
build when **any** lens card is at or above `GRAPH_RECON_CI_MAX_SEVERITY`
(default `high`, so any `high` or `critical` card fails).

- **Allow high cards** (triage them out of band): set
  `GRAPH_RECON_CI_MAX_SEVERITY: critical`.
- **Be stricter** (fail on medium+): set `GRAPH_RECON_CI_MAX_SEVERITY: medium`.
- Per-lens admission thresholds (`lenses.admission` in `reconproject.json`)
  and the `lenses.enabled`/`lenses.disabled` gates apply **before** the CI
  threshold: a disabled lens emits no cards.

The gate reads only `dim: "lens"` findings (violation cards). Non-lens
findings (e.g. scanner notes) are reported in `findings/` but do not fail the
build — they are subject to the `review.max_findings_per_layer` budget.

## 5. Why the gate is deterministic (the pin contract)

Same revision → same graph → same cards. Every link in the chain is
content- or revision-addressed:

- the **checkout and the scan revision are the same sha** (`REVISION`),
  and scanners read the repo at `ctx.revision` (`git ls-tree` / `git show`,
  never the working tree);
- the **graph input** is the base branch's committed graph, fetched with
  `git show` — byte-identical on every machine for the same base tip;
- **ephemeral layers** (freshness-stamped, e.g. `live_ports`) are excluded
  from the pin by construction; only the stable subset feeds `graph.sha256`;
- findings/cards carry **path-independent evidence**
  (`graph:<pin16>`, `node:<id>`, `edge:<from>-><to> <kind>`) and card ids are
  content-derived (`L-<lens>-<sha8>`), so the same graph yields the same
  cards;
- `verify --rerun` re-runs the pipeline in the same job and fails on any
  drift — a nondeterministic scanner breaks the gate, it does not slip
  through.

## 6. Reading the results

- **`out/graph.jsonl`** — merged stable layers, deduped by id (keep-last);
  `out/graph.dedup-report.json` lists duplicate-id conflicts.
- **`out/graph.sha256`** — the pin; `out/layers/analysis-manifest.json` —
  run metadata (never part of the pin).
- **`findings/<lens>.jsonl`** — the cards per lens (deduped by fingerprint,
  budget-capped; `findings/<layer>.review.json` records truncation).
- **`out/layers/<name>.ERROR.jsonl`** — fail-closed scanner errors, with the
  error message and the failing scanner's name.

## 7. Troubleshooting

- **`verify --rerun FAIL (regen … != stored …)`** — a stable-layer scanner is
  nondeterministic on this revision (live state, timestamps, absolute paths
  in record content). Find the drifting layer by re-running locally; mark it
  `ephemeral` (`layer_stability = "ephemeral"` or `ephemeral.layers` in
  `reconproject.json`) or remove the nondeterminism.
- **Run exits 1 with `GraphInputRequiredError`** — no graph input resolved;
  set `GRAPH_RECON_GRAPH_INPUT` or commit the base graph (see §3).
- **`[registry] skip <name>: …`** — a scanner module failed to import; the
  message names the module. (The template's scanner loader puts the on-disk
  `scanners/` dir on `sys.path`, so the installed `graph-recon` console
  script loads scanners from the repo, not from site-packages.)
- **`lens gate FAIL` with cards** — the expected outcome when the revision
  violates the admission thresholds; inspect the printed card list, fix or
  triage, or raise the threshold (§4).
- **No cards at all** — either every lens passed its negative control
  (good), or no lens ran: check `lenses.enabled`/`lenses.disabled` in
  `reconproject.json` and the `[run]` log lines.
