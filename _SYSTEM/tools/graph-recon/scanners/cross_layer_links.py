"""M1 analytics: cross-layer link query tables (files -> organs -> launchd -> ports -> secrets/protected).

Graph-understanding phase (E-2, owner-approved 2026-08-04). Consumes the merged
graph artifact (reconloop.graphio) and answers "which surfaces touch which":
  - one `cross_layer_link` node per (from_surface, to_surface, edge_kind) triple
    with count > 0: id `xlink:<from>-><to>:<edge_kind>`, props: count, boundary
    histogram, sample of first 3 edge ids,
  - targeted `surface_query` nodes:
      `query:memory_bus`   — nodes touching memory-bus (database:memory.db,
                             file:*memory-bus*.json) via any edge,
      `query:writers`      — writers = nodes with outgoing file_write edges,
                             with their targets,
      `query:secrets`      — surfaces touching env_file / secret_bearing_file /
                             protected_path nodes,
  - findings: edges linking secret/protected surfaces to network surfaces
    (sev high), file_write into protected/env/database targets (sev medium),
    edges touching memory-bus (sev info, ledger already tracks F-*).
Determinism: surfaces fixed order, edges sorted, sorted emission, samples are
first-by-sorted-id. Evidence always non-empty.
"""
from __future__ import annotations
from collections import Counter
from .base import BaseScanner, ScanResult
from reconloop.model import Node, Edge, Finding
from reconloop.graphio import load_graph

SURFACES: dict[str, set] = {
    "files": {"file", "script", "service", "test_suite"},
    "organs": {"governance_organ"},
    "launchd": {"launchd_agent"},
    "ports": {"port", "network_endpoint", "process"},
    "servers": {"mcp_server"},
    "harness": {"harness_config"},
    "memory": {"database"},
    "registry": {"registry_entry"},
    "secrets": {"env_file", "secret_bearing_file"},
    "protected": {"protected_path"},
    "formula": {"formula_bank"},
    "git": {"git_commit", "git_blob"},
}
KIND_TO_SURFACE = {k: s for s, kinds in SURFACES.items() for k in kinds}
SECRET_SURFACES = {"secrets", "protected"}
NETWORK_SURFACES = {"ports"}
MEMORY_BUS_HINTS = ("memory-bus", "memory_bus", "database:memory.db")


class CrossLayerLinksScanner(BaseScanner):
    name = "cross_layer_links"
    dim = "analytics"
    requires_graph = True  # M1.5: fail-closed — merged-graph input required

    def run(self, ctx) -> ScanResult:
        from reconloop.graphio import require_graph  # noqa: E402
        require_graph(ctx)  # M1.5: fail-closed when no graph input
        r = ScanResult()
        nodes, edges, src = load_graph(ctx)

        kind_of = {nid: rec.get("kind", "?") for nid, rec in nodes.items()}
        surface_of = {nid: KIND_TO_SURFACE.get(k, f"other:{k}") for nid, k in kind_of.items()}

        # ---- aggregate (from_surface, to_surface, edge_kind) ----
        agg: dict[tuple, list] = {}
        for e in edges:
            f, t = e.get("from"), e.get("to")
            if f not in surface_of or t not in surface_of:
                continue
            key = (surface_of[f], surface_of[t], e.get("kind", "?"))
            agg.setdefault(key, []).append(e)
        for key in sorted(agg):
            (fs, ts, ek), recs = key, agg[key]
            boundaries = Counter(x.get("boundary", "none") for x in recs)
            samples = sorted(f"{x['from']}->{x['to']}" for x in recs)[:3]
            r.nodes.append(Node(
                id=f"xlink:{fs}->{ts}:{ek}",
                kind="cross_layer_link",
                props={
                    "from_surface": fs, "to_surface": ts, "edge_kind": ek,
                    "count": len(recs),
                    "boundaries": dict(sorted(boundaries.items())),
                    "samples": samples,
                },
                evidence=[f"{src}", f"edges:{len(recs)}"],
                src=self.name,
            ))

        # ---- targeted queries ----
        # M1.5 item 4: bidirectional incident computation (from AND to) for
        # memory_bus + writers queries.
        def incident(nid: str) -> list:
            out = []
            for e in edges:
                if e.get("from") == nid or e.get("to") == nid:
                    out.append(e)
            return out

        def other_end(e: dict, nid: str) -> str:
            return e["to"] if e.get("from") == nid else e["from"]

        # memory-bus: nodes named memory-bus / memory.db
        mb_ids = sorted(nid for nid in nodes
                        if any(h in nid for h in MEMORY_BUS_HINTS))
        mb_touchers = sorted({other_end(e, nid) for nid in mb_ids
                              for e in incident(nid)} - set(mb_ids))
        r.nodes.append(Node(
            id="query:memory_bus",
            kind="surface_query",
            props={"touching_nodes": mb_touchers, "memory_bus_nodes": mb_ids},
            evidence=[f"{src}", f"touchers:{len(mb_touchers)}"],
            src=self.name,
        ))

        # writers: bidirectional — nodes incident to file_write edges on
        # either side (writers = from, write_targets = to, incident = both)
        fw = [e for e in edges if e.get("kind") == "file_write"]
        writers = sorted({e["from"] for e in fw})
        targets = sorted({e["to"] for e in fw})
        incident_nodes = sorted({n for e in fw for n in (e["from"], e["to"])})
        r.nodes.append(Node(
            id="query:writers",
            kind="surface_query",
            props={"writers": writers, "write_targets": targets,
                   "incident_nodes": incident_nodes, "count": len(writers)},
            evidence=[f"{src}", f"writers:{len(writers)}", f"edges:{len(fw)}"],
            src=self.name,
        ))

        # secrets: edges incident to secret/protected surface nodes
        secret_ids = {nid for nid, s in surface_of.items() if s in SECRET_SURFACES}
        touch_edges = [e for e in edges
                       if (e.get("from") in secret_ids or e.get("to") in secret_ids)]
        touch_by_surface: Counter = Counter()
        for e in touch_edges:
            touch_by_surface[surface_of.get(e.get("from"), "?")] += 1
            touch_by_surface[surface_of.get(e.get("to"), "?")] += 1
        r.nodes.append(Node(
            id="query:secrets",
            kind="surface_query",
            props={
                "secret_surface_nodes": len(secret_ids),
                "incident_edges": len(touch_edges),
                "touching_surfaces": dict(sorted(touch_by_surface.items())),
            },
            evidence=[f"{src}", f"incident:{len(touch_edges)}"],
            src=self.name,
        ))

        # ---- findings ----
        for e in sorted(edges, key=lambda x: (x.get("from", ""), x.get("to", ""), x.get("kind", ""))):
            f, t = e.get("from"), e.get("to")
            fs, ts = surface_of.get(f, "?"), surface_of.get(t, "?")
            fid = f"XL:{f}->{t}:{e.get('kind')}"
            if fs in SECRET_SURFACES and ts in NETWORK_SURFACES or \
               ts in SECRET_SURFACES and fs in NETWORK_SURFACES:
                r.findings.append(Finding(
                    id=fid, sev="high", dim="analytics",
                    desc=f"edge links secret/protected surface to network surface: {f} -> {t} ({e.get('kind')})",
                    evidence=[f"{src}", f"edge:{f}->{t}"],
                ))
            elif e.get("kind") == "file_write" and \
                 (KIND_TO_SURFACE.get(kind_of.get(t, "")) in SECRET_SURFACES or kind_of.get(t) == "database"):
                r.findings.append(Finding(
                    id=fid, sev="medium", dim="analytics",
                    desc=f"file_write into protected/secret/database target: {f} -> {t}",
                    evidence=[f"{src}", f"edge:{f}->{t}"],
                ))
            elif f in mb_ids or t in mb_ids:
                r.findings.append(Finding(
                    id=fid, sev="info", dim="analytics",
                    desc=f"edge touches memory-bus: {f} -> {t} ({e.get('kind')})",
                    evidence=[f"{src}", f"edge:{f}->{t}"],
                ))

        r.nodes.sort(key=lambda n: n.id)
        r.edges.sort(key=lambda e: (e.from_, e.to, e.kind))
        r.findings.sort(key=lambda f: f.id)
        return r
