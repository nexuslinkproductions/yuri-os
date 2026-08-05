"""M2 lens 3/6: hook_projection — registered hook commands must resolve to files.

Invariant: every coreEntrypoint in _SYSTEM/config/yuri-hook-registry.json
(pinned at ctx.revision) must resolve to a file node in the graph's file
layer (relative path normalization). Stale/missing needles = violation cards
(verified:false). Never live state.
"""
from __future__ import annotations
from ._base_lens import BaseLens, LensResult
from reconloop.graphio import load_graph

HOOK_REG = "_SYSTEM/config/yuri-hook-registry.json"


class HookProjectionLens(BaseLens):
    name = "hook_projection"
    invariant = "registered hook commands resolve to existing files"
    scope = "hook registry coreEntrypoint vs graph file layer"
    admission = "coreEntrypoint absent from file layer"

    def run(self, ctx) -> LensResult:
        r = LensResult(lens_name=self.name, invariant=self.invariant,
                       scope=self.scope, admission=self.admission)
        nodes, edges, src = load_graph(ctx)
        reg = self.git_show(ctx, HOOK_REG)
        if reg is None:
            r.notes = f"{HOOK_REG} not readable at {ctx.revision}"
            return self.finish(r, src=src, cards=[],
                               extra_props={"registry_readable": False})
        import json
        data = json.loads(reg)
        hooks = data.get("hooks", [])
        cards = []
        resolved = 0
        for h in sorted(hooks, key=lambda x: x.get("hookId", "")):
            hid = h.get("hookId", "?")
            ep = h.get("coreEntrypoint") or h.get("command")
            if not ep:
                cards.append(self.card(r, node_ids=[f"hook:{hid}"], evidence=[f"git show {ctx.revision}:{HOOK_REG}", f"hookId:{hid}"],
                                       sev="medium", desc=f"hook {hid} has no coreEntrypoint/command"))
                continue
            # normalize: strip ./ prefix, resolve relative file node.
            # M1 synthesis must not resurrect missing targets: a synthetic node
            # is an edge artifact, not file-layer evidence.
            rel = ep.removeprefix("./")
            if f"file:{rel}" in nodes and nodes[f"file:{rel}"].get("src") != "graphio-synthetic":
                resolved += 1
                continue
            cards.append(self.card(r, node_ids=[f"hook:{hid}", f"file:{rel}"],
                                   evidence=[f"git show {ctx.revision}:{HOOK_REG}", f"hookId:{hid}", f"entrypoint:{ep}"],
                                   sev="high",
                                   desc=f"hook {hid} entrypoint not in file layer: {ep}"))
        return self.finish(r, src=src, cards=cards,
                           extra_props={"hooks": len(hooks), "resolved": resolved,
                                        "registry_readable": True})
