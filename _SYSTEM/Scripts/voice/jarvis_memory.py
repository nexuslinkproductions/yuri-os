#!/usr/bin/env python3
# @capability: jarvis-episodic-memory
# @serves: jarvis persistent memory | voice brain memory db | yuri remembers across restarts | episodic recall | remember tool | jarvis.db
# @does: a lightweight EPISODIC memory store for the Yuri voice brain — SQLite + FTS5 (Python stdlib only,
#        no Node bridge in the voice hot-path). The MODEL decides what's worth remembering (the `remember`
#        tool); per-turn FTS5 cue-recall surfaces relevant past episodes into the system prompt. write_strength
#        is model-judged salience (weight) × reinforcement; full energy-gate |ΔU|·precision integration is V2.
# @use: imported by yuri-z-brain.py. `remember(...)` to commit, `recall(query)` to get a compact recall block,
#        `YURI_Z_MEMORY=0` to disable (degrades to no-op at the wiring seam). DB at _SYSTEM/state/voice/jarvis-memory.db.
# @exports: remember, recall, recall_raw, reinforce, _extract_cues, is_enabled, DB_PATH
#
# WHY NOT the existing organs (capability-first, checked — documented non-fit):
#   memory-canonical-store.mjs = a declarative (subject,predicate,object) TRIPLE store for cross-lane operating
#     truth, governed propose→decide→promote, read-path folds ALL generations + resolves supersede/retract.
#     Wrong SHAPE (voice episodes aren't declarative triples) + wrong LATENCY (heavy periodic fold, not per-turn)
#     + wrong GOVERNANCE (voice episodes are personal episodic context, not Track-A facts other lanes need).
#   spreading-activation-memory.mjs = a personalized-PageRank RANKER over a graph built from .md files, seeded by
#     node IDs (memory handles). A recall RANKER, not a store; needs a Node subprocess + graph rebuild per turn
#     (too slow for voice). Right idea for a V2 ASSOCIATIVE layer on top of this store — not the V1 ground truth.
#   This store is a genuine gap, not a rebuild. It CROSS-LINKS (reads MEMORY.md/canonical facts via the brain's
#   existing startup load) without writing voice episodes into the governed Track-A surface.
import os, re, sqlite3
from datetime import datetime, timezone

# T1 + T2 SEAMS — the brain wired INTO the YURI OS substrate (main-lane serial wiring, 2026-06-19).
# Both are sibling modules; guarded imports so this store stays import-clean in isolation (tests/cold start).
# Each degrades to no-op at its seam: energy absent/disabled → write_strength == plain clamp;
# spreading absent/disabled/empty → associative fill skipped → pure FTS recall (unchanged behavior).
try:
    import jarvis_energy as je      # T1: write_strength = base·(1+surprise)·precision — REAL ΔU salience
    _HAS_ENERGY = True
except Exception:
    je = None
    _HAS_ENERGY = False
try:
    import jarvis_spreading as jsp  # T2: associative (PPR) recall — surfaces episodes connected to the cues
    _HAS_SPREADING = True
except Exception:
    jsp = None
    _HAS_SPREADING = False

# DB lives next to the rolling history (state/voice/) — runtime state, gitignored, NOT a protected surface.
DB_PATH = os.environ.get(
    "YURI_Z_MEMORY_DB",
    os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "..", "state", "voice", "jarvis-memory.db"),
)
ENABLED = os.environ.get("YURI_Z_MEMORY", "1") != "0"

SCHEMA = """
CREATE TABLE IF NOT EXISTS episodes (
  id INTEGER PRIMARY KEY,
  ts TEXT NOT NULL,
  kind TEXT DEFAULT 'episode',
  summary TEXT NOT NULL,
  cues TEXT DEFAULT '',
  tags TEXT DEFAULT '',
  weight REAL DEFAULT 1.0,
  reinforced INTEGER DEFAULT 0,
  last_recalled_ts TEXT,
  transcript_ref TEXT DEFAULT ''
);
CREATE VIRTUAL TABLE IF NOT EXISTS episodes_fts USING fts5(
  summary, cues, tags, content='episodes', content_rowid='id', tokenize='porter unicode61'
);
CREATE TRIGGER IF NOT EXISTS episodes_ai AFTER INSERT ON episodes BEGIN
  INSERT INTO episodes_fts(rowid, summary, cues, tags) VALUES (new.id, new.summary, new.cues, new.tags);
END;
CREATE TRIGGER IF NOT EXISTS episodes_ad AFTER DELETE ON episodes BEGIN
  INSERT INTO episodes_fts(episodes_fts, rowid, summary, cues, tags) VALUES('delete', old.id, old.summary, old.cues, old.tags);
END;
CREATE TRIGGER IF NOT EXISTS episodes_au AFTER UPDATE ON episodes BEGIN
  INSERT INTO episodes_fts(episodes_fts, rowid, summary, cues, tags) VALUES('delete', old.id, old.summary, old.cues, old.tags);
  INSERT INTO episodes_fts(rowid, summary, cues, tags) VALUES (new.id, new.summary, new.cues, new.tags);
END;
"""

# Minimal English stopword set — cue extraction keeps content words (high-signal FTS seeds).
_STOP = set("""the a an and or but is are was were be been being to of in on at for with from by as you i me my
mine your yours it its this that these those he him his she her hers they them their we our ours do does did done
have has had not no yes so if then than there here just very really about into over after before up down out off
again once will would could should can may might must shall what which who whom whose when where why how all any
both each few more most other some such only own same too also more most get got go going want need like tell said
now""".split())

_LEXEME = re.compile(r"[a-z][a-z0-9]{2,}")


def is_enabled():
    return ENABLED


def _now():
    return datetime.now(timezone.utc).isoformat()


def _connect(db=None):
    path = db or DB_PATH
    os.makedirs(os.path.dirname(path), exist_ok=True)
    c = sqlite3.connect(path, timeout=5)
    c.executescript(SCHEMA)
    return c


def remember(summary, cues="", kind="episode", tags="", weight=1.0, transcript_ref="", db=None):
    """Commit an episode. The MODEL is the judge of surprise/salience (weight 0.1–5). Returns a short ack.
    Routine op — never confirm-gated (memory is neither destructive nor outward-facing)."""
    if not ENABLED:
        return "memory disabled"
    summary = (summary or "").strip()
    if not summary:
        return "nothing to remember"
    try:
        base = float(weight or 1.0)
    except (TypeError, ValueError):
        base = 1.0
    # T1 SEAM: enrich the model-judged weight with the system's REAL energy surprise
    # (write_strength = base·(1+surprise)·precision, clamped [0.1,5]). surprise_score() reads the
    # energy-gate ΔU trace (READ-ONLY). When jarvis_energy is absent/disabled, surprise=0 →
    # write_strength(base) reduces to the plain clamp, so behavior is unchanged (non-fatal degrade).
    if _HAS_ENERGY:
        try:
            w = je.write_strength(base)
        except Exception:
            w = max(0.1, min(base, 5.0))
    else:
        w = max(0.1, min(base, 5.0))
    # Auto-extract cues from the summary if the model didn't supply any (defensive — don't lose the signal).
    cues = (cues or "").strip() or _extract_cues(summary)
    kind = kind if kind in ("fact", "preference", "commitment", "episode") else "episode"
    c = _connect(db)
    try:
        c.execute(
            "INSERT INTO episodes(ts, kind, summary, cues, tags, weight, transcript_ref) VALUES(?,?,?,?,?,?,?)",
            (_now(), kind, summary, cues, (tags or "").strip(), w, (transcript_ref or "").strip()),
        )
        c.commit()
        return f"remembered ({kind}): {summary[:90]}"
    except sqlite3.Error as e:
        return f"memory write failed: {str(e)[:60]}"
    finally:
        c.close()


def _extract_cues(text):
    """Content-word extraction for recall seeding: lowercase, drop stopwords + short tokens. FTS does the ranking."""
    toks = _LEXEME.findall((text or "").lower())
    return " ".join(t for t in toks if t not in _STOP)[:500]


def _fts_query(text):
    """Build a safe FTS5 OR-query from content words. Quotes each term; empty → None (caller skips recall)."""
    words = [w for w in _extract_cues(text).split() if w]
    if not words:
        return None
    # de-dup, cap at 12 terms (a long utterance shouldn't fan out the MATCH into noise)
    seen, terms = set(), []
    for w in words:
        if w in seen:
            continue
        seen.add(w)
        terms.append('"' + w.replace('"', "") + '"')
        if len(terms) >= 12:
            break
    return " OR ".join(terms)


def recall_raw(query, limit=5, db=None):
    """Ranked recall as a list of dicts (id, summary, kind, tags, weight, reinforced, ts, score).

    FTS5 BM25 × weight ranks DIRECT cue matches (authoritative). Then the T2 ASSOCIATIVE layer fills
    remaining slots with episodes CONNECTED to the query's cues via personalized PageRank that FTS did
    NOT directly match — the spreading-activation value FTS alone misses. Degrades to pure FTS when
    spreading is absent/disabled/empty (identical to pre-V2 behavior). Empty on no-match / disabled /
    malformed query (recall is NON-FATAL — the brain works without it)."""
    if not ENABLED:
        return []
    fts = _fts_query(query)
    if not fts:
        return []   # no content words → no FTS match AND no PPR seeds
    c = _connect(db)
    try:
        # bm25 lower (more negative) = better match; multiply by effective weight (weight × reinforcement boost)
        # so better-match AND higher-salience both rank first under ASC. Reinforcement folds recency in.
        rows = c.execute(
            """SELECT e.id, e.summary, e.kind, e.tags, e.weight, e.reinforced, e.ts,
                      bm25(episodes_fts) AS bm25
               FROM episodes_fts
               JOIN episodes e ON e.id = episodes_fts.rowid
               WHERE episodes_fts MATCH ?
               ORDER BY bm25(episodes_fts) * (e.weight * (1.0 + 0.2 * e.reinforced)) ASC
               LIMIT ?""",
            (fts, int(limit)),
        ).fetchall()
        out = [
            {"id": r[0], "summary": r[1], "kind": r[2], "tags": r[3], "weight": r[4],
             "reinforced": r[5], "ts": r[6], "score": round(r[7], 3)}
            for r in rows
        ]
        # T2 SEAM — associative fill: PPR over the episode graph surfaces episodes that SHARE cues/tags with
        # a matched episode but didn't directly match the query (the spreading recall FTS misses). FTS direct
        # matches stay authoritative + weight-ranked; associative items fill remaining slots, ranked by PPR
        # activation. READ-ONLY on the store. Non-fatal: any fault → FTS results stand unchanged.
        if _HAS_SPREADING and len(out) < int(limit):
            try:
                if jsp.is_enabled():
                    assoc = jsp.associative_recall(query, db=db, limit=int(limit) * 3)
                    if assoc:
                        seen = {str(o["id"]) for o in out}
                        act = {str(r["id"]): float(r.get("activation") or 0.0) for r in assoc}
                        assoc_only = [eid for eid in act if eid not in seen]
                        if assoc_only:
                            ph = ",".join("?" for _ in assoc_only)
                            extra = c.execute(
                                f"SELECT id, summary, kind, tags, weight, reinforced, ts "
                                f"FROM episodes WHERE id IN ({ph})",
                                assoc_only,
                            ).fetchall()
                            for r in sorted(extra, key=lambda x: -act.get(str(x[0]), 0.0)):
                                out.append({"id": r[0], "summary": r[1], "kind": r[2], "tags": r[3],
                                            "weight": r[4], "reinforced": r[5], "ts": r[6],
                                            "score": round(act.get(str(r[0]), 0.0), 3)})
                                if len(out) >= int(limit):
                                    break
            except Exception:
                pass   # associative fill is non-fatal — FTS results stand
        # RECALL IS A WRITE (reconsolidation): reinforce the recalled ids + stamp last_recalled_ts.
        if out:
            ids = ",".join(str(o["id"]) for o in out)
            c.execute(f"UPDATE episodes SET reinforced = reinforced + 1, last_recalled_ts = ? WHERE id IN ({ids})", (_now(),))
            c.commit()
        return out
    except sqlite3.Error:
        return []   # malformed MATCH / DB hiccup → degrade silently (no recall this turn)
    finally:
        c.close()


def _rel_time(ts):
    """Human relative time for the recall block ('2d ago', '5h ago', 'just now')."""
    try:
        then = datetime.fromisoformat(ts.replace("Z", "+00:00"))
        secs = max(0, (datetime.now(timezone.utc) - then).total_seconds())
    except Exception:
        return "?"
    if secs < 60:
        return "just now"
    if secs < 3600:
        return f"{int(secs // 60)}m ago"
    if secs < 86400:
        return f"{int(secs // 3600)}h ago"
    return f"{int(secs // 86400)}d ago"


def recall(query, limit=5, db=None):
    """A compact spoken-context recall block for the system prompt, or '' when nothing relevant.
    Injected per-turn so Yuri recalls across restarts (the frozen startup MEMORY.md can't do this)."""
    rows = recall_raw(query, limit=limit, db=db)
    if not rows:
        return ""
    lines = ["## RECALLED MEMORY (past episodes — use ONLY if relevant to what Marcel just said; don't mention these unless they apply)"]
    for r in rows:
        tag = f"[{r['kind']}, {_rel_time(r['ts'])}]"
        lines.append(f"- {tag} {r['summary']}")
    return "\n".join(lines)


def reinforce(epid, db=None):
    """Externally reinforce a specific episode (e.g. the model re-confirms a fact). Best-effort."""
    if not ENABLED or not epid:
        return False
    c = _connect(db)
    try:
        c.execute("UPDATE episodes SET reinforced = reinforced + 1, last_recalled_ts = ? WHERE id = ?", (_now(), int(epid)))
        c.commit()
        return c.total_changes > 0
    except sqlite3.Error:
        return False
    finally:
        c.close()


if __name__ == "__main__":
    import sys
    cmd = (sys.argv[1] if len(sys.argv) > 1 else "stats")
    if cmd == "stats":
        c = _connect()
        try:
            n = c.execute("SELECT COUNT(*) FROM episodes").fetchone()[0]
            kinds = c.execute("SELECT kind, COUNT(*) FROM episodes GROUP BY kind").fetchall()
            print(f"jarvis-memory.db: {n} episodes")
            for k, cnt in kinds:
                print(f"  {k}: {cnt}")
        finally:
            c.close()
    elif cmd == "recent":
        c = _connect()
        try:
            for r in c.execute("SELECT id, ts, kind, summary FROM episodes ORDER BY id DESC LIMIT 10"):
                print(f"[{r[0]}] {r[1]} ({r[2]}) {r[3]}")
        finally:
            c.close()
    elif cmd == "recall":
        print(recall(" ".join(sys.argv[2:])))
    elif cmd == "purge":
        # destructive — only via explicit CLI, never from the brain
        c = _connect()
        try:
            c.execute("DELETE FROM episodes"); c.commit()
            print("purged all episodes")
        finally:
            c.close()
    else:
        print("usage: jarvis_memory.py [stats|recent|recall <q>|purge]")
