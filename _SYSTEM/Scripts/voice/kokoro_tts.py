#!/usr/bin/env python3
# @capability: kokoro-tts-pipecat
# @serves: kokoro tts pipecat service | yuri voice preset | mlx kokoro frame processor | clean fast tts apple silicon
# @does: a Pipecat TTSService wrapping mlx-audio Kokoro-82M with a PRESET voice (default bf_isabella,
#        British female — Yuri's voice). Natively-trained voice (not a clone), RTF ~0.1 warm. All MLX work
#        on ONE dedicated thread (Metal stream is thread-local), full-synth-then-frame (smooth), resample
#        once (no per-chunk seams), MLX cache cleared per turn. Same hardened infra as the MOSS service.
# @use: the TTS stage of bot.py. Construct with voice= + lang_code= (a=American, b=British). Override at
#        runtime with YURI_VOICE / YURI_VOICE_LANG. Voice list: af_*/am_* (American), bf_*/bm_* (British).
# @exports: KokoroTTSService
import asyncio
import re
from concurrent.futures import ThreadPoolExecutor
from typing import AsyncGenerator

import numpy as np
from loguru import logger

from pipecat.frames.frames import Frame, TTSAudioRawFrame, ErrorFrame
from pipecat.services.tts_service import TTSService
from pipecat.services.settings import TTSSettings


def _clear_mlx_cache():
    """Release pooled Metal buffers after each synth — keeps an always-on bot memory-bounded."""
    try:
        import mlx.core as mx
        if hasattr(mx, "clear_cache"):
            mx.clear_cache()
        elif hasattr(mx, "metal") and hasattr(mx.metal, "clear_cache"):
            mx.metal.clear_cache()
    except Exception:
        pass


def _normalize(t: str) -> str:
    """Make text speakable + phonemizer-safe. The Kokoro phonemizer chokes on markdown and fancy
    punctuation (→ 'words count mismatch' → broadcast_shapes crash) — and you don't speak asterisks
    anyway. Strip markdown, normalize dashes/quotes, turn newlines into sentence breaks (which also
    lets the sentence-splitter chunk long bulleted replies into short, safe pieces)."""
    t = (t.replace("—", ", ").replace("–", ", ").replace("…", ". ")
         .replace("“", '"').replace("”", '"').replace("‘", "'").replace("’", "'"))
    t = re.sub(r"[*#`_~]+", "", t)              # bold/italic/headers/code/strikethrough markers
    t = re.sub(r"(?m)^\s*[-•·]\s*", "", t)       # leading bullet markers
    t = re.sub(r"\s*\n+\s*", ". ", t)            # newlines → sentence breaks
    t = re.sub(r"\s+", " ", t)                   # collapse whitespace
    t = re.sub(r"(\.\s*){2,}", ". ", t)          # de-dupe runs of periods
    return t.strip()


class KokoroTTSService(TTSService):
    """Preset-voice TTS via mlx-audio Kokoro-82M. Synthesizes the full reply on a dedicated MLX
    thread, then yields fixed-size TTSAudioRawFrame chunks for smooth playback + barge-in."""

    def __init__(self, *, model_path: str = "prince-canuma/Kokoro-82M", voice: str = "bf_isabella",
                 lang_code: str = "b", speed: float = 1.0, frame_ms: int = 300,
                 sample_rate: int | None = None, **kwargs):
        kwargs.setdefault("settings", TTSSettings(model=None, voice=None, language=None))
        super().__init__(sample_rate=sample_rate, **kwargs)
        self._voice = voice
        self._lang = lang_code
        self._speed = speed
        self._frame_ms = frame_ms
        self._model_sr = 24000  # Kokoro native
        # MLX's Metal GPU stream is THREAD-LOCAL — the thread that loads the model must also run
        # generate(). One persistent single-thread executor owns all MLX work.
        self._ex = ThreadPoolExecutor(max_workers=1, thread_name_prefix="kokoro-mlx")
        logger.info(f"[kokoro] loading {model_path} (voice={voice}, lang={lang_code}) ...")
        self._model = self._ex.submit(self._load, model_path).result()
        logger.info("[kokoro] model ready")
        try:
            self._ex.submit(self._warm).result()
            logger.info("[kokoro] warmed (first reply will be fast)")
        except Exception as e:
            logger.warning(f"[kokoro] warmup skipped: {e}")

    @staticmethod
    def _load(model_path: str):
        import mlx.core as mx  # noqa: F401  — initialize MLX on THIS (the dedicated) thread
        from mlx_audio.tts.utils import load_model
        return load_model(model_path)

    def _warm(self):
        for _seg in self._model.generate(text="Ready.", voice=self._voice, lang_code=self._lang, speed=self._speed):
            pass
        _clear_mlx_cache()

    def can_generate_metrics(self) -> bool:
        return False

    async def run_tts(self, text: str, context_id: str) -> AsyncGenerator[Frame, None]:
        logger.debug(f"[kokoro] {text!r}")
        loop = asyncio.get_event_loop()
        q: asyncio.Queue = asyncio.Queue()

        def produce():
            try:
                # Synthesize PER SENTENCE: each generate() call is short + single-segment, which
                # sidesteps Kokoro's multi-segment concat that throws "broadcast_shapes" on longer
                # replies. One bad sentence is skipped, not the whole reply (graceful degradation).
                norm = _normalize(text)
                sentences = [s.strip() for s in re.split(r"(?<=[.!?])\s+", norm) if s.strip()] or [norm]
                produced = False
                for sent in sentences:
                    try:
                        cs = []
                        for seg in self._model.generate(text=sent, voice=self._voice, lang_code=self._lang, speed=self._speed):
                            a = seg.audio if hasattr(seg, "audio") else seg
                            a = np.asarray(a, dtype=np.float32).squeeze()
                            a = a.mean(axis=1) if a.ndim > 1 else a
                            cs.append(a)
                        if cs:
                            audio = np.concatenate(cs)
                            pcm = (np.clip(audio, -1.0, 1.0) * 32767.0).astype("<i2").tobytes()
                            loop.call_soon_threadsafe(q.put_nowait, pcm)
                            produced = True
                    except Exception as e:
                        logger.warning(f"[kokoro] skipped a sentence ({e}): {sent!r}")
                if not produced:
                    loop.call_soon_threadsafe(q.put_nowait, RuntimeError("no audio produced"))
            except Exception as e:  # surface synth errors as a frame, never crash the pipeline
                loop.call_soon_threadsafe(q.put_nowait, e)
            finally:
                _clear_mlx_cache()
                loop.call_soon_threadsafe(q.put_nowait, None)

        self._ex.submit(produce)

        # Consume per-sentence audio pieces (produce emits one pcm chunk per synthesized sentence).
        first = True
        bpf = max(2, int(self.sample_rate * self._frame_ms / 1000) * 2)  # bytes/frame (mono int16)
        while True:
            item = await q.get()
            if item is None:
                break
            if isinstance(item, Exception):
                if first:
                    yield ErrorFrame(error=f"Kokoro TTS error: {item}")
                break
            if first:
                await self.stop_ttfb_metrics()
                first = False
            resampled = await self._resampler.resample(item, self._model_sr, self.sample_rate)
            for i in range(0, len(resampled), bpf):
                yield TTSAudioRawFrame(resampled[i:i + bpf], self.sample_rate, 1, context_id=context_id)
