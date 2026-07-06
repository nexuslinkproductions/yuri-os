#!/usr/bin/env python3
"""
test_jarvis_xref.py — tests for the T3 canonical-truth + xref navigation seam.

Covers:
  GREEN happy-path  — canonical_block() non-empty & compact; xref() bounded.
  RED degrade       — JARVIS_XREF=0 disables both (return "", no node call).
  RED cold-start    — store/CLI absent -> graceful "" (monkeypatched paths).
  EDGE              — empty/garbage query; max_lines boundary; env truthiness;
                      heterogeneous tier sort; filing-lane advisory filter.

Run: python3 _SYSTEM/Scripts/voice/test_jarvis_xref.py
"""

import importlib
import os
import sys
import unittest

_HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, _HERE)

# xref-query.mjs lives one dir up from voice/ : _SYSTEM/Scripts/xref-query.mjs
_XREF_CLI = os.path.abspath(os.path.join(_HERE, "..", "xref-query.mjs"))


def _fresh_import(env_overrides=None, restore_after=True):
    """Import jarvis_xref fresh with optional env overrides.

    The module-init canonical cache is recomputed under the requested env.
    By default env is restored after import (init-cache tests). Set
    restore_after=False to LEAVE overrides in place so call-time reads
    (is_enabled, xref) observe them — used by the disabled-gate tests.

    Returns (module, saved_env_dict).
    """
    sys.modules.pop("jarvis_xref", None)
    saved = {}
    keys = list(env_overrides.keys()) if env_overrides else []
    for k in keys:
        saved[k] = os.environ.get(k)
        os.environ[k] = env_overrides[k]
    try:
        import jarvis_xref  # noqa: F401  (fresh import re-runs init)
        importlib.reload(jarvis_xref)
    except Exception:
        for k in keys:
            if saved[k] is None:
                os.environ.pop(k, None)
            else:
                os.environ[k] = saved[k]
        raise
    if restore_after:
        for k in keys:
            if saved[k] is None:
                os.environ.pop(k, None)
            else:
                os.environ[k] = saved[k]
    return jarvis_xref, saved


def _restore(saved):
    for k, v in saved.items():
        if v is None:
            os.environ.pop(k, None)
        else:
            os.environ[k] = v


class TestCanonicalHappyPath(unittest.TestCase):
    """GREEN: against the live repo (canonical store + xref CLI present)."""

    def setUp(self):
        self.mod, _ = _fresh_import({"JARVIS_XREF": "1"})

    def test_canonical_block_compact_and_bounded(self):
        blk = self.mod.canonical_block()
        if blk:  # live store may legitimately be empty in CI
            self.assertLessEqual(len(blk), self.mod._MAX_CANONICAL_CHARS)
            self.assertIn("canonical", blk.lower())
            self.assertTrue(any(ln.startswith("- ") for ln in blk.splitlines()))

    def test_canonical_block_is_string(self):
        self.assertIsInstance(self.mod.canonical_block(), str)

    def test_canonical_block_idempotent(self):
        """Two calls return the SAME cached object (init-time cache, not per-call)."""
        self.assertEqual(self.mod.canonical_block(), self.mod.canonical_block())


@unittest.skipUnless(os.path.isfile(_XREF_CLI), "xref-query.mjs not present")
class TestXrefHappyPath(unittest.TestCase):
    def setUp(self):
        self.mod, _ = _fresh_import({"JARVIS_XREF": "1"})

    def test_xref_returns_bounded_string(self):
        out = self.mod.xref("energy gate", max_lines=5)
        self.assertIsInstance(out, str)
        if out:  # live xref may return content
            # 5 lines + optional truncation marker
            self.assertLessEqual(len(out.splitlines()), 6)

    def test_xref_max_lines_default(self):
        out = self.mod.xref("memory")
        if out:
            # 40 default + optional marker
            self.assertLessEqual(len(out.splitlines()), 41)


class TestDisabledGate(unittest.TestCase):
    """RED degrade: JARVIS_XREF=0 disables both seams (env stays set for the call)."""

    def setUp(self):
        self.mod, self.saved = _fresh_import({"JARVIS_XREF": "0"}, restore_after=False)

    def tearDown(self):
        _restore(self.saved)

    def test_disabled_is_enabled_false(self):
        self.assertFalse(self.mod.is_enabled())

    def test_disabled_canonical_empty(self):
        self.assertEqual(self.mod.canonical_block(), "")

    def test_disabled_xref_empty(self):
        self.assertEqual(self.mod.xref("anything"), "")


class TestEnvTruthiness(unittest.TestCase):
    """is_enabled() must honor the documented truthy/falsy values at call time."""

    def _check(self, val, expected):
        saved = os.environ.get("JARVIS_XREF")
        os.environ["JARVIS_XREF"] = val
        try:
            # Need the module loaded; re-import not required since is_enabled reads live.
            mod, _ = _fresh_import({}, restore_after=False)
            # _fresh_import({}) doesn't touch JARVIS_XREF, so the val we set persists.
            self.assertEqual(
                mod.is_enabled(),
                expected,
                f"JARVIS_XREF={val!r} -> is_enabled() expected {expected}",
            )
        finally:
            if saved is None:
                os.environ.pop("JARVIS_XREF", None)
            else:
                os.environ["JARVIS_XREF"] = saved

    def test_truthy(self):
        for v in ("1", "true", "TRUE", "yes", "on", "ON"):
            self._check(v, True)

    def test_falsy(self):
        for v in ("0", "false", "no", "off", "", "anything-else"):
            self._check(v, False)

    def test_default_on(self):
        """Absence of JARVIS_XREF defaults to ENABLED."""
        saved = os.environ.pop("JARVIS_XREF", None)
        try:
            mod, _ = _fresh_import({}, restore_after=False)
            self.assertTrue(mod.is_enabled())
        finally:
            if saved is not None:
                os.environ["JARVIS_XREF"] = saved


class TestColdStartAbsent(unittest.TestCase):
    """RED cold-start: store/CLI absent -> graceful "" (no exception)."""

    def test_canonical_store_absent(self):
        mod, _ = _fresh_import({"JARVIS_XREF": "1"})
        mod._CANONICAL_STORE = "/nonexistent/path/no-store.mjs"
        self.assertEqual(mod._load_canonical_once(), "")
        self.assertEqual(mod._render_canonical_block(""), "")

    def test_xref_cli_absent(self):
        mod, _ = _fresh_import({"JARVIS_XREF": "1"})
        mod._XREF_CLI = "/nonexistent/path/no-xref.mjs"
        self.assertEqual(mod.xref("query"), "")

    def test_render_garbage_json(self):
        mod, _ = _fresh_import({"JARVIS_XREF": "1"})
        self.assertEqual(mod._render_canonical_block("not json {{{"), "")
        self.assertEqual(mod._render_canonical_block(""), "")
        self.assertEqual(mod._render_canonical_block("{}"), "")

    def test_render_empty_claims(self):
        mod, _ = _fresh_import({"JARVIS_XREF": "1"})
        view = '{"v":1,"claims":{},"foldedAt":null}'
        self.assertEqual(mod._render_canonical_block(view), "")


class TestEdgeCases(unittest.TestCase):
    def setUp(self):
        self.mod, _ = _fresh_import({"JARVIS_XREF": "1"})

    def test_empty_query(self):
        self.assertEqual(self.mod.xref(""), "")
        self.assertEqual(self.mod.xref("   "), "")

    def test_none_query(self):
        self.assertEqual(self.mod.xref(None), "")

    def test_zero_max_lines_defaults(self):
        out = self.mod.xref("memory", max_lines=0)
        self.assertIsInstance(out, str)

    def test_negative_max_lines_defaults(self):
        out = self.mod.xref("memory", max_lines=-5)
        self.assertIsInstance(out, str)

    def test_heterogeneous_tier_sort(self):
        """readView tier is heterogeneous (int/str/None) — render must not crash."""
        mod, _ = _fresh_import({"JARVIS_XREF": "1"})
        view = (
            '{"v":1,"claims":{'
            '"a\\u0000p1":{"subject":"a","predicate":"p1","object":1,"tier":1,'
            '"provenance":{"lane":"claude"}},'
            '"b\\u0000p2":{"subject":"b","predicate":"p2","object":"x",'
            '"tier":"permanent","provenance":{"lane":"deepseek"}},'
            '"c\\u0000p3":{"subject":"c","predicate":"p3","object":null,"tier":null,'
            '"provenance":{"lane":"ollama"}}'
            '},"foldedAt":"2026-01-01T00:00:00Z"}'
        )
        blk = mod._render_canonical_block(view)
        self.assertIn("a", blk)
        self.assertIn("permanent", blk)
        self.assertIn("claude", blk)

    def test_nested_object_rendered_as_json(self):
        """readView object can be a nested dict — render as compact JSON, not repr."""
        mod, _ = _fresh_import({"JARVIS_XREF": "1"})
        view = (
            '{"v":1,"claims":{'
            '"s\\u0000p":{"subject":"s","predicate":"p",'
            '"object":{"k":"v","n":3},"tier":1,'
            '"provenance":{"lane":"claude"}}'
            '},"foldedAt":"2026-01-01T00:00:00Z"}'
        )
        blk = mod._render_canonical_block(view)
        self.assertIn('"k":"v"', blk)

    def test_filing_lane_filtered(self):
        """Advisory filing-lane placement history is excluded from the startup block."""
        mod, _ = _fresh_import({"JARVIS_XREF": "1"})
        view = (
            '{"v":1,"claims":{'
            '"op\\u0000truth":{"subject":"op","predicate":"truth","object":"live",'
            '"tier":1,"provenance":{"lane":"claude"}},'
            '"junk\\u0000place":{"subject":"junk","predicate":"place","object":"x",'
            '"tier":null,"provenance":{"lane":"filing"}}'
            '},"foldedAt":"2026-01-01T00:00:00Z"}'
        )
        blk = mod._render_canonical_block(view)
        self.assertIn("op", blk)
        self.assertNotIn("filing", blk)

    def test_block_capped_at_max_chars(self):
        """A store with many claims must not exceed the ~4000 char cap."""
        mod, _ = _fresh_import({"JARVIS_XREF": "1"})
        # Synthesize 200 claims.
        claims = {}
        for i in range(200):
            claims[f"subj{i}\\u0000pred{i}"] = {
                "subject": f"subj{i}",
                "predicate": f"pred{i}",
                "object": f"value-{i}-padding-" * 10,
                "tier": 1,
                "provenance": {"lane": "claude"},
            }
        view = '{"v":1,"claims":' + __import__("json").dumps(claims) + ',"foldedAt":"x"}'
        blk = mod._render_canonical_block(view)
        self.assertLessEqual(len(blk), mod._MAX_CANONICAL_CHARS)
        self.assertIn("…", blk)  # truncation marker expected


if __name__ == "__main__":
    unittest.main(verbosity=2)
