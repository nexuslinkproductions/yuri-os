#!/usr/bin/env python3
# @capability: mlx-clone-tts-pipecat
# @serves: mlx clone tts pipecat service | moss nano voice clone | yuri voice tts frame processor | low latency cloned voice
# @does: a Pipecat TTSService wrapping an mlx-audio clone-capable model (default MOSS-TTS-Nano-100M, the
#        bake-off winner — the SAME recipe as voice-mlx-server.py: clone from rick-ref-10s.wav + its ref_text).
#        All MLX work runs on ONE dedicated thread (MLX's Metal GPU stream is thread-local), synthesizes the
#        full utterance then emits fixed audio frames (smooth playback — the model is slower than realtime so
#        streaming live would stutter), resamples the model's native rate to the transport, clears the MLX
#        cache each turn. Class name kept as MarvisTTSService for import stability.
# @use: the TTS stage of bot.py. Construct with ref_audio=<ref wav> + ref_text=<its transcript> (ref_text is
#        what makes the clone sound right — without it you get a robotic default speaker).
# @exports: MarvisTTSService
import asyncio
from concurrent.futures import ThreadPoolExecutor
from typing import AsyncGenerator

import numpy as np
from loguru import logger

from pipecat.frames.frames import Frame, TTSAudioRawFrame, ErrorFrame
from pipecat.services.tts_service import TTSService
from pipecat.services.settings import TTSSettings


def _clear_mlx_cache():
    """Release pooled Metal buffers after each synth — without this an always-on bot leaks GPU
    memory unbounded (the >10GB PTT leak, same fix). Defensive across MLX API versions."""
    try:
        import mlx.core as mx
        if hasattr(mx, "clear_cache"):
            mx.clear_cache()
        elif hasattr(mx, "metal") and hasattr(mx.metal, "clear_cache"):
            mx.metal.clear_cache()
    except Exception:
        pass


def _mono(a):
    """mlx-audio clone models (MOSS) emit stereo (N,2); collapse to mono float32 1-D."""
    a = np.asarray(a, dtype=np.float32).squeeze()
    if a.ndim > 1:
        a = a.mean(axis=0) if a.shape[0] < a.shape[1] else a.mean(axis=1)
    return a


class MarvisTTSService(TTSService):
    """Cloned-voice TTS via an mlx-audio model. Synthesizes the full reply on a dedicated MLX
    thread, then yields fixed-size TTSAudioRawFrame chunks for smooth playback + barge-in."""

    def __init__(self, *, model_path: str = "mlx-community/MOSS-TTS-Nano-100M", ref_audio: str,
                 ref_text: str | None = None, frame_ms: int = 300,
                 sample_rate: int | None = None, **kwargs):
        # This service has no remote model/voice/language settings — give the base a complete
        # TTSSettings so its validator doesn't log a spurious "NOT_GIVEN" ERROR at startup.
        kwargs.setdefault("settings", TTSSettings(model=None, voice=None, language=None))
        super().__init__(sample_rate=sample_rate, **kwargs)
        self._ref = ref_audio
        self._ref_text = ref_text
        self._frame_ms = frame_ms
        # MLX's Metal GPU stream is THREAD-LOCAL. The thread that loads the model must also be the
        # thread that runs generate(), or generate() dies with "no Stream(gpu, 0) in current thread".
        # One persistent single-thread executor owns ALL MLX work: stream persists turn-to-turn,
        # synthesis runs off the event loop (so barge-in/VAD stay responsive), and calls serialize.
        self._ex = ThreadPoolExecutor(max_workers=1, thread_name_prefix="mlx-tts")
        logger.info(f"[tts] loading {model_path} (dedicated MLX thread) ...")
        self._model, self._model_sr = self._ex.submit(self._load, model_path).result()
        logger.info(f"[tts] model ready (sr={self._model_sr}, ref_text={'yes' if ref_text else 'NO — clone will be weak'})")
        # Warm the MLX graph once: cold first-gen is ~1.6 RTF, warm is ~0.35 RTF. Pay the
        # compile at startup so the FIRST real reply is already fast.
        try:
            self._ex.submit(self._warm).result()
            logger.info("[tts] warmed (first reply will be fast)")
        except Exception as e:
            logger.warning(f"[tts] warmup skipped: {e}")

    @staticmethod
    def _load(model_path: str):
        import mlx.core as mx  # noqa: F401  — initialize MLX on THIS (the dedicated) thread
        from mlx_audio.tts.utils import load_model
        m = load_model(model_path)
        sr = int(getattr(m, "sample_rate", None) or getattr(m, "sr", 24000))
        return m, sr

    def _warm(self):
        for _seg in self._model.generate(text="Ready.", ref_audio=self._ref, ref_text=self._ref_text):
            pass
        _clear_mlx_cache()

    def can_generate_metrics(self) -> bool:
        return False

    async def run_tts(self, text: str, context_id: str) -> AsyncGenerator[Frame, None]:
        logger.debug(f"[tts] {text!r}")
        loop = asyncio.get_event_loop()
        q: asyncio.Queue = asyncio.Queue()

        def produce():
            try:
                chunks = []
                for seg in self._model.generate(text=text, ref_audio=self._ref, ref_text=self._ref_text):
                    a = seg.audio if hasattr(seg, "audio") else seg
                    chunks.append(_mono(a))
                audio = np.concatenate(chunks) if chunks else np.zeros(0, dtype=np.float32)
                pcm = (np.clip(audio, -1.0, 1.0) * 32767.0).astype("<i2").tobytes()
                loop.call_soon_threadsafe(q.put_nowait, pcm)  # the WHOLE utterance, one piece
            except Exception as e:  # surface synth errors as a frame, never crash the pipeline
                loop.call_soon_threadsafe(q.put_nowait, e)
            finally:
                _clear_mlx_cache()
                loop.call_soon_threadsafe(q.put_nowait, None)

        self._ex.submit(produce)  # the dedicated MLX thread — NOT the default executor pool

        item = await q.get()
        if isinstance(item, Exception):
            yield ErrorFrame(error=f"TTS error: {item}")
            return
        if not item:
            return
        await self.stop_ttfb_metrics()
        # Resample the ENTIRE utterance in ONE call — per-chunk resampling leaves a discontinuity
        # at every frame boundary ("choking on its own words"). Then slice the continuous resampled
        # PCM into fixed frames; byte-slicing adds no artifacts (pure buffering for playback/barge-in).
        resampled = await self._resampler.resample(item, self._model_sr, self.sample_rate)
        bpf = max(2, int(self.sample_rate * self._frame_ms / 1000) * 2)  # bytes/frame (mono int16)
        for i in range(0, len(resampled), bpf):
            yield TTSAudioRawFrame(resampled[i:i + bpf], self.sample_rate, 1, context_id=context_id)
