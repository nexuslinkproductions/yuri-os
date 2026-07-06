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


class TestEnergySeam(unittest.TestCase):
    """T1 seam: remember() routes the model weight THROUGH jarvis_energy.write_strength (real ΔU salience),
    and degrades to the plain clamp when the energy seam is absent. Uses a temp db."""
    def setUp(self):
        self.tmp = tempfile.NamedTemporaryFile(suffix=".db", delete=False)
        self.tmp.close()
        self.db = self.tmp.name
        self._had_energy = jm._HAS_ENERGY
        self._je = jm.je
        # save the REAL write_strength function — monkeypatching it mutates the module attribute, so we
        # must restore the function itself (not just the module ref) or the sentinel leaks across tests.
        self._orig_ws = jm.je.write_strength if jm.je is not None else None

    def tearDown(self):
        if jm.je is not None and self._orig_ws is not None:
            jm.je.write_strength = self._orig_ws
        jm._HAS_ENERGY = self._had_energy
        jm.je = self._je
        try:
            os.unlink(self.db)
        except OSError:
            pass

    # GREEN — when the seam is live, the STORED weight is exactly what write_strength returns (proves the
    # wiring routes THROUGH write_strength, not the plain clamp).
    def test_remember_routes_through_write_strength(self):
        if not self._had_energy:
            self.skipTest("jarvis_energy not importable in this env")
        jm.je.write_strength = lambda base, precision=1.0: 2.77   # deterministic sentinel
        jm.remember("a fact", cues="fact", weight=1.0, db=self.db)
        import sqlite3
        c = sqlite3.connect(self.db)
        w = c.execute("SELECT weight FROM episodes").fetchone()[0]
        c.close()
        self.assertAlmostEqual(w, 2.77, places=5)

    # RED — when the energy seam is absent, remember degrades to the plain clamp (no surprise multiplier)
    def test_energy_absent_degrades_to_clamp(self):
        jm._HAS_ENERGY = False
        jm.je = None
        jm.remember("big note", cues="note", weight=999, db=self.db)
        import sqlite3
        c = sqlite3.connect(self.db)
        w = c.execute("SELECT weight FROM episodes").fetchone()[0]
        c.close()
        self.assertEqual(w, 5.0)   # plain clamp, no enrichment


class TestAssociativeSeam(unittest.TestCase):
    """T2 seam: recall fuses FTS direct matches with associative (PPR) fill. An episode CONNECTED to a
    direct match via a shared cue — but not itself a direct cue match — surfaces through spreading activation.
    """
    def setUp(self):
        self.tmp = tempfile.NamedTemporaryFile(suffix=".db", delete=False)
        self.tmp.close()
        self.db = self.tmp.name
        self._had_spreading = jm._HAS_SPREADING
        self._jsp = jm.jsp
        # A = direct match (query cue 'marcel'); B = connected to A via shared 'rust', NOT a direct match
        jm.remember("Marcel deployed the rust service.", cues="marcel deployed rust service", kind="fact", db=self.db)
        jm.remember("The rust deployment failed on port 8080.", cues="rust deployment failed port", kind="episode", db=self.db)

    def tearDown(self):
        jm._HAS_SPREADING = self._had_spreading
        jm.jsp = self._jsp
        try:
            jm.jsp._GRAPH_CACHE.pop(self.db, None)   # bust the spreading cache for this path (no cross-test leak)
        except Exception:
            pass
        try:
            os.unlink(self.db)
        except OSError:
            pass

    # GREEN — recall('marcel') direct-matches A; B (connected via shared 'rust', not a direct match) fills via PPR
    def test_associative_fill_surfaces_connected_episode(self):
        if not self._had_spreading:
            self.skipTest("jarvis_spreading not importable in this env")
        rows = jm.recall_raw("what about marcel", db=self.db, limit=5)
        summaries = [r["summary"] for r in rows]
        self.assertTrue(any("deployed the rust service" in s for s in summaries), "A (direct match) must surface")
        self.assertTrue(any("failed on port 8080" in s for s in summaries), "B (associative fill) must surface")

    # RED — with the spreading seam off, recall is pure FTS: B (no 'marcel' cue) does NOT surface
    def test_spreading_off_is_pure_fts(self):
        jm._HAS_SPREADING = False
        jm.jsp = None
        rows = jm.recall_raw("what about marcel", db=self.db, limit=5)
        summaries = [r["summary"] for r in rows]
        self.assertTrue(any("deployed the rust service" in s for s in summaries), "A still direct-matches")
        self.assertFalse(any("failed on port 8080" in s for s in summaries), "B must be absent (no associative fill)")


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

    # T3 seam — the brain imports jarvis_xref, injects canonical truth at startup, and exposes an xref tool
    def test_imports_jarvis_xref(self):
        self.assertIn("import jarvis_xref as jx", self._src())

    def test_xref_tool_declared(self):
        self.assertIn('"name": "xref"', self._src())

    def test_xref_handled_in_exec(self):
        self.assertIn('if name == "xref":', self._src())

    def test_canonical_block_injected_at_startup(self):
        self.assertIn("canonical_block()", self._src())

    # Refinement (owner 2026-06-19): stop narrating commands — outcomes only, never raw read-aloud
    def test_voice_discipline_forbids_command_narration(self):
        s = self._src()
        self.assertIn("NEVER announce a command", s)
        self.assertIn("outcomes only", s)

    def test_describe_action_no_raw_command_readaloud(self):
        s = self._src()
        # the old verbose read-aloud patterns are gone …
        self.assertNotIn("run the command: {args.get('command'", s)
        self.assertNotIn("AppleScript: {s[:120]}", s)
        self.assertNotIn("GUI script: {s[:120]}", s)
        # … replaced by truncated plain glosses (bash ≤70, applescript/gui ≤50)
        self.assertIn("[:70]", s)
        self.assertIn("[:50]", s)

    def test_recall_injected_per_turn(self):
        s = self._src()
        self.assertIn("jm.recall(user_msg)", s)
        self.assertIn("sys_prompt = SYSTEM", s)

    def test_brain_parses_clean(self):
        import ast
        ast.parse(self._src())   # raises on syntax error


class TestConfirmGateNarrowed(unittest.TestCase):
    """Bug-1 regression (owner 2026-06-19): the confirm-gate fired on EVERY routine step — any edit/write,
    bare `rm`, any `>` redirect, `git commit` — so Yuri read each command out loud + asked to confirm before
    running it. Now ONLY outward-facing / irreversible actions gate. Loads yuri-z-brain.py via importlib
    (the hyphen filename isn't importable) with JARVIS_XREF=0 to skip the canonical node call at import."""
    BRAIN = os.path.join(os.path.dirname(os.path.abspath(__file__)), "yuri-z-brain.py")

    @classmethod
    def setUpClass(cls):
        os.environ["JARVIS_XREF"] = "0"   # skip the canonical node call when the brain module builds SYSTEM
        import importlib.util
        spec = importlib.util.spec_from_file_location("yzb_gate_test", cls.BRAIN)
        cls.yzb = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(cls.yzb)

    # RED — routine ops MUST NOT gate (the bug was that they all did)
    def test_edit_file_not_gated(self):
        self.assertFalse(self.yzb._is_critical_call(
            "edit_file", {"path": "src/x.py", "old_string": "a", "new_string": "b"}))

    def test_write_new_file_not_gated(self):
        # a path that does NOT exist → creating, not overwriting → routine
        self.assertFalse(self.yzb._is_critical_call(
            "write_file", {"path": "brand_new_unlikely_xyz_12345.py", "content": "x"}))

    def test_routine_bash_not_gated(self):
        for cmd in ("git status", "npm test", "ls -la", "grep foo bar.txt", "echo hi",
                    "rm /tmp/some-cache-file", "mv a.txt b.txt", "node script.js > out.log",
                    "git commit -m wip", "git add -A", "cat <<'EOF' > /tmp/x\nhi\nEOF"):
            self.assertFalse(self.yzb._is_critical_call("bash", {"command": cmd}),
                             f"routine bash should NOT gate: {cmd!r}")

    def test_spawn_worker_not_gated(self):
        self.assertFalse(self.yzb._is_critical_call("spawn_worker", {"task": "run the tests"}))

    # GREEN — genuinely outward / irreversible ops STILL gate (guard against over-narrowing)
    def test_git_push_still_gated(self):
        self.assertTrue(self.yzb._is_critical_call("bash", {"command": "git push origin main"}))

    def test_overwrite_existing_file_gated(self):
        # an existing file → overwrite = potential data loss → critical
        self.assertTrue(self.yzb._is_critical_call(
            "write_file", {"path": "_SYSTEM/Scripts/voice/yuri-z-brain.py", "content": "x"}))

    def test_sendmail_still_gated(self):
        self.assertTrue(self.yzb._is_critical_call("bash", {"command": "sendmail someone@mail.com"}))


if __name__ == "__main__":
    unittest.main(verbosity=2)
