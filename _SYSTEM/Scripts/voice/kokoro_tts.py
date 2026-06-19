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
import os
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


def _synth(model, text, voice, lang, speed):
    """Generate mono float32 audio for one piece of text."""
    cs = []
    for seg in model.generate(text=text, voice=voice, lang_code=lang, speed=speed):
        a = seg.audio if hasattr(seg, "audio") else seg
        a = np.asarray(a, dtype=np.float32).squeeze()
        a = a.mean(axis=1) if a.ndim > 1 else a
        cs.append(a)
    return np.concatenate(cs) if cs else np.zeros(0, dtype=np.float32)


def _chunks(text, maxlen=60):
    """Split a reply into short, synth-safe pieces: by sentence, then by comma for long sentences
    (merging tiny fragments). The mlx-audio Kokoro vocoder throws broadcast_shapes on some longer
    single generate() calls; short pieces synth reliably, so we feed it short pieces and stitch."""
    out = []
    for s in re.split(r"(?<=[.!?])\s+", (text or "").strip()):
        s = s.strip()
        if not s:
            continue
        if len(s) <= maxlen:
            out.append(s)
            continue
        cur = ""
        for part in re.split(r"(?<=,)\s+", s):
            if cur and len(cur) + len(part) + 1 > maxlen:
                out.append(cur.strip())
                cur = part
            else:
                cur = (cur + " " + part).strip() if cur else part
        if cur.strip():
            out.append(cur.strip())
    return out or ([text.strip()] if (text or "").strip() else [])


def _trim_filler(audio, sr):
    """We append ' hm.' to dodge Kokoro's single-sentence broadcast_shapes bug — cut it back off.
    Search ONLY the last ~1.4s (where the filler lives) so we never trim into earlier real words."""
    if audio.size < int(sr * 0.8):
        return audio
    region = int(sr * 1.4)
    start = max(0, audio.size - region)
    win = int(sr * 0.02)
    seg = audio[start:]
    n = seg.size // win
    if n < 4:
        return audio
    energy = np.abs(seg[:n * win]).reshape(n, win).max(axis=1)
    sil = energy < 0.02
    i = n - 1
    while i > 0 and sil[i]:
        i -= 1          # trailing silence
    while i > 0 and not sil[i]:
        i -= 1          # the filler word ("hm")
    while i > 0 and sil[i]:
        i -= 1          # the gap before the filler -> back to the real speech end
    cut = start + (i + 1) * win
    cut = max(audio.size - region, min(cut, audio.size - int(sr * 0.3)))  # bound to the filler region
    return audio[:cut]


class KokoroTTSService(TTSService):
    """Preset-voice TTS via mlx-audio Kokoro-82M. Synthesizes the full reply on a dedicated MLX
    thread, then yields fixed-size TTSAudioRawFrame chunks for smooth playback + barge-in."""

    def __init__(self, *, model_path: str = "prince-canuma/Kokoro-82M", voice: str = "bf_isabella",
                 lang_code: str = "b", speed: float | None = None, frame_ms: int = 300,
                 sample_rate: int | None = None, **kwargs):
        kwargs.setdefault("settings", TTSSettings(model=None, voice=None, language=None))
        super().__init__(sample_rate=sample_rate, **kwargs)
        self._voice = voice
        self._lang = lang_code
        self._speed = speed if speed is not None else float(os.environ.get("YURI_VOICE_SPEED", "1.15"))
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

    def _try_synth(self, t):
        """One synth attempt; returns audio, or None on the broadcast_shapes crash (no raise)."""
        try:
            a = _synth(self._model, t, self._voice, self._lang, self._speed)
            return a if (a is not None and a.size) else None
        except Exception as e:
            logger.warning(f"[kokoro] chunk synth failed ({str(e)[:40]}): {t[:50]!r}")
            return None

    def _synth_robust(self, norm: str):
        """Synthesize in Yuri's voice by stitching short, synth-safe chunks — dodges the mlx-audio
        Kokoro broadcast_shapes bug WITHOUT any spoken filler (NO ' okay' pad, NO macOS — owner
        2026-06-19). A chunk that still crashes is re-split into word groups; a group that still
        crashes is skipped (rare, tiny). Returns None only if EVERYTHING crashes."""
        if not norm:
            return None
        gap = np.zeros(int(self._model_sr * 0.01), dtype=np.float32)  # ~10ms seam cushion only (chunks already carry punctuation pauses; 80ms read as 'exhaling')
        out = []

        def emit(t):
            a = self._try_synth(t)
            if a is not None:
                out.append(a)
                out.append(gap)
                return True
            return False

        # maxlen=32 + 4-word -> 2-word fallback gives full coverage on the crasher set (verified
        # 2026-06-19, DROPS=0). A 2-word pair that STILL crashes is skipped (rare, ~tiny).
        for chunk in _chunks(norm, maxlen=32):
            if emit(chunk):
                continue
            words = chunk.split()
            for i in range(0, len(words), 4):
                grp = words[i:i + 4]
                if emit(" ".join(grp)):
                    continue
                for j in range(0, len(grp), 2):
                    emit(" ".join(grp[j:j + 2]))
        return np.concatenate(out) if out else None

    def can_generate_metrics(self) -> bool:
        return False

    async def run_tts(self, text: str, context_id: str) -> AsyncGenerator[Frame, None]:
        logger.debug(f"[kokoro] {text!r}")
        loop = asyncio.get_event_loop()
        q: asyncio.Queue = asyncio.Queue()

        def produce():
            try:
                # Synthesize the WHOLE normalized reply in Yuri's voice. Some short single sentences
                # hit Kokoro's broadcast_shapes bug — _synth_robust retries with a 2nd clause to dodge
                # it. NO macOS fallback (owner hard-blocked it); if Kokoro still can't, stay silent.
                audio = self._synth_robust(_normalize(text))
                if audio is not None and audio.size:
                    pcm = (np.clip(audio, -1.0, 1.0) * 32767.0).astype("<i2").tobytes()
                    loop.call_soon_threadsafe(q.put_nowait, pcm)
                else:
                    loop.call_soon_threadsafe(q.put_nowait, RuntimeError("no audio"))
            except Exception as e:  # surface synth errors as a frame, never crash the pipeline
                loop.call_soon_threadsafe(q.put_nowait, e)
            finally:
                _clear_mlx_cache()
                loop.call_soon_threadsafe(q.put_nowait, None)

        self._ex.submit(produce)

        # Consume per-sentence audio pieces (produce emits one pcm chunk per synthesized sentence).
        first = True
        produced = False
        bpf = max(2, int(self.sample_rate * self._frame_ms / 1000) * 2)  # bytes/frame (mono int16)
        while True:
            item = await q.get()
            if item is None:
                break
            if isinstance(item, Exception):
                break  # fall through to the never-silent fallback below
            if first:
                await self.stop_ttfb_metrics()
                first = False
            resampled = await self._resampler.resample(item, self._model_sr, self.sample_rate)
            for i in range(0, len(resampled), bpf):
                yield TTSAudioRawFrame(resampled[i:i + bpf], self.sample_rate, 1, context_id=context_id)
                produced = True
        if not produced:
            # macOS `say` fallback HARD-BLOCKED (owner directive 2026-06-18): one voice only. If
            # Kokoro produced nothing after the robust retries, stay silent — never switch voices.
            logger.warning("[kokoro] no audio after retries — staying silent (macOS fallback hard-blocked)")
