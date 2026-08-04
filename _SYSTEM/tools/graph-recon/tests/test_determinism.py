import sys
from pathlib import Path
import tempfile
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from reconloop.determinism import pin, verify
with tempfile.TemporaryDirectory() as td:
    td = Path(td)
    g = td / "g.jsonl"; g.write_text('{"id":"x:1","kind":"file","props":{},"evidence":[],"src":"t"}\n')
    s1 = pin(g, td / "g.sha256")
    assert verify(g, td / "g.sha256"), "verify after pin"
    g.write_text(g.read_text() + '{"id":"x:2","kind":"file","props":{},"evidence":[],"src":"t"}\n')
    assert not verify(g, td / "g.sha256"), "verify fails on drift"
print("test_determinism OK")
