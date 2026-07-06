#!/usr/bin/env python3
# test_jarvis_energy.py — GREEN happy-path + RED degrade/cold-start + edge cases
# for jarvis_energy (T1: ΔU surprise → write_strength).
#
# Runs the LIVE trace if present (happy path) and synthesizes fixtures for the
# degrade/cold-start/edge paths. No network, no node-per-call, no writes to the
# real trace. All self-verification.
#
# Run: python3 _SYSTEM/Scripts/voice/test_jarvis_energy.py

import json
import math
import os
import sys
import tempfile

# Import the module under test (same dir).
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import jarvis_energy


def _ok(name):
    print(f"  PASS: {name}")


def _fail(name, detail=""):
    print(f"  FAIL: {name} {detail}")
    return False


def _write_fixture(records):
    """Write a list of dicts as JSONL to a temp file; return the path."""
    fd, path = tempfile.mkstemp(suffix=".jsonl", prefix="jarvis-energy-test-")
    with os.fdopen(fd, "w") as f:
        for rec in records:
            f.write(json.dumps(rec) + "\n")
    return path


def test_import_and_exports():
    """Module imports and exposes the contract functions with correct signatures."""
    assert callable(jarvis_energy.surprise_score), "surprise_score not callable"
    assert callable(jarvis_energy.write_strength), "write_strength not callable"
    assert callable(jarvis_energy.is_enabled), "is_enabled not callable"
    assert callable(jarvis_energy.trace_path), "trace_path not callable"
    # Default signature: surprise_score(window=20)
    s = jarvis_energy.surprise_score()
    assert isinstance(s, float), f"surprise_score() not float: {type(s)}"
    # Default signature: write_strength(base_weight, precision=1.0)
    w = jarvis_energy.write_strength(1.0)
    assert isinstance(w, float), f"write_strength() not float: {type(w)}"
    _ok("module imports + contract signatures")


def test_stdlib_only():
    """Module must be Python stdlib only (no third-party imports)."""
    # import ast is stdlib; subprocess/json/math/os are stdlib. Verify by checking the
    # module's loaded submodules are all from the stdlib (heuristic: no site-packages).
    # Simpler: re-parse the source and assert no 'import numpy/pandas/requests' etc.
    src_path = os.path.join(os.path.dirname(__file__), "jarvis_energy.py")
    with open(src_path) as f:
        src = f.read()
    forbidden = ["numpy", "pandas", "requests", "scipy", "torch", "tensorflow", "sklearn"]
    hits = [mod for mod in forbidden if f"import {mod}" in src or f"from {mod}" in src]
    assert not hits, f"forbidden third-party imports: {hits}"
    _ok("stdlib-only (no third-party imports)")


def test_disabled_degrades_to_zero():
    """JARVIS_ENERGY=0 → surprise_score() == 0.0 and write_strength == base*precision (clamped)."""
    orig = os.environ.get("JARVIS_ENERGY")
    os.environ["JARVIS_ENERGY"] = "0"
    try:
        # Reload to pick up the flag. importlib keeps module-level state; reimport via a fresh
        # exec is overkill — instead, the module gates on the cached _ENABLED. Set it directly
        # to simulate the disabled path deterministically (the flag's effect at import time).
        jarvis_energy._ENABLED = False
        s = jarvis_energy.surprise_score(20)
        assert s == 0.0, f"disabled surprise_score != 0: {s}"
        # write_strength with surprise=0 → base * 1 * precision, clamped [0.1, 5]
        w = jarvis_energy.write_strength(2.0, 1.0)
        assert w == 2.0, f"disabled write_strength(2.0) != 2.0: {w}"
        _ok("JARVIS_ENERGY=0 degrades surprise→0, write_strength→base*precision")
    finally:
        jarvis_energy._ENABLED = True
        if orig is None:
            os.environ.pop("JARVIS_ENERGY", None)
        else:
            os.environ["JARVIS_ENERGY"] = orig


def test_trace_absent_degrades():
    """Trace path unresolvable → surprise_score() == 0.0 (cold-start degrade)."""
    # Force the cached path to None (simulates node absent / trace unresolvable).
    orig_resolved = jarvis_energy._TRACE_PATH_RESOLVED
    orig_path = jarvis_energy._TRACE_PATH
    jarvis_energy._TRACE_PATH_RESOLVED = True
    jarvis_energy._TRACE_PATH = None
    try:
        s = jarvis_energy.surprise_score(20)
        assert s == 0.0, f"absent-trace surprise != 0: {s}"
        w = jarvis_energy.write_strength(1.5)
        assert w == 1.5, f"absent-trace write_strength(1.5) != 1.5: {w}"
        _ok("trace absent → degrade to surprise=0 (cold-start)")
    finally:
        jarvis_energy._TRACE_PATH_RESOLVED = orig_resolved
        jarvis_energy._TRACE_PATH = orig_path


def test_empty_trace_degrades():
    """Empty trace file → surprise_score() == 0.0."""
    empty = _write_fixture([])  # mkstemp creates an empty file; _write_fixture with [] leaves it empty
    os.unlink(empty)  # actually empty it
    open(empty, "w").close() if False else None
    # Recreate cleanly:
    fd, empty = tempfile.mkstemp(suffix=".jsonl")
    os.fdopen(fd, "w").close()  # empty file
    orig_resolved = jarvis_energy._TRACE_PATH_RESOLVED
    orig_path = jarvis_energy._TRACE_PATH
    jarvis_energy._TRACE_PATH_RESOLVED = True
    jarvis_energy._TRACE_PATH = empty
    try:
        s = jarvis_energy.surprise_score(20)
        assert s == 0.0, f"empty-trace surprise != 0: {s}"
        _ok("empty trace file → surprise=0")
    finally:
        jarvis_energy._TRACE_PATH_RESOLVED = orig_resolved
        jarvis_energy._TRACE_PATH = orig_path
        os.unlink(empty)


def test_happy_path_fixture():
    """Synthetic trace with known deltaU values → surprise_score ≈ weighted mean |deltaU|."""
    # Use recent timestamps so decay ≈ 1.0 (predictable). 4 verdicts, |deltaU| = [0.1, 0.2, 0.3, 0.4].
    from datetime import datetime, timezone
    now = datetime.now(timezone.utc)
    recent_iso = now.isoformat()
    recs = [
        {"ts": recent_iso, "deltaU": -0.1, "decision": True, "stateBefore": {}, "stateAfter": {}},
        {"ts": recent_iso, "deltaU": 0.2, "decision": True, "stateBefore": {}, "stateAfter": {}},
        {"ts": recent_iso, "deltaU": -0.3, "decision": False, "stateBefore": {}, "stateAfter": {}},
        {"ts": recent_iso, "deltaU": 0.4, "decision": True, "stateBefore": {}, "stateAfter": {}},
    ]
    fixture = _write_fixture(recs)
    orig_resolved = jarvis_energy._TRACE_PATH_RESOLVED
    orig_path = jarvis_energy._TRACE_PATH
    jarvis_energy._TRACE_PATH_RESOLVED = True
    jarvis_energy._TRACE_PATH = fixture
    try:
        s = jarvis_energy.surprise_score(20)
        # mean |deltaU| = (0.1+0.2+0.3+0.4)/4 = 0.25 (decay≈1 since ts is now)
        assert abs(s - 0.25) < 0.02, f"surprise {s} != ~0.25"
        # window=2 → last 2 records: |deltaU|=[0.3, 0.4] → mean 0.35
        s2 = jarvis_energy.surprise_score(2)
        assert abs(s2 - 0.35) < 0.02, f"surprise(window=2) {s2} != ~0.35"
        _ok(f"happy-path fixture: surprise(20)={s:.4f} (~0.25), surprise(2)={s2:.4f} (~0.35)")
    finally:
        jarvis_energy._TRACE_PATH_RESOLVED = orig_resolved
        jarvis_energy._TRACE_PATH = orig_path
        os.unlink(fixture)


def test_write_strength_formula_and_clamp():
    """write_strength = clamp(base·precision + BOOST·surprise/(1+surprise), 0.1, 5). ADDITIVE bounded —
    weight stays primary; surprise only nudges up to +BOOST. (Supersedes the naive base*(1+surprise)
    multiplier, which saturates the band at live surprise≈9.)"""
    from datetime import datetime, timezone
    now = datetime.now(timezone.utc).isoformat()
    # |deltaU|=1.0 → surprise=1.0 → bounded=0.5 → write_strength(1.0) = 1.0·1.0 + 1.0·0.5 = 1.5
    recs = [{"ts": now, "deltaU": 1.0, "decision": True, "stateBefore": {}, "stateAfter": {}}]
    fixture = _write_fixture(recs)
    orig_resolved = jarvis_energy._TRACE_PATH_RESOLVED
    orig_path = jarvis_energy._TRACE_PATH
    jarvis_energy._TRACE_PATH_RESOLVED = True
    jarvis_energy._TRACE_PATH = fixture
    try:
        w = jarvis_energy.write_strength(1.0)
        assert abs(w - 1.5) < 0.02, f"write_strength(1.0) with surprise=1.0 != 1.5: {w}"
        # precision multiplier on base: 1.0·1.5 + 1.0·0.5 = 2.0
        w2 = jarvis_energy.write_strength(1.0, precision=1.5)
        assert abs(w2 - 2.0) < 0.02, f"write_strength(1.0,1.5) != 2.0: {w2}"
        # weight stays PRIMARY under surprise: base=4, surprise=1 → 4.0 + 0.5 = 4.5 (NOT saturated to 5.0)
        wp = jarvis_energy.write_strength(4.0)
        assert abs(wp - 4.5) < 0.02, f"write_strength(4.0) should be 4.5 (weight-primary), got {wp}"
        # clamp HIGH only at the ceiling: base=5, surprise=1 → 5.0 + 0.5 = 5.5 → clamped to 5.0
        wh = jarvis_energy.write_strength(5.0)
        assert wh == 5.0, f"write_strength(5.0) not clamped to 5.0: {wh}"
        # clamp LOW: base=0.01, surprise=0 (disabled) → 0.01 → clamp to 0.1
        jarvis_energy._ENABLED = False
        wl = jarvis_energy.write_strength(0.01)
        assert wl == 0.1, f"write_strength(0.01) not clamped to 0.1: {wl}"
        jarvis_energy._ENABLED = True
        _ok(f"write_strength additive+bounded [0.1,5]: w={w:.3f} prec={w2:.3f} primary(4.0)={wp} hi={wh} lo={wl}")
    finally:
        jarvis_energy._TRACE_PATH_RESOLVED = orig_resolved
        jarvis_energy._TRACE_PATH = orig_path
        jarvis_energy._ENABLED = True
        os.unlink(fixture)


def test_malformed_lines_skipped():
    """Malformed/garbage JSONL lines are skipped (non-fatal), valid ones still scored."""
    from datetime import datetime, timezone
    now = datetime.now(timezone.utc).isoformat()
    fixture = tempfile.mkstemp(suffix=".jsonl")[1]
    with open(fixture, "w") as f:
        f.write("this is not json\n")
        f.write('{"ts": "' + now + '", "deltaU": 0.5}\n')
        f.write("\n")  # blank line
        f.write('{"ts": "' + now + '", "deltaU": 0.5}\n')
        f.write('{broken json\n')
    orig_resolved = jarvis_energy._TRACE_PATH_RESOLVED
    orig_path = jarvis_energy._TRACE_PATH
    jarvis_energy._TRACE_PATH_RESOLVED = True
    jarvis_energy._TRACE_PATH = fixture
    try:
        s = jarvis_energy.surprise_score(20)
        # 2 valid records, |deltaU|=0.5 each → mean 0.5
        assert abs(s - 0.5) < 0.02, f"malformed-skip surprise {s} != ~0.5"
        _ok(f"malformed lines skipped, valid scored: surprise={s:.4f} (~0.5)")
    finally:
        jarvis_energy._TRACE_PATH_RESOLVED = orig_resolved
        jarvis_energy._TRACE_PATH = orig_path
        os.unlink(fixture)


def test_missing_deltaU_skipped():
    """Records without a deltaU field are skipped (non-fatal)."""
    from datetime import datetime, timezone
    now = datetime.now(timezone.utc).isoformat()
    recs = [
        {"ts": now, "decision": True},  # no deltaU
        {"ts": now, "deltaU": 0.8, "decision": True},
        {"ts": now, "deltaU": None, "decision": True},  # null deltaU
    ]
    fixture = _write_fixture(recs)
    orig_resolved = jarvis_energy._TRACE_PATH_RESOLVED
    orig_path = jarvis_energy._TRACE_PATH
    jarvis_energy._TRACE_PATH_RESOLVED = True
    jarvis_energy._TRACE_PATH = fixture
    try:
        s = jarvis_energy.surprise_score(20)
        assert abs(s - 0.8) < 0.02, f"missing-deltaU surprise {s} != ~0.8"
        _ok(f"missing/null deltaU skipped: surprise={s:.4f} (~0.8)")
    finally:
        jarvis_energy._TRACE_PATH_RESOLVED = orig_resolved
        jarvis_energy._TRACE_PATH = orig_path
        os.unlink(fixture)


def test_large_deltaU_does_not_crash():
    """Protected-path violations add +100 to U — a huge deltaU must not crash or NaN out. With the ADDITIVE
    bounded formula, huge surprise does NOT saturate weight-1 to 5.0 (bounded→~1.0, so weight-1→~2.0); only a
    high base near the ceiling clamps. This is the saturation-fix regression guard."""
    from datetime import datetime, timezone
    now = datetime.now(timezone.utc).isoformat()
    recs = [{"ts": now, "deltaU": 270.0, "decision": False, "stateBefore": {}, "stateAfter": {}}]
    fixture = _write_fixture(recs)
    orig_resolved = jarvis_energy._TRACE_PATH_RESOLVED
    orig_path = jarvis_energy._TRACE_PATH
    jarvis_energy._TRACE_PATH_RESOLVED = True
    jarvis_energy._TRACE_PATH = fixture
    try:
        s = jarvis_energy.surprise_score(20)
        assert math.isfinite(s), f"surprise not finite: {s}"
        # weight-1 + bounded(270)≈0.9963 → ~1.996. NOT saturated to 5.0 (the old bug). Weight preserved.
        w = jarvis_energy.write_strength(1.0)
        assert abs(w - 1.9963) < 0.02, f"weight-1 with huge surprise should be ~1.996 (not 5.0): {w}"
        # the ceiling clamp still works for a high base: 4.5 + 0.9963 = 5.496 → clamp 5.0
        wh = jarvis_energy.write_strength(4.5)
        assert wh == 5.0, f"write_strength(4.5) with huge surprise not clamped to 5.0: {wh}"
        _ok(f"large deltaU (270) handled, NO saturation: surprise={s:.2f}, write_strength(1.0)={w:.3f}, (4.5)={wh}")
    finally:
        jarvis_energy._TRACE_PATH_RESOLVED = orig_resolved
        jarvis_energy._TRACE_PATH = orig_path
        os.unlink(fixture)


def test_time_decay():
    """Old verdicts weigh less than recent ones (exponential decay)."""
    from datetime import datetime, timezone, timedelta
    now = datetime.now(timezone.utc)
    old = (now - timedelta(hours=10)).isoformat()
    recent = now.isoformat()
    # One old verdict with |deltaU|=4, one recent with |deltaU|=0.4.
    recs = [
        {"ts": old, "deltaU": 4.0},
        {"ts": recent, "deltaU": 0.4},
    ]
    fixture = _write_fixture(recs)
    orig_resolved = jarvis_energy._TRACE_PATH_RESOLVED
    orig_path = jarvis_energy._TRACE_PATH
    orig_hl = jarvis_energy._DECAY_HALF_LIFE
    jarvis_energy._TRACE_PATH_RESOLVED = True
    jarvis_energy._TRACE_PATH = fixture
    jarvis_energy._DECAY_HALF_LIFE = 3600.0  # 1h half-life
    try:
        s = jarvis_energy.surprise_score(20)
        # Without decay, mean = (4.0 + 0.4)/2 = 2.2. With decay, the old (4.0) verdict
        # at 10h has weight 0.5^(10) ≈ 0.000977; recent (0.4) has weight ~1.0.
        # So weighted mean ≈ (4*0.000977 + 0.4*1.0)/(0.000977+1.0) ≈ 0.4035.
        assert s < 1.0, f"decay not working: surprise {s} >= 1.0 (old verdict should be suppressed)"
        assert s > 0.39, f"surprise {s} too low (recent verdict lost): expected ~0.40"
        _ok(f"time decay: surprise={s:.4f} (~0.40, old verdict suppressed)")
    finally:
        jarvis_energy._TRACE_PATH_RESOLVED = orig_resolved
        jarvis_energy._TRACE_PATH = orig_path
        jarvis_energy._DECAY_HALF_LIFE = orig_hl
        os.unlink(fixture)


def test_read_only_safety():
    """The module must not write any file (READ-ONLY on the energy system)."""
    src_path = os.path.join(os.path.dirname(__file__), "jarvis_energy.py")
    with open(src_path) as f:
        src = f.read()
    # No write/append/open-in-write-mode calls except the __main__ diagnostics (which only prints).
    # The source should not contain open(..., "w") / open(..., "a") / os.remove / shutil.rmtree etc.
    write_patterns = ['open(', "'w'", '"w"', "'a'", '"a"', "os.remove", "os.unlink",
                      "shutil.rmtree", "rmtree", ".write(", ".writelines(", "appendFileSync",
                      "writeFileSync"]
    # Filter out the docstring/comment mentions and the test-fixture helpers (this is the module, not test).
    # In the MODULE source, the only `.write(` should be in the node subprocess string (process.stdout.write),
    # which is READ (writing to node's stdout to GET the path back).
    # Check for actual file-write opens.
    lines = src.split("\n")
    violations = []
    for i, line in enumerate(lines, 1):
        stripped = line.strip()
        if stripped.startswith("#") or stripped.startswith('"""') or '"""' in stripped:
            continue
        # open(path, "w") or "a" modes on a FILE (not subprocess)
        if ('open(' in line and ('"w"' in line or "'w'" in line or '"a"' in line or "'a'" in line)
                and 'subprocess' not in line and 'capture_output' not in line):
            violations.append(f"L{i}: {stripped}")
    assert not violations, f"file-write opens found in module: {violations}"
    # No os.remove/os.unlink/shutil in the module
    destructive = [p for p in ["os.remove", "os.unlink", "shutil", "rmtree", "os.rmdir"] if p in src]
    assert not destructive, f"destructive calls in module: {destructive}"
    _ok("READ-ONLY: no file writes / destructive calls in module")


def test_live_trace_if_present():
    """If the real trace is present and resolvable, surprise_score returns a finite float.
    This is the LIVE happy-path check (skipped gracefully if node/trace absent)."""
    # Reset the cache so trace_path() does a fresh node resolution.
    jarvis_energy._TRACE_PATH_RESOLVED = False
    jarvis_energy._TRACE_PATH = None
    path = jarvis_energy.trace_path()
    if not path or not os.path.exists(path):
        print(f"  SKIP: live trace absent or unresolvable (path={path}) — cold-start path covered above")
        return
    s = jarvis_energy.surprise_score(20)
    assert isinstance(s, float), f"live surprise not float: {type(s)}"
    assert math.isfinite(s), f"live surprise not finite: {s}"
    assert s >= 0.0, f"live surprise negative: {s}"
    w = jarvis_energy.write_strength(1.0)
    assert 0.1 <= w <= 5.0, f"live write_strength out of [0.1,5]: {w}"
    _ok(f"LIVE trace: surprise(20)={s:.4f}, write_strength(1.0)={w:.4f} (trace={path})")


def main():
    print("=" * 70)
    print("test_jarvis_energy.py — T1 (jarvis_energy) GREEN/RED/edge suite")
    print("=" * 70)
    tests = [
        test_import_and_exports,
        test_stdlib_only,
        test_disabled_degrades_to_zero,
        test_trace_absent_degrades,
        test_empty_trace_degrades,
        test_happy_path_fixture,
        test_write_strength_formula_and_clamp,
        test_malformed_lines_skipped,
        test_missing_deltaU_skipped,
        test_large_deltaU_does_not_crash,
        test_time_decay,
        test_read_only_safety,
        test_live_trace_if_present,
    ]
    passed = 0
    failed = 0
    for t in tests:
        try:
            t()
            passed += 1
        except AssertionError as e:
            _fail(t.__name__, str(e))
            failed += 1
        except Exception as e:
            _fail(t.__name__, f"unexpected {type(e).__name__}: {e}")
            failed += 1
    print("-" * 70)
    print(f"RESULT: {passed} passed, {failed} failed, {len(tests)} total")
    print("=" * 70)
    sys.exit(1 if failed else 0)


if __name__ == "__main__":
    main()
