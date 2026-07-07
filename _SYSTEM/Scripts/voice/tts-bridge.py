#!/usr/bin/env python3
"""TTS bridge — Kokoro-82M MLX synthesis with JSON-lines stdin/stdout protocol.

Protocol (one JSON object per line):
  stdin:   {"cmd":"speak","text":"sentence to speak"}
  stdout:  {"status":"ready"} on startup
           {"status":"done"} after each speak completes
  stderr:  all logging (model load, synth, playback, errors)

Model is loaded ONCE at startup. Synthesis + playback run on the main thread
between stdin reads — the sequential protocol guarantees no concurrent MLX work,
which keeps the Metal GPU stream happy (it's thread-local).

Reuse: synthesis helpers (_normalize, _chunks, _synth, _clear_mlx_cache) are
inlined from kokoro_tts.py so this bridge stays self-contained — no pipecat
dependency for a standalone process that only needs text → PCM → speaker.
"""
import gc
import json
import logging
import os
import re
import sys, threading
_stop_event = threading.Event()

import numpy as np
import pyaudio

# ─── config ──────────────────────────────────────────────────────────────────
MODEL_PATH = "prince-canuma/Kokoro-82M"
VOICE = "bf_isabella"        # Yuri's voice — British female (natively trained)
LANG_CODE = "b"              # British English
SPEED = 1.15
SAMPLE_RATE = 24000          # Kokoro native — no resampling needed
SEAM_GAP_S = 0.01            # 10ms silence between stitched chunks
CHUNK_MAXLEN = 32            # short pieces synth reliably (dodges broadcast_shapes)

logging.basicConfig(
    level=os.environ.get("YURI_TTS_LOG", "INFO"),
    stream=sys.stderr,
    format="%(asctime)s [tts-bridge] %(levelname)s %(message)s",
)
log = logging.getLogger("tts-bridge")


# ─── MLX / synth helpers (inlined from kokoro_tts.py) ────────────────────────

def _clear_mlx_cache():
    """Release pooled Metal buffers + GC pass after each synth — keeps a
    long-running bridge memory-bounded (Metal allocator recycles instead of growing)."""
    try:
        import mlx.core as mx
        if hasattr(mx, "metal") and hasattr(mx.metal, "clear_cache"):
            mx.metal.clear_cache()
        elif hasattr(mx, "clear_cache"):
            mx.clear_cache()
    except Exception:
        pass
    try:
        gc.collect()
    except Exception:
        pass


def _normalize(t: str) -> str:
    """Make text speakable + phonemizer-safe. Kokoro's g2p (misaki) emits
    'words count mismatch' (→ broadcast_shapes vocoder crash) when a whitespace-split
    token contains an embedded symbol or no-space dot. Normalize so every token is
    a clean speakable word/number the g2p can align."""
    t = (t.replace("—", ", ").replace("–", ", ").replace("…", ". ")
         .replace("“", '"').replace("”", '"').replace("‘", "'").replace("’", "'"))
    t = re.sub(r"[*#`_~]+", "", t)              # bold/italic/headers/code/strikethrough markers
    t = re.sub(r"(?m)^\s*[-•·]\s*", "", t)       # leading bullet markers
    t = re.sub(r"\s*\n+\s*", ". ", t)            # newlines → sentence breaks
    t = re.sub(r"(?<=[A-Za-z0-9])\.(?=[A-Za-z0-9])", " ", t)  # no-space dots → space
    t = re.sub(r"[^0-9A-Za-z\s.,!?'-]", " ", t)  # drop symbols → space
    t = re.sub(r"\s+", " ", t)                   # collapse whitespace
    t = re.sub(r"(\.\s*){2,}", ". ", t)          # de-dupe runs of periods
    if not re.search(r"[A-Za-z0-9]", t):
        return ""  # punctuation-only → nothing to speak
    return t.strip()


def _chunks(text, maxlen=CHUNK_MAXLEN):
    """Split text into short, synth-safe pieces: by sentence, then by comma for long
    sentences. The mlx-audio Kokoro vocoder throws broadcast_shapes on some longer
    single generate() calls; short pieces synth reliably, so we feed it short pieces."""
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


def _synth(model, text, voice, lang, speed):
    """Generate mono float32 audio for one piece of text."""
    cs = []
    for seg in model.generate(text=text, voice=voice, lang_code=lang, speed=speed):
        a = seg.audio if hasattr(seg, "audio") else seg
        a = np.asarray(a, dtype=np.float32).squeeze()
        a = a.mean(axis=1) if a.ndim > 1 else a
        cs.append(a)
    return np.concatenate(cs) if cs else np.zeros(0, dtype=np.float32)


# ─── model load (main thread — Metal stream is thread-local) ─────────────────

def load_model():
    """Load Kokoro-82M MLX model. Caps Metal memory for long-running sessions."""
    import mlx.core as mx  # initialize MLX context on THIS thread (main)
    try:
        if hasattr(mx, "metal") and hasattr(mx.metal, "set_memory_limit"):
            cap = int(os.environ.get("YURI_MLX_MEM_LIMIT_MB", "2048"))
            if cap > 0:
                mx.metal.set_memory_limit(cap * 1024 * 1024)
                log.info(f"Metal memory limit: {cap}MB")
    except Exception as e:
        log.warning(f"could not set Metal memory limit: {e}")
    from mlx_audio.tts.utils import load_model as _load
    return _load(MODEL_PATH)


def warm_model(model):
    """Synth a throwaway sentence so the first real reply is fast."""
    try:
        for _seg in model.generate(text="Ready.", voice=VOICE, lang_code=LANG_CODE, speed=SPEED):
            pass
        _clear_mlx_cache()
        log.info("warmup complete")
    except Exception as e:
        log.warning(f"warmup skipped: {e}")


# ─── robust synthesis (chunked + fallback, proven in kokoro_tts.py) ──────────

def _try_synth(model, text):
    """One synth attempt; returns float32 audio or None on crash (no raise)."""
    try:
        a = _synth(model, text, VOICE, LANG_CODE, SPEED)
        return a if (a is not None and a.size) else None
    except Exception as e:
        log.warning(f"chunk synth failed ({str(e)[:60]}): {text[:50]!r}")
        return None


def synth_robust(model, norm):
    """Synthesize by stitching short, synth-safe chunks — dodges the mlx-audio
    Kokoro broadcast_shapes bug. A crashing chunk is re-split into 4-word then
    2-word groups; a 2-word pair that still crashes is skipped (rare, tiny).
    Returns None if everything crashes or input is empty."""
    if not norm:
        return None
    gap = np.zeros(int(SAMPLE_RATE * SEAM_GAP_S), dtype=np.float32)
    out = []

    def emit(t):
        a = _try_synth(model, t)
        if a is not None:
            out.append(a)
            out.append(gap)
            return True
        return False

    for chunk in _chunks(norm):
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


# ─── audio output ────────────────────────────────────────────────────────────

def resolve_output_device(pa):
    """PyAudio system default output index (XM5 headphones)."""
    try:
        info = pa.get_default_output_device_info()
        log.info(f"output device #{info['index']}: {info['name']} "
                 f"({info['maxOutputChannels']}ch)")
        return info["index"]
    except Exception as e:
        log.warning(f"could not resolve default output device ({e}), "
                    f"using system default")
        return None


def play_pcm(pa, out_idx, pcm):
    """Open a 24kHz mono int16 output stream, play PCM in chunks (stoppable), close."""
    stream = pa.open(
        format=pyaudio.paInt16,
        channels=1,
        rate=SAMPLE_RATE,
        output=True,
        output_device_index=out_idx,
    )
    try:
        chunk = 8192  # ~340ms @ 24kHz — stop granularity
        for i in range(0, len(pcm), chunk):
            if _stop_event.is_set():
                log.debug("playback stopped mid-sentence (barge-in)")
                break
            stream.write(pcm[i:i + chunk])
        stream.stop_stream()
    finally:
        stream.close()


def synth_and_play(model, pa, out_idx, text):
    _stop_event.clear()
    """Normalize → synth → convert to int16 PCM → play → clear MLX cache."""
    norm = _normalize(text)
    if not norm:
        log.debug(f"nothing to speak after normalize: {text[:60]!r}")
        return
    audio = synth_robust(model, norm)
    if audio is None or not audio.size:
        log.warning(f"no audio after retries — staying silent: {norm[:60]!r}")
        return
    pcm = (np.clip(audio, -1.0, 1.0) * 32767.0).astype("<i2").tobytes()
    try:
        play_pcm(pa, out_idx, pcm)
    except Exception as e:
        log.error(f"playback failed: {e}")
    finally:
        _clear_mlx_cache()


# ─── main loop ───────────────────────────────────────────────────────────────

def main():
    log.info(f"loading {MODEL_PATH} (voice={VOICE}, lang={LANG_CODE}, speed={SPEED}) ...")
    model = load_model()
    log.info("model loaded")
    warm_model(model)

    pa = pyaudio.PyAudio()
    out_idx = resolve_output_device(pa)

    # Signal readiness — orchestrator waits for this before sending commands.
    print(json.dumps({"status": "ready"}), flush=True)

    for line in sys.stdin:
        line = line.strip()
        if not line:
            continue
        try:
            cmd = json.loads(line)
        except json.JSONDecodeError as e:
            log.warning(f"malformed JSON, skipping: {line[:80]!r} ({e})")
            continue
        c = cmd.get("cmd")
        if c == "speak":
            text = cmd.get("text", "")
            log.debug(f"speak: {text[:80]!r}")
            synth_and_play(model, pa, out_idx, text)
            print(json.dumps({"status": "done"}), flush=True)
        elif c == "stop":
            _stop_event.set()
            log.debug("stop requested — will abort after current chunk")
            continue
        elif c == "quit":
            log.info("quit command — shutting down")
            break
        else:
            log.debug(f"unknown command, ignoring: {c!r}")

    # stdin closed → clean shutdown
    log.info("stdin EOF — shutting down")
    try:
        pa.terminate()
    except Exception:
        pass


if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        log.info("interrupted")
        sys.exit(0)
