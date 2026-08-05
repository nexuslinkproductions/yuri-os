import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from reconloop.registry import load_scanners
from reconloop.context import ScanContext
from scanners.base import ScanResult
from reconloop.graphio import GraphInputRequiredError
scanners = load_scanners(Path("scanners"), Path("."))
fixture = str(Path(__file__).resolve().parent / "fixtures" / "analytics_graph.jsonl")
for name, cls in scanners.items():
    if name == "base": continue
    assert hasattr(cls, "name") and hasattr(cls, "dim") and hasattr(cls, "run"), f"{name} protocol"
    assert cls.layer_stability in ("stable", "ephemeral"), f"{name} stability"
    # M1.5 item 3: analytics scanners require graph input (fail-closed) — provide
    # the fixture; base scanners run with the real repo root (fail-open OK).
    ctx = ScanContext("/Users/marcelspatz/YURI-OS-MUSUBI",
                      graph_input=fixture if cls.requires_graph else "")
    try:
        res = cls().run(ctx)
    except GraphInputRequiredError:
        raise AssertionError(f"{name} requires_graph but no input was provided") from None
    assert isinstance(res, ScanResult), f"{name} returns ScanResult"
print(f"test_contract OK ({len(scanners)-1} scanners conform)")
