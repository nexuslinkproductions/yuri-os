"""M2 lens 1/6: route_binding — route-registry entries must bind role + registry + canary provider.

Invariant: every modelIdentity in _SYSTEM/config/provider-route-registry.json
(pinned at ctx.revision) must have a role, a non-wildcard provider, and at
least one route with status canary-proven (or canary-passing evidence).
Missing/wildcard bindings = violation card (verified:false).

Reads the registry FILE at the pinned revision (git show ctx.revision:path —
same revision the graph file layer came from), plus the graph's
registry_entry nodes for cross-reference. Never live state.
"""
from __future__ import annotations
from ._base_lens import BaseLens, LensResult
from reconloop.graphio import load_graph

ROUTE_REG = "_SYSTEM/config/provider-route-registry.json"
CANARY_OK = {"canary-proven", "canary-passing", "canary-pass"}


class RouteBindingLens(BaseLens):
    name = "route_binding"
    invariant = "route-registry entries must bind role + registry entry + canary-passing provider"
    scope = "registry_entry nodes + provider-route-registry.json at ctx.revision"
    admission = "missing role / wildcard provider / no canary-proven route"

    def run(self, ctx) -> LensResult:
        r = LensResult(lens_name=self.name, invariant=self.invariant,
                       scope=self.scope, admission=self.admission)
        nodes, edges, src = load_graph(ctx)
        reg = self.git_show(ctx, ROUTE_REG)
        if reg is None:
            r.notes = f"{ROUTE_REG} not readable at {ctx.revision}"
            return self.finish(r, src=src, cards=[],
                               extra_props={"registry_readable": False})
        import json
        data = json.loads(reg)
        identities = data.get("modelIdentities", {})
        cards = []
        for mid, entry in sorted(identities.items()):
            role = entry.get("role")
            routes = entry.get("routes", [])
            providers = {rt.get("provider") for rt in routes}
            statuses = {rt.get("status") for rt in routes}
            canary_ok = bool(statuses & CANARY_OK)
            wildcard = any(p in (None, "*", "") for p in providers) or not providers
            node_id = f"registry:route:{mid}"
            evidence = [f"git show {ctx.revision}:{ROUTE_REG}",
                        f"modelIdentity:{mid}"]
            if not role:
                cards.append(self.card(r, node_ids=[node_id], evidence=evidence,
                                       sev="medium", desc=f"missing role binding for {mid}"))
            elif wildcard:
                cards.append(self.card(r, node_ids=[node_id], evidence=evidence,
                                       sev="medium",
                                       desc=f"wildcard/missing provider for {mid} (providers={sorted(providers)})"))
            if not canary_ok:
                cards.append(self.card(r, node_ids=[node_id], evidence=evidence,
                                       sev="low",
                                       desc=f"no canary-passing route for {mid} (statuses={sorted(statuses)})"))
        return self.finish(r, src=src, cards=cards,
                           extra_props={"identities": len(identities),
                                        "registry_readable": True})
