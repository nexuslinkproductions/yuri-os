import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from reconloop.registry import load_scanners
from reconloop.context import ScanContext
from scanners.base import ScanResult
from reconloop.graphio import GraphInputRequiredError


def _assert_conform(name, cls, fixture):
    assert hasattr(cls, "name") and hasattr(cls, "dim") and hasattr(cls, "run"), f"{name} protocol"
    assert cls.layer_stability in ("stable", "ephemeral"), f"{name} stability"
    # M1.5 item 3: analytics scanners require graph input (fail-closed) — provide
    # the fixture; base scanners run with the template root (fail-open OK).
    ctx = ScanContext(str(Path(__file__).resolve().parent.parent),
                      graph_input=fixture if cls.requires_graph else "")
    try:
        res = cls().run(ctx)
    except GraphInputRequiredError:
        raise AssertionError(f"{name} requires_graph but no input was provided") from None
    assert isinstance(res, ScanResult), f"{name} returns ScanResult"


scanners = load_scanners(Path("scanners"), Path("."))
fixture = str(Path(__file__).resolve().parent / "fixtures" / "analytics_graph.jsonl")
for name, cls in scanners.items():
    if name == "base": continue
    _assert_conform(name, cls, fixture)
print(f"test_contract OK ({len(scanners)-1} scanners conform)")

# M4-W1: optional packs must also conform when loaded explicitly.
packed = load_scanners(Path("scanners"), Path("."), packs=["yuri"])
for name in ("organs", "registries", "memory_schema", "formula_banks"):
    assert name in packed, f"pack scanner {name} missing from pack load"
    _assert_conform(name, packed[name], fixture)
print(f"test_contract pack OK ({len(packed)-len(scanners)} pack scanners conform)")

# M4-W1-FIX (DEFECT 1 regression): load_scanners must accept a str
# template_root — _config_packs normalizes it (a str used to crash with
# TypeError: unsupported operand type(s) for /: 'str' and 'str' at
# reconloop/registry.py, template_root / "reconproject.json"). The str
# points at the same template root, so the same core set must load and no
# pack scanner may appear without an explicit packs= argument.
core_from_str = load_scanners(Path("scanners"), template_root=str(Path(".").resolve()))
assert len(core_from_str) == len(scanners), \
    "str template_root must load exactly the same core set"
for name in ("organs", "registries", "memory_schema", "formula_banks"):
    assert name not in core_from_str, f"core run (str template_root) must not load pack scanner {name}"
print(f"test_contract str-template_root OK ({len(core_from_str)} scanners, no packs)")
