"""P2 port: literal + dynamic write targets (E8 logic)."""
from __future__ import annotations
import re
from .base import BaseScanner, ScanResult
from reconloop.model import Node, Edge

CALL = re.compile(r"(?:writeFileSync|appendFileSync|createWriteStream|writeFile)\s*\(")
LIT = re.compile(r"(?:writeFileSync|appendFileSync|createWriteStream|writeFile)\(\s*(['\"])([^'\"]+?)\1")
EXTS = (".jsonl", ".json", ".log", ".md", ".db", ".txt", ".lock", ".csv", ".out")

class WritersScanner(BaseScanner):
    name = "writers"; dim = "static"
    def run(self, ctx) -> ScanResult:
        r = ScanResult()
        for w in sorted((ctx.root / "_SYSTEM").rglob("*.mjs")):
            if ".test." in w.name or "node_modules" in str(w): continue
            try: src = w.read_text(encoding="utf-8", errors="ignore")
            except Exception: continue
            n_calls = len(CALL.findall(src))
            if n_calls == 0: continue
            n_lit = 0
            for m in LIT.finditer(src):
                t = m.group(2)
                if t.endswith(EXTS) and not t.startswith(("http", "node:")):
                    n_lit += 1
                    r.edges.append(Edge(from_=f"file:{w.relative_to(ctx.root)}", to=f"file:{t}",
                                        kind="file_write", props={}, evidence=[f"{w} L{src[:m.start()].count(chr(10))+1}"], boundary="none"))
            if n_lit < n_calls:
                r.nodes.append(Node(id=f"file:{w.relative_to(ctx.root)}", kind="file",
                                    props={"write_calls": n_calls, "literal_targets": n_lit, "dynamic_targets": n_calls - n_lit,
                                           "note": "dynamic write targets"}, evidence=["E8 depth"], src="writers"))
        return r
