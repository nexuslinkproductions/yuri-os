#!/usr/bin/env python3
"""TTS bridge — Kokoro-82M MLX synthesis with JSON-lines stdin/stdout protocol.

Protocol (one JSON object per line):
  stdin:   {"cmd":"speak","text":"sentence to speak"}
  stdout:  {"status":"ready"} on startup
           {"status":"done"} after each speak completes
  stderr:  all logging (model load, synth, playback, errors)

Model is loaded ONCE at startup. All synthesis + all PyAudio work stay on the
main thread — the Metal GPU stream is thread-local, so MLX work must never run
concurrently. A second, MLX-free thread only reads stdin and dispatches: a
"stop" command sets _stop_event immediately (even mid-playback), everything
else is handed to the main thread's sequential queue — this is what lets
barge-in actually interrupt an in-progress speak instead of queuing behind it.

Synthesis strategy: each speak synthesizes the FULL received text in ONE
model.generate() call — Kokoro is a sentence-level prosody model and the
orchestrator already sends one sentence per call, so this is normally a single
continuous pass with no internal seams, gaps, or per-fragment breath artifacts.
This bridge used to pre-chunk into <=32-char pieces (then 4-word, then 2-word
groups on failure) to dodge a real mlx-audio bug — that word-level shredding,
with a hard breath-inducing gap stitched between every isolated fragment, was
the actual source of the "2-3 words then pause, heavy breathing" defect. The
underlying bug is now patched at its root — see
_patch_kokoro_sinegen_length_bug() below, applied once at model load — so
whole-text synthesis is the reliable common case. Sentence- then clause-level
splitting (never word-level) is kept only as a last-resort fallback for
whatever the patch doesn't cover.

Reuse: synthesis helpers (_normalize, _synth, _clear_mlx_cache) are inlined
from kokoro_tts.py so this bridge stays self-contained — no pipecat dependency
for a standalone process that only needs text → PCM → speaker.
"""
import gc
import json
import logging
import os
import queue
import re
import sys, threading
_stop_event = threading.Event()

import numpy as np
import pyaudio

# ─── config ──────────────────────────────────────────────────────────────────
MODEL_PATH = "prince-canuma/Kokoro-82M"
VOICE = "bf_isabella"        # Yuri's voice — British female (natively trained)
LANG_CODE = "b"              # British English
# 1.15 keeps the existing tuned pace (~178wpm on a typical reply — brisk but
# well inside natural conversational range). The reported "unusable" defect
# was 100% structural fragmentation, not pace, so the default is unchanged;
# override by ear without touching code via YURI_TTS_SPEED.
SPEED = float(os.environ.get("YURI_TTS_SPEED", "1.15"))
SAMPLE_RATE = 24000          # Kokoro native — no resampling needed
CLAUSE_GAP_S = 0.15          # natural clause-boundary pause (fallback stitching only)
FADE_S = 0.008               # short edge fade so a stitched seam isn't a click

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


def _split_sentences(text):
    """Split into sentence-level units at . ! ? boundaries (punctuation stays
    attached to its sentence). Only used when a whole-text synth has failed."""
    return [s.strip() for s in re.split(r"(?<=[.!?])\s+", (text or "").strip()) if s.strip()]


def _split_clauses(text):
    """Split ONE sentence into clause-level units at , ; boundaries (punctuation
    stays attached). Last-resort granularity when a whole sentence still fails
    after the top-level retry — never split below this. Word-level splitting is
    exactly what produced the '2-3 word bundling + breath' artifact this
    redesign replaces, so it is not a step in this ladder."""
    return [c.strip() for c in re.split(r"(?<=[,;])\s+", (text or "").strip()) if c.strip()]


def _synth(model, text, voice, lang, speed):
    """Generate mono float32 audio for one piece of text in a single
    model.generate() pass (concatenating the rare multi-segment case, e.g. text
    over Kokoro's ~510-phoneme-per-segment internal limit — never triggered by
    a normal single sentence)."""
    cs = []
    for seg in model.generate(text=text, voice=voice, lang_code=lang, speed=speed):
        a = seg.audio if hasattr(seg, "audio") else seg
        a = np.asarray(a, dtype=np.float32).squeeze()
        a = a.mean(axis=1) if a.ndim > 1 else a
        cs.append(a)
    return np.concatenate(cs) if cs else np.zeros(0, dtype=np.float32)


# ─── model load (main thread — Metal stream is thread-local) ─────────────────

def _patch_kokoro_sinegen_length_bug():
    """Runtime monkeypatch (no vendor files touched — tts-bridge.py is the only
    file this project owns) for the real mlx-audio bug that forced the old
    chunk-and-shred fallback in the first place.

    Root cause (confirmed by full traceback + exact shape values, e.g. observed
    crash "Shapes (1,37800,1) and (1,38100,9) cannot be broadcast", reproduced
    standalone in /tmp/kokoro_probe.py): mlx_audio/tts/models/kokoro/istftnet.py's
    SineGen._f02sine() adds phase jitter cheaply by interpolating its
    radian-phase tensor DOWN by 1/upsample_scale and back UP by upsample_scale
    (upsample_scale=300 for this model/config). Both interpolate() calls
    (mlx_audio/tts/models/interpolate.py) size their output as
    ceil(in_width * scale_factor); when the intermediate length isn't an exact
    multiple of 300 — the common case, since it depends on the predicted
    phoneme-duration total, an essentially arbitrary integer — ceil() on the
    way down and ceil() on the way back up don't invert, so the returned
    `sines` tensor comes back longer than f0 by up to one hop frame (confirmed
    empirically: always drifts by exactly +300 samples when it drifts at all —
    6/22 and 5/22 test sentences at speed 1.0 and 1.15 respectively, in
    /tmp/kokoro_probe.py's unpatched run). SineGen.__call__ then builds
    `uv`/`noise` straight off the ORIGINAL, un-drifted f0 and multiplies them
    against the drifted `sines` (istftnet.py line 620) — that length mismatch
    is the exact broadcast_shapes crash. It is data-dependent (the predicted
    total duration frame count), not "long text bad" — a two-word fragment can
    trip it just as easily as a full sentence, which is why the old
    word-shredding fallback only ever reduced the odds of hitting a bad
    length, it never eliminated the bug (confirmed: e.g. "Hey Marcel." and
    "You there?" — both well under the old 32-char chunk limit — crash on
    their own at speed 1.15).

    The fix (same one landed upstream on mlx-audio main post-0.4.4, commit
    cc30ce27 "Fix SineGen length alignment", unreleased on PyPI as of the
    0.4.4 pinned in this venv): pad/truncate `sines` back to f0's own length
    right after _f02sine() produces it. A no-op whenever the lengths already
    match (the common case) — this can only ever repair the drifted case, it
    can never alter already-correct audio. Empirically validated: 22/22 test
    sentences (including every sentence that crashed unpatched) synthesize
    cleanly in one pass at both speed 1.0 and 1.15 once this is applied.
    """
    try:
        from mlx_audio.tts.models.kokoro import istftnet
        import mlx.core as mx
    except Exception as e:
        log.warning(f"kokoro SineGen patch skipped (import failed, clause-level "
                    f"fallback remains the only crash defense): {e}")
        return False

    SineGen = getattr(istftnet, "SineGen", None)
    if SineGen is None or not hasattr(SineGen, "_f02sine"):
        log.warning("kokoro SineGen patch skipped (class shape changed upstream, "
                    "clause-level fallback remains the only crash defense)")
        return False
    if getattr(SineGen, "_yuri_length_patched", False):
        return True  # already patched (e.g. load_model called more than once)

    _orig_f02sine = SineGen._f02sine

    def _f02sine_length_matched(self, f0_values):
        sines = _orig_f02sine(self, f0_values)
        target = f0_values.shape[1]
        got = sines.shape[1]
        if got == target:
            return sines
        log.debug(f"SineGen length drift caught: {got} -> {target} samples "
                  f"(delta={got - target:+d}); realigning")
        if got > target:
            return sines[:, :target, :]
        return mx.pad(sines, [(0, 0), (0, target - got), (0, 0)])

    SineGen._f02sine = _f02sine_length_matched
    SineGen._yuri_length_patched = True
    log.info("patched mlx_audio SineGen._f02sine (broadcast_shapes root-cause fix)")
    return True


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
    _patch_kokoro_sinegen_length_bug()
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


# ─── robust synthesis (whole-text first, clause-level fallback only) ─────────

def _try_synth(model, text):
    """One synth attempt over the given text; returns float32 audio or None on
    crash (no raise). No trailing-punctuation stripping — '.', '!', '?' carry
    real intonation and the SineGen patch above removes the need to dodge them."""
    text = (text or "").strip()
    if not text:
        return None
    try:
        a = _synth(model, text, VOICE, LANG_CODE, SPEED)
        return a if (a is not None and a.size) else None
    except Exception as e:
        log.warning(f"chunk synth failed ({str(e)[:60]}): {text[:50]!r}")
        return None


def _edge_fade(a, fade_in, fade_out, n):
    """Linear fade on just the requested edge(s) — used only at an internal
    stitch seam so it reads as a soft pause, never at the utterance's true
    start/end (those keep the model's own onset/decay untouched)."""
    if n <= 0 or a.size < 2 * n or not (fade_in or fade_out):
        return a
    a = a.copy()
    ramp = np.linspace(0.0, 1.0, n, dtype=np.float32)
    if fade_in:
        a[:n] *= ramp
    if fade_out:
        a[-n:] *= ramp[::-1]
    return a


def _stitch(pieces):
    """Join fallback fragments with a natural clause-boundary pause instead of
    the old 10ms hard-silence seam (short enough to read as a stutter, not a
    pause) — plus a short edge fade so the splice itself isn't audible as a
    click. Only internal seams are faded/gapped; a single piece passes through
    untouched (the common whole-text-succeeded case never reaches _stitch at
    all — see synth_robust)."""
    if not pieces:
        return None
    if len(pieces) == 1:
        return pieces[0]
    n = int(SAMPLE_RATE * FADE_S)
    gap = np.zeros(int(SAMPLE_RATE * CLAUSE_GAP_S), dtype=np.float32)
    last = len(pieces) - 1
    out = []
    for i, p in enumerate(pieces):
        out.append(_edge_fade(p, fade_in=(i > 0), fade_out=(i < last), n=n))
        if i < last:
            out.append(gap)
    return np.concatenate(out)


def synth_robust(model, norm):
    """Synthesize the whole utterance as ONE continuous model.generate() pass —
    the common path: Kokoro is a sentence-level prosody model and the
    orchestrator already sends one sentence per call, so this is normally a
    single pass with no internal gaps or per-fragment breath artifacts. Only on
    failure do we degrade — first to sentence units (. ! ?), then to
    comma/semicolon clauses. Never below clause granularity: a clause that
    still fails is logged and skipped, not shredded into words. Returns None
    if input is empty or everything fails."""
    if not norm:
        return None

    whole = _try_synth(model, norm)
    if whole is not None:
        log.debug(f"single-pass synth ok ({whole.size / SAMPLE_RATE:.2f}s, "
                  f"{len(norm)} chars): {norm[:60]!r}")
        return whole

    log.warning(f"whole-text synth failed, degrading to sentence/clause units: {norm[:60]!r}")
    out = []
    for sentence in _split_sentences(norm):
        piece = _try_synth(model, sentence)
        if piece is not None:
            out.append(piece)
            continue
        log.warning(f"sentence synth failed, degrading to clauses: {sentence[:60]!r}")
        for clause in _split_clauses(sentence):
            cpiece = _try_synth(model, clause)
            if cpiece is not None:
                out.append(cpiece)
            else:
                log.warning(f"clause synth failed, skipping (no word-level shredding): {clause[:60]!r}")
    return _stitch(out)


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
    """Normalize → synth (one continuous pass) → convert to int16 PCM → play → clear MLX cache."""
    _stop_event.clear()
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

def _stdin_reader(cmd_q):
    """Reads stdin on its own thread so a 'stop' command can flip _stop_event
    the instant it arrives — even while the main thread is deep inside a
    blocking play_pcm() call for the speak currently in flight. This thread
    does no MLX/Metal/PyAudio work (that all stays on the main thread, per the
    thread-local Metal stream requirement above); it only parses JSON and
    either sets _stop_event directly (stop) or hands the command to the main
    thread's sequential queue (speak/quit/anything else) so those keep the
    exact same one-at-a-time processing order as before."""
    for line in sys.stdin:
        line = line.strip()
        if not line:
            continue
        try:
            cmd = json.loads(line)
        except json.JSONDecodeError as e:
            log.warning(f"malformed JSON, skipping: {line[:80]!r} ({e})")
            continue
        if cmd.get("cmd") == "stop":
            _stop_event.set()
            log.debug("stop requested — aborting current playback")
            continue
        cmd_q.put(cmd)
    cmd_q.put(None)  # stdin closed — tell the main loop to shut down


def main():
    log.info(f"loading {MODEL_PATH} (voice={VOICE}, lang={LANG_CODE}, speed={SPEED}) ...")
    model = load_model()
    log.info("model loaded")
    warm_model(model)

    pa = pyaudio.PyAudio()
    out_idx = resolve_output_device(pa)

    cmd_q = queue.Queue()
    threading.Thread(target=_stdin_reader, args=(cmd_q,), daemon=True).start()

    # Signal readiness — orchestrator waits for this before sending commands.
    print(json.dumps({"status": "ready"}), flush=True)

    while True:
        cmd = cmd_q.get()
        if cmd is None:
            log.info("stdin EOF — shutting down")
            break
        c = cmd.get("cmd")
        if c == "speak":
            text = cmd.get("text", "")
            log.debug(f"speak: {text[:80]!r}")
            synth_and_play(model, pa, out_idx, text)
            print(json.dumps({"status": "done"}), flush=True)
        elif c == "quit":
            log.info("quit command — shutting down")
            break
        else:
            log.debug(f"unknown command, ignoring: {c!r}")

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
