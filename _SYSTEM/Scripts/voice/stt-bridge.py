#!/usr/bin/env python3
# @capability: voice-stt-bridge
# @serves: speech to text subprocess | whisper mlx stt | silero vad mic | yuri voice input bridge
# @does: stdin JSON cmds -> HyperX mic + Silero VAD + Whisper-MLX -> stdout JSON. Runs as a child
#        process of the Yuri voice orchestrator. CAPTURE AND DECODE ARE DECOUPLED: a persistent
#        capture thread holds the mic stream open for the whole process lifetime and VAD-segments
#        utterances continuously; a decoder thread transcribes each utterance on its own thread
#        (MLX is thread-local) so the mic keeps capturing utterance N+1 while Whisper transcribes N.
#        No audio is lost during transcription. Half-duplex timing (when to listen vs. when TTS is
#        playing) is owned by the orchestrator; this bridge reports the next fresh transcription for
#        each {"cmd":"listen"} request.
# @use: `.venv-pipecat/bin/python stt-bridge.py`. Waits for stdin `{"cmd":"listen"}` lines, replies
#       with transcription JSON on stdout. All diagnostics go to stderr (stdout carries ONLY protocol
#       JSON).
"""STT bridge: stdin JSON commands -> continuous mic + VAD + Whisper -> stdout JSON.

Protocol (one JSON object per line over stdio):
    in:  {"cmd":"listen"}                  return the next fresh transcription
    out: {"status":"ready"}                emitted once at startup, after the Whisper model loads
    out: {"text":"transcription"}          successful transcription (text may be "")
    out: {"text":"","status":"timeout"}    no speech completed within the timeout window

Architecture (Phase 2 capture-decode decoupling):
    - Capture thread  : opens the PyAudio input stream ONCE, reads 16kHz/mono/int16 frames
                        continuously, runs Silero VAD inline, and emits a float32 utterance to
                        `decode_queue` each time VAD signals end-of-speech (stop_secs trailing
                        silence) or the MAX_RECORD_SECS hard cap trips.
    - Decoder thread  : owns the Whisper model (loaded on THIS thread; MLX Metal is thread-local).
                        Pulls utterances from `decode_queue`, transcribes with the R5 tuning
                        (initial_prompt + condition_on_previous_text), pushes results to
                        `result_queue`. Decoder backpressure drops the oldest pending chunk.
    - Main thread     : on {"cmd":"listen"} drains any stale (pre-request) results to avoid
                        surfacing TTS-echo / pre-request speech, then waits up to LISTEN_TIMEOUT
                        for the next fresh result.

Run with the pipecat venv so pipecat / mlx-whisper / pyaudio / numpy resolve:
    _SYSTEM/state/voice/.venv-pipecat/bin/python _SYSTEM/Scripts/voice/stt-bridge.py
"""
import json
import os
import queue
import sys
import threading
import time

import numpy as np
import pyaudio

from pipecat.audio.vad.silero import SileroVADAnalyzer
from pipecat.audio.vad.vad_analyzer import VADParams, VADState
from mlx_whisper import transcribe

# --- config -----------------------------------------------------------------
SAMPLE_RATE = 16000
CHUNK_FRAMES = 512                         # Silero VAD block size @ 16kHz (num_frames_required)
CHANNELS = 1
LISTEN_TIMEOUT = 15.0                      # secs to wait for a fresh transcription -> else timeout
MAX_RECORD_SECS = 60.0                     # hard cap on a single utterance (anti-hang safety)
WHISPER_MODEL = os.environ.get(
    "YURI_WHISPER_MODEL", "mlx-community/whisper-large-v3-turbo-q4"
)

# VAD params — unified, env-overridable, research-backed defaults (R1/R2).
VAD_CONFIDENCE = float(os.environ.get("YURI_VAD_CONFIDENCE", "0.5"))
VAD_START_SECS = float(os.environ.get("YURI_VAD_START_SECS", "0.15"))
VAD_STOP_SECS = float(os.environ.get("YURI_VAD_STOP_SECS", "2.5"))  # slow/thoughtful pause tolerance

# Whisper tuning (R5): initial_prompt seeds task vocabulary + filler/pause capture;
# condition_on_previous_text stitches fragmented thoughts across 30s windows.
WHISPER_LANGUAGE = os.environ.get("YURI_WHISPER_LANGUAGE", "en")  # Marcel speaks English
WHISPER_INITIAL_PROMPT = os.environ.get(
    "YURI_WHISPER_INITIAL_PROMPT",
    "Voice dictation transcript. Pauses are normal. Transcribe verbatim including filler words.",
)
WHISPER_CONDITION_PREVIOUS = os.environ.get("YURI_WHISPER_CONDITION_PREVIOUS", "1") == "1"
WHISPER_NO_SPEECH_THRESH = float(os.environ.get("YURI_WHISPER_NO_SPEECH_THRESH", "0.6"))
WHISPER_HALLUC_SILENCE = float(os.environ.get("YURI_WHISPER_HALLUC_SILENCE_THRESH", "2.0"))

# Decoder backpressure: drop oldest pending chunk when this many utterances are queued.
# Single-speaker M2 Pro should never hit this; it only guards against a stuck decoder.
DECODE_QUEUE_LIMIT = 2


def _log(msg):
    """All diagnostics -> stderr. stdout is reserved for protocol JSON."""
    print(msg, file=sys.stderr, flush=True)


# --- device resolution (mirrors bot.py::_resolve_audio_devices) -------------
def resolve_input_device(pa):
    """Return PyAudio input device index whose name contains 'hyperx', else None (PyAudio default).

    Same env knobs as bot.py: YURI_INPUT_DEVICE=<substring> overrides the match string;
    YURI_FORCE_BUILTIN_MIC=0 disables resolution entirely (lets the system default win)."""
    if os.environ.get("YURI_FORCE_BUILTIN_MIC", "1") != "1":
        return None
    preferred = os.environ.get("YURI_INPUT_DEVICE", "").lower().strip()
    for i in range(pa.get_device_count()):
        info = pa.get_device_info_by_index(i)
        if info.get("maxInputChannels", 0) <= 0:
            continue
        name = info.get("name", "").lower()
        if (preferred and preferred in name) or ("hyperx" in name):
            _log(f"[stt] input device: [{i}] {info['name']}")
            return i
    _log("[stt] no HyperX input found - using PyAudio default")
    return None


# --- VAD setup --------------------------------------------------------------
def make_vad():
    """Build the Silero VAD analyzer with the unified, env-driven VAD params.

    min_volume is set to 0.0 deliberately: pipecat's default VAD_MIN_VOLUME (0.6) is normalized
    EBU-R128 loudness on a 32ms block, which real speech never reaches (~0.1-0.3), so the volume
    gate would block ALL frames and the VAD would never fire. The repo's own mic-vad-check.py uses
    0.0 for the same reason. The required confidence/start_secs/stop_secs are honored exactly.
    """
    vad = SileroVADAnalyzer(
        params=VADParams(
            confidence=VAD_CONFIDENCE,
            start_secs=VAD_START_SECS,
            stop_secs=VAD_STOP_SECS,
            min_volume=0.0,
        )
    )
    vad.set_sample_rate(SAMPLE_RATE)
    return vad


def reset_vad(vad):
    """Reset the VAD state machine + internal buffer for a fresh utterance."""
    vad._vad_buffer = b""
    vad._vad_state = VADState.QUIET
    vad._vad_starting_count = 0
    vad._vad_stopping_count = 0


# --- capture thread (persistent mic stream + VAD segmentation) --------------
def _enqueue_utterance(audio_chunks, decode_queue):
    """Normalize int16 frames -> float32 and enqueue for decode, with backpressure."""
    if not audio_chunks:
        return
    audio_int16 = np.frombuffer(b"".join(audio_chunks), dtype=np.int16)
    audio_f32 = audio_int16.astype(np.float32) / 32768.0
    duration = audio_f32.size / SAMPLE_RATE
    # Backpressure: if the decoder can't keep up, drop the OLDEST pending chunk so the newest
    # speech wins. Single-speaker M2 Pro should never trigger this.
    while decode_queue.qsize() >= DECODE_QUEUE_LIMIT:
        try:
            decode_queue.get_nowait()
            _log("[stt] decode backlog - dropped oldest pending chunk")
        except queue.Empty:
            break
    decode_queue.put(audio_f32)
    _log(f"[stt] utterance queued for decode ({duration:.2f}s)")


def capture_worker(pa, vad, device_index, decode_queue, stop_event, speaking_event):
    """Open the mic ONCE and run VAD segmentation for the whole process lifetime.

    Emits a float32 utterance to `decode_queue` on end-of-speech (VAD -> QUIET after stop_secs
    trailing silence) or when MAX_RECORD_SECS is reached. The stream is never closed between
    utterances, so audio capture continues uninterrupted while the decoder transcribes.
    """
    stream = pa.open(
        format=pyaudio.paInt16,
        channels=CHANNELS,
        rate=SAMPLE_RATE,
        input=True,
        input_device_index=device_index,
        frames_per_buffer=CHUNK_FRAMES,
    )
    _log("[stt] capture stream opened (persistent - mic stays open for process lifetime)")

    provisional = []          # onset frames captured during STARTING, promoted only if SPEAKING follows
    audio_chunks = []         # confirmed utterance capture
    confirmed = False
    utterance_start = None

    try:
        while not stop_event.is_set():
            data = stream.read(CHUNK_FRAMES, exception_on_overflow=False)
            state = vad._run_analyzer(data)

            if not confirmed:
                if state == VADState.STARTING:
                    provisional.append(data)                    # preserve onset
                elif state == VADState.SPEAKING:
                    confirmed = True
                    audio_chunks = provisional + [data]
                    provisional = []
                    utterance_start = time.monotonic()
                    speaking_event.set()
                    _log("[stt] speech start detected")
                else:                                          # QUIET (STOPPING can't precede SPEAKING)
                    provisional = []                           # discard a false-start blip
            else:
                audio_chunks.append(data)
                if state == VADState.QUIET:
                    _log("[stt] speech end detected (trailing silence)")
                    _enqueue_utterance(audio_chunks, decode_queue)
                    audio_chunks = []
                    confirmed = False
                    utterance_start = None
                    provisional = []
                    speaking_event.clear()
                    reset_vad(vad)
                    continue
                if utterance_start is not None and (
                    time.monotonic() - utterance_start >= MAX_RECORD_SECS
                ):
                    _log("[stt] hard record cap reached - flushing partial")
                    _enqueue_utterance(audio_chunks, decode_queue)
                    audio_chunks = []
                    confirmed = False
                    utterance_start = None
                    provisional = []
                    speaking_event.clear()
                    reset_vad(vad)
    except Exception as e:
        _log(f"[stt] capture thread error: {e!r}")
    finally:
        try:
            stream.stop_stream()
        except Exception:
            pass
        try:
            stream.close()
        except Exception:
            pass
        _log("[stt] capture stream closed")
    speaking_event.clear()


# --- decoder thread (owns the Whisper model; MLX is thread-local) -----------
def _run_transcribe(audio_f32):
    """Transcribe one utterance with the R5 tuning. Falls back to the critical subset if the
    installed mlx_whisper rejects any of the optional kwargs (skip silently per spec)."""
    kwargs = dict(
        path_or_hf_repo=WHISPER_MODEL,
        language=WHISPER_LANGUAGE,
        initial_prompt=WHISPER_INITIAL_PROMPT,
        condition_on_previous_text=WHISPER_CONDITION_PREVIOUS,
        no_speech_threshold=WHISPER_NO_SPEECH_THRESH,
        hallucination_silence_threshold=WHISPER_HALLUC_SILENCE,
        verbose=None,
    )
    try:
        return transcribe(audio_f32, **kwargs)
    except TypeError as e:
        # A kwarg isn't supported by this mlx_whisper build -> retry the critical subset only.
        _log(f"[stt] whisper kwarg rejected ({e!r}); retrying with critical subset")
        return transcribe(
            audio_f32,
            path_or_hf_repo=WHISPER_MODEL,
            language=WHISPER_LANGUAGE,
            initial_prompt=WHISPER_INITIAL_PROMPT,
            condition_on_previous_text=WHISPER_CONDITION_PREVIOUS,
            verbose=None,
        )


def decoder_worker(decode_queue, result_queue, ready_event, stop_event):
    """Decode loop: loads + owns the Whisper model on THIS thread, transcribes utterances."""
    try:
        _log(f"[stt] loading Whisper ({WHISPER_MODEL}) on decoder thread ...")
        # Force the model load + prime the cached singleton with 1s of silence so the first real
        # utterance isn't penalized by a cold load. Done here (not main) because MLX Metal is
        # thread-local and the decoder thread must own the model.
        transcribe(np.zeros(SAMPLE_RATE, dtype=np.float32),
                   path_or_hf_repo=WHISPER_MODEL, verbose=None)
        _log("[stt] whisper model loaded on decoder thread")
    except Exception as e:
        _log(f"[stt] whisper warmup error: {e!r}")
    finally:
        ready_event.set()  # unblock main either way (so the orchestrator isn't stuck on a load failure)

    while not stop_event.is_set():
        try:
            audio_f32 = decode_queue.get(timeout=0.5)
        except queue.Empty:
            continue
        try:
            duration = audio_f32.size / SAMPLE_RATE
            _log(f"[stt] transcribing {duration:.2f}s ...")
            result = _run_transcribe(audio_f32)
            text = (result.get("text") or "").strip()
            _log(f"[stt] -> {text!r}")
            result_queue.put({"text": text, "ts": time.monotonic()})
        except Exception as e:
            _log(f"[stt] decode error: {e!r}")
            result_queue.put({"text": "", "ts": time.monotonic(), "error": str(e)})


# --- main loop --------------------------------------------------------------
def main():
    pa = pyaudio.PyAudio()
    device_index = resolve_input_device(pa)
    vad = make_vad()

    decode_queue = queue.Queue()
    result_queue = queue.Queue()
    stop_event = threading.Event()
    ready_event = threading.Event()
    # set by the capture thread while a VAD-confirmed utterance is in progress; lets the main loop
    # extend its wait past LISTEN_TIMEOUT so slow-start speech (Marcel's pattern) isn't cut off.
    speaking_event = threading.Event()

    # daemon threads: die with the process; we never join them on a graceful stdin close.
    capture_thread = threading.Thread(
        target=capture_worker,
        args=(pa, vad, device_index, decode_queue, stop_event, speaking_event),
        daemon=True,
        name="stt-capture",
    )
    decoder_thread = threading.Thread(
        target=decoder_worker,
        args=(decode_queue, result_queue, ready_event, stop_event),
        daemon=True,
        name="stt-decoder",
    )

    decoder_thread.start()
    capture_thread.start()

    # Wait for the Whisper model to load on the decoder thread before signalling ready - the
    # orchestrator gates its first {"cmd":"listen"} on this line.
    ready_event.wait()
    print(json.dumps({"status": "ready"}), flush=True)
    _log('[stt] ready - awaiting {"cmd":"listen"} on stdin')

    for line in sys.stdin:
        line = line.strip()
        if not line:
            continue
        try:
            cmd = json.loads(line)
        except json.JSONDecodeError as e:
            _log(f"[stt] bad JSON on stdin ({e}): {line!r}")
            continue
        if cmd.get("cmd") != "listen":
            _log(f"[stt] ignoring unknown cmd: {cmd!r}")
            continue

        listen_arrived = time.monotonic()

        # Drain stale results (completed BEFORE this request arrived). With continuous capture the
        # mic is always running, so utterances produced while no listen was pending (e.g. TTS echo,
        # or speech during the orchestrator's processing turn) would otherwise leak into this reply.
        # Anything timestamped after listen_arrived is fresh and gets requeued for pickup below.
        drained = 0
        while True:
            try:
                stale = result_queue.get_nowait()
            except queue.Empty:
                break
            if stale.get("ts", 0.0) > listen_arrived:
                result_queue.put(stale)              # fresh (produced after listen) - keep it
                break
            drained += 1
        if drained:
            _log(f"[stt] drained {drained} stale result(s) before listen")

        deadline = listen_arrived + LISTEN_TIMEOUT
        text = None
        extended = False
        while text is None:
            remaining = deadline - time.monotonic()
            if remaining <= 0:
                # LISTEN_TIMEOUT elapsed with no fresh result. If the capture thread has a
                # VAD-confirmed utterance in progress, Marcel started speaking just before the
                # window closed - extend once (bounded by MAX_RECORD_SECS) so we capture it
                # instead of timing out mid-sentence.
                if not extended and speaking_event.is_set():
                    extended = True
                    deadline = time.monotonic() + MAX_RECORD_SECS
                    _log("[stt] speech in progress at timeout - extending wait")
                    continue
                break
            try:
                item = result_queue.get(timeout=remaining)
            except queue.Empty:
                if extended and not speaking_event.is_set():
                    break                                      # extended window expired, speech ended
                continue
            if item.get("ts", 0.0) < listen_arrived:
                continue                              # lost a race during drain - keep draining
            text = item.get("text", "")

        try:
            if text is None:
                print(json.dumps({"text": "", "status": "timeout"}), flush=True)
            else:
                print(json.dumps({"text": text}), flush=True)
        except Exception as e:                        # never let one bad reply kill the bridge
            _log(f"[stt] reply error: {e!r}")

    stop_event.set()
    _log("[stt] stdin closed - exiting")


if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        _log("[stt] interrupted")
    finally:
        sys.exit(0)
