import sys; sys.path.insert(0, "/tmp/yuri-recon/template")
from reconloop.model import Node, Edge, Finding
from reconloop.ledger import dedup, fingerprint
n = Node(id="test:1", kind="file")
assert n.to_jsonl().startswith('{"evidence"')
e = Edge(from_="a", to="b", kind="c")
assert '"from": "a"' in e.to_jsonl()
f1 = Finding(id="F-x", sev="high", dim="t", desc="same"); f1.fingerprint = fingerprint(f1)
f2 = Finding(id="F-y", sev="high", dim="t", desc="same"); f2.fingerprint = fingerprint(f2)
assert len(dedup([f1, f2])) == 1
print("test_model OK")
