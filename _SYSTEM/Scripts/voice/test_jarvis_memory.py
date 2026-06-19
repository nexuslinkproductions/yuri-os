#!/usr/bin/env python3
"""Tests for jarvis_memory.py — the JARVIS episodic store.
GREEN (happy path) + RED (negative/mismatch/degrade/cold-start) + a metamorphic stability check.
Runs against a TEMP db (db= kwarg) — the live jarvis-memory.db is never touched."""
import os, sys, tempfile, unittest
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import jarvis_memory as jm


class TestRememberRecall(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.NamedTemporaryFile(suffix=".db", delete=False)
        self.tmp.close()
        self.db = self.tmp.name

    def tearDown(self):
        try:
            os.unlink(self.db)
        except OSError:
            pass

    # GREEN — write then recall by a matching cue
    def test_remember_then_recall_match(self):
        r = jm.remember("Marcel's favorite color is teal.", cues="favorite color teal preference",
                        kind="fact", weight=3, db=self.db)
        self.assertTrue(r.startswith("remembered"))
        block = jm.recall("what is my favorite color", db=self.db)
        self.assertIn("teal", block)
        self.assertIn("fact", block)

    # RED — a query with NO overlapping cues returns nothing
    def test_recall_no_match_returns_empty(self):
        jm.remember("Marcel's favorite color is teal.", cues="color teal", kind="fact", db=self.db)
        self.assertEqual(jm.recall("schedule a dentist appointment", db=self.db), "")

    # RED — cold start: fresh db, recall is empty (no crash)
    def test_cold_start_empty(self):
        self.assertEqual(jm.recall("anything at all", db=self.db), "")

    # RED — malformed/weird query is safe (returns empty, never raises)
    def test_malformed_query_safe(self):
        jm.remember("a fact about stuff", cues="stuff fact", db=self.db)
        for q in ('"""', "'; DROP TABLE--", "%%%", "", "   "):
            self.assertEqual(jm.recall(q, db=self.db), q and "" or "")  # empty/whitespace → ""

    # GREEN — relevance ranking: the better-matching fact ranks first
    def test_recall_ranks_by_relevance(self):
        jm.remember("The trading engine trades Coinbase crypto.", cues="trading engine crypto coinbase", db=self.db)
        jm.remember("Marcel's dog is named Rex.", cues="dog rex pet", db=self.db)
        rows = jm.recall_raw("trading crypto coinbase engine", db=self.db)
        self.assertGreaterEqual(len(rows), 1)
        self.assertIn("trading", rows[0]["summary"].lower())

    # GREEN — higher weight ranks first among matches
    def test_weight_boosts_ranking(self):
        jm.remember("Marcel likes dark mode.", cues="dark mode ui preference", weight=0.5, db=self.db)
        jm.remember("Marcel likes light mode for reading.", cues="light mode reading ui", weight=4, db=self.db)
        rows = jm.recall_raw("mode ui", db=self.db)
        self.assertGreaterEqual(len(rows), 2)
        # higher-weight 'light mode' should rank first
        self.assertIn("light", rows[0]["summary"].lower())

    # METAMORPHIC — recall is a WRITE (reconsolidation): reinforced + last_recalled_ts advance in the DB.
    # (recall_raw returns the pre-UPDATE snapshot, so verify the side-effect by reading the DB directly.)
    def test_recall_reinforces(self):
        import sqlite3
        jm.remember("a durable commitment", cues="commitment goal", db=self.db)
        jm.recall_raw("commitment goal", db=self.db)          # 1st recall → reinforced 0→1
        c = sqlite3.connect(self.db)
        r1 = c.execute("SELECT reinforced, last_recalled_ts FROM episodes WHERE summary LIKE '%commitment%'").fetchone()
        jm.recall_raw("commitment goal", db=self.db)          # 2nd recall → reinforced 1→2
        r2 = c.execute("SELECT reinforced, last_recalled_ts FROM episodes WHERE summary LIKE '%commitment%'").fetchone()
        c.close()
        self.assertEqual(r1[0], 1)
        self.assertEqual(r2[0], 2)
        self.assertIsNotNone(r2[1])

    # GREEN — cue extraction drops stopwords + short tokens
    def test_extract_cues(self):
        cues = jm._extract_cues("The quick brown fox is really very fast indeed")
        for stop in ("the", "is", "very"):
            self.assertNotIn(stop, cues.split())
        self.assertIn("quick", cues.split())
        self.assertIn("brown", cues.split())

    # GREEN — kind is sanitized to the allowed set
    def test_kind_sanitized(self):
        r = jm.remember("note", cues="note", kind="MALICIOUS_TABLE", db=self.db)
        self.assertIn("episode", r)   # unknown kind → default 'episode'

    # GREEN — empty summary is refused
    def test_empty_summary_refused(self):
        self.assertEqual(jm.remember("", db=self.db), "nothing to remember")
        self.assertEqual(jm.remember("   ", db=self.db), "nothing to remember")

    # RED — weight is clamped to [0.1, 5] (order-independent: insertion order is 999→5, then -5→0.1)
    def test_weight_clamped(self):
        jm.remember("tiny note", cues="note", weight=999, db=self.db)
        jm.remember("big note", cues="note", weight=-5, db=self.db)
        import sqlite3
        c = sqlite3.connect(self.db)
        ws = [r[0] for r in c.execute("SELECT weight FROM episodes").fetchall()]
        c.close()
        self.assertEqual(set(ws), {0.1, 5.0})
        self.assertEqual(max(ws), 5.0)
        self.assertEqual(min(ws), 0.1)


class TestDisabledMode(unittest.TestCase):
    # RED — disabled degrades at the seam: remember→disabled ack, recall→empty (brain keeps working)
    def setUp(self):
        self._prev = jm.ENABLED
        jm.ENABLED = False

    def tearDown(self):
        jm.ENABLED = self._prev

    def test_disabled_remember(self):
        self.assertEqual(jm.remember("x", cues="x"), "memory disabled")

    def test_disabled_recall(self):
        self.assertEqual(jm.recall("x"), "")
        self.assertEqual(jm.recall_raw("x"), [])


class TestBrainWiring(unittest.TestCase):
    """Confirm the brain wired the remember tool + recall injection without importing the server.
    Parses the brain source (hyphenated filename isn't importable) and checks the integration points."""
    BRAIN = os.path.join(os.path.dirname(os.path.abspath(__file__)), "yuri-z-brain.py")

    def _src(self):
        with open(self.BRAIN) as f:
            return f.read()

    def test_imports_jarvis_memory(self):
        self.assertIn("import jarvis_memory as jm", self._src())

    def test_remember_tool_declared(self):
        self.assertIn('"name": "remember"', self._src())

    def test_remember_handled_in_exec(self):
        self.assertIn('if name == "remember":', self._src())

    def test_recall_injected_per_turn(self):
        s = self._src()
        self.assertIn("jm.recall(user_msg)", s)
        self.assertIn("sys_prompt = SYSTEM", s)

    def test_brain_parses_clean(self):
        import ast
        ast.parse(self._src())   # raises on syntax error


if __name__ == "__main__":
    unittest.main(verbosity=2)
