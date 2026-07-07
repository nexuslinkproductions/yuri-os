#!/usr/bin/env python3
# @capability: voice-stt-bridge
# @serves: speech to text subprocess | whisper mlx stt | silero vad mic | yuri voice input bridge
# @does: stdin JSON cmds -> HyperX mic + Silero VAD + Whisper-MLX -> stdout JSON. Designed to run as a
#        child process of the Yuri voice orchestrator. Half-duplex: the mic is only open during an
#        active listen cycle, so it never captures the TTS playback on a different output device.
# @use: `.venv-pipecat/bin/python stt-bridge.py`. Waits for stdin `{"cmd":"listen"}` lines, replies with
#       transcription JSON on stdout. All diagnostics go to stderr (stdout carries ONLY protocol JSON).
"""STT bridge: stdin JSON commands -> mic + VAD + Whisper -> stdout JSON.

Protocol (one JSON object per line over stdio):
    in:  {"cmd":"listen"}                  start one capture + transcribe cycle
    out: {"status":"ready"}                emitted once at startup, after models load
    out: {"text":"transcription"}          successful transcription (text may be "")
    out: {"text":"","status":"timeout"}    no speech detected within the timeout window

Audio pipeline: PyAudio 16kHz/mono/int16 -> Silero VAD (segment utterance) -> mlx_whisper.

Run with the pipecat venv so pipecat / mlx-whisper / pyaudio / numpy resolve:
    _SYSTEM/state/voice/.venv-pipecat/bin/python _SYSTEM/Scripts/voice/stt-bridge.py
"""
import json
import os
import sys
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
LISTEN_TIMEOUT = 15.0                      # secs to wait for speech to start -> else timeout
MAX_RECORD_SECS = 30.0                     # hard cap on a single utterance (anti-hang safety)
WHISPER_MODEL = os.environ.get(
    "YURI_WHISPER_MODEL", "mlx-community/whisper-large-v3-turbo-q4"
)


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


# --- VAD + model setup (loaded on the MAIN thread before the loop) ----------
def make_vad():
    """Build the Silero VAD analyzer.

    min_volume is set to 0.0 deliberately: pipecat's default VAD_MIN_VOLUME (0.6) is normalized
    EBU-R128 loudness on a 32ms block, which real speech never reaches (~0.1-0.3), so the volume
    gate would block ALL frames and the VAD would never fire. The repo's own mic-vad-check.py uses
    0.0 for the same reason. The required confidence/start_secs/stop_secs are honored exactly.
    """
    vad = SileroVADAnalyzer(
        params=VADParams(confidence=0.5, start_secs=0.15, stop_secs=2.5, min_volume=0.0)  # 2.5s pause tolerance for slow/thoughtful speech
    )
    vad.set_sample_rate(SAMPLE_RATE)
    return vad


def warmup_whisper():
    """Load the Whisper model on the main thread.

    MLX's Metal stream is thread-local; lazy-loading on a later worker thread would break. We force
    the load here by transcribing 1s of silence, which also primes the cached model singleton so the
    first real utterance isn't penalized by a cold load.
    """
    _log(f"[stt] warming up Whisper ({WHISPER_MODEL}) ...")
    transcribe(np.zeros(SAMPLE_RATE, dtype=np.float32),
               path_or_hf_repo=WHISPER_MODEL, verbose=None)
    _log("[stt] whisper model loaded")


def reset_vad(vad):
    """Reset the VAD state machine + internal buffer for a fresh utterance."""
    vad._vad_buffer = b""
    vad._vad_state = VADState.QUIET
    vad._vad_starting_count = 0
    vad._vad_stopping_count = 0


# --- one capture + transcribe cycle ----------------------------------------
def listen_once(pa, vad, device_index, timeout=LISTEN_TIMEOUT):
    """Open the mic, VAD-segment one utterance, transcribe it.

    Returns the transcription text (possibly ""), or None when no speech started within `timeout`.
    We drive the VAD synchronously via _run_analyzer (the analyzer's sync core) rather than the
    async analyze_audio(), because this bridge is a blocking stdin loop with no event loop.
    """
    reset_vad(vad)
    stream = pa.open(
        format=pyaudio.paInt16,
        channels=CHANNELS,
        rate=SAMPLE_RATE,
        input=True,
        input_device_index=device_index,
        frames_per_buffer=CHUNK_FRAMES,
    )

    confirmed = False          # SPEAKING reached -> sustained speech confirmed
    provisional = []           # onset frames captured from STARTING, kept only if SPEAKING follows
    audio_chunks = []          # confirmed capture
    started_at = time.monotonic()
    hard_cap = started_at + MAX_RECORD_SECS
    try:
        while True:
            now = time.monotonic()
            if not confirmed and now - started_at >= timeout:
                return None                                     # no speech within the window
            if confirmed and now >= hard_cap:
                _log("[stt] hard record cap reached - transcribing partial")
                break

            data = stream.read(CHUNK_FRAMES, exception_on_overflow=False)
            state = vad._run_analyzer(data)

            if not confirmed:
                if state == VADState.STARTING:
                    provisional.append(data)                    # preserve onset
                elif state == VADState.SPEAKING:
                    confirmed = True
                    audio_chunks = provisional + [data]
                    provisional = []
                else:                                           # QUIET (STOPPING can't precede SPEAKING)
                    provisional = []                            # discard a false-start blip
            else:
                audio_chunks.append(data)
                if state == VADState.QUIET:
                    break                                       # end of speech (stop_secs trailing silence)
    finally:
        try:
            stream.stop_stream()
        except Exception:
            pass
        stream.close()

    if not audio_chunks:
        return None

    # mlx_whisper expects a float32 waveform normalized to [-1, 1] (matching load_audio's
    # int16->float32 / 32768.0 path). Feeding raw int16 would corrupt the mel spectrogram.
    audio_int16 = np.frombuffer(b"".join(audio_chunks), dtype=np.int16)
    audio_f32 = audio_int16.astype(np.float32) / 32768.0
    _log(f"[stt] transcribing {audio_f32.size / SAMPLE_RATE:.2f}s ...")
    result = transcribe(audio_f32, path_or_hf_repo=WHISPER_MODEL, verbose=None)
    text = (result.get("text") or "").strip()
    _log(f"[stt] -> {text!r}")
    return text


# --- main loop --------------------------------------------------------------
def main():
    pa = pyaudio.PyAudio()
    device_index = resolve_input_device(pa)
    vad = make_vad()
    warmup_whisper()

    # The orchestrator waits for this line before sending the first listen command.
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
        try:
            text = listen_once(pa, vad, device_index)
        except Exception as e:                                  # never let one bad cycle kill the bridge
            _log(f"[stt] listen error: {e!r}")
            text = None
        if text is None:
            print(json.dumps({"text": "", "status": "timeout"}), flush=True)
        else:
            print(json.dumps({"text": text}), flush=True)

    _log("[stt] stdin closed - exiting")


if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        _log("[stt] interrupted")
    finally:
        sys.exit(0)
