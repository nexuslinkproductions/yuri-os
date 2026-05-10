#!/usr/bin/env python3
"""Yuri Memory Governor.

Canonical lifecycle layer for memory.db. It keeps legacy `memories` usable while
adding governed write/read/manage/defend/research-watch loops.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import os
import re
import sqlite3
import sys
import urllib.parse
import urllib.request
import xml.etree.ElementTree as ET
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from typing import Any

DB_PATH = os.path.abspath(os.path.join(os.path.dirname(__file__), "memory.db"))

SENSITIVE_PATTERNS = [
    re.compile(r"sk-[a-zA-Z0-9]{32,}"),
    re.compile(r"xkeysia-[a-zA-Z0-9]{60,}"),
    re.compile(r"AIza[0-9A-Za-z-_]{35}"),
    re.compile(r"ghp_[a-zA-Z0-9]{36}"),
    re.compile(r"ey[a-zA-Z0-9-_]{20,}\.ey[a-zA-Z0-9-_]{20,}\.[a-zA-Z0-9-_]{20,}"),
    re.compile(r"password\s*[:=]\s*[\"']?[^\"'\s,]+[\"']?", re.IGNORECASE),
]

CONTROL_FLOW_PATTERNS = [
    re.compile(r"ignore (all )?(previous|prior|above) instructions", re.IGNORECASE),
    re.compile(r"system prompt", re.IGNORECASE),
    re.compile(r"developer message", re.IGNORECASE),
    re.compile(r"tool call", re.IGNORECASE),
    re.compile(r"exfiltrat", re.IGNORECASE),
    re.compile(r"run .*shell", re.IGNORECASE),
]

ENVIRONMENT_SECRET_PATTERNS = [
    re.compile(r"\.env\b", re.IGNORECASE),
    re.compile(r"\bapi[_ -]?key\b", re.IGNORECASE),
    re.compile(r"\bcredential(s)?\b", re.IGNORECASE),
    re.compile(r"\bsecret(s)?\b", re.IGNORECASE),
    re.compile(r"\b(access|auth|bearer|refresh|session)[_ -]?token\b", re.IGNORECASE),
    re.compile(r"\bpassword\b", re.IGNORECASE),
]

RESEARCH_SOURCES_2026 = [
    ("MemoryAgentBench: Evaluating Memory in LLM Agents via Incremental Multi-Turn Interactions", "https://openreview.net/pdf/73075b52c441b9966980a5928b47d073c9671992.pdf", "2026", "peer_reviewed", "ICLR 2026", 0.95, "local eval must cover retrieval, test-time learning, long-range understanding, selective forgetting"),
    ("LightMem: Memory Is All You Need for Agentic AI", "https://arxiv.org/abs/2604.07798", "2026-04-22", "accepted_plus_preprint", "ICLR 2026 / arXiv", 0.9, "split STM/MTM/LTM and keep heavy consolidation offline"),
    ("Memory for Autonomous LLM Agents: A Survey", "https://arxiv.org/abs/2603.07670", "2026-03", "preprint", "arXiv", 0.82, "write-manage-read loop with contradiction, privacy, latency, forgetting controls"),
    ("AgeMem: Agentic Memory for LLM Agents", "https://arxiv.org/abs/2601.01885", "2026-04-30", "preprint", "arXiv", 0.78, "explicit store/retrieve/update/summarize/discard operations"),
    ("Fine-Mem: Fine-Grained Memory for LLM Agents through Rehearsal and Self-Feedback", "https://arxiv.org/abs/2601.08435", "2026-01", "preprint", "arXiv", 0.8, "operation-level memory feedback"),
    ("Neuromem: Framework and Benchmark for Long-term Memory in LLM Agents", "https://arxiv.org/abs/2602.13967", "2026-02", "preprint", "arXiv", 0.8, "streaming lifecycle evaluation from ingestion to context integration"),
    ("FluxMem: A Liquid Multi-agent Memory System", "https://arxiv.org/abs/2602.14038", "2026-02", "preprint", "arXiv", 0.76, "adaptive memory layout by interaction type"),
    ("PlugMem: A Task-Agnostic Plugin Memory Module for LLM Agents", "https://www.microsoft.com/en-us/research/publication/plugmem-a-task-agnostic-plugin-memory-module-for-llm-agents/", "2026-02", "technical_report", "Microsoft Research", 0.78, "convert episodic traces into propositional and prescriptive knowledge"),
    ("StructMemEval: Evaluating LLMs' Structured Memory Capabilities in Agentic Tasks", "https://openreview.net/forum?id=a9vY2sJkf4", "2026", "workshop_oral", "ICLR 2026 MemAgents", 0.84, "organize memory into ledgers, lists, trees, project states, entity relations"),
    ("Experience Reuse in Large Language Model-based Agents", "https://arxiv.org/abs/2604.27003", "2026-04-29", "preprint", "arXiv", 0.76, "promote abstract procedural memories over raw trajectories"),
    ("Secure Forgetting for LLM-Agent System", "https://arxiv.org/abs/2604.00430", "2026-04", "preprint", "arXiv", 0.82, "forgetting scopes: state, trajectory, environment"),
    ("Memory Control Flow Attacks in Multi-Agent LLM Systems", "https://arxiv.org/abs/2603.15125", "2026-03", "preprint", "arXiv", 0.86, "detect memories that steer future tool or agent behavior"),
    ("LLM Agent Memory Poisoning: A Comprehensive Defense Framework", "https://arxiv.org/abs/2601.05504", "2026-01", "preprint", "arXiv", 0.86, "trust-score and quarantine poisoned memory"),
    ("OpenRAG-Soc: Open-Set Evaluation for Retrieval-Augmented Generation in Social Applications", "https://arxiv.org/abs/2601.10923", "2026-01", "peer_reviewed", "WWW 2026", 0.82, "open-set RAG safety and source-quality evaluation"),
]


@dataclass
class Assessment:
    content: str
    content_hash: str
    memory_type: str
    tier: str
    structure: str
    scope: str
    status: str
    trust_score: float
    confidence_score: float
    source_quality: float
    sensitivity: str
    decay_score: float
    canonical_summary: str
    flags: list[str]


def utc_now() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat()


def get_conn(db_path: str = DB_PATH) -> sqlite3.Connection:
    conn = sqlite3.connect(db_path, timeout=30.0)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode=WAL;")
    conn.execute("PRAGMA foreign_keys=ON;")
    ensure_schema(conn)
    return conn


def ensure_schema(conn: sqlite3.Connection) -> None:
    schema_path = os.path.join(os.path.dirname(__file__), "schema.sql")
    with open(schema_path, "r", encoding="utf-8") as handle:
        conn.executescript(handle.read())
    ensure_column(conn, "memory_items", "use_count", "INTEGER NOT NULL DEFAULT 0")
    seed_research_sources(conn)


def ensure_column(conn: sqlite3.Connection, table: str, column: str, definition: str) -> None:
    columns = [row["name"] for row in conn.execute(f"PRAGMA table_info({table})").fetchall()]
    if column not in columns:
        conn.execute(f"ALTER TABLE {table} ADD COLUMN {column} {definition}")


def valid_agent_or_none(conn: sqlite3.Connection, source_agent: str | None) -> str | None:
    if not source_agent:
        return None
    row = conn.execute("SELECT agent_id FROM agents WHERE agent_id = ?", (source_agent,)).fetchone()
    return source_agent if row else None


def redact(content: str) -> tuple[str, list[str]]:
    flags: list[str] = []
    redacted = content
    for pattern in SENSITIVE_PATTERNS:
        if pattern.search(redacted):
            flags.append("sensitive_secret_pattern")
            redacted = pattern.sub("[REDACTED_BY_MEMORY_GOVERNOR]", redacted)
    return redacted, sorted(set(flags))


def content_hash(content: str) -> str:
    normalized = re.sub(r"\s+", " ", content.strip()).lower()
    return hashlib.sha256(normalized.encode("utf-8")).hexdigest()


def classify(content: str, mem_type: str | None, source_kind: str, tags: list[str], importance: int) -> Assessment:
    redacted, flags = redact(content)
    lowered = redacted.lower()

    for pattern in CONTROL_FLOW_PATTERNS:
        if pattern.search(redacted):
            flags.append("memory_control_flow_risk")

    memory_type = mem_type or "episodic"
    if any(token in lowered for token in ["must ", "never ", "policy", "rule", "protocol"]):
        memory_type = "policy"
    elif any(token in lowered for token in ["steps:", "procedure", "runbook", "workflow", "how to"]):
        memory_type = "procedural"
    elif any(token in lowered for token in ["paper", "arxiv", "openreview", "iclr", "www 2026"]):
        memory_type = "research"

    if memory_type in {"policy", "procedural"}:
        structure = "tree" if "steps" in lowered or "workflow" in lowered else "ledger"
        tier = "LTM" if importance >= 3 else "MTM"
    elif memory_type == "research":
        structure = "ledger"
        tier = "LTM"
    elif source_kind in {"liquid", "session"}:
        structure = "episode"
        tier = "STM"
    else:
        structure = "episode"
        tier = "MTM" if importance >= 2 else "STM"

    scope = "state"
    if any(token in lowered for token in ["trajectory", "session", "conversation", "handoff"]):
        scope = "trajectory"
    if any(pattern.search(redacted) for pattern in ENVIRONMENT_SECRET_PATTERNS):
        scope = "environment"

    sensitivity = "internal"
    if "sensitive_secret_pattern" in flags or scope == "environment":
        sensitivity = "secret"
    elif any(token in lowered for token in ["private", "personal", "client", "customer"]):
        sensitivity = "restricted"

    trust = 0.72
    confidence = 0.64
    source_quality = 0.6
    status = "active"
    if source_kind in {"kernel", "system", "rag_ingest"}:
        source_quality += 0.15
    if source_kind in {"web", "research_watch"}:
        source_quality += 0.05
    if "memory_control_flow_risk" in flags:
        trust -= 0.45
        confidence -= 0.25
        status = "quarantined"
    if sensitivity == "secret":
        trust -= 0.25
        status = "quarantined"
    if importance >= 4:
        confidence += 0.12

    trust = max(0.0, min(1.0, trust))
    confidence = max(0.0, min(1.0, confidence))
    source_quality = max(0.0, min(1.0, source_quality))
    decay = 0.08 if tier == "LTM" else 0.2 if tier == "MTM" else 0.45

    summary = re.sub(r"\s+", " ", redacted.strip())[:280]
    return Assessment(
        content=redacted,
        content_hash=content_hash(redacted),
        memory_type=memory_type,
        tier=tier,
        structure=structure,
        scope=scope,
        status=status,
        trust_score=trust,
        confidence_score=confidence,
        source_quality=source_quality,
        sensitivity=sensitivity,
        decay_score=decay,
        canonical_summary=summary,
        flags=sorted(set(flags)),
    )


def seed_research_sources(conn: sqlite3.Connection) -> None:
    for title, url, pub_date, grade, venue, relevance, impact in RESEARCH_SOURCES_2026:
        conn.execute(
            """
            INSERT INTO memory_research_sources
              (title, url, publication_date, evidence_grade, venue, relevance_score, implementation_impact, checked_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
            ON CONFLICT(url) DO UPDATE SET
              title=excluded.title,
              publication_date=excluded.publication_date,
              evidence_grade=excluded.evidence_grade,
              venue=excluded.venue,
              relevance_score=excluded.relevance_score,
              implementation_impact=excluded.implementation_impact,
              checked_at=CURRENT_TIMESTAMP,
              updated_at=CURRENT_TIMESTAMP
            """,
            (title, url, pub_date, grade, venue, relevance, impact),
        )


def append_event(conn: sqlite3.Connection, item_id: int | None, event_type: str, operation: str, actor: str | None, outcome: str = "ok", metadata: dict[str, Any] | None = None, utility_score: float | None = None) -> int:
    cur = conn.execute(
        """
        INSERT INTO memory_events (item_id, event_type, operation, actor, outcome, utility_score, metadata_json)
        VALUES (?, ?, ?, ?, ?, ?, ?)
        """,
        (item_id, event_type, operation, actor, outcome, utility_score, json.dumps(metadata or {}, sort_keys=True)),
    )
    event_id = int(cur.lastrowid)
    if item_id is not None and event_type in {"read", "write", "duplicate", "manage", "defend"}:
        conn.execute(
            """
            INSERT INTO memory_feedback (item_id, event_id, operation, outcome, utility_label, utility_score, notes)
            VALUES (?, ?, ?, ?, ?, ?, ?)
            """,
            (
                item_id,
                event_id,
                operation,
                outcome,
                "useful" if outcome in {"ok", "active", "deduped"} else "needs_review",
                utility_score,
                json.dumps(metadata or {}, sort_keys=True),
            ),
        )
    return event_id


def governed_write(
    content: str,
    mem_type: str | None = "episodic",
    source_agent: str | None = None,
    tags: list[str] | None = None,
    importance: int = 1,
    source_uri: str | None = None,
    source_kind: str = "kernel",
    legacy_memory_id: int | None = None,
    rag_source_path: str | None = None,
    rag_node_id: int | None = None,
    metadata: dict[str, Any] | None = None,
    db_path: str = DB_PATH,
) -> int:
    tags = tags or []
    assessment = classify(content, mem_type, source_kind, tags, importance)
    with get_conn(db_path) as conn:
        stored_agent = valid_agent_or_none(conn, source_agent)
        existing = conn.execute(
            "SELECT id FROM memory_items WHERE content_hash = ?",
            (assessment.content_hash,),
        ).fetchone()
        if existing:
            item_id = int(existing["id"])
            conn.execute(
                """
                UPDATE memory_items
                SET use_count = use_count + 1,
                    last_accessed_at = CURRENT_TIMESTAMP,
                    updated_at = CURRENT_TIMESTAMP,
                    legacy_memory_id = COALESCE(legacy_memory_id, ?),
                    rag_source_path = COALESCE(rag_source_path, ?),
                    rag_node_id = COALESCE(rag_node_id, ?)
                WHERE id = ?
                """,
                (legacy_memory_id, rag_source_path, rag_node_id, item_id),
            )
            append_event(conn, item_id, "duplicate", "write", source_agent, "deduped", {"tags": tags, "flags": assessment.flags})
            return item_id

        cur = conn.execute(
            """
            INSERT INTO memory_items (
                legacy_memory_id, content, canonical_summary, memory_type, tier, structure, scope, status,
                source_agent, source_uri, source_kind, tags, trust_score, confidence_score, source_quality,
                sensitivity, decay_score, importance, content_hash, rag_source_path, rag_node_id, metadata_json
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                legacy_memory_id,
                assessment.content,
                assessment.canonical_summary,
                assessment.memory_type,
                assessment.tier,
                assessment.structure,
                assessment.scope,
                assessment.status,
                stored_agent,
                source_uri,
                source_kind,
                json.dumps(tags, sort_keys=True),
                assessment.trust_score,
                assessment.confidence_score,
                assessment.source_quality,
                assessment.sensitivity,
                assessment.decay_score,
                importance,
                assessment.content_hash,
                rag_source_path,
                rag_node_id,
                json.dumps({**(metadata or {}), "flags": assessment.flags}, sort_keys=True),
            ),
        )
        item_id = int(cur.lastrowid)
        append_event(conn, item_id, "write", "store", stored_agent, assessment.status, {"tags": tags, "flags": assessment.flags, "source_agent": source_agent})
        return item_id


def governed_read(query: str | None = None, limit: int = 20, include_suppressed: bool = False, db_path: str = DB_PATH) -> list[dict[str, Any]]:
    with get_conn(db_path) as conn:
        where = []
        params: list[Any] = []
        if not include_suppressed:
            where.append("status NOT IN ('tombstoned', 'quarantined')")
            where.append("(expires_at IS NULL OR expires_at > CURRENT_TIMESTAMP)")
        if query:
            where.append("(content LIKE ? OR canonical_summary LIKE ? OR tags LIKE ?)")
            needle = f"%{query}%"
            params.extend([needle, needle, needle])
        clause = " AND ".join(where) if where else "1=1"
        rows = conn.execute(
            f"""
            SELECT id, canonical_summary, memory_type, tier, structure, scope, status,
                   trust_score, confidence_score, source_quality, sensitivity,
                   importance, use_count, created_at, updated_at, last_accessed_at
            FROM memory_items
            WHERE {clause}
            ORDER BY
              (trust_score * 0.25 + confidence_score * 0.2 + source_quality * 0.15 + importance * 0.05 + use_count * 0.01) DESC,
              updated_at DESC
            LIMIT ?
            """,
            params + [limit],
        ).fetchall()
        ids = [int(row["id"]) for row in rows]
        if ids:
            conn.executemany(
                "UPDATE memory_items SET use_count = use_count + 1, last_accessed_at = CURRENT_TIMESTAMP WHERE id = ?",
                [(item_id,) for item_id in ids],
            )
            for item_id in ids:
                append_event(conn, item_id, "read", "retrieve", "kernel", "ok", {"query": query})
        return [dict(row) for row in rows]


def backfill_legacy(db_path: str = DB_PATH) -> dict[str, int]:
    counts = {"scanned": 0, "backfilled": 0}
    with get_conn(db_path) as conn:
        rows = _legacy_rows_to_backfill(conn)
    for row in rows:
        counts["scanned"] += 1
        try:
            tags = json.loads(row["tags"]) if row["tags"] else []
            if not isinstance(tags, list):
                tags = []
        except json.JSONDecodeError:
            tags = []
        governed_write(
            row["content"] or "",
            mem_type=row["type"] or "episodic",
            source_agent=row["source_agent"],
            tags=tags,
            importance=int(row["importance"] or 1),
            source_kind="legacy_backfill",
            legacy_memory_id=int(row["id"]),
            db_path=db_path,
        )
        counts["backfilled"] += 1
    return counts


def _legacy_rows_to_backfill(conn: sqlite3.Connection) -> list[sqlite3.Row]:
    return conn.execute(
        """
        SELECT m.id, m.type, m.content, m.source_agent, m.tags, m.importance
        FROM memories m
        LEFT JOIN memory_items i ON i.legacy_memory_id = m.id
        WHERE i.id IS NULL
        ORDER BY m.id ASC
        """
    ).fetchall()


def manage(cycle: str = "daily", db_path: str = DB_PATH) -> dict[str, Any]:
    started = utc_now()
    summary = {
        "cycle": cycle,
        "items_scanned": 0,
        "promoted": 0,
        "demoted": 0,
        "tombstoned": 0,
        "archived": 0,
        "duplicates_merged": 0,
    }
    with get_conn(db_path) as conn:
        cur = conn.execute(
            "INSERT INTO memory_consolidation_runs (cycle, status, started_at) VALUES (?, 'running', ?)",
            (cycle, started),
        )
        run_id = int(cur.lastrowid)
        try:
            legacy_rows = _legacy_rows_to_backfill(conn)
            summary["scanned"] = len(legacy_rows)
            for row in legacy_rows:
                try:
                    tags = json.loads(row["tags"]) if row["tags"] else []
                    if not isinstance(tags, list):
                        tags = []
                except json.JSONDecodeError:
                    tags = []
                assessment = classify(row["content"] or "", row["type"] or "episodic", "legacy_backfill", tags, int(row["importance"] or 1))
                existing = conn.execute("SELECT id FROM memory_items WHERE content_hash=?", (assessment.content_hash,)).fetchone()
                stored_agent = valid_agent_or_none(conn, row["source_agent"])
                if existing:
                    conn.execute(
                        "UPDATE memory_items SET legacy_memory_id=COALESCE(legacy_memory_id, ?), updated_at=CURRENT_TIMESTAMP WHERE id=?",
                        (int(row["id"]), int(existing["id"])),
                    )
                    append_event(conn, int(existing["id"]), "duplicate", "backfill", "memory_governor", "deduped", {"legacy_memory_id": int(row["id"])})
                else:
                    cur_item = conn.execute(
                        """
                        INSERT INTO memory_items (
                            legacy_memory_id, content, canonical_summary, memory_type, tier, structure, scope, status,
                            source_agent, source_kind, tags, trust_score, confidence_score, source_quality,
                            sensitivity, decay_score, importance, content_hash, metadata_json
                        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'legacy_backfill', ?, ?, ?, ?, ?, ?, ?, ?, ?)
                        """,
                        (
                            int(row["id"]),
                            assessment.content,
                            assessment.canonical_summary,
                            assessment.memory_type,
                            assessment.tier,
                            assessment.structure,
                            assessment.scope,
                            assessment.status,
                            stored_agent,
                            json.dumps(tags, sort_keys=True),
                            assessment.trust_score,
                            assessment.confidence_score,
                            assessment.source_quality,
                            assessment.sensitivity,
                            assessment.decay_score,
                            int(row["importance"] or 1),
                            assessment.content_hash,
                            json.dumps({"flags": assessment.flags}, sort_keys=True),
                        ),
                    )
                    append_event(conn, int(cur_item.lastrowid), "write", "backfill", "memory_governor", assessment.status, {"legacy_memory_id": int(row["id"]), "source_agent": row["source_agent"]})
                summary["backfilled"] = summary.get("backfilled", 0) + 1
            rows = conn.execute("SELECT * FROM memory_items ORDER BY id ASC").fetchall()
            summary["items_scanned"] = len(rows)

            now = datetime.now(timezone.utc)
            for row in rows:
                item_id = int(row["id"])
                status = row["status"]
                tier = row["tier"]
                trust = float(row["trust_score"])
                confidence = float(row["confidence_score"])
                use_count = int(row["use_count"] or 0)
                sensitivity = row["sensitivity"]
                last_accessed_raw = row["last_accessed_at"] or row["updated_at"] or row["created_at"]
                try:
                    last_accessed = datetime.fromisoformat(str(last_accessed_raw).replace("Z", "+00:00"))
                    if last_accessed.tzinfo is None:
                        last_accessed = last_accessed.replace(tzinfo=timezone.utc)
                except ValueError:
                    last_accessed = now
                age_days = (now - last_accessed).days

                if status == "active" and (trust < 0.25 or sensitivity == "secret"):
                    conn.execute("UPDATE memory_items SET status='tombstoned', tier='Tombstone', updated_at=CURRENT_TIMESTAMP WHERE id=?", (item_id,))
                    append_event(conn, item_id, "defend", "tombstone", "memory_governor", "ok", {"reason": "low_trust_or_secret"})
                    summary["tombstoned"] += 1
                    continue

                if status == "quarantined" and cycle in {"daily", "weekly", "monthly"}:
                    conn.execute("UPDATE memory_items SET status='tombstoned', tier='Tombstone', updated_at=CURRENT_TIMESTAMP WHERE id=?", (item_id,))
                    append_event(conn, item_id, "defend", "tombstone", "memory_governor", "ok", {"reason": "quarantined"})
                    summary["tombstoned"] += 1
                    continue

                if tier == "STM" and (use_count >= 2 or confidence >= 0.7):
                    conn.execute("UPDATE memory_items SET tier='MTM', updated_at=CURRENT_TIMESTAMP WHERE id=?", (item_id,))
                    append_event(conn, item_id, "manage", "promote", "memory_governor", "ok", {"from": "STM", "to": "MTM"})
                    summary["promoted"] += 1
                elif tier == "MTM" and use_count >= 5 and confidence >= 0.65 and trust >= 0.6:
                    conn.execute("UPDATE memory_items SET tier='LTM', updated_at=CURRENT_TIMESTAMP WHERE id=?", (item_id,))
                    append_event(conn, item_id, "manage", "promote", "memory_governor", "ok", {"from": "MTM", "to": "LTM"})
                    summary["promoted"] += 1
                elif tier == "MTM" and age_days > 45 and use_count == 0:
                    conn.execute("UPDATE memory_items SET tier='Archive', status='archived', updated_at=CURRENT_TIMESTAMP WHERE id=?", (item_id,))
                    append_event(conn, item_id, "manage", "archive", "memory_governor", "ok", {"age_days": age_days})
                    summary["archived"] += 1
                elif tier == "LTM" and age_days > 180 and use_count < 2:
                    conn.execute("UPDATE memory_items SET tier='Archive', status='archived', updated_at=CURRENT_TIMESTAMP WHERE id=?", (item_id,))
                    append_event(conn, item_id, "manage", "archive", "memory_governor", "ok", {"age_days": age_days})
                    summary["archived"] += 1

            conn.execute(
                """
                UPDATE memory_consolidation_runs
                SET status='completed', finished_at=CURRENT_TIMESTAMP, items_scanned=?, promoted=?,
                    demoted=?, tombstoned=?, archived=?, duplicates_merged=?, summary_json=?
                WHERE id=?
                """,
                (
                    summary["items_scanned"],
                    summary["promoted"],
                    summary["demoted"],
                    summary["tombstoned"],
                    summary["archived"],
                    summary["duplicates_merged"],
                    json.dumps(summary, sort_keys=True),
                    run_id,
                ),
            )
        except Exception as exc:
            conn.execute(
                "UPDATE memory_consolidation_runs SET status='failed', finished_at=CURRENT_TIMESTAMP, error=? WHERE id=?",
                (str(exc), run_id),
            )
            raise
    return summary


def health(db_path: str = DB_PATH) -> dict[str, Any]:
    with get_conn(db_path) as conn:
        def scalar(sql: str, params: tuple[Any, ...] = ()) -> Any:
            row = conn.execute(sql, params).fetchone()
            return row[0] if row else 0

        total = int(scalar("SELECT COUNT(*) FROM memory_items"))
        stale = int(scalar("SELECT COUNT(*) FROM memory_items WHERE status='active' AND COALESCE(last_accessed_at, updated_at, created_at) < datetime('now', '-90 days')"))
        suppressed = int(scalar("SELECT COUNT(*) FROM memory_items WHERE status IN ('tombstoned', 'quarantined') OR tier='Tombstone'"))
        conflicts = int(scalar("SELECT COUNT(*) FROM memory_relations WHERE relation_type='contradicts'"))
        low_trust = int(scalar("SELECT COUNT(*) FROM memory_items WHERE trust_score < 0.35"))
        latest_research = scalar("SELECT MAX(checked_at) FROM memory_research_sources")
        latest_run = conn.execute("SELECT cycle, status, finished_at FROM memory_consolidation_runs ORDER BY id DESC LIMIT 1").fetchone()
        return {
            "total": total,
            "stale": stale,
            "stale_ratio": round(stale / total, 4) if total else 0,
            "suppressed": suppressed,
            "conflicts": conflicts,
            "low_trust": low_trust,
            "last_research_watch": latest_research,
            "last_consolidation": dict(latest_run) if latest_run else None,
        }


def research_watch(db_path: str = DB_PATH, online: bool = True) -> dict[str, Any]:
    inserted = 0
    with get_conn(db_path) as conn:
        before = conn.total_changes
        seed_research_sources(conn)
        if online:
            for paper in fetch_arxiv_candidates():
                conn.execute(
                    """
                    INSERT INTO memory_research_sources
                      (title, url, publication_date, evidence_grade, venue, relevance_score, implementation_impact, checked_at, status)
                    VALUES (?, ?, ?, 'preprint_candidate', 'arXiv', 0.55, 'queued_for_review', CURRENT_TIMESTAMP, 'review_queue')
                    ON CONFLICT(url) DO UPDATE SET checked_at=CURRENT_TIMESTAMP, updated_at=CURRENT_TIMESTAMP
                    """,
                    (paper["title"], paper["url"], paper.get("published")),
                )
        inserted = conn.total_changes - before
        append_event(conn, None, "research-watch", "scan", "memory_governor", "ok", {"online": online, "changes": inserted})
    return {"changes": inserted, "online": online}


def fetch_arxiv_candidates() -> list[dict[str, str]]:
    query = urllib.parse.quote('all:"memory" AND all:"agent" AND cat:cs.AI')
    url = f"https://export.arxiv.org/api/query?search_query={query}&sortBy=submittedDate&sortOrder=descending&max_results=5"
    try:
        with urllib.request.urlopen(url, timeout=12) as response:
            raw = response.read()
    except Exception:
        return []

    papers: list[dict[str, str]] = []
    root = ET.fromstring(raw)
    ns = {"atom": "http://www.w3.org/2005/Atom"}
    for entry in root.findall("atom:entry", ns):
        title = (entry.findtext("atom:title", default="", namespaces=ns) or "").strip()
        link = (entry.findtext("atom:id", default="", namespaces=ns) or "").strip()
        published = (entry.findtext("atom:published", default="", namespaces=ns) or "").strip()[:10]
        if not published.startswith("2026"):
            continue
        papers.append({"title": re.sub(r"\s+", " ", title), "url": link, "published": published})
    return papers


def main() -> None:
    parser = argparse.ArgumentParser(description="Yuri Memory Governor")
    parser.add_argument("--db", default=DB_PATH)
    sub = parser.add_subparsers(dest="command", required=True)

    p_write = sub.add_parser("write")
    p_write.add_argument("content")
    p_write.add_argument("--type", default="episodic")
    p_write.add_argument("--agent")
    p_write.add_argument("--tag", action="append", default=[])
    p_write.add_argument("--importance", type=int, default=1)
    p_write.add_argument("--source-uri")
    p_write.add_argument("--source-kind", default="kernel")
    p_write.add_argument("--rag-source-path")
    p_write.add_argument("--rag-node-id", type=int)

    p_read = sub.add_parser("read")
    p_read.add_argument("--query")
    p_read.add_argument("--limit", type=int, default=20)
    p_read.add_argument("--include-suppressed", action="store_true")

    p_manage = sub.add_parser("manage")
    p_manage.add_argument("--cycle", choices=["daily", "weekly", "monthly"], default="daily")

    sub.add_parser("backfill")
    sub.add_parser("health")
    p_research = sub.add_parser("research-watch")
    p_research.add_argument("--offline", action="store_true")

    args = parser.parse_args()
    if args.command == "write":
        item_id = governed_write(
            args.content,
            mem_type=args.type,
            source_agent=args.agent,
            tags=args.tag,
            importance=args.importance,
            source_uri=args.source_uri,
            source_kind=args.source_kind,
            rag_source_path=args.rag_source_path,
            rag_node_id=args.rag_node_id,
            db_path=args.db,
        )
        print(json.dumps({"item_id": item_id}, indent=2))
    elif args.command == "read":
        print(json.dumps(governed_read(args.query, args.limit, args.include_suppressed, args.db), indent=2, default=str))
    elif args.command == "manage":
        print(json.dumps(manage(args.cycle, args.db), indent=2, default=str))
    elif args.command == "backfill":
        print(json.dumps(backfill_legacy(args.db), indent=2))
    elif args.command == "health":
        print(json.dumps(health(args.db), indent=2, default=str))
    elif args.command == "research-watch":
        print(json.dumps(research_watch(args.db, online=not args.offline), indent=2, default=str))
    else:
        parser.print_help()
        sys.exit(1)


if __name__ == "__main__":
    main()
