"""M1.6: id-dedup merge with conflict policy + duplicate report.

cmd_merge (and cmd_run's inline merge) previously concatenated layer files
without dedup — the pinned v3 graph carried 229 duplicate node records
(file: nodes overlapping across file_inventory/writers layers, F-040).

dedup_by_id(lines, keep="last"):
  - keeps the LAST record per node id (later layer wins — deterministic since
    inputs are sorted by layer filename),
  - counts duplicates removed,
  - classifies conflicts: duplicate ids whose records differ in content
    (kind/props/evidence/src) vs identical repeats,
  - returns (deduped_lines, report dict).

Edge records have no id and pass through unchanged. Deterministic: input order
is sorted layer files; ties resolved by keep-last. Stdlib only.
"""
from __future__ import annotations
import json


def dedup_by_id(lines: list[str], keep: str = "last") -> tuple[list[str], dict]:
    """Dedup JSONL node records by id. Returns (deduped_lines, report)."""
    seen: dict[str, str] = {}          # id -> line kept
    dups_removed = 0
    conflicts: dict[str, dict] = {}    # id -> {count, first_src, last_src, differing}
    for line in lines:
        if not line.strip():
            continue
        try:
            rec = json.loads(line)
        except Exception:  # noqa: BLE001 — pass non-JSON through untouched
            continue
        rid = rec.get("id")
        if rid is None or "from" in rec:  # edge or non-node record: pass through
            continue
        if rid in seen:
            dups_removed += 1
            first = json.loads(seen[rid])
            differing = first != rec
            c = conflicts.setdefault(rid, {
                "count": 0,
                "first_src": first.get("src", ""),
                "last_src": rec.get("src", ""),
                "differing": False,
            })
            c["count"] += 1
            c["differing"] = c["differing"] or differing
            c["last_src"] = rec.get("src", "")
        if keep == "last":
            seen[rid] = line  # later wins
        else:
            seen.setdefault(rid, line)
    out = []
    emitted: set = set()
    for line in lines:
        if not line.strip():
            continue
        try:
            rec = json.loads(line)
        except Exception:  # noqa: BLE001
            out.append(line)
            continue
        rid = rec.get("id")
        if rid is None or "from" in rec:
            out.append(line)
            continue
        if keep == "last":
            if line == seen[rid] and rid not in emitted:
                out.append(line)
                emitted.add(rid)
        else:
            if rid not in emitted:
                out.append(line)
                emitted.add(rid)
    return out, {
        "policy": keep,
        "total_records": len(lines),
        "unique_ids": len(seen),
        "duplicates_removed": dups_removed,
        "conflicting_ids": sum(1 for c in conflicts.values() if c["differing"]),
        "conflicts": {rid: c for rid, c in sorted(conflicts.items())},
    }
