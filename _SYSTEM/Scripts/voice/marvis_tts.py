#!/usr/bin/env python3
# @capability: marvis-rick-tts-pipecat
# @serves: marvis streaming tts pipecat service | rick voice clone streaming | mlx tts frame processor | low latency cloned voice
# @does: a Pipecat TTSService wrapping mlx-audio Marvis-TTS — streams cloned-Rick audio chunks (stream=True, ~0.5s interval) into the voice pipeline. MLX-native, no float64 crashes.
# @use: the TTS stage of bot.py (Pipecat voice rebuild). Construct with ref_audio=<rick ref wav>.
# @exports: MarvisTTSService
import asyncio
from typing import AsyncGenerator

import numpy as np
from loguru import logger

from pipecat.frames.frames import Frame, TTSAudioRawFrame, ErrorFrame
from pipecat.services.tts_service import TTSService
from mlx_audio.tts.utils import load_model


class MarvisTTSService(TTSService):
    """Streaming cloned-voice TTS via mlx-audio Marvis. Yields TTSAudioRawFrame chunks as
    Marvis generates, so time-to-first-audio is ~one streaming_interval, not the full synth."""

    def __init__(self, *, model_path: str = "Marvis-AI/marvis-tts-250m-v0.2", ref_audio: str,
                 ref_text: str | None = None, streaming_interval: float = 0.5,
                 sample_rate: int | None = None, **kwargs):
        super().__init__(sample_rate=sample_rate, **kwargs)
        self._ref = ref_audio
        self._ref_text = ref_text
        self._interval = streaming_interval
        self._model_sr = 24000  # Marvis native; self._resampler comes from the TTSService base
        logger.info(f"[marvis] loading {model_path} ...")
        self._model = load_model(model_path)
        logger.info("[marvis] model ready")

    def can_generate_metrics(self) -> bool:
        return False

    async def run_tts(self, text: str, context_id: str) -> AsyncGenerator[Frame, None]:
        logger.debug(f"[marvis] TTS: {text!r}")
        loop = asyncio.get_event_loop()
        q: asyncio.Queue = asyncio.Queue()

        def produce():
            try:
                for seg in self._model.generate(
                    text=text, ref_audio=self._ref, ref_text=self._ref_text,
                    stream=True, streaming_interval=self._interval, verbose=False,
                ):
                    a = np.array(seg.audio, dtype=np.float32).reshape(-1)
                    pcm = (np.clip(a, -1.0, 1.0) * 32767.0).astype("<i2").tobytes()
                    loop.call_soon_threadsafe(q.put_nowait, pcm)
            except Exception as e:  # surface synth errors as a frame, never crash the pipeline
                loop.call_soon_threadsafe(q.put_nowait, e)
            finally:
                loop.call_soon_threadsafe(q.put_nowait, None)

        loop.run_in_executor(None, produce)

        first = True
        while True:
            item = await q.get()
            if item is None:
                break
            if isinstance(item, Exception):
                yield ErrorFrame(error=f"Marvis TTS error: {item}")
                break
            if first:
                await self.stop_ttfb_metrics()
                first = False
            audio = await self._resampler.resample(item, self._model_sr, self.sample_rate)
            yield TTSAudioRawFrame(audio, self.sample_rate, 1, context_id=context_id)
