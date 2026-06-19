#!/usr/bin/env python3
# @capability: jarvis-energy-surprise
# @serves: jarvis write_strength | ΔU surprise gating | neuro-core doctrine | energy-gate trace integration
# @does: reads the YURI energy-gate JSONL trace (READ-ONLY), computes a time-decayed surprise score from
#        |deltaU| over recent gate verdicts, and exposes write_strength = clamp(base·precision + BOOST·surprise/(1+surprise), 0.1, 5)
#        — an ADDITIVE bounded surprise nudge (NOT a multiplier: a multiplier saturates the [0.1,5] band at live
#        surprise≈9, erasing the salience gradient). This wires the system's REAL energy ΔU into episodic-memory
#        write salience while keeping the model-judged weight PRIMARY (high-weight always outranks high-surprise).
# @use: imported by jarvis_memory (wired by the main lane). `write_strength(weight, precision)` to score a
#        write; `surprise_score(window)` to read raw ΔU surprise. `JARVIS_ENERGY=0` to disable (degrades to
#        base weight). Trace path resolved ONCE at import via a cached one-shot node call to gateTracePath().
# @exports: surprise_score, write_strength, is_enabled, trace_path
#
# SAFETY CONTRACT:
#   - READ-ONLY on the energy system. Never arms the gate. Never writes the trace.
#   - Never writes ANY file. Pure read + compute.
#   - Trace absent/empty/malformed → degrade to surprise=0.0 (write_strength = base weight; non-fatal).
#   - Gate behind JARVIS_ENERGY (default ON) so the main lane can disable independently.
#
# WHY deltaU (not stateBefore.U/stateAfter.U): the live trace record carries deltaU as a TOP-LEVEL signed
# float (= computeDeltaU's U_after − U_before, computed at fire time with the EXACT gate weights). The
# stateBefore/stateAfter objects hold raw control-plane fields (verifiedEvidenceCount, distributions, ...)
# but NOT a .U scalar. So |stateAfter.U − stateBefore.U| ≡ abs(rec["deltaU"]) — and using the pre-computed
# deltaU is MORE faithful (it reuses the fire-time weights rather than re-deriving U with default weights
# in Python). This is the semantic match for the brief's formula, grounded in the actual trace shape.
#
# COUPLING: this module imports NOTHING from yuri-z-brain.py or jarvis_memory.py (the main lane wires the
# single `jarvis_energy.write_strength(weight)` call into remember() serially, after collection). Zero
# pairwise coupling → collision-free parallel build with T2/T3.

import json
import math
import os
import subprocess

# ---------------------------------------------------------------------------
# Config / feature flag
# ---------------------------------------------------------------------------
# JARVIS_ENERGY default ON (per brief: gate behind env, default ON). "0" disables.
_ENABLED = os.environ.get("JARVIS_ENERGY", "1") != "0"

# Time-decay half-life (seconds) for the surprise score. Recent verdicts weigh more.
# 3600s (1h): the gate fires many times/second under load; an hour captures the recent
# regime without a stale spike from hours ago dominating the mean.
_DECAY_HALF_LIFE = float(os.environ.get("JARVIS_ENERGY_HALFLIFE", "3600"))

# Absolute floor on the trace read budget. The live trace is ~700MB; we must NEVER slurp
# it whole. We seek from EOF backward in bounded chunks and parse complete JSONL lines.
# Each verdict line is ~1-3KB; 4096 lines × 3KB ≈ 12MB worst case for window=20 + headroom.
_TAIL_CHUNK = 65536  # 64KB per seek-chunk
_MAX_TAIL_BYTES = 16 * 1024 * 1024  # 16MB hard ceiling — never read more than this

# Default window for surprise_score (the brief's contract default).
_DEFAULT_WINDOW = 20

# SURPRISE_BOOST — the max ADDITIVE nudge surprise can add to a write's weight (env-tunable, default 1.0).
# The surprise contribution is logistic-compressed (surprise/(1+surprise) ∈ [0,1)) then scaled by BOOST,
# so it nudges the weight up to +BOOST for maximally surprising moments. ADDITIVE + BOUNDED, never a
# multiplier: a naive base*(1+surprise) at live surprise≈9 collapses EVERY weight to ~5.0 (clamp), erasing
# the model's salience gradient and degenerating recall to pure bm25. Additive keeps the MODEL'S weight
# PRIMARY — a high-weight low-surprise write always outranks a low-weight high-surprise write; surprise
# only lifts within the band. (NEURO_CORE gap noted: |ΔU| is unsigned; the signed-RPE down-weight branch
# is a deeper V2 refinement — V1 encodes memorability-magnitude, the safe correct first step.)
_SURPRISE_BOOST = float(os.environ.get("JARVIS_SURPRISE_BOOST", "1.0"))


def is_enabled():
    """Whether the energy-surprise integration is armed (JARVIS_ENERGY != "0")."""
    return _ENABLED


# ---------------------------------------------------------------------------
# Trace path — ONE cached node call at module init (never per-call)
# ---------------------------------------------------------------------------
_TRACE_PATH = None
_TRACE_PATH_RESOLVED = False


def _resolve_trace_path():
    """Resolve the energy-gate trace path via a one-shot node call to gateTracePath().
    Cached on first call. Returns the path string or None if node fails/absent."""
    global _TRACE_PATH, _TRACE_PATH_RESOLVED
    if _TRACE_PATH_RESOLVED:
        return _TRACE_PATH
    _TRACE_PATH_RESOLVED = True
    # The brief's exact one-shot: import gateTracePath from the gate-trace module, write path to stdout.
    # Run from repo root (cwd is the repo root in the voice hot-path; brain launches there).
    script = (
        "import{gateTracePath}"
        "from'./_SYSTEM/Scripts/math/yuri-energy-gate-trace.mjs';"
        "process.stdout.write(gateTracePath())"
    )
    try:
        # cwd = repo root. This file is _SYSTEM/Scripts/voice/jarvis_energy.py, so the repo
        # root is FOUR dirname calls up: voice → Scripts → _SYSTEM → <repo_root>.
        repo_root = os.path.dirname(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))
        result = subprocess.run(
            ["node", "-e", script],
            cwd=repo_root,
            capture_output=True,
            text=True,
            timeout=5,
        )
        if result.returncode == 0 and result.stdout.strip():
            _TRACE_PATH = result.stdout.strip()
        # else: _TRACE_PATH stays None → degrade
    except Exception:
        _TRACE_PATH = None  # node absent / timeout / any fault → degrade silently
    return _TRACE_PATH


def trace_path():
    """Public accessor for the resolved trace path (or None if unresolvable). Mainly for
    diagnostics/tests; the hot path uses the cached internal value."""
    return _resolve_trace_path()


# ---------------------------------------------------------------------------
# Trace tail reader — bounded seek-from-end (NEVER slurp the whole file)
# ---------------------------------------------------------------------------
def _read_tail_records(path, min_lines):
    """Read the last >= min_lines complete JSONL records from `path` via backward-seek.
    Returns a list of parsed dicts (most-recent-last order preserved as in file). Empty
    list on any fault (absent file, parse error, under-budget). NEVER raises.
    The trace is ~700MB; this reads at most _MAX_TAIL_BYTES from the end."""
    out = []
    try:
        fsize = os.path.getsize(path)
    except OSError:
        return out
    if fsize <= 0:
        return out
    # Open in binary, seek from end, accumulate a byte buffer, split on newlines.
    try:
        with open(path, "rb") as f:
            pos = fsize
            buf = b""
            bytes_read = 0
            while pos > 0 and bytes_read < _MAX_TAIL_BYTES:
                read_size = min(_TAIL_CHUNK, pos)
                pos -= read_size
                f.seek(pos)
                chunk = f.read(read_size)
                bytes_read += len(chunk)
                buf = chunk + buf
                # Count complete lines we have (a trailing newline means the last line is complete).
                # We want at least min_lines complete records; stop early once we have enough.
                # Split on \n; a leading partial line (no preceding \n) is discarded at the buffer head.
                # Count complete lines (those bounded by \n on both sides, or the final line if file ends \n).
                lines = buf.split(b"\n")
                # lines[0] is the partial head (unless buf starts at file start); lines[-1] is after last \n.
                # Complete lines = lines[1:-1] if there's a trailing newline, else lines[1:] handling.
                complete = [ln for ln in lines[1:] if ln]  # skip partial head; drop empties
                if len(complete) >= min_lines:
                    break
            # Parse the complete lines (most-recent-last in file order).
            for raw in buf.split(b"\n"):
                raw = raw.strip()
                if not raw:
                    continue
                try:
                    rec = json.loads(raw.decode("utf-8"))
                    if isinstance(rec, dict):
                        out.append(rec)
                except (ValueError, UnicodeDecodeError):
                    continue  # malformed line → skip (trace is append-only; a torn write is non-fatal)
    except OSError:
        return out
    return out


# ---------------------------------------------------------------------------
# Surprise score — time-decayed mean |deltaU| over recent verdicts
# ---------------------------------------------------------------------------
def _time_decay_weight(ts_iso, now_ts=None):
    """Exponential decay weight for a verdict timestamp (half-life = _DECAY_HALF_LIFE).
    Returns a weight in (0, 1]; older verdicts → smaller weight. 1.0 if ts unparseable
    (can't decay → treat as recent rather than zeroing real signal)."""
    if ts_iso is None:
        return 1.0
    try:
        # ISO-8601 with possible trailing Z; Python fromisoformat needs +00:00 not Z (pre-3.11).
        ts = ts_iso.replace("Z", "+00:00") if isinstance(ts_iso, str) else ts_iso
        from datetime import datetime, timezone
        then = datetime.fromisoformat(ts)
        if then.tzinfo is None:
            then = then.replace(tzinfo=timezone.utc)
        if now_ts is None:
            now_ts = datetime.now(timezone.utc)
        age_s = max(0.0, (now_ts - then).total_seconds())
    except Exception:
        return 1.0  # unparseable → no decay (don't zero real ΔU signal on a bad ts)
    if _DECAY_HALF_LIFE <= 0:
        return 1.0
    return math.pow(0.5, age_s / _DECAY_HALF_LIFE)


def surprise_score(window=20):
    """Time-decayed mean |deltaU| over the last `window` gate verdicts.

    Returns a float >= 0.0. Returns 0.0 if: the integration is disabled, the trace is
    absent/empty, no verdicts carry a numeric deltaU, or any fault occurs. NEVER raises.

    The |deltaU| is the magnitude of the energy jump across each gate verdict (the brief's
    |stateAfter.U − stateBefore.U|); recent verdicts weigh more via exponential decay."""
    if not _ENABLED:
        return 0.0
    try:
        window = max(1, int(window))
    except (TypeError, ValueError):
        window = _DEFAULT_WINDOW
    path = _resolve_trace_path()
    if not path:
        return 0.0
    records = _read_tail_records(path, window)
    if not records:
        return 0.0
    # Take the last `window` records (most recent).
    recent = records[-window:]
    weighted_sum = 0.0
    weight_total = 0.0
    from datetime import datetime, timezone
    now_ts = datetime.now(timezone.utc)
    for rec in recent:
        d = rec.get("deltaU")
        if d is None:
            continue
        try:
            mag = abs(float(d))
        except (TypeError, ValueError):
            continue
        w = _time_decay_weight(rec.get("ts"), now_ts)
        weighted_sum += mag * w
        weight_total += w
    if weight_total <= 0.0:
        return 0.0
    return weighted_sum / weight_total


# ---------------------------------------------------------------------------
# write_strength — the integration seam (base_weight * (1+surprise) * precision)
# ---------------------------------------------------------------------------
def write_strength(base_weight, precision=1.0):
    """Compute a surprise-gated write strength for an episodic-memory commit.

    write_strength = clamp(base_weight * precision + SURPRISE_BOOST * surprise/(1+surprise), 0.1, 5).

    The surprise contribution is ADDITIVE and BOUNDED (logistic compression into [0,1), scaled by
    SURPRISE_BOOST). This is the corrected form: the naive base*(1+surprise)*precision multiplies by
    raw surprise, which at the LIVE energy-trace magnitude (~9) pushes every weight past the [0.1,5]
    ceiling → everything clamps to ~5.0 → the model's salience gradient is erased → recall ranking
    degenerates to pure bm25. Additive-bounded keeps the MODEL'S weight PRIMARY: a weight-4 commitment
    during high surprise stays ~4.9, not 5.0-for-everything; a high-weight low-surprise write always
    outranks a low-weight high-surprise write. Surprise lifts memorability up to +SURPRISE_BOOST.

    - base_weight: the model-judged salience (jarvis_memory.remember() weight). PRIMARY signal.
    - precision: optional confidence multiplier on the base (default 1.0).
    - Degrades to clamp(base * precision) when surprise_score()==0 (trace absent/disabled/empty).
    NEVER raises."""
    try:
        bw = float(base_weight) if base_weight is not None else 1.0
    except (TypeError, ValueError):
        bw = 1.0
    try:
        p = float(precision) if precision is not None else 1.0
    except (TypeError, ValueError):
        p = 1.0
    if not math.isfinite(p) or p <= 0:
        p = 1.0
    if not math.isfinite(bw):
        bw = 1.0
    surprise = surprise_score() if _ENABLED else 0.0
    if not math.isfinite(surprise):
        surprise = 0.0
    # Logistic compression: surprise∈[0,∞) → bounded∈[0,1). caps the additive nudge so it can never
    # saturate the band no matter how large a single verdict's |ΔU| (protected-path +100, etc.).
    bounded = (surprise / (1.0 + surprise)) if surprise > 0.0 else 0.0
    raw = bw * p + _SURPRISE_BOOST * bounded
    if not math.isfinite(raw):
        raw = bw  # fall back to base if any non-finite crept in
    return max(0.1, min(raw, 5.0))


if __name__ == "__main__":
    # Diagnostics CLI (for manual inspection — not on the voice hot-path).
    import sys
    print(f"JARVIS_ENERGY enabled: {is_enabled()}")
    print(f"trace path: {trace_path()}")
    tp = trace_path()
    if tp:
        try:
            sz = os.path.getsize(tp)
            print(f"trace size: {sz} bytes")
        except OSError:
            print("trace size: (unreadable)")
    print(f"surprise_score(20): {surprise_score(20):.6f}")
    print(f"write_strength(1.0): {write_strength(1.0):.6f}")
    print(f"write_strength(1.0, precision=1.5): {write_strength(1.0, 1.5):.6f}")
