#!/usr/bin/env python3
"""test_kokoro_tts.py — _normalize / _chunks regression for the g2p 'words count mismatch' +
broadcast_shapes vocoder crash (owner 2026-06-19).

Root cause this pins: Kokoro's g2p (misaki) word-count-mismatches when a whitespace token contains an
EMBEDDED SYMBOL or a NO-SPACE DOT (IPs 127.0.0.1, versions v1.2.3, URLs/paths foo.com / a/b/c, code
refs, stray non-ASCII). The mismatch → downstream tensor shapes fail to broadcast → 'chunk synth failed'.
_normalize must reduce every token to a clean speakable word/number.

Needs the pipecat venv (kokoro_tts imports pipecat + numpy at module level):
  _SYSTEM/state/voice/.venv-pipecat/bin/python _SYSTEM/Scripts/voice/test_kokoro_tts.py
Skips cleanly if pipecat isn't importable (so plain `python3` + CI don't hard-fail)."""
import os
import re
import sys
import unittest

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
try:
    from kokoro_tts import _normalize, _chunks
    _SKIP = None
except Exception as _e:   # pipecat/numpy not importable in this interpreter
    _normalize = _chunks = None
    _SKIP = f"pipecat venv unavailable: {type(_e).__name__}: {str(_e)[:80]}"

# An alnum token with an embedded symbol/dot is the g2p hazard. Apostrophes (contractions) are allowed.
_EMBEDDED_SYM = re.compile(r"[^0-9A-Za-z']")


def _bad_tokens(s):
    """Tokens that mix alnum with an embedded symbol/dot — the g2p word-count-mismatch trigger."""
    bad = []
    for w in (s or "").split():
        if not w:
            continue
        if any(c.isalnum() for c in w) and _EMBEDDED_SYM.search(w):
            bad.append(w)
    return bad


@unittest.skipUnless(_normalize, _SKIP)
class TestNormalizePhonemizerSafe(unittest.TestCase):
    # GREEN — the documented crasher inputs come out with NO embedded-symbol tokens
    def test_ip_version_path_symbols(self):
        out = _normalize("check port 8080 at 127.0.0.1 & /path/v1.2.3 — done")
        self.assertEqual(_bad_tokens(out), [], f"embedded-symbol tokens remain: {out!r}")

    def test_urls_and_repo_paths(self):
        out = _normalize("see https://foo.com/bar or _SYSTEM/Scripts/voice/x.py")
        self.assertEqual(_bad_tokens(out), [], f"embedded-symbol tokens: {out!r}")

    def test_code_refs_and_brackets(self):
        out = _normalize("set x = a + b [0] {1} <2> ~3|4`5` *6* & 7%")
        self.assertEqual(_bad_tokens(out), [], f"embedded-symbol tokens: {out!r}")

    def test_non_ascii_collapsed(self):
        out = _normalize("café résumé → done ✓ ☆")
        self.assertEqual(_bad_tokens(out), [], f"embedded-symbol tokens: {out!r}")

    # GREEN — legitimate speakable structure is PRESERVED (don't over-strip)
    def test_contractions_and_sentence_punctuation_preserved(self):
        out = _normalize("I don't think so. Really? Yes!")
        self.assertIn("don't", out)          # apostrophe contraction survives
        self.assertIn("think", out)
        self.assertIn(".", out)              # sentence punctuation survives

    def test_markdown_stripped(self):
        out = _normalize("**bold** and _ital_ and `code` and # head")
        for sym in ("*", "`", "_", "#"):
            self.assertNotIn(sym, out)

    def test_newlines_become_breaks(self):
        out = _normalize("first line\nsecond line\nthird")
        self.assertNotIn("\n", out)

    # RED — empty / whitespace input is safe (never feeds the model an empty string)
    def test_empty_and_whitespace_safe(self):
        self.assertEqual(_normalize(""), "")
        self.assertEqual(_normalize("   \n\t  "), "")


@unittest.skipUnless(_normalize, _SKIP)
class TestChunks(unittest.TestCase):
    # GREEN — long replies split into short, synth-safe pieces (the broadcast_shapes dodge)
    def test_long_reply_chunks_short(self):
        text = "One short sentence. And another one here that is a fair bit longer than the limit allows."
        out = _chunks(text, maxlen=30)
        self.assertGreaterEqual(len(out), 2, "should split a multi-sentence reply")
        # _chunks splits by sentence then comma (maxlen is a SOFT target, not a hard cap — a comma-less
        # long sentence can exceed it; _synth_robust re-splits at maxlen=32 for the real synth safety).
        self.assertLessEqual(max(len(c) for c in out), 72, f"chunk unexpectedly long: {[len(c) for c in out]}")

    def test_short_sentence_passes_through(self):
        self.assertEqual(_chunks("Quick one.", maxlen=60), ["Quick one."])


if __name__ == "__main__":
    unittest.main(verbosity=2)
