#!/usr/bin/env python3
# @capability: voice-pipecat-bot
# @serves: realtime voice agent | always-on rick voice loop | pipecat bot | talk to claude code by voice
# @does: the Pipecat realtime pipeline — local mic -> Silero VAD + smart-turn -> MLX Whisper STT -> brain-proxy (drives the live Claude Code tmux session) -> Marvis streaming Rick TTS -> speaker. Always-on, barge-in.
# @use: R3 of the voice rebuild. Run (venv-pipecat) alongside a tmux `claude` (bridge armed) + claude-brain-proxy.py.
# @exports: (async main)
import os, sys, asyncio, re, time, datetime
sys.path.insert(0, os.path.dirname(__file__))

from loguru import logger
# Quiet the terminal: only INFO+ (kills pipecat's per-frame DEBUG firehose). YURI_LOG_LEVEL=DEBUG to restore.
logger.remove()
logger.add(sys.stderr, level=os.environ.get("YURI_LOG_LEVEL", "INFO"))
from pipecat.audio.vad.silero import SileroVADAnalyzer
from pipecat.audio.vad.vad_analyzer import VADParams
from pipecat.audio.turn.smart_turn.local_smart_turn_v3 import LocalSmartTurnAnalyzerV3
from pipecat.audio.filters.base_audio_filter import BaseAudioFilter
from pipecat.services.whisper.stt import WhisperSTTServiceMLX, MLXModel
from pipecat.services.openai.llm import OpenAILLMService
from pipecat.transports.local.audio import LocalAudioTransport, LocalAudioTransportParams
from pipecat.processors.aggregators.llm_context import LLMContext
from pipecat.processors.aggregators.llm_response_universal import LLMContextAggregatorPair
from pipecat.pipeline.pipeline import Pipeline
from pipecat.pipeline.task import PipelineTask
from pipecat.pipeline.runner import PipelineRunner
from pipecat.frames.frames import (
    TranscriptionFrame, TTSSpeakFrame, InputAudioRawFrame,
    VADUserStartedSpeakingFrame, VADUserStoppedSpeakingFrame, InterruptionFrame,
)
# InterruptionFrame is this pipecat version's unified barge-in signal (replaces the older
# Start/StopInterruptionFrame pair). FrameProcessor.broadcast_interruption() pushes it both
# upstream and downstream; every processor resets its running task on receipt, and
# BaseOutputTransport's media sender stops in-flight/queued audio immediately (verified by
# reading pipecat/processors/frame_processor.py + pipecat/transports/base_output.py in the
# installed 1.3.0 package — this is the SAME primitive VADUserTurnStartStrategy uses).
from pipecat.processors.frame_processor import FrameProcessor, FrameDirection
from pipecat.processors.audio.vad_processor import VADProcessor

from kokoro_tts import KokoroTTSService


# INSTANT-BARGE-IN
class InstantBargeIn(FrameProcessor):
    """Stops Yuri's audio output the INSTANT raw VAD fires (VADUserStartedSpeakingFrame) —
    before STT/turn-confirmation ever runs. Today the pipeline had no interruption broadcaster
    at all (no UserTurnProcessor was wired in; CancelFilter's docstring claim of barge-in was
    aspirational, not actually mechanized), so Yuri kept talking through the whole STT+turn
    round-trip. This processor calls FrameProcessor.broadcast_interruption() — the same
    primitive pipecat's own VADUserTurnStartStrategy uses to trigger an "on_user_turn_started"
    interruption — which pushes an InterruptionFrame both ways: every processor resets its
    running task, TTSService cancels any in-flight synth, and BaseOutputTransport's media
    sender stops queued/playing audio immediately (verified against the installed pipecat 1.3.0
    source, not assumed from memory/older-pipecat APIs).

    Placed directly after `vad` and BEFORE stt in the pipeline, so it reacts to the raw
    VADUserStartedSpeakingFrame (the earliest signal) rather than waiting for a finalized
    transcription. VAD's own confidence=0.6 threshold (set on the SileroVADAnalyzer in main())
    is the ONLY gate applied before this fires — that threshold already rejects ambient/street
    noise blips, in both wake-gate-ON and hot-mic (wake-gate-OFF) sessions, so hot-mic mode
    doesn't get extra suppression here: VAD confidence IS "the wake gate would accept this".

    Debounced (min_interval_s) so a stutter of rapid VAD start events doesn't spam
    broadcast_interruption() calls; harmless if it did (idempotent), but noisy in logs."""

    def __init__(self, min_interval_s: float = 0.25):
        super().__init__()
        self._min_interval = min_interval_s
        self._last_fire = 0.0

    async def process_frame(self, frame, direction):
        await super().process_frame(frame, direction)
        if isinstance(frame, VADUserStartedSpeakingFrame):
            now = time.time()
            if now - self._last_fire >= self._min_interval:
                self._last_fire = now
                logger.info("✂️  instant barge-in — muting output on raw VAD (pre-STT)")
                await self.broadcast_interruption()
        await self.push_frame(frame, direction)


class HeardLogger(FrameProcessor):
    """Prints every finalized transcription so you can SEE when STT actually heard you —
    the fastest way to tell an input (mic/VAD) problem from an output (TTS) one."""

    async def process_frame(self, frame, direction):
        await super().process_frame(frame, direction)
        if isinstance(frame, TranscriptionFrame) and (frame.text or "").strip():
            logger.info(f"👂 YOU SAID: {frame.text!r}")
        await self.push_frame(frame, direction)


class CancelFilter(FrameProcessor):
    """Swallows a cancel command so it never becomes a request. You speaking already triggers
    barge-in (cancels Yuri's in-flight response + speech); this stops the word 'cancel' itself from
    reaching the brain, so you can immediately restate. Place AFTER the wake gate."""

    def __init__(self, phrases):
        super().__init__()
        self._phrases = [p.strip().lower() for p in phrases if p.strip()]

    async def process_frame(self, frame, direction):
        await super().process_frame(frame, direction)
        if isinstance(frame, TranscriptionFrame):
            t = re.sub(r"[^a-z\s]", "", (frame.text or "").lower()).strip()
            t = re.sub(r"^(yuri|rick)\s+", "", t).strip()  # drop a leading wake word
            # Match a cancel phrase at the START, END, or as the whole sentence — people naturally
            # trail off with "...never mind, scratch that" at the end of a ramble.
            if any(t == p or t.startswith(p + " ") or t.endswith(" " + p) for p in self._phrases):
                logger.info(f"🚫 cancel — discarded (restate your request): {frame.text!r}")
                return  # swallow: do not forward downstream
        await self.push_frame(frame, direction)


class WakeGate(FrameProcessor):
    """Gates transcriptions behind a wake word that may appear ANYWHERE — start, middle, or end of
    the sentence. On a hit it strips ONLY the wake word and forwards the WHOLE rest of what you said
    (so '...do X, Yuri' sends 'do X', not just 'Yuri'). Stays awake for a keepalive window so
    follow-ups don't need the word again. Asleep + no wake word => dropped (she stays quiet)."""

    def __init__(self, phrases, keepalive=5.0):
        super().__init__()
        self._patterns = [
            re.compile(r"\b" + r"\s*".join(re.escape(w) for w in p.split()) + r"\b", re.IGNORECASE)
            for p in phrases if p.strip()
        ]
        self._keepalive = keepalive
        self._awake_until = 0.0

    async def process_frame(self, frame, direction):
        await super().process_frame(frame, direction)
        if isinstance(frame, TranscriptionFrame) and (frame.text or "").strip():
            txt = frame.text.strip()
            now = time.time()
            if any(p.search(txt) for p in self._patterns):
                cleaned = txt
                for p in self._patterns:
                    cleaned = p.sub(" ", cleaned)
                cleaned = re.sub(r"\s+", " ", cleaned).strip(" ,.?!-")
                self._awake_until = now + self._keepalive
                frame.text = cleaned or txt   # bare wake word -> keep it (just activates)
                logger.info(f"⚡ Yuri (wake) -> {frame.text!r}")
                await self.push_frame(frame, direction)
                return
            if now < self._awake_until:
                self._awake_until = now + self._keepalive   # follow-up extends the window
                await self.push_frame(frame, direction)
                return
            logger.info(f"💤 ignored (no wake word): {txt!r}")
            return  # asleep + no wake word -> drop
        await self.push_frame(frame, direction)


def _clear_mlx_cache():
    try:
        import mlx.core as mx
        if hasattr(mx, "clear_cache"):
            mx.clear_cache()
        elif hasattr(mx, "metal") and hasattr(mx.metal, "clear_cache"):
            mx.metal.clear_cache()
    except Exception:
        pass


class MLXCacheCleaner(FrameProcessor):
    """Frees MLX's Metal buffer pool after every transcription. Whisper-MLX allocates GPU buffers per
    transcribe and never frees them — including wake-gate-dropped speech that runs STT but never
    reaches TTS's cache-clear — so without this, transcription slows then hangs over a long session.
    Placed right after STT so it catches ALL transcriptions (gated or not)."""

    async def process_frame(self, frame, direction):
        await super().process_frame(frame, direction)
        await self.push_frame(frame, direction)
        if isinstance(frame, TranscriptionFrame):
            _clear_mlx_cache()


class InputLevelLogger(FrameProcessor):
    """Logs incoming mic level periodically — proves audio is reaching the pipeline (vs a dead
    capture) and shows the level relative to the VAD min_volume gate so we can calibrate."""

    def __init__(self):
        super().__init__()
        self._n = 0

    async def process_frame(self, frame, direction):
        await super().process_frame(frame, direction)
        # VAD events from the VADProcessor (emitted just upstream) — the truthful place to see them.
        if isinstance(frame, VADUserStartedSpeakingFrame):
            logger.info("🗣  VAD FIRED: speech STARTED")
        elif isinstance(frame, VADUserStoppedSpeakingFrame):
            logger.info("🤐 VAD: speech STOPPED → STT transcribing…")
        elif isinstance(frame, InputAudioRawFrame):
            import numpy as np
            a = np.frombuffer(frame.audio, dtype=np.int16).astype("float32") / 32768.0
            peak = float(np.max(np.abs(a))) if a.size else 0.0
            self._n += 1
            # Only speak up when you're actually talking (peak above noise floor), throttled — no spam.
            if peak > 0.08 and self._n % 20 == 0:
                logger.info(f"🎤 hearing you (peak {peak:.2f})")
        await self.push_frame(frame, direction)


class GainAudioFilter(BaseAudioFilter):
    """Boosts the mic signal BEFORE VAD/STT — the DJI's hardware gain is so low that normal speech
    sits near the noise floor, so VAD never fires. Applied in the transport's input filter slot, so
    both Silero VAD and Whisper see the amplified audio. Clips safely on loud peaks."""

    def __init__(self, gain: float = 8.0):
        self._gain = gain

    async def start(self, sample_rate: int):
        pass

    async def stop(self):
        pass

    async def process_frame(self, frame):
        pass

    async def filter(self, audio: bytes) -> bytes:
        import numpy as np
        a = np.frombuffer(audio, dtype=np.int16).astype("float32") * self._gain
        return np.clip(a, -32768, 32767).astype("<i2").tobytes()

REPO = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", ".."))
# Yuri's voice: Kokoro preset bf_isabella (British female). Override via YURI_VOICE / YURI_VOICE_LANG
# (a=American, b=British — e.g. YURI_VOICE=bf_alice, or af_heart with YURI_VOICE_LANG=a).
VOICE = os.environ.get("YURI_VOICE", "bf_isabella")
VOICE_LANG = os.environ.get("YURI_VOICE_LANG", "b")
# Brain: GLM Z.ai brain (yuri-z-brain.py :8014, Z.ai GLM Coding Plan, $0). This is the ONE brain —
# claude-p-brain.py (:8012) is retired (claude -p is a forbidden launch shape). Override with
# BRAIN_PROXY_URL only if you know what you're doing.
PROXY = os.environ.get("BRAIN_PROXY_URL", "http://127.0.0.1:8014/v1")

# The brain proxy folds the conversation itself (claude -p) / drives the real Claude session,
# but Pipecat needs a context/system seed.
SYSTEM = "You are Yuri, the spoken voice assistant. Keep replies short and conversational."

# BRIEF-ON-START
MORNING_BRIEF_SCRIPT = os.path.join(REPO, "_SYSTEM", "runtime", "morning-brief.mjs")


def _time_of_day_greeting(now: "datetime.datetime | None" = None) -> str:
    """Good morning/afternoon/evening Marcel — time-of-day aware, local clock."""
    h = (now or datetime.datetime.now()).hour
    part = "morning" if 5 <= h < 12 else "afternoon" if 12 <= h < 18 else "evening"
    return f"Good {part} Marcel."


async def _fetch_spoken_brief(timeout_s: float = 15.0) -> str | None:
    """Runs `node morning-brief.mjs --spoken` and returns its stdout (already a single
    speakable sentence-joined string — see renderSpoken() in morning-brief.mjs, which
    guarantees >=1 sentence even when every underlying source is unavailable).

    Fails OPEN on every error path (missing script, non-zero exit, empty stdout, timeout,
    node not on PATH, etc.) — returns None and logs one line, never raises. A startup brief
    is a nice-to-have; it must never be able to block or crash the voice loop.
    """
    if os.environ.get("YURI_BRIEF", "1") == "0":
        logger.info("🌅 morning brief disabled (YURI_BRIEF=0)")
        return None
    if not os.path.isfile(MORNING_BRIEF_SCRIPT):
        logger.warning(f"🌅 morning brief skipped — script not found: {MORNING_BRIEF_SCRIPT}")
        return None
    try:
        proc = await asyncio.create_subprocess_exec(
            "node", MORNING_BRIEF_SCRIPT, "--spoken",
            cwd=REPO, stdin=asyncio.subprocess.DEVNULL,
            stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.PIPE,
        )
        try:
            out, err = await asyncio.wait_for(proc.communicate(), timeout=timeout_s)
        except asyncio.TimeoutError:
            proc.kill()
            await proc.wait()
            logger.warning(f"🌅 morning brief skipped — timed out after {timeout_s}s")
            return None
        if proc.returncode != 0:
            logger.warning(f"🌅 morning brief skipped — exit {proc.returncode}: {(err or b'').decode(errors='replace')[:200]!r}")
            return None
        text = (out or b"").decode(errors="replace").strip()
        if not text:
            logger.warning("🌅 morning brief skipped — empty output")
            return None
        return text
    except Exception as e:
        logger.warning(f"🌅 morning brief skipped — {e!r}")
        return None


def _log_audio_devices():
    """Show the ACTUAL mic/speaker Pipecat will use — a wrong/silent default input device
    is the #1 reason 'I talked and nothing happened'."""
    try:
        import sounddevice as sd
        devs = sd.query_devices()
        din, dout = sd.default.device  # (input_idx, output_idx)
        iname = devs[din]["name"] if isinstance(din, int) and din >= 0 else "?"
        oname = devs[dout]["name"] if isinstance(dout, int) and dout >= 0 else "?"
        logger.info(f"🎤 input  (mic):     [{din}] {iname}")
        logger.info(f"🔊 output (speaker): [{dout}] {oname}")
        logger.info("   (wrong device? set it in System Settings ▸ Sound, then relaunch)")
    except Exception as e:
        logger.warning(f"could not query audio devices: {e}")


def _resolve_audio_devices():
    """Resolve input/output PyAudio device indices. Forces a non-Bluetooth input
    (HyperX > built-in > MacBook) so Bluetooth headphones stay on A2DP (high quality).
    Returns (input_index, output_index). output_index is always the current default
    output (never changed). input_index is None if no suitable device found (PyAudio
    uses its default — may trigger Bluetooth HFP).
    Override: YURI_INPUT_DEVICE=<substring> (e.g. 'HyperX'). Disable: YURI_FORCE_BUILTIN_MIC=0."""
    if os.environ.get("YURI_FORCE_BUILTIN_MIC", "1") != "1":
        return None, None
    try:
        import pyaudio
        pa = pyaudio.PyAudio()
        out_idx = pa.get_default_output_device_info()["index"]
        preferred = os.environ.get("YURI_INPUT_DEVICE", "").lower().strip()
        in_idx = None
        for i in range(pa.get_device_count()):
            info = pa.get_device_info_by_index(i)
            name = info.get("name", "").lower()
            if info.get("maxInputChannels", 0) > 0:
                if (preferred and preferred in name) or \
                   (not preferred and ("hyperx" in name or "built-in" in name or "macbook" in name or "internal" in name)):
                    in_idx = i
                    logger.info(f'🎧 input device: [{i}] {info["name"]} — Bluetooth stays on A2DP')
                    break
        if in_idx is None:
            logger.info("🎧 no preferred input found — using system default (Bluetooth HFP may degrade output)")
        pa.terminate()
        return in_idx, out_idx
    except Exception as e:
        logger.warning(f"could not resolve audio devices: {e}")
        return None, None


async def main():
    _audio_in, _audio_out = _resolve_audio_devices()
    _log_audio_devices()
    mic_gain = float(os.environ.get("YURI_MIC_GAIN", "0.7"))  # another ~7dB down (loud street-noise rejection)
    transport = LocalAudioTransport(LocalAudioTransportParams(
        audio_in_enabled=True,
        audio_out_enabled=True,
        input_device_index=_audio_in,
        output_device_index=_audio_out,
        # Boost the quiet DJI mic ~8x before VAD/STT so normal speech clears Silero (no shouting).
        # Tune with YURI_MIC_GAIN (lower if it picks up too much / clips, higher if still missed).
        audio_in_filter=GainAudioFilter(gain=mic_gain),
        # Run output at Kokoro's native 24kHz so the in-pipeline resampler is a no-op (no per-frame
        # seams) and CoreAudio handles any device conversion.
        audio_out_sample_rate=24000,
        # Silero VAD needs 16kHz; pin input there (Pipecat resamples the device correctly).
        # NOTE: in Pipecat 1.3.0 the transport does NOT run vad_analyzer on input — VAD must be a
        # real pipeline stage (VADProcessor, added below). That mis-wiring is why VAD never fired.
        audio_in_sample_rate=16000,
    ))
    # stop_secs (turn-end silence) defined up here so the STT's ttfs_p99_latency can exceed it —
    # otherwise the turn-stop timeout math collapses to 0s ("delayed turn detection" warning).
    stop_secs = float(os.environ.get("YURI_STOP_SECS", "2.0"))
    stt = WhisperSTTServiceMLX(model=MLXModel.LARGE_V3_TURBO_Q4, ttfs_p99_latency=stop_secs + 0.5)
    llm = OpenAILLMService(api_key="local", model="claude-code", base_url=PROXY, max_tokens=4096)
    _tts_engine = os.environ.get("YURI_TTS_ENGINE", "kokoro").lower()
        if _tts_engine == "moss":
            from marvis_tts import MarvisTTSService
            _ref = os.environ.get("YURI_VOICE_REF", os.path.join(os.path.dirname(__file__), "..", "..", "state", "voice", "rick-ref-10s.wav"))
            _ref_txt_path = os.environ.get("YURI_VOICE_REF_TEXT", os.path.join(os.path.dirname(__file__), "..", "..", "state", "voice", "rick-ref-10s.txt"))
            _ref_txt_val = open(_ref_txt_path).read().strip() if os.path.exists(_ref_txt_path) else None
            tts = MarvisTTSService(ref_audio=_ref, ref_text=_ref_txt_val)
            logger.info(f"[TTS] MOSS clone voice (ref: {os.path.basename(_ref)})")
        else:
            tts = KokoroTTSService(voice=VOICE, lang_code=VOICE_LANG,
                                   frame_ms=int(os.environ.get("YURI_TTS_FRAME_MS", "150")))
            logger.info(f"[TTS] Kokoro (voice={VOICE}, frame_ms=150)")

    # VAD as a REAL pipeline stage (Pipecat 1.3.0): emits VADUser{Started,Stopped}SpeakingFrame that
    # the STT service consumes to segment + transcribe. This is the fix — the transport never ran VAD.
    # confidence 0.5 (Silero scores your speech ~0.99 in isolation); min_volume=0 (no volume gate).
    # confidence 0.6 + start_secs 0.3: reject street-noise blips (stops false barge-in mid-sentence).
    # stop_secs (2.0s, defined above): pauses BETWEEN your words don't prematurely end the turn +
    # transcribe a fragment while you're still talking. Raise YURI_STOP_SECS if you buffer longer.
    vad = VADProcessor(vad_analyzer=SileroVADAnalyzer(
        params=VADParams(confidence=0.6, start_secs=0.3, stop_secs=stop_secs, min_volume=0.0)))

    # Voice activation: Yuri stays asleep until you say the wake word, then stays awake for a
    # follow-up window (keepalive) so you don't repeat it every turn. YURI_WAKE_DISABLE=1 = hot mic.
    # Hot mic by default — no wake word. Marcel mutes the mic to control when she listens.
    # Re-enable the wake gate with YURI_WAKE_ENABLE=1 if ever wanted.
    wake_on = os.environ.get("YURI_WAKE_ENABLE", "0") == "1"
    # No overlapping phrases (the filter pushes once per matching pattern → dupes). "yuri" already
    # catches "hey yuri". Whisper may mishear the name — add variants here if it does.
    wake_phrases = [p.strip() for p in os.environ.get("YURI_WAKE_PHRASES", "yuri,rick").split(",") if p.strip()]
    wake = WakeGate(wake_phrases,
                    keepalive=float(os.environ.get("YURI_WAKE_KEEPALIVE", "5"))) if wake_on else None
    if wake:
        logger.info(f"🔒 voice activation ON — wake word(s): {wake_phrases} (say one, then talk; YURI_WAKE_DISABLE=1 for hot mic)")

    # Cancel command: say one of these to abort the current request + restate (your speech also
    # barge-in-stops Yuri). Configurable via YURI_CANCEL_PHRASES.
    cancel_phrases = [p.strip() for p in os.environ.get(
        "YURI_CANCEL_PHRASES", "cancel,never mind,nevermind,scratch that,forget it,start over").split(",") if p.strip()]
    cancel = CancelFilter(cancel_phrases)

    context = LLMContext(messages=[{"role": "system", "content": SYSTEM}])
    agg = LLMContextAggregatorPair(context)

    # INSTANT-BARGE-IN: placed immediately after `vad`, BEFORE stt/InputLevelLogger, so output
    # muting reacts to the raw VADUserStartedSpeakingFrame — the earliest signal pipecat emits —
    # rather than waiting for STT + turn confirmation. See InstantBargeIn's docstring for why.
    barge_in = InstantBargeIn()

    # stt → [wake gate] → HeardLogger: 👂 YOU SAID only logs speech that PASSED the wake gate, so the
    # terminal shows exactly what Yuri acted on (talk without the wake word → 🎤 hearing you but no reply).
    stages = [transport.input(), vad, barge_in, InputLevelLogger(), stt, MLXCacheCleaner()]
    if wake:
        stages.append(wake)
    stages.append(cancel)
    stages += [HeardLogger(), agg.user(), llm, tts, transport.output(), agg.assistant()]
    pipeline = Pipeline(stages)
    # Don't let an idle stretch (Yuri thinking, or just quiet) cancel the pipeline + kill the bot.
    # Always-on assistant: it stays up until you Ctrl-C, no matter how long between turns.
    task = PipelineTask(pipeline, cancel_on_idle_timeout=False, cancel_runner_on_idle_timeout=False)

    # Yuri speaks first: proves the output path end-to-end on launch (if you hear this, the
    # speaker + TTS work and any later silence is an input problem), and is the first
    # "JARVIS speaks unprompted" primitive.
    greeting = os.environ.get("YURI_GREETING", "Yuri online. Say my name whenever you need me.")

    # BRIEF-ON-START: fetch the spoken morning brief (fail-open, 15s budget) and prefix it with a
    # time-of-day greeting, e.g. "Good morning Marcel. <brief sentences>". Queued as ONE
    # TTSSpeakFrame (append_to_context defaults True — see pipecat/frames/frames.py TTSSpeakFrame
    # + llm_response_universal.py's _handle_text/_handle_push_aggregation, read directly from the
    # installed package): the assistant-side aggregator (agg.assistant(), after tts in the stage
    # list below) writes it into LLM context as an assistant turn, so the brain already "knows"
    # it opened with the brief instead of re-greeting. Still fully cancellable by barge-in — it's
    # a normal TTSSpeakFrame flowing through the same tts -> transport.output() stages as any
    # other reply, and InstantBargeIn/broadcast_interruption() don't special-case frame origin.
    brief_text = await _fetch_spoken_brief()
    if brief_text:
        opening = f"{_time_of_day_greeting()} {brief_text}"
        await task.queue_frame(TTSSpeakFrame(opening, append_to_context=True))
    elif greeting.strip():
        await task.queue_frame(TTSSpeakFrame(greeting))

    logger.info("🎙  voice loop live — just talk (no wake word yet). Ctrl-C to stop.")
    await PipelineRunner().run(task)


if __name__ == "__main__":
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        pass
