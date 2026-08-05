"""M1.5 item 6: analysis-manifest schema is rev-pinned (schema file + sha256 pin)."""
import hashlib
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

SCHEMA = ROOT / "reconloop" / "schemas" / "analysis-manifest.schema.json"
PIN = ROOT / "reconloop" / "schemas" / "analysis-manifest.schema.sha256"


def sha256_file(p: Path) -> str:
    return hashlib.sha256(p.read_bytes()).hexdigest()


assert SCHEMA.exists() and PIN.exists()
assert sha256_file(SCHEMA) == PIN.read_text().strip(), "schema drifted from rev-pin"
print("test_schema_pin OK")
