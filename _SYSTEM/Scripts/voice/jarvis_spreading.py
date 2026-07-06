#!/usr/bin/env python3
# @capability: jarvis-associative-recall
# @serves: jarvis associative memory | spreading-activation recall over episodes | personalized PageRank recall for the voice brain
# @does: an ASSOCIATIVE recall layer (V2) on top of jarvis_memory's SQLite episode store — builds an episode
#        graph (nodes=episodes, edges from shared cues/tags/kind) and runs personalized PageRank power iteration
#        seeded by the current utterance's content-words, returning ranked {id, activation}. PURE PYTHON mirror of
#        _SYSTEM/Scripts/spreading-activation-memory.mjs:recall() (damping=0.85, iterations=30, use-count prior).
#        Node-free by design — the voice hot-path never shells a Node subprocess.
# @use: imported by yuri-z-brain.py / jarvis_memory. `associative_recall(query)` → ranked ids for rank-fusion
#        with FTS5; `build_graph(db)` → cached episode graph (rebuilt only when episode row-count changes).
#        `JARVIS_SPREADING=0` disables (degrades to [] at the wiring seam). READ-ONLY on the episode store.
# @exports: build_graph, associative_recall, is_enabled
#
# ALGORITHM PROVENANCE — this is a faithful Python port of the canonical organ:
#   _SYSTEM/Scripts/spreading-activation-memory.mjs :: recall(graph, seedIds, {damping=0.85, iterations=30, useCountBoost=0.1})
#     - teleport vector = uniform over valid seeds
#     - column-normalized sparse transition (undirected edges, lexicographic dedup)
#     - dangling nodes (zero out-degree) redistribute their mass back to the seed set
#     - power iteration: v = damping * (M·v) + (1-damping) * tp
#     - node prior multiplier: 1 + useCountBoost * ln(1 + useCount)
#   The .mjs is the single source of truth for the numerics; any divergence is a bug.
#
# EDGE MODEL (mirrors ingestMemoryDir's edge rules, adapted to episodes):
#   shared cue   → weight 1.0  (cue is an explicit descriptor, same class as a wiki-link)
#   shared tag   → weight 1.0  (tag is an explicit descriptor)
#   shared kind  → weight 0.2  (kind is a coarse category, same class as metadata.type's 0.2 clique)
#   self-loop    → excluded    (ek(a,a) = ∅ in the .mjs)
# Why no co-recall edges: hebbianCoRecall in the .mjs is a CALLER-side reinforcement, not part of graph build.
# The episode store has no co-recall log; fusing that would require a WRITE (forbidden here — READ-ONLY).
import os
import re
import math
import sqlite3

# Gate behind an env flag (default ON, per the brief). JARVIS_SPREADING=0 disables at the seam.
ENABLED = os.environ.get("JARVIS_SPREADING", "1") != "0"

# DB_PATH mirrors jarvis_memory.DB_PATH exactly (same env override, same resolution). Resolved lazily so a
# missing jarvis_memory import (e.g. standalone test) never breaks this module.
def _resolve_db_path():
    env = os.environ.get("YURI_Z_MEMORY_DB")
    if env:
        return env
    # Match jarvis_memory.py's resolution: voice/../state/voice/jarvis-memory.db
    here = os.path.dirname(os.path.abspath(__file__))
    return os.path.join(here, "..", "..", "state", "voice", "jarvis-memory.db")

# Minimal English stopword set + content-word lexer — mirrored from jarvis_memory._extract_cues so seed
# extraction matches how episodes were stored (a divergence here would silently mis-seed the PPR).
_STOP = set("""the a an and or but is are was were be been being to of in on at for with from by as you i me my
mine your yours it its this that these those he him his she her hers they them their we our ours do does did done
have has had not no yes so if then than there here just very really about into over after before up down out off
again once will would could should can may might must shall what which who whom whose when where why how all any
both each few more most other some such only own same too also get got go going want need like tell said now""".split())
_LEXEME = re.compile(r"[a-z][a-z0-9]{2,}")


def _extract_cues(text):
    """Content-word extraction (mirrors jarvis_memory._extract_cues). Seeds for PPR must match stored cues."""
    toks = _LEXEME.findall((text or "").lower())
    return [t for t in toks if t not in _STOP]


def is_enabled():
    return ENABLED


# ── Graph (pure-Python mirror of the .mjs createGraph/addNode/addEdge) ──────────────────────────────
#
# Graph shape (intentionally close to the .mjs so the PPR math is a 1:1 port):
#   nodes: dict[id_str] -> {"use_count": int}
#   edges: dict["a|b" (lexicographic)] -> {"w": float}      (undirected, self-loops excluded)
class _Graph:
    # _cue_index is the memoized cue/tag/kind -> set(node-id) index used for query seeding. Built once per
    # graph (when the graph is built from episodes), so seeding never re-reads the store per turn.
    __slots__ = ("nodes", "edges", "_cue_index")

    def __init__(self):
        self.nodes = {}   # id(str) -> {"use_count": int}
        self.edges = {}   # "a|b" -> {"w": float}
        self._cue_index = None   # built by _build_graph_from_episodes, consumed by _seed_nodes_from_query

    def add_node(self, nid, use_count=1):
        # .mjs addNode: insert with defaults if new; use_count is set-once here (episodes carry a fixed value).
        if nid not in self.nodes:
            self.nodes[nid] = {"use_count": int(use_count) if use_count else 1}

    def add_edge(self, a, b, w=1.0):
        # .mjs addEdge: self-loop = no-op; lexicographic key; accumulate weight.
        if a == b:
            return
        key = "%s|%s" % (a, b) if a < b else "%s|%s" % (b, a)
        e = self.edges.get(key)
        if e is not None:
            e["w"] += w
        else:
            self.edges[key] = {"w": float(w)}


def _rowcount(conn):
    """Episode row-count (cache key). Returns 0 if the table is absent (cold start / foreign DB)."""
    try:
        r = conn.execute("SELECT COUNT(*) FROM episodes").fetchone()
        return int(r[0]) if r else 0
    except sqlite3.Error:
        return 0


def _load_episodes(conn):
    """READ-ONLY fetch of the episode columns the graph needs. Returns [] on any error (non-fatal)."""
    try:
        rows = conn.execute(
            "SELECT id, cues, tags, kind, reinforced FROM episodes"
        ).fetchall()
    except sqlite3.Error:
        return []
    out = []
    for r in rows:
        eid = str(r[0])
        cues = set(_extract_cues(r[1] or "")) if r[1] else set()
        tags = set(t for t in str(r[2] or "").split() if t) if r[2] else set()
        kind = (r[3] or "").strip() if r[3] is not None else ""
        # use_count prior: reinforced is the episode's reconsolidation counter; +1 so never-zero
        # (mirrors the .mjs default useCount=1 on addNode).
        try:
            reinforced = int(r[4]) if r[4] is not None else 0
        except (TypeError, ValueError):
            reinforced = 0
        out.append({"id": eid, "cues": cues, "tags": tags, "kind": kind, "use_count": reinforced + 1})
    return out


def _build_graph_from_episodes(episodes):
    """Construct the episode graph: nodes=episodes, edges from shared cues/tags/kind (see EDGE MODEL above).

    Edge construction is O(N) over per-attribute buckets (not O(N^2) pair scan) — episodes sharing an
    attribute land in the same bucket and get clique-connected, exactly like ingestMemoryDir's typeMap pass.
    """
    g = _Graph()
    for ep in episodes:
        g.add_node(ep["id"], use_count=ep["use_count"])

    # Bucket by cue / tag / kind, then clique-connect each bucket. Weight per EDGE is accumulated across
    # shared attributes (two episodes sharing 2 cues get weight 2.0 on their edge — same as the .mjs
    # addEdge accumulation when two wiki-links point the same pair).
    def _clique(members, weight):
        members = [m for m in members if m in g.nodes]
        for i in range(len(members)):
            mi = members[i]
            for j in range(i + 1, len(members)):
                g.add_edge(mi, members[j], weight)

    cue_buckets = {}
    tag_buckets = {}
    kind_buckets = {}
    # cue_index: word -> set(node-id), consumed by _seed_nodes_from_query so seeding never re-reads the store.
    cue_index = {}
    for ep in episodes:
        nid = ep["id"]
        for cu in ep["cues"]:
            cue_buckets.setdefault(cu, []).append(nid)
            cue_index.setdefault(cu, set()).add(nid)
        for tg in ep["tags"]:
            tag_buckets.setdefault(tg, []).append(nid)
            cue_index.setdefault(tg, set()).add(nid)
        if ep["kind"]:
            kl = ep["kind"].lower()
            kind_buckets.setdefault(ep["kind"], []).append(nid)
            cue_index.setdefault(kl, set()).add(nid)

    for members in cue_buckets.values():
        _clique(members, 1.0)
    for members in tag_buckets.values():
        _clique(members, 1.0)
    # kind clique weight 0.2 (mirrors ingestMemoryDir's shared-metadata.type 0.2 weight).
    for members in kind_buckets.values():
        _clique(members, 0.2)
    g._cue_index = cue_index
    return g


# In-process cache: {db_path: (graph, rowcount_at_build)}. Rebuild only when row-count changes.
# (Module-global, not per-call — the voice loop calls associative_recall every turn; rebuilding PPR graphs
#  hundreds of times per turn is the cost the brief explicitly tells us to avoid.)
_GRAPH_CACHE = {}


def build_graph(db=None):
    """Build (or return cached) episode graph. READ-ONLY on the store. Returns None if disabled / empty / absent."""
    if not ENABLED:
        return None
    path = db or _resolve_db_path()
    cached = _GRAPH_CACHE.get(path)
    if not os.path.exists(path):
        # Cold start: DB not created yet. Degrade to None (callers return []).
        if cached is not None:
            del _GRAPH_CACHE[path]
        return None
    try:
        conn = sqlite3.connect(path, timeout=5)
    except sqlite3.Error:
        return None
    try:
        rc = _rowcount(conn)
    finally:
        conn.close()
    if rc == 0:
        if cached is not None:
            del _GRAPH_CACHE[path]
        return None
    if cached is not None and cached[1] == rc:
        return cached[0]
    # Rebuild: open read-only, load episodes, construct graph.
    try:
        conn = sqlite3.connect("file:%s?mode=ro" % path, uri=True, timeout=5)
    except sqlite3.Error:
        return None
    try:
        episodes = _load_episodes(conn)
    finally:
        conn.close()
    if not episodes:
        return None
    g = _build_graph_from_episodes(episodes)
    _GRAPH_CACHE[path] = (g, rc)
    return g


# ── Personalized PageRank (1:1 port of spreading-activation-memory.mjs:recall) ───────────────────────
def _ppr(graph, seed_ids, damping=0.85, iterations=30, use_count_boost=0.1):
    """Personalized PageRank power iteration with dangling→seeds redistribution + use-count prior.

    Returns list of {id, activation} sorted desc by activation (ties broken by id asc), zero excluded.
    Mirrors recall() in spreading-activation-memory.mjs line-for-line in the numerics.
    """
    nids = list(graph.nodes.keys())
    n = len(nids)
    if n == 0:
        return []
    idx = {nid: i for i, nid in enumerate(nids)}
    # Keep only seeds that are real nodes (the .mjs does seedIds.filter(s => graph.nodes.has(s))).
    seeds = [s for s in seed_ids if s in graph.nodes]
    if not seeds:
        return []
    inv_s = 1.0 / len(seeds)

    # Teleport vector: uniform over valid seeds.
    tp = [0.0] * n
    for s in seeds:
        tp[idx[s]] = inv_s

    # Sparse adjacency (undirected): for each edge a|b, both (a->b) and (b->a) get weight w.
    adj = [[] for _ in range(n)]
    for key, e in graph.edges.items():
        sep = key.find("|")
        if sep < 0:
            continue
        a_id, b_id = key[:sep], key[sep + 1:]
        ai = idx.get(a_id)
        bi = idx.get(b_id)
        if ai is None or bi is None:
            continue
        w = e["w"]
        adj[ai].append((bi, w))
        adj[bi].append((ai, w))

    # Column-normalized transition + dangling set (nodes with zero out-degree).
    # col[j] = list of (i, w / col_sum_j); dangling nodes j contribute their mass to the seeds.
    col = [[] for _ in range(n)]
    dangling = []
    for j in range(n):
        s = 0.0
        for (_, w) in adj[j]:
            s += w
        if s > 0.0:
            for (i, w) in adj[j]:
                col[j].append((i, w / s))
        else:
            dangling.append(j)

    # Power iteration. v starts at the teleport vector (matches v.set(tp) in the .mjs).
    v = list(tp)
    v2 = [0.0] * n
    for _t in range(iterations):
        for i in range(n):
            v2[i] = 0.0
        for j in range(n):
            vj = v[j]
            if vj == 0.0:
                continue
            for (i, cw) in col[j]:
                v2[i] += vj * cw
        if dangling:
            dm = 0.0
            for d in dangling:
                dm += v[d]
            if dm > 0.0:
                dp = dm * inv_s
                for s in seeds:
                    v2[idx[s]] += dp
        for i in range(n):
            v2[i] = damping * v2[i] + (1.0 - damping) * tp[i]
        v, v2 = v2, v

    # Apply node prior (1 + useCountBoost * ln(1 + useCount)) and collect non-zero.
    results = []
    for i in range(n):
        vi = v[i]
        if vi <= 0.0:
            continue
        uc = graph.nodes[nids[i]]["use_count"]
        prior = 1.0 + use_count_boost * math.log1p(uc)   # log1p(x) = ln(1+x), exact mirror of Math.log(1+useCount)
        results.append({"id": nids[i], "activation": vi * prior})
    # Sort desc by activation, ties broken by id asc (mirrors the .mjs comparator).
    results.sort(key=lambda r: (-r["activation"], r["id"]))
    return results


def associative_recall(query, db=None, limit=5):
    """Associative recall over the episode graph: PPR seeded by the query's content-words.

    Returns list of {id, activation} ranked desc; [] when disabled, DB absent/empty, or query has no
    content-words that map to known episode nodes. READ-ONLY — never writes episodes.
    """
    if not ENABLED:
        return []
    graph = build_graph(db=db)
    if graph is None or not graph.nodes:
        return []
    # Seed by content-words of the query: any episode node whose id matches a content-word is a seed.
    # (Episode ids are integers-as-strings; content-words are lexemes. The realistic seed path is: an
    #  episode shares a cue/tag with the query → it's connected to the seed neighborhood. We seed the
    #  nodes whose stored cues/tags overlap the query's content-words — those are the "recall seeds".)
    seed_ids = _seed_nodes_from_query(graph, query)
    if not seed_ids:
        return []
    ranked = _ppr(graph, seed_ids)
    if limit is not None and limit > 0:
        ranked = ranked[:int(limit)]
    return ranked


def _seed_nodes_from_query(graph, query):
    """Map query content-words to graph seed nodes (deterministic, no embeddings).

    A node is a seed if any of its episode's cues/tags/kind appears as a content-word in the query.
    Uses the memoized _cue_index built at graph-construction time — no per-turn store re-read.
    """
    qwords = _extract_cues(query)
    if not qwords:
        return []
    index = graph._cue_index or {}
    seeds = set()
    for qw in qwords:
        ids = index.get(qw)
        if ids:
            seeds.update(ids)
    # Defensive: only seeds that are real nodes (the index is built from the same node set, so this is a no-op
    # in practice, but it costs nothing and guards against a stale index).
    return [s for s in seeds if s in graph.nodes]


def _read_episode_attributes(db_path, graph):
    """Deprecated stub — kept only to avoid breaking any external import. The cue index is now built at
    graph construction (_build_graph_from_episodes). Returns {} (no caller relies on this anymore)."""
    return {}


def _build_cue_index(graph, episode_attrs):
    """Deprecated stub — kept only to avoid breaking any external import. The cue index is now built at
    graph construction. Returns {}."""
    return {}


if __name__ == "__main__":
    import sys
    cmd = sys.argv[1] if len(sys.argv) > 1 else "stats"
    if cmd == "stats":
        g = build_graph()
        if g is None:
            print("jarvis-spreading: no episode graph (DB absent/empty or disabled)")
        else:
            print("jarvis-spreading: %d nodes, %d edges" % (len(g.nodes), len(g.edges)))
    elif cmd == "recall":
        q = " ".join(sys.argv[2:])
        for r in associative_recall(q):
            print("%s\t%.6f" % (r["id"], r["activation"]))
    else:
        print("usage: jarvis_spreading.py [stats|recall <q>]")
