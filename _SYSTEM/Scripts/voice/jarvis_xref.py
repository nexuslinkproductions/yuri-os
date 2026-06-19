#!/usr/bin/env python3
# @capability: jarvis-xref-navigation
# @serves: yuri navigates yuri natively | canonical truth at brain startup | xref tool for voice brain | jarvis xref
# @does: READ-ONLY YURI-OS navigation seam for the voice brain — (a) canonical_block() loads the system's
#        peer-open canonical truth (readView from memory-canonical-store.mjs) via ONE cached one-shot node call
#        at import, for startup injection; (b) xref(query) shells node xref-query.mjs so Yuri navigates the
#        code/docs/circuitry knowledge the way every lane does. Degrades to "" at both seams when absent/disabled.
# @use: imported by yuri-z-brain.py. canonical_block() → _build_system() startup; xref() → the `xref` tool.
# @exports: canonical_block, xref, is_enabled
"""
jarvis_xref.py — YURI OS canonical-truth + native xref navigation seam for the voice brain.

Track T3 of the JARVIS ↔ YURI-OS integration mission (05-INTEGRATION-MISSION-BRIEF.md).

Two READ-ONLY integrations into the substrate:
  (a) canonical_block() — load the system's canonical truth (peer-open readView from
      memory-canonical-store.mjs) at brain startup and expose a compact markdown block for
      startup injection. ONE cached one-shot node call at module init.
  (b) xref(query, max_lines=40) — shell `node _SYSTEM/Scripts/xref-query.mjs "<query>"`,
      bounded output, returns compact text. On-demand navigation TOOL (per-call is fine —
      it is NOT the hot path).

Safety:
  - READ-ONLY everywhere. Never writes governed surfaces.
  - Honors protected paths (.env, backend/data, .claude/state, ...) — it never reads them.
  - Degrades to "" gracefully if the canonical store is absent or xref fails.
  - Gated behind JARVIS_XREF (default ON = "1", "true", "yes", "on"). When disabled, both
    functions return "" without touching node, so the brain's startup stays node-free.

Stdlib only (subprocess, json, os, sys). Python 3.8+.
"""

from __future__ import annotations

import json
import os
import subprocess
import sys

__all__ = ["canonical_block", "xref", "is_enabled"]

# ─── paths ────────────────────────────────────────────────────────────────────
# Resolve repo root from this file's location: _SYSTEM/Scripts/voice/jarvis_xref.py
_HERE = os.path.dirname(os.path.abspath(__file__))
_REPO_ROOT = os.path.abspath(os.path.join(_HERE, "..", "..", ".."))
_XREF_CLI = os.path.join(_REPO_ROOT, "_SYSTEM", "Scripts", "xref-query.mjs")
_CANONICAL_STORE = os.path.join(
    _REPO_ROOT, "_SYSTEM", "Scripts", "memory-canonical-store.mjs"
)

# Compact cap for the startup-injection block (~4000 chars keeps brain startup snappy).
_MAX_CANONICAL_CHARS = 4000

# One-shot node call timeout (seconds). Startup must not hang on a wedged node.
_NODE_TIMEOUT_S = 20

# Truthy env values for the gate.
_TRUTHY = {"1", "true", "yes", "on"}


def is_enabled() -> bool:
    """Whether the xref seam is armed. Default ON; JARVIS_XREF=0 disables."""
    raw = os.environ.get("JARVIS_XREF", "1").strip().lower()
    return raw in _TRUTHY


# ─── module-init canonical cache ──────────────────────────────────────────────
# ONE one-shot node call at import time (when armed). Cached for the process lifetime.
# This is the "warm canonical" the brain injects at startup. If node/store absent or
# the call fails for any reason -> _canonical_cache stays "" (graceful degrade).
_canonical_cache: str = ""


def _load_canonical_once() -> str:
    """One-shot node call to readView(); returns "" on any failure (never raises)."""
    if not is_enabled():
        return ""
    if not os.path.isfile(_CANONICAL_STORE):
        return ""
    # Use absolute module path so node's CWD doesn't matter. ESM dynamic import.
    # Build the import() arg as a properly-quoted JS string literal from the file:// URL.
    mod_url = "file://" + _CANONICAL_STORE
    js = (
        "import(" + json.dumps(mod_url) + ")"
        ".then(m=>process.stdout.write(JSON.stringify(m.readView())))"
        ".catch(()=>process.exit(0))"
    )
    try:
        proc = subprocess.run(
            [sys.executable if False else "node", "-e", js],
            capture_output=True,
            text=True,
            timeout=_NODE_TIMEOUT_S,
        )
    except (FileNotFoundError, subprocess.SubprocessError, OSError):
        return ""
    if proc.returncode != 0:
        return ""
    return proc.stdout or ""


def _render_canonical_block(view_json: str) -> str:
    """
    Render the readView() JSON into a compact markdown block, capped at ~4000 chars.

    readView shape (verified from memory-canonical-store.mjs buildReadView):
      {
        v: 1,
        foldedAt: "<iso>",
        claimCount: <int>,
        claims: {
          "<subject>\\u0000<predicate>": {
            subject, predicate, object, eventId, kind,
            provenance: { lane, session, agent },
            memory_type, domain, tier, lifecycle, status
          }, ...
        },
        contested: { "<key>": { competing: [...] }, ... }
      }
    Filing-lane claims are advisory (placement history) — they are NOT in readView's
    claims map by construction (buildReadView keeps byKey winners; loadCanonical filters
    filing, but readView does not pre-filter — so we filter advisory lane here too for
    cleanliness: a startup block should carry operator-grade truth, not placement noise).
    """
    if not view_json or not view_json.strip():
        return ""
    try:
        view = json.loads(view_json)
    except (json.JSONDecodeError, ValueError):
        return ""

    claims = view.get("claims") if isinstance(view, dict) else None
    if not isinstance(claims, dict) or not claims:
        return ""

    lines = ["## YURI canonical truth (peer-open readView)"]
    folded = view.get("foldedAt") if isinstance(view, dict) else None
    if folded:
        lines.append(f"_folded {folded}_")
    lines.append("")

    # Sort by tier then subject for deterministic, compact output. tier is HETEROGENEOUS
    # in the live store (int 1, str 'permanent'/'project', None) — coerce to a stable
    # string so no cross-type comparison ever fires.
    def _sort_key(item):
        _, c = item
        tier = c.get("tier") if isinstance(c, dict) else None
        tier_s = "999" if tier is None else str(tier)
        return (tier_s, str(c.get("subject", "")))

    rendered = 0
    budget = _MAX_CANONICAL_CHARS
    header_blob = "\n".join(lines)
    budget -= len(header_blob)
    if budget <= 0:
        return header_blob[:_MAX_CANONICAL_CHARS]

    out = [header_blob]
    for _, c in sorted(claims.items(), key=_sort_key):
        if not isinstance(c, dict):
            continue
        # Skip advisory filing-lane placement history (transition-only, not operator truth).
        prov = c.get("provenance") or {}
        if prov.get("lane") == "filing":
            continue
        subject = c.get("subject", "?")
        predicate = c.get("predicate", "?")
        obj = c.get("object")
        if obj is None:
            obj_s = ""
        elif isinstance(obj, (dict, list)):
            # Compact JSON for structured objects (readView objects can be nested).
            obj_s = json.dumps(obj, separators=(",", ":"), ensure_ascii=False)
        else:
            obj_s = str(obj)
        # Per-claim object cap so one giant claim doesn't monopolize the block.
        if len(obj_s) > 200:
            obj_s = obj_s[:197] + "…"
        tier = c.get("tier")
        tier_s = "" if tier is None else f" [t{tier}]"
        lane = prov.get("lane", "?")
        # One compact line per claim: "- <subject> :: <predicate> = <object> (lane) [tN]"
        line = f"- `{subject}` :: {predicate} = {obj_s}{tier_s} ({lane})"
        if len(line) + 1 > budget:  # +1 for newline
            out.append("…")
            break
        out.append(line)
        budget -= len(line) + 1
        rendered += 1

    if rendered == 0:
        return ""  # all claims were advisory -> no truth to inject
    block = "\n".join(out)
    return block[:_MAX_CANONICAL_CHARS]


# populate the cache at import (guarded; failures -> "")
try:
    _canonical_cache = _render_canonical_block(_load_canonical_once())
except Exception:  # pragma: no cover — absolute degrade floor
    _canonical_cache = ""


def canonical_block() -> str:
    """
    Compact markdown block of canonical claims for startup injection.

    Resolved ONCE at module init via a cached one-shot node call to readView() in
    memory-canonical-store.mjs (peer-open, no lease, READ-ONLY). Returns "" when:
      - JARVIS_XREF is disabled, OR
      - the canonical store / node is absent, OR
      - the store holds no operator-grade claims.
    Capped at ~4000 chars so brain startup stays snappy.
    """
    return _canonical_cache


# ─── on-demand xref navigation ────────────────────────────────────────────────
def xref(query: str, max_lines: int = 40) -> str:
    """
    Navigate YURI's knowledge the way lanes do.

    Shells `node _SYSTEM/Scripts/xref-query.mjs "<query>"` (READ-ONLY navigation
    across FTS5 / circuitry graph / GitNexus / mechanism spectrum), bounded to
    `max_lines` of output (default 40). On any error (node absent, non-zero exit,
    timeout, JARVIS_XREF disabled) -> "". Safe to call in the brain's tool layer.

    Per-call is intentional: xref is an on-demand tool, NOT the voice hot path
    (the brain calls this only when it decides to navigate, not every turn).
    """
    if not is_enabled():
        return ""
    if not query or not query.strip():
        return ""
    if not os.path.isfile(_XREF_CLI):
        return ""
    if max_lines is None or max_lines <= 0:
        max_lines = 40

    try:
        proc = subprocess.run(
            ["node", _XREF_CLI, str(query)],
            capture_output=True,
            text=True,
            timeout=_NODE_TIMEOUT_S,
        )
    except (FileNotFoundError, subprocess.SubprocessError, OSError):
        return ""
    if proc.returncode != 0:
        return ""
    out = proc.stdout or ""
    # Bound to max_lines (compact text for the brain tool).
    lines = out.splitlines()
    if len(lines) > max_lines:
        lines = lines[:max_lines]
        lines.append("…[truncated]")
    return "\n".join(lines)


if __name__ == "__main__":  # pragma: no cover — manual smoke
    print("=== canonical_block() ===")
    print(canonical_block() or "(empty — store absent or disabled)")
    print("\n=== xref('energy gate') ===")
    print(xref("energy gate", max_lines=6) or "(empty — xref unavailable or disabled)")
