#!/usr/bin/env python3
"""test_bot_brief.py — hermetic regression for bot.py's BRIEF-ON-START + INSTANT-BARGE-IN additions.

Covers:
  GREEN happy-path  — _time_of_day_greeting() picks the right daypart; _fetch_spoken_brief()
                      returns real spoken text from the actual morning-brief.mjs script (ONE
                      live subprocess call, bounded — proves the real integration works end to
                      end, not just a mock).
  RED fail-open     — _fetch_spoken_brief() returns None (never raises) when: the script path
                      doesn't exist, the subprocess times out, the subprocess exits non-zero,
                      the subprocess produces empty stdout, or YURI_BRIEF=0 disables it outright.
  EDGE              — InstantBargeIn debounces rapid VADUserStartedSpeakingFrame bursts but still
                      calls broadcast_interruption() at least once per burst.

bot.py imports pipecat (fast, ~1s) and kokoro_tts (slow — loads a real MLX model). This test
stubs kokoro_tts in sys.modules with a lightweight fake BEFORE importing bot, so the test stays
hermetic and fast; it never loads the real TTS model. Needs the pipecat venv:
  _SYSTEM/state/voice/.venv-pipecat/bin/python _SYSTEM/Scripts/voice/test_bot_brief.py
Skips cleanly if pipecat isn't importable (so plain `python3` + CI don't hard-fail).
"""

import asyncio
import datetime
import os
import sys
import types
import unittest
from unittest import mock

_HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, _HERE)


def _install_kokoro_stub():
    """Fake kokoro_tts module: bot.py only needs KokoroTTSService to exist as an importable
    symbol (it's constructed inside main(), never at module import time), so a bare stub class
    is enough to satisfy `from kokoro_tts import KokoroTTSService` without loading real MLX."""
    if "kokoro_tts" in sys.modules:
        return
    stub = types.ModuleType("kokoro_tts")

    class _FakeKokoroTTSService:
        def __init__(self, *a, **kw):
            pass

    stub.KokoroTTSService = _FakeKokoroTTSService
    sys.modules["kokoro_tts"] = stub


try:
    _install_kokoro_stub()
    import bot  # noqa: E402
    _SKIP = None
except Exception as _e:  # pipecat not importable in this interpreter
    bot = None
    _SKIP = f"pipecat venv unavailable: {type(_e).__name__}: {str(_e)[:120]}"


@unittest.skipUnless(bot, _SKIP)
class TestTimeOfDayGreeting(unittest.TestCase):
    # GREEN — daypart boundaries match the packet's spec (morning/afternoon/evening).
    def test_morning(self):
        self.assertEqual(
            bot._time_of_day_greeting(datetime.datetime(2026, 7, 5, 8, 0)),
            "Good morning Marcel.",
        )

    def test_afternoon(self):
        self.assertEqual(
            bot._time_of_day_greeting(datetime.datetime(2026, 7, 5, 14, 0)),
            "Good afternoon Marcel.",
        )

    def test_evening(self):
        self.assertEqual(
            bot._time_of_day_greeting(datetime.datetime(2026, 7, 5, 20, 0)),
            "Good evening Marcel.",
        )

    def test_boundary_5am_is_morning(self):
        self.assertEqual(
            bot._time_of_day_greeting(datetime.datetime(2026, 7, 5, 5, 0)),
            "Good morning Marcel.",
        )

    def test_boundary_midnight_is_evening(self):
        self.assertEqual(
            bot._time_of_day_greeting(datetime.datetime(2026, 7, 5, 0, 0)),
            "Good evening Marcel.",
        )


@unittest.skipUnless(bot, _SKIP)
class TestFetchSpokenBriefFailOpen(unittest.IsolatedAsyncioTestCase):
    async def test_disabled_via_env(self):
        with mock.patch.dict(os.environ, {"YURI_BRIEF": "0"}):
            result = await bot._fetch_spoken_brief()
        self.assertIsNone(result)

    async def test_missing_script_returns_none(self):
        with mock.patch.object(bot, "MORNING_BRIEF_SCRIPT", "/tmp/does-not-exist-morning-brief.mjs"):
            result = await bot._fetch_spoken_brief()
        self.assertIsNone(result)

    async def test_timeout_returns_none_and_kills_proc(self):
        fake_proc = mock.AsyncMock()
        fake_proc.communicate = mock.AsyncMock(side_effect=asyncio.TimeoutError())
        fake_proc.kill = mock.Mock()
        fake_proc.wait = mock.AsyncMock()
        with mock.patch("os.path.isfile", return_value=True), \
             mock.patch("asyncio.create_subprocess_exec", mock.AsyncMock(return_value=fake_proc)):
            result = await bot._fetch_spoken_brief(timeout_s=0.01)
        self.assertIsNone(result)
        fake_proc.kill.assert_called_once()

    async def test_nonzero_exit_returns_none(self):
        fake_proc = mock.AsyncMock()
        fake_proc.communicate = mock.AsyncMock(return_value=(b"", b"boom"))
        fake_proc.returncode = 1
        with mock.patch("os.path.isfile", return_value=True), \
             mock.patch("asyncio.create_subprocess_exec", mock.AsyncMock(return_value=fake_proc)):
            result = await bot._fetch_spoken_brief()
        self.assertIsNone(result)

    async def test_empty_stdout_returns_none(self):
        fake_proc = mock.AsyncMock()
        fake_proc.communicate = mock.AsyncMock(return_value=(b"   \n", b""))
        fake_proc.returncode = 0
        with mock.patch("os.path.isfile", return_value=True), \
             mock.patch("asyncio.create_subprocess_exec", mock.AsyncMock(return_value=fake_proc)):
            result = await bot._fetch_spoken_brief()
        self.assertIsNone(result)

    async def test_subprocess_exec_raising_returns_none(self):
        with mock.patch("os.path.isfile", return_value=True), \
             mock.patch("asyncio.create_subprocess_exec", side_effect=FileNotFoundError("no node")):
            result = await bot._fetch_spoken_brief()
        self.assertIsNone(result)

    async def test_happy_path_mocked_stdout(self):
        fake_proc = mock.AsyncMock()
        fake_proc.communicate = mock.AsyncMock(return_value=(b"Good morning brief text.\n", b""))
        fake_proc.returncode = 0
        with mock.patch("os.path.isfile", return_value=True), \
             mock.patch("asyncio.create_subprocess_exec", mock.AsyncMock(return_value=fake_proc)):
            result = await bot._fetch_spoken_brief()
        self.assertEqual(result, "Good morning brief text.")


@unittest.skipUnless(bot, _SKIP)
class TestFetchSpokenBriefLiveIntegration(unittest.IsolatedAsyncioTestCase):
    # GREEN — ONE real subprocess call against the actual morning-brief.mjs script. Profiled at
    # ~8-16s wall time (git/health/dream-queue reads), so this uses a generous 25s budget — proof
    # the real integration (not just mocks) returns a valid, non-empty spoken sentence and exits
    # cleanly, matching the packet's "brief-fetch function returns text" acceptance criterion.
    async def test_real_script_returns_nonempty_text(self):
        result = await bot._fetch_spoken_brief(timeout_s=25.0)
        self.assertIsInstance(result, str)
        self.assertGreater(len(result.strip()), 0)


@unittest.skipUnless(bot, _SKIP)
class TestInstantBargeIn(unittest.IsolatedAsyncioTestCase):
    async def test_broadcasts_interruption_on_vad_started(self):
        proc = bot.InstantBargeIn()
        proc.broadcast_interruption = mock.AsyncMock()
        proc.push_frame = mock.AsyncMock()
        frame = bot.VADUserStartedSpeakingFrame()
        await proc.process_frame(frame, bot.FrameDirection.DOWNSTREAM)
        proc.broadcast_interruption.assert_awaited_once()
        proc.push_frame.assert_awaited_once_with(frame, bot.FrameDirection.DOWNSTREAM)

    async def test_debounces_rapid_bursts(self):
        proc = bot.InstantBargeIn(min_interval_s=10.0)  # long window forces the debounce path
        proc.broadcast_interruption = mock.AsyncMock()
        proc.push_frame = mock.AsyncMock()
        for _ in range(5):
            await proc.process_frame(bot.VADUserStartedSpeakingFrame(), bot.FrameDirection.DOWNSTREAM)
        # Only the first of 5 rapid VAD-start events should trigger a real interruption broadcast.
        self.assertEqual(proc.broadcast_interruption.await_count, 1)
        # But every frame still gets forwarded downstream — muting must never also drop the frame.
        self.assertEqual(proc.push_frame.await_count, 5)

    async def test_ignores_non_vad_frames(self):
        proc = bot.InstantBargeIn()
        proc.broadcast_interruption = mock.AsyncMock()
        proc.push_frame = mock.AsyncMock()
        await proc.process_frame(bot.VADUserStoppedSpeakingFrame(), bot.FrameDirection.DOWNSTREAM)
        proc.broadcast_interruption.assert_not_called()
        proc.push_frame.assert_awaited_once()


if __name__ == "__main__":
    unittest.main(verbosity=2)
