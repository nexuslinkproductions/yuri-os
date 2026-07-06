#!/usr/bin/env python3
# test_jarvis_spreading.py — GREEN/RED/metamorphic coverage for jarvis_spreading (T2)
#
# Self-contained: builds a throwaway SQLite episode store using jarvis_memory's SCHEMA (so the graph reads the
# REAL table shape), runs PPR, and verifies the canonical numerics. No external services, no pip.
import os
import sys
import sqlite3
import tempfile
import unittest

_HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, _HERE)

import jarvis_spreading as js
import jarvis_memory as jm   # for SCHEMA + remember() — exercises the real store shape

# Force the spreading layer ON for tests (env may have JARVIS_SPREADING=0 in some shells).
os.environ["JARVIS_SPREADING"] = "1"
js.ENABLED = True


def _make_db(tmpdir, episodes):
    """Create a fresh episode DB with jarvis_memory's SCHEMA and insert the given episode rows.
    episodes: list of dicts with keys matching remember()'s args. Returns the db path."""
    path = os.path.join(tmpdir, "test-episodes.db")
    conn = sqlite3.connect(path)
    conn.executescript(jm.SCHEMA)
    conn.commit()
    conn.close()
    # Use remember() so the FTS triggers + ts + defaults match production exactly.
    for ep in episodes:
        jm.remember(
            summary=ep["summary"],
            cues=ep.get("cues", ""),
            kind=ep.get("kind", "episode"),
            tags=ep.get("tags", ""),
            weight=ep.get("weight", 1.0),
            db=path,
        )
    return path


class TestJarvisSpreadingGREEN(unittest.TestCase):
    """Happy path: build_graph from a populated store + associative_recall returns ranked ids."""

    def setUp(self):
        self.tmp = tempfile.mkdtemp(prefix="jarvis-spread-")
        self.db = _make_db(self.tmp, [
            {"summary": "marcel likes rust", "cues": "marcel rust preference", "kind": "preference", "tags": "lang rust"},
            {"summary": "marcel deploys rust service", "cues": "marcel rust deploy", "kind": "episode", "tags": "deploy rust"},
            {"summary": "alice prefers python", "cues": "alice python preference", "kind": "preference", "tags": "lang python"},
            {"summary": "grocery list milk eggs", "cues": "grocery milk eggs", "kind": "episode", "tags": "shop food"},
            {"summary": "rust async runtime tokio", "cues": "rust async tokio runtime", "kind": "fact", "tags": "rust lang"},
        ])
        # Clear the in-process cache so each test builds from its own DB.
        js._GRAPH_CACHE.clear()

    def tearDown(self):
        js._GRAPH_CACHE.clear()

    def test_build_graph_returns_nodes_and_edges(self):
        g = js.build_graph(db=self.db)
        self.assertIsNotNone(g, "graph should build from a populated store")
        self.assertEqual(len(g.nodes), 5, "one node per episode")
        # rust is shared by eps 1,2,5 → clique edges (1-2, 1-5, 2-5); marcel shared by 1,2 (1-2);
        # preference/kind shared by 1,3 (1-3); lang tag shared by 1,3,5 (1-3,1-5,3-5); etc. At least the
        # rust clique + marcel + lang + preference-kind edges exist.
        self.assertGreaterEqual(len(g.edges), 3, "shared cues/tags/kind must produce edges")
        # Self-loops must never exist (ek(a,a)=∅ in the .mjs).
        for key in g.edges:
            a, b = key.split("|", 1)
            self.assertNotEqual(a, b, "no self-loop edge: %s" % key)

    def test_associative_recall_returns_ranked_ids(self):
        res = js.associative_recall("tell me about rust", db=self.db)
        self.assertIsInstance(res, list)
        self.assertGreater(len(res), 0, "rust query must hit cue-overlapping episodes")
        # Every result is {id, activation} with activation > 0.
        for r in res:
            self.assertIn("id", r)
            self.assertIn("activation", r)
            self.assertGreater(r["activation"], 0.0)
        # Descending activation order.
        acts = [r["activation"] for r in res]
        self.assertEqual(acts, sorted(acts, reverse=True), "results must be sorted by activation desc")

    def test_limit_truncates(self):
        res_full = js.associative_recall("rust", db=self.db, limit=100)
        res_lim = js.associative_recall("rust", db=self.db, limit=2)
        self.assertEqual(len(res_lim), min(2, len(res_full)), "limit must truncate")

    def test_no_content_words_returns_empty(self):
        # "the a an" are all stopwords → no seeds → [].
        self.assertEqual(js.associative_recall("the a an", db=self.db), [])

    def test_off_topic_query_returns_empty(self):
        # No episode shares a cue with "quantum entanglement boson".
        self.assertEqual(js.associative_recall("quantum entanglement boson", db=self.db), [])


class TestJarvisSpreadingRED(unittest.TestCase):
    """Degrade / cold-start: disabled, absent DB, empty DB, foreign DB."""

    def setUp(self):
        js._GRAPH_CACHE.clear()

    def tearDown(self):
        js._GRAPH_CACHE.clear()
        js.ENABLED = True

    def test_disabled_returns_none_and_empty(self):
        js.ENABLED = False
        self.assertIsNone(js.build_graph(db="/dev/null"))
        self.assertEqual(js.associative_recall("anything", db="/dev/null"), [])

    def test_absent_db_returns_none(self):
        # A path that does not exist → cold start degrade.
        self.assertIsNone(js.build_graph(db="/nonexistent/path/jarvis.db"))
        self.assertEqual(js.associative_recall("rust", db="/nonexistent/path/jarvis.db"), [])

    def test_empty_db_returns_none(self):
        tmp = tempfile.mkdtemp(prefix="jarvis-empty-")
        path = os.path.join(tmp, "empty.db")
        conn = sqlite3.connect(path)
        conn.executescript(jm.SCHEMA)
        conn.commit()
        conn.close()
        self.assertIsNone(js.build_graph(db=path), "zero-row store must degrade to None")
        self.assertEqual(js.associative_recall("rust", db=path), [])

    def test_foreign_db_no_episodes_table_returns_none(self):
        # A DB with no episodes table → _rowcount catches the OperationalError → degrade.
        tmp = tempfile.mkdtemp(prefix="jarvis-foreign-")
        path = os.path.join(tmp, "foreign.db")
        conn = sqlite3.connect(path)
        conn.execute("CREATE TABLE other(x INTEGER)")
        conn.commit()
        conn.close()
        self.assertIsNone(js.build_graph(db=path))


class TestJarvisSpreadingMetamorphic(unittest.TestCase):
    """Metamorphic checks required by the brief:
      (1) PPR recall is STABLE across repeated identical calls (deterministic power iteration — no randomness).
      (2) Higher-cue-overlap episodes rank HIGHER (the mechanism the integration relies on).
    """

    def setUp(self):
        self.tmp = tempfile.mkdtemp(prefix="jarvis-meta-")
        self.db = _make_db(self.tmp, [
            # Ep A: shares 3 cues with the seed neighborhood ("rust", "marcel", "deploy")
            {"summary": "marcel deploys rust service", "cues": "marcel rust deploy", "kind": "episode", "tags": "rust deploy"},
            # Ep B: shares 1 cue ("rust")
            {"summary": "rust async runtime tokio", "cues": "rust async tokio", "kind": "fact", "tags": "lang"},
            # Ep C: unrelated (control)
            {"summary": "grocery list milk eggs", "cues": "grocery milk eggs", "kind": "episode", "tags": "shop"},
        ])
        js._GRAPH_CACHE.clear()

    def tearDown(self):
        js._GRAPH_CACHE.clear()

    def test_recall_stable_across_repeated_calls(self):
        """Same query, same DB → identical result list (PPR is deterministic)."""
        r1 = js.associative_recall("marcel rust deploy", db=self.db)
        r2 = js.associative_recall("marcel rust deploy", db=self.db)
        r3 = js.associative_recall("marcel rust deploy", db=self.db)
        self.assertEqual(r1, r2, "PPR must be deterministic: call 1 == call 2")
        self.assertEqual(r2, r3, "PPR must be deterministic: call 2 == call 3")

    def test_higher_cue_overlap_ranks_higher(self):
        """Ep A (shares marcel+rust+deploy cues with the query) must outrank Ep B (shares only 'rust')."""
        res = js.associative_recall("marcel rust deploy", db=self.db)
        ids = [r["id"] for r in res]
        # Episode ids are insertion order (1=A, 2=B, 3=C). A must precede B.
        self.assertIn("1", ids, "Ep A must be recalled")
        self.assertIn("2", ids, "Ep B must be recalled")
        self.assertLess(ids.index("1"), ids.index("2"),
                        "Ep A (3 shared cues) must rank higher than Ep B (1 shared cue)")

    def test_ppr_matches_direct_call(self):
        """associative_recall must equal a direct _ppr call on the same graph+seeds (no hidden transform)."""
        g = js.build_graph(db=self.db)
        seeds = js._seed_nodes_from_query(g, "marcel rust deploy")
        direct = js._ppr(g, seeds)
        via_api = js.associative_recall("marcel rust deploy", db=self.db, limit=10000)
        self.assertEqual(direct, via_api, "associative_recall must be a thin wrapper over _ppr")


class TestJarvisSpreadingPPRNumerics(unittest.TestCase):
    """Verify the PPR math against the canonical algorithm: damping=0.85, iterations=30, use-count prior."""

    def test_two_node_graph_known_answer(self):
        """Two nodes connected by one edge, both seeded. PPR converges to a known closed form.

        Symmetric 2-node graph: M = [[0,1],[1,0]] (column-stochastic). With both nodes seeded (tp=[0.5,0.5])
        and damping d, the fixed point is uniform (v=[0.5,0.5]) — symmetric input + symmetric graph →
        symmetric output. The prior then scales each by 1 + 0.1*ln(1+use_count).
        """
        g = js._Graph()
        g.add_node("1", use_count=1)
        g.add_node("2", use_count=1)
        g.add_edge("1", "2", 1.0)
        res = js._ppr(g, ["1", "2"])
        self.assertEqual(len(res), 2)
        # Equal use_count → equal activation (symmetry). Check they're within float tolerance.
        a1 = next(r["activation"] for r in res if r["id"] == "1")
        a2 = next(r["activation"] for r in res if r["id"] == "2")
        self.assertAlmostEqual(a1, a2, places=9, msg="symmetric graph+seeds → symmetric activation")
        # Each is 0.5 * (1 + 0.1*ln(2)).
        import math
        expected = 0.5 * (1.0 + 0.1 * math.log(2))
        self.assertAlmostEqual(a1, expected, places=9)

    def test_use_count_prior_applied(self):
        """Node with higher use_count gets a higher activation prior, all else equal."""
        g = js._Graph()
        g.add_node("1", use_count=1)
        g.add_node("2", use_count=9)   # 9x the use → larger prior
        g.add_edge("1", "2", 1.0)
        res = js._ppr(g, ["1", "2"])
        a1 = next(r["activation"] for r in res if r["id"] == "1")
        a2 = next(r["activation"] for r in res if r["id"] == "2")
        self.assertGreater(a2, a1, "higher use_count → higher prior → higher activation")

    def test_dangling_node_redistributes_to_seeds(self):
        """A node with no edges (dangling) redistributes its teleport mass back to the seed set.

        Node 1 is the only seed and the only node with an edge. Node 3 is dangling. Node 1 must get
        non-zero activation; the graph is connected enough that the PPR doesn't collapse.
        """
        g = js._Graph()
        g.add_node("1", use_count=1)
        g.add_node("2", use_count=1)
        g.add_node("3", use_count=1)   # dangling — no edges
        g.add_edge("1", "2", 1.0)
        res = js._ppr(g, ["1"])   # only node 1 seeded
        ids = {r["id"] for r in res}
        self.assertIn("1", ids, "seed node must get activation")


class TestJarvisSpreadingCache(unittest.TestCase):
    """Graph cache: rebuild only when episode row-count changes."""

    def setUp(self):
        self.tmp = tempfile.mkdtemp(prefix="jarvis-cache-")
        self.db = _make_db(self.tmp, [
            {"summary": "first episode", "cues": "first episode", "kind": "episode", "tags": ""},
        ])
        js._GRAPH_CACHE.clear()

    def tearDown(self):
        js._GRAPH_CACHE.clear()

    def test_cache_returns_same_object(self):
        g1 = js.build_graph(db=self.db)
        g2 = js.build_graph(db=self.db)
        self.assertIs(g1, g2, "same row-count → cached graph object reused (no rebuild)")

    def test_cache_rebuilds_after_insert(self):
        g1 = js.build_graph(db=self.db)
        jm.remember(summary="second episode", cues="second episode", db=self.db)
        g2 = js.build_graph(db=self.db)
        self.assertIsNot(g1, g2, "row-count change → graph must rebuild")
        self.assertEqual(len(g2.nodes), len(g1.nodes) + 1)


if __name__ == "__main__":
    unittest.main(verbosity=2)
