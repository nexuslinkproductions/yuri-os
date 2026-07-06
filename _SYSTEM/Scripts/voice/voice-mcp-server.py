#!/usr/bin/env python3
# @capability: voice-mcp-server
# @serves: voice tools for OMP/Composer | MCP voice_listen voice_speak | brain-driven voice | kokoro whisper silero
# @does: an MCP server (JSON-RPC 2.0 over stdio) that exposes the Pipecat audio components as on-demand
#        tools a brain (Composer in OMP) can call — NOT a Pipecat pipeline. voice_listen() opens the mic,
#        runs Silero VAD, and returns a Whisper-MLX transcription. voice_speak(text) synthesizes via
#        Kokoro-82M and plays it, with mic-VAD barge-in. The brain drives the voice: listen → think → speak.
# @use: spawned by OMP as an MCP server: _SYSTEM/state/voice/.venv-pipecat/bin/python voice-mcp-server.py.
#       It speaks newline-delimited JSON-RPC on stdio; all logging goes to STDERR (stdout is the channel).
# @exports: (stdio MCP loop)
#
# Design notes:
#   - The MCP protocol is implemented by hand (stdlib only) — no external MCP SDK. Each stdin line is one
#     JSON-RPC request; each stdout line is one JSON-RPC response. Logging/progress → stderr ONLY.
#   - MLX models (Whisper + Kokoro) load ONCE at startup and run on the MAIN thread (MLX's Metal stream is
#     thread-local: the thread that loads a model must run it). The barge-in monitor thread touches only the
#     mic + VAD, never MLX — so thread-locality holds with no executor needed.
#   - The PyAudio device handles stay open for the process lifetime; input/output STREAMS are opened per call
#     (cheap, and avoids a stalled long-lived stream killing the whole server). voice_listen and voice_speak
#     are serialized by a lock — the brain calls them sequentially anyway.
#   - stdout is a sacred channel. Any library call that might print to stdout (model load, synth, transcribe)
#     is wrapped in _to_stderr() so stray progress bytes can never corrupt the JSON-RPC framing.

import os
import sys
import json
import re
import time
import gc
import threading
import traceback

import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))

# ─────────────────────────────────────────────────────────────────────────────
# Config (env mirrors bot.py / kokoro_tts.py so the MCP server sounds identical)
# ─────────────────────────────────────────────────────────────────────────────
VOICE = os.environ.get("YURI_VOICE", "bf_isabella")            # Kokoro preset (British female = Yuri)
LANG = os.environ.get("YURI_VOICE_LANG", "b")                  # a=American, b=British
SPEED = float(os.environ.get("YURI_VOICE_SPEED", "1.15"))
WHISPER_MODEL = "mlx-community/whisper-large-v3-turbo-q4"      # MLXModel.LARGE_V3_TURBO_Q4 from bot.py
KOKORO_MODEL = "prince-canuma/Kokoro-82M"
KOKORO_SR = 24000                                               # Kokoro native sample rate
INPUT_SR = 16000                                                # Silero VAD + Whisper need 16kHz mono
# VAD params — confidence 0.6 + start_secs 0.3 reject street-noise blips; stop_secs 2.0 = end-of-turn.
VAD_CONFIDENCE = float(os.environ.get("YURI_VAD_CONFIDENCE", "0.6"))
VAD_START_SECS = float(os.environ.get("YURI_VAD_START_SECS", "0.3"))
VAD_STOP_SECS = float(os.environ.get("YURI_STOP_SECS", "2.0"))
DEFAULT_LISTEN_TIMEOUT = float(os.environ.get("YURI_LISTEN_TIMEOUT", "30"))

# ─────────────────────────────────────────────────────────────────────────────
# Logging — stderr ONLY (stdout is the MCP JSON-RPC channel)
# ─────────────────────────────────────────────────────────────────────────────
def log(msg: str):
    print(msg, file=sys.stderr, flush=True)


class _to_stderr:
    """Context manager: temporarily redirect sys.stdout → sys.stderr. Libraries (mlx-audio, tqdm,
    loguru misconfiguration) that print progress to stdout would corrupt the JSON-RPC channel; this
    routes their bytes to stderr instead of discarding them, so debugging info survives."""

    def __enter__(self):
        self._real = sys.stdout
        sys.stdout = sys.stderr
        return self

    def __exit__(self, *exc):
        sys.stdout = self._real
        return False


# ─────────────────────────────────────────────────────────────────────────────
# TTS helpers — adapted verbatim from kokoro_tts.py (pure functions; same behavior,
# same crash-dodging). Kept inline so the server is standalone (no TTSService dep).
# ─────────────────────────────────────────────────────────────────────────────
def _clear_mlx_cache():
    """Release pooled Metal buffers + force a GC pass after MLX work — keeps a long-lived
    server memory-bounded (mirrors kokoro_tts._clear_mlx_cache)."""
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
    """Make text speakable + phonemizer-safe (dodges Kokoro's g2p broadcast_shapes crash)."""
    t = (t.replace("—", ", ").replace("–", ", ").replace("…", ". ")
         .replace("“", '"').replace("”", '"').replace("‘", "'").replace("’", "'"))
    t = re.sub(r"[*#`_~]+", "", t)              # markdown markers
    t = re.sub(r"(?m)^\s*[-•·]\s*", "", t)      # bullet markers
    t = re.sub(r"\s*\n+\s*", ". ", t)           # newlines → sentence breaks
    t = re.sub(r"(?<=[A-Za-z0-9])\.(?=[A-Za-z0-9])", " ", t)  # no-space dots → space
    t = re.sub(r"[^0-9A-Za-z\s.,!?'-]", " ", t) # drop symbols → space
    t = re.sub(r"\s+", " ", t)
    t = re.sub(r"(\.\s*){2,}", ". ", t)
    if not re.search(r"[A-Za-z0-9]", t):
        return ""
    return t.strip()


def _chunks(text, maxlen=32):
    """Split text into short, synth-safe pieces (by sentence, then comma). The mlx-audio Kokoro
    vocoder throws broadcast_shapes on some longer generate() calls; short pieces synth reliably."""
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


def synth_robust(model, norm, voice, lang, speed):
    """Synthesize by stitching short, synth-safe chunks — dodges the Kokoro broadcast_shapes bug.
    A crashing chunk is re-split to 4-word then 2-word groups; a still-crashing pair is skipped.
    Returns float32 mono @ KOKORO_SR, or None if everything crashed / there was nothing to say."""
    if not norm:
        return None
    gap = np.zeros(int(KOKORO_SR * 0.01), dtype=np.float32)  # ~10ms seam cushion
    out = []

    def emit(t):
        try:
            a = _synth(model, t, voice, lang, speed)
            if a is not None and a.size:
                out.append(a)
                out.append(gap)
                return True
        except Exception as e:
            log(f"[kokoro] chunk synth failed ({str(e)[:60]}): {t[:50]!r}")
        return False

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


# ─────────────────────────────────────────────────────────────────────────────
# Global runtime state (populated by startup())
# ─────────────────────────────────────────────────────────────────────────────
_pa = None                  # persistent PyAudio instance (devices stay open)
_in_idx = None              # resolved input device index (HyperX)
_out_idx = None             # resolved output device index (system default = XM5)
_vad = None                 # SileroVADAnalyzer (shared; reset before each use)
_whisper_model = WHISPER_MODEL
_kokoro = None              # loaded mlx-audio Kokoro model
_call_lock = threading.Lock()   # serialize voice_listen / voice_speak
_models_loaded = False


def resolve_audio_devices():
    """Resolve input/output PyAudio device indices — same logic as bot.py._resolve_audio_devices.
    Forces a non-Bluetooth input (HyperX > built-in > MacBook) so Bluetooth headphones stay on A2DP.
    Override with YURI_INPUT_DEVICE=<substring>. Returns (in_idx, out_idx); None = use PyAudio default."""
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
                   (not preferred and ("hyperx" in name or "built-in" in name
                                       or "macbook" in name or "internal" in name)):
                    in_idx = i
                    log(f"[voice-mcp] input  device: [{i}] {info['name']}")
                    break
        oname = pa.get_device_info_by_index(out_idx).get("name", "?")
        log(f"[voice-mcp] output device: [{out_idx}] {oname}")
        if in_idx is None:
            log("[voice-mcp] no preferred input found — using PyAudio default (Bluetooth HFP may degrade)")
        pa.terminate()
        return in_idx, out_idx
    except Exception as e:
        log(f"[voice-mcp] could not resolve audio devices: {e}")
        return None, None


def _reset_vad():
    """Reset the shared Silero analyzer to a clean QUIET state before a capture/barge-in run.
    VADAnalyzer.set_params() recalculates counters but does NOT clear its internal byte buffer,
    so we clear it (plus the ONNX model state) explicitly."""
    try:
        from pipecat.audio.vad.vad_analyzer import VADState
        _vad._vad_buffer = b""
        _vad._vad_state = VADState.QUIET
        _vad._vad_starting_count = 0
        _vad._vad_stopping_count = 0
        _vad._last_reset_time = time.time()
        try:
            _vad._model.reset_states()
        except Exception:
            pass
    except Exception as e:
        log(f"[voice-mcp] vad reset failed: {e}")


# ─────────────────────────────────────────────────────────────────────────────
# Tool: voice_listen — open mic, VAD-segment one utterance, Whisper-transcribe, return text
# ─────────────────────────────────────────────────────────────────────────────
def voice_listen(timeout_secs: float = DEFAULT_LISTEN_TIMEOUT) -> str:
    _ensure_models()
    timeout_secs = min(float(timeout_secs), 15.0)  # CAP at 15s — longer blocks stall the provider stream
    import pyaudio
    from pipecat.audio.vad.vad_analyzer import VADState

    with _call_lock:
        frames_per_vad = _vad.num_frames_required()           # 512 @ 16kHz
        bytes_per_vad = frames_per_vad * 2                    # int16 mono
        deadline = time.monotonic() + max(1.0, timeout_secs)

        stream = _pa.open(format=pyaudio.paInt16, channels=1, rate=INPUT_SR, input=True,
                          input_device_index=_in_idx, frames_per_buffer=frames_per_vad)
        _reset_vad()
        saw_speech = False
        speech = bytearray()
        try:
            log("[voice-mcp] listen: waiting for speech…")
            while time.monotonic() < deadline:
                try:
                    data = stream.read(frames_per_vad, exception_on_overflow=False)
                except OSError as e:
                    log(f"[voice-mcp] input read error: {e}")
                    break
                if not data:
                    continue
                st = _vad._run_analyzer(data)                 # sync state-machine core
                if st != VADState.QUIET:
                    speech.extend(data)                        # capture from first non-quiet frame (lead-in + speech)
                    if st == VADState.SPEAKING:
                        saw_speech = True
                else:
                    if saw_speech:
                        break                                  # stop_secs of silence after real speech → utterance done
                    # else: still waiting for speech; discard pre-speech silence
        finally:
            try:
                stream.stop_stream()
                stream.close()
            except Exception:
                pass

        if not saw_speech or len(speech) < bytes_per_vad * 2:
            log("[voice-mcp] listen: no speech detected")
            return "(no speech detected)"

        audio_f32 = np.frombuffer(bytes(speech), np.int16).astype(np.float32) / 32768.0
        log(f"[voice-mcp] transcribing {len(audio_f32) / INPUT_SR:.1f}s of speech…")
        try:
            with _to_stderr():
                import mlx_whisper
                result = mlx_whisper.transcribe(audio_f32, path_or_hf_repo=_whisper_model)
            text = (result.get("text") or "").strip() if isinstance(result, dict) else ""
        except Exception as e:
            log(f"[voice-mcp] transcribe failed: {e}\n{traceback.format_exc()}")
            return f"(transcribe error: {str(e)[:120]})"
        finally:
            _clear_mlx_cache()

        log(f"[voice-mcp] heard: {text!r}")
        return text or "(no speech detected)"


# ─────────────────────────────────────────────────────────────────────────────
# Tool: voice_speak — synth via Kokoro, play through speaker, barge-in on mic speech
# ─────────────────────────────────────────────────────────────────────────────
def voice_speak(text: str) -> str:
    _ensure_models()
    import pyaudio
    from pipecat.audio.vad.vad_analyzer import VADState

    norm = _normalize(text or "")
    if not norm:
        return "spoken"                                       # nothing speakable — silent success

    with _call_lock:
        # 1) Synthesize the full utterance up front (on the main MLX thread).
        try:
            with _to_stderr():
                audio_f32 = synth_robust(_kokoro, norm, VOICE, LANG, SPEED)
        except Exception as e:
            log(f"[voice-mcp] synth failed: {e}\n{traceback.format_exc()}")
            return f"(synth error: {str(e)[:120]})"
        finally:
            _clear_mlx_cache()

        if audio_f32 is None or audio_f32.size == 0:
            log("[voice-mcp] speak: no audio produced — staying silent")
            return "spoken"

        pcm = (np.clip(audio_f32, -1.0, 1.0) * 32767.0).astype("<i2")

        # 2) Play it while a monitor thread watches the mic for speech (barge-in).
        # Barge-in DISABLED — echo feedback loop fix. Mic stays off during TTS.
        # Play the full audio without interruption checks.
        ostream = None
        try:
            ostream = _pa.open(format=pyaudio.paInt16, channels=1, rate=KOKORO_SR, output=True,
                              output_device_index=_out_idx, frames_per_buffer=2048)
            chunk = 2048
            for i in range(0, len(pcm), chunk):
                block = pcm[i:i + chunk]
                ostream.write(block.tobytes(), num_frames=len(block))
        except Exception as e:
            log(f"[voice-mcp] playback failed: {e}")
            return f"(playback error: {str(e)[:120]})"
        finally:
            if ostream is not None:
                try:
                    ostream.stop_stream()
                    ostream.close()
                except Exception:
                    pass

        log("[voice-mcp] speak: done")
        log("[voice-mcp] speak: done")
        return "spoken"


# ─────────────────────────────────────────────────────────────────────────────
# Startup — load models + open devices ONCE, before the JSON-RPC loop
# ─────────────────────────────────────────────────────────────────────────────
def startup():
    global _pa, _in_idx, _out_idx, _vad, _kokoro
    log("[voice-mcp] loading models…")

    # Cap MLX Metal memory so a long-lived server doesn't grow unbounded (mirrors kokoro_tts._load).
    try:
        import mlx.core as mx
        cap = int(os.environ.get("YURI_MLX_MEM_LIMIT_MB", "2048"))
        if cap > 0 and hasattr(mx, "metal") and hasattr(mx.metal, "set_memory_limit"):
            mx.metal.set_memory_limit(cap * 1024 * 1024)
            log(f"[voice-mcp] Metal memory limit set to {cap}MB")
    except Exception as e:
        log(f"[voice-mcp] could not set Metal memory limit: {e}")

    # 1) Whisper STT (MLX) — warm on the main thread so the first real call is fast.
    with _to_stderr():
        import mlx_whisper
        log("[voice-mcp] warming Whisper…")
        mlx_whisper.transcribe(np.zeros(int(INPUT_SR * 0.5), dtype=np.float32),
                               path_or_hf_repo=_whisper_model)
    log("[voice-mcp] Whisper ready")

    # 2) Kokoro TTS (MLX) — load + warm on the same main thread (Metal stream is thread-local).
    with _to_stderr():
        from mlx_audio.tts.utils import load_model
        log(f"[voice-mcp] loading Kokoro (voice={VOICE}, lang={LANG}, speed={SPEED})…")
        _kokoro = load_model(KOKORO_MODEL)
        for _seg in _kokoro.generate(text="Ready.", voice=VOICE, lang_code=LANG, speed=SPEED):
            pass
        _clear_mlx_cache()
    log("[voice-mcp] Kokoro ready")

    # 3) Silero VAD (ONNX) — via pipecat's analyzer (loads the bundled silero_vad.onnx).
    with _to_stderr():
        from pipecat.audio.vad.silero import SileroVADAnalyzer
        from pipecat.audio.vad.vad_analyzer import VADParams
        _vad = SileroVADAnalyzer(params=VADParams(
            confidence=VAD_CONFIDENCE, start_secs=VAD_START_SECS,
            stop_secs=VAD_STOP_SECS, min_volume=0.0))
        _vad.set_sample_rate(INPUT_SR)
    log(f"[voice-mcp] VAD ready (confidence={VAD_CONFIDENCE}, start={VAD_START_SECS}s, stop={VAD_STOP_SECS}s)")

    # 4) Audio devices — persistent PyAudio instance + resolved indices; streams open per-call.
    import pyaudio
    _pa = pyaudio.PyAudio()
    _in_idx, _out_idx = resolve_audio_devices()

    log("[voice-mcp] ready — voice_listen + voice_speak available")


def _ensure_models():
    """Lazy-load models on first tool call. Lets the MCP initialize handshake
    respond instantly so OMP registers the voice tools without timing out."""
    global _models_loaded
    if _models_loaded:
        return
    log("[voice-mcp] loading models (first call — ~15s)…")
    startup()
    _models_loaded = True
    log("[voice-mcp] models loaded — subsequent calls will be fast")


# ─────────────────────────────────────────────────────────────────────────────
# MCP JSON-RPC 2.0 over stdio (newline-delimited)
# ─────────────────────────────────────────────────────────────────────────────
PROTOCOL_VERSION = "2024-11-05"
SERVER_INFO = {"name": "voice", "version": "1.0"}

TOOLS = [
    {
        "name": "voice_listen",
        "description": "Capture speech from the microphone and return the transcribed text. Blocks until "
                       "speech is detected and transcribed. Use this to hear what Marcel said.",
        "inputSchema": {
            "type": "object",
            "properties": {
                "timeout_secs": {
                    "type": "number", "default": 30,
                    "description": "Max seconds to wait for speech",
                },
            },
        },
    },
    {
        "name": "voice_speak",
        "description": "Speak text through the TTS speaker. The text is synthesized and played immediately. "
                       "Supports barge-in (stops if the user starts talking).",
        "inputSchema": {
            "type": "object",
            "required": ["text"],
            "properties": {
                "text": {"type": "string", "description": "The text to speak"},
            },
        },
    },
    {
        "name": "voice_screenshot",
        "description": "Capture a screenshot and return the actual image. Use this to SEE what's on Marcel's "
                       "screen — the image is returned directly, no description needed. Optional window_id "
                       "from voice_list_windows to capture a specific window.",
        "inputSchema": {
            "type": "object",
            "properties": {
                "window_id": {
                    "type": "integer",
                    "description": "Window ID to capture a specific window. Omit for full screen.",
                },
            },
        },
    },
]


def _result_text(text: str) -> dict:
    return {"content": [{"type": "text", "text": text}]}


def _result_image(path: str) -> dict:
    """Return an image file as MCP image content (base64). Composer sees it natively."""
    import base64 as _b64
    with open(path, "rb") as f:
        img_b64 = _b64.b64encode(f.read()).decode()
    return {"content": [{"type": "image", "data": img_b64, "mimeType": "image/png"}]}


def send(obj: dict):
    """Write ONE compact JSON-RPC message line to stdout (the MCP channel). Never pretty-print."""
    sys.stdout.write(json.dumps(obj, separators=(",", ":")) + "\n")
    sys.stdout.flush()


def handle_request(req: dict):
    """Dispatch one JSON-RPC request. Notifications (no `id`) get no response."""
    if not isinstance(req, dict):
        return
    rid = req.get("id")
    method = req.get("method")
    params = req.get("params") or {}
    is_notification = "id" not in req

    def respond(result):
        if not is_notification:
            send({"jsonrpc": "2.0", "id": rid, "result": result})

    def respond_error(code: int, message: str):
        if not is_notification:
            send({"jsonrpc": "2.0", "id": rid, "error": {"code": code, "message": message}})

    try:
        if method == "initialize":
            respond({"protocolVersion": PROTOCOL_VERSION,
                     "capabilities": {"tools": {}},
                     "serverInfo": SERVER_INFO})
        elif method == "notifications/initialized":
            return  # notification — no response (client signals init complete)
        elif method == "ping":
            respond({})
        elif method == "tools/list":
            respond({"tools": TOOLS})
        elif method == "tools/call":
            name = params.get("name")
            args = params.get("arguments") or {}
            if name == "voice_listen":
                respond(_result_text(voice_listen(float(args.get("timeout_secs", DEFAULT_LISTEN_TIMEOUT)))))
            elif name == "voice_speak":
                respond(_result_text(voice_speak(str(args.get("text", "")))))
            elif name == "voice_screenshot":
                import subprocess as _sp, time as _t, os as _os
                wid = args.get("window_id")
                _shot = f"/tmp/yuri-mcp-shot-{int(_t.time())}.png"
                if wid:
                    _sp.run(["screencapture", "-l"+str(wid), "-x", _shot], timeout=5)
                else:
                    _sp.run(["screencapture", "-x", _shot], timeout=5)
                if _os.path.exists(_shot) and _os.path.getsize(_shot) > 2048:
                    respond(_result_image(_shot))
                else:
                    respond(_result_text(f"screenshot capture failed — file too small or missing: {_shot}"))
            else:
                respond_error(-32602, f"unknown tool: {name}")
        else:
            respond_error(-32601, f"method not found: {method}")
    except Exception as e:
        log(f"[voice-mcp] handler error: {e}\n{traceback.format_exc()}")
        respond_error(-32603, f"internal error: {str(e)[:160]}")


def main():
    # DO NOT load models here — respond to MCP initialize IMMEDIATELY so OMP
    # registers the voice tools. Models load lazily on first voice_listen/speak call.
    log("[voice-mcp] stdio JSON-RPC loop started (models load on first tool call)")
    for line in sys.stdin:
        line = line.strip()
        if not line:
            continue
        try:
            req = json.loads(line)
        except json.JSONDecodeError as e:
            log(f"[voice-mcp] bad JSON ({e}): {line[:120]!r}")
            continue
        handle_request(req)
    log("[voice-mcp] stdin closed — shutting down")


if __name__ == "__main__":
    main()
