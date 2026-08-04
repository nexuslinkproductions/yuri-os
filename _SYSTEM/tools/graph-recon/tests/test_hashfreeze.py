"""M2 item 1: hashfreeze — fixture + tamper test (tamper any entry => verify fails)."""
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

from reconloop.hashfreeze import (  # noqa: E402
    build_hashfreeze, verify_hashfreeze, write_hashfreeze, FROZEN_PINS)


def test_hashfreeze_write_verify_roundtrip() -> None:
    import tempfile
    from reconloop.hashfreeze import build_hashfreeze
    # build against a temp copy? simpler: build against real ROOT, verify matches
    freeze = build_hashfreeze(template_root=ROOT, commit="test")
    assert freeze["input_pins"]["v3_deduped"] == FROZEN_PINS["v3_deduped"]
    assert freeze["input_pins"]["canonical_deduped"] == FROZEN_PINS["canonical_deduped"]
    assert "route_binding.py" in freeze["scanners"]
    assert "analysis-manifest.schema.json" in freeze["schemas"]
    assert "lens-card.schema.json" in freeze["schemas"]
    v = verify_hashfreeze(ROOT, freeze)
    assert v == [], v


def test_hashfreeze_tamper_detected() -> None:
    freeze = build_hashfreeze(template_root=ROOT, commit="test")
    for sec in ("scanners", "schemas", "engine"):
        name = next(iter(freeze[sec]))
        bad = dict(freeze)
        bad[sec] = dict(freeze[sec])
        bad[sec][name] = "0" * 64  # tamper one hash
        v = verify_hashfreeze(ROOT, bad)
        assert any(name in x for x in v), (name, v)
    # tamper lens config
    bad = dict(freeze)
    bad["lens_config_sha256"] = "0" * 64
    assert any("lens_config" in x for x in verify_hashfreeze(ROOT, bad))
    # tamper an input pin
    bad = dict(freeze)
    bad["input_pins"] = {"v3_deduped": "0" * 64, "canonical_deduped": FROZEN_PINS["canonical_deduped"]}
    assert any("input_pin" in x for x in verify_hashfreeze(ROOT, bad))
    # tamper a fixture
    bad = dict(freeze)
    bad["fixtures"] = dict(freeze["fixtures"])
    fname = next(iter(bad["fixtures"]))
    bad["fixtures"][fname] = "0" * 64
    assert any(fname in x for x in verify_hashfreeze(ROOT, bad))
    print("tamper detection OK")


def test_lens_schema_pin() -> None:
    import hashlib
    schema = ROOT / "reconloop" / "schemas" / "lens-card.schema.json"
    pin = ROOT / "reconloop" / "schemas" / "lens-card.schema.sha256"
    assert schema.exists() and pin.exists()
    assert hashlib.sha256(schema.read_bytes()).hexdigest() == pin.read_text().strip()
    print("lens schema pin OK")


if __name__ == "__main__":
    for fn in (test_hashfreeze_write_verify_roundtrip, test_hashfreeze_tamper_detected,
               test_lens_schema_pin):
        fn()
        print(f"OK {fn.__name__}")
    print("test_hashfreeze OK (all)")
