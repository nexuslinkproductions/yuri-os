import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from reconloop.registry import load_scanners
from reconloop.context import ScanContext
from scanners.base import ScanResult
scanners = load_scanners(Path("scanners"), Path("."))
for name, cls in scanners.items():
    if name == "base": continue
    assert hasattr(cls, "name") and hasattr(cls, "dim") and hasattr(cls, "run"), f"{name} protocol"
    res = cls().run(ScanContext("/Users/marcelspatz/YURI-OS-MUSUBI"))
    assert isinstance(res, ScanResult), f"{name} returns ScanResult"
print(f"test_contract OK ({len(scanners)-1} scanners conform)")
