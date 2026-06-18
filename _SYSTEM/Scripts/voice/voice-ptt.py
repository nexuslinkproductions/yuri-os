#!/usr/bin/env python3
# @capability: voice-ptt-control
# @serves: push to talk | voice control claude | hold key speak inject | voice into vscode claude | hands-on voice command | cancel push to talk
# @does: GLOBAL push-to-talk voice control. Hold a hotkey, speak, release -> Parakeet transcribes the clip on release (~39ms per second of audio, doesn't degrade with length) -> the text is pasted (clipboard + Cmd-V [+ Return]) into the FOCUSED app — VS Code's Claude input, a terminal Claude, anywhere. Press Escape to CANCEL mid-thought (nothing sent). Drops a ptt-held flag so the Rick-voice overseer never talks over your live dictation. Single-instance (kills prior ptt on launch). No always-on, no VAD wait, no TTS: intentional voice INPUT only.
# @use: run `ptt` (grant Accessibility to the terminal/python on first run). HOLD the combo (default right-option), speak, release. Tap ESCAPE to cancel a press mid-sentence. Tune: VOICE_PTT_KEY ("ctrl+enter" | "alt+enter" | single like "alt_r"/"f13"), VOICE_PTT_CANCEL_KEY (default "esc"), VOICE_PTT_SUBMIT (1=paste+Enter, 0=paste only), VOICE_MIC_DEVICE, VOICE_PTT_STREAM (1=experimental live streaming — only wins for short commands; default 0=batch), VOICE_PTT_CHUNK_S.
import os, sys, time, threading, queue, subprocess
# The 2.3G model is cached locally after first download — never phone the HF Hub again.
# Kills the "unauthenticated requests to the HF Hub" warning AND skips a network round-trip
# on every launch (faster start, works fully offline). Override with HF_HUB_OFFLINE=0 to re-check.
os.environ.setdefault("HF_HUB_OFFLINE", "1")
os.environ.setdefault("TOKENIZERS_PARALLELISM", "false")
import numpy as np, sounddevice as sd, mlx.core as mx
from pynput import keyboard
from parakeet_mlx import from_pretrained
from parakeet_mlx.audio import get_logmel

# SINGLE-INSTANCE: kill any prior voice-ptt.py before we load a model. Stacked instances each
# transcribe the same keypress and fight over the GPU — that was the "transcription got very slow"
# regression. Do this BEFORE the heavy model load so two models never coexist.
try:
    _self = os.getpid()
    for _p in subprocess.run(["pgrep", "-f", "voice-ptt.py"], capture_output=True, text=True).stdout.split():
        if _p and int(_p) != _self:
            try: os.kill(int(_p), 15)
            except Exception: pass
except Exception:
    pass

SAMPLE_RATE = 16000; BLOCK = 1600
# PTT trigger. Default: hold right-option. Tokens split on "+" and matched EXACTLY.
COMBO    = os.environ.get("VOICE_PTT_KEY", "alt_r").lower().strip()
SUBMIT   = os.environ.get("VOICE_PTT_SUBMIT", "1") == "1"    # paste + Enter, or paste only
MIC      = os.environ.get("VOICE_MIC_DEVICE")
# BATCH default (right tool): transcribes the whole clip on release at ~39ms/sec of audio and does
# NOT degrade with length. Streaming (VOICE_PTT_STREAM=1) reprocesses a growing context per chunk
# and falls behind on long requests — only wins for SHORT commands on an idle machine.
STREAM   = os.environ.get("VOICE_PTT_STREAM", "0") == "1"
CHUNK    = int(SAMPLE_RATE * float(os.environ.get("VOICE_PTT_CHUNK_S", "0.4")))
CTX      = (256, 256); DEPTH = 2
RMS_FLOOR = 0.0008
MIN_CHARS = 2

# CANCEL key (blackout escape hatch): tap it while holding / right after release -> discard, send nothing.
_cancel_name = os.environ.get("VOICE_PTT_CANCEL_KEY", "esc").lower().strip()
CANCEL_KEY = keyboard.Key.esc if _cancel_name in ("esc", "escape") else getattr(keyboard.Key, _cancel_name, None)

# ptt-held flag: present while the mic is open so the Rick-voice overseer defers and never talks
# over live dictation. Holds this ptt's PID; voice-speak.sh checks pid-alive + mtime freshness.
_VOICE_STATE = os.path.abspath(os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "..", "state", "voice"))
PTT_HELD = os.path.join(_VOICE_STATE, "ptt-held.flag")

CTRL_KEYS  = {keyboard.Key.ctrl, keyboard.Key.ctrl_l, keyboard.Key.ctrl_r}
SHIFT_KEYS = {keyboard.Key.shift, keyboard.Key.shift_l, keyboard.Key.shift_r}
ALT_KEYS   = {keyboard.Key.alt, keyboard.Key.alt_l, keyboard.Key.alt_r}
_parts = [p.strip() for p in COMBO.split("+") if p.strip()]
_MODS  = {"ctrl", "shift", "alt", "option"}
NEED_CTRL  = "ctrl" in _parts
NEED_SHIFT = "shift" in _parts
NEED_ALT   = ("alt" in _parts) or ("option" in _parts)
NEED_ENTER = ("enter" in _parts) or ("return" in _parts)
_singles   = [p for p in _parts if p not in _MODS and p not in ("enter", "return")]
SINGLE     = getattr(keyboard.Key, _singles[0], None) if _singles else None
_state = {"ctrl": False, "shift": False, "alt": False, "enter": False, "single": False}

def _combo_active():
    ok = ((_state["ctrl"] or not NEED_CTRL) and (_state["shift"] or not NEED_SHIFT)
          and (_state["alt"] or not NEED_ALT) and (_state["enter"] or not NEED_ENTER))
    if SINGLE is not None:
        ok = ok and _state["single"]
    return ok

def _track(key, down):
    if SINGLE is not None and key == SINGLE: _state["single"] = down
    if key in CTRL_KEYS:  _state["ctrl"]  = down
    elif key in SHIFT_KEYS: _state["shift"] = down
    elif key in ALT_KEYS:   _state["alt"]   = down
    elif key == keyboard.Key.enter: _state["enter"] = down

print(f"loading Parakeet… (PTT = hold {COMBO}, cancel = {_cancel_name}, mode={'stream' if STREAM else 'batch'})", flush=True)
model = from_pretrained("mlx-community/parakeet-tdt-0.6b-v2", dtype=mx.float32)
preproc = model.preprocessor_config
# MLX pools Metal GPU buffers across calls; if never cleared, every transcription's intermediate
# arrays stay resident -> unbounded memory growth (this was the >10GB PTT leak). Clear after each
# generate. The API moved between MLX versions (mx.clear_cache vs mx.metal.clear_cache) — try both.
def _clear_mlx_cache():
    try: mx.clear_cache()
    except Exception:
        try: mx.metal.clear_cache()
        except Exception: pass

# WARMUP: burn the one-time ~1.5s MLX kernel-compile here so the FIRST spoken command is fast.
try:
    model.generate(get_logmel(mx.array(np.zeros(SAMPLE_RATE * 2, dtype=np.float32)), preproc)); mx.eval(model.parameters())
    if STREAM:
        with model.transcribe_stream(context_size=CTX, depth=DEPTH) as _w:
            _w.add_audio(mx.array(np.zeros(int(SAMPLE_RATE * 0.4), dtype=np.float32))); _ = _w.result.text
    _clear_mlx_cache()
    print("  (kernels warm — first command will be fast)", flush=True)
except Exception:
    pass

_SENTINEL = object()
_qref      = [queue.Queue()]       # fresh queue per recording
_stream    = [None]                # live mic InputStream
_inject_lock = threading.Lock()    # serialize pastes
_cancelled = [False]               # set by Escape — abort this recording, send nothing
_pending   = [False]               # a transcribe is in flight (so Escape can still cancel post-release)
_hold_tick = [0]

def _cb(indata, frames, t, status):
    _qref[0].put(indata[:, 0].copy())
    _hold_tick[0] += 1
    if _hold_tick[0] % 10 == 0:                 # ~1s: keep ptt-held.flag mtime fresh for long holds
        try: os.utime(PTT_HELD, None)
        except Exception: pass

def _open_stream():
    dev = (int(MIC) if MIC and MIC.isdigit() else MIC) if MIC else None
    s = sd.InputStream(samplerate=SAMPLE_RATE, channels=1, dtype="float32", blocksize=BLOCK, callback=_cb, device=dev)
    s.start()
    return s

def _ptt_hold():
    try:
        os.makedirs(_VOICE_STATE, exist_ok=True)
        with open(PTT_HELD, "w") as f: f.write(str(os.getpid()))
    except Exception: pass

def _ptt_release():
    try: os.unlink(PTT_HELD)
    except Exception: pass

def _osa(script):
    r = subprocess.run(["osascript", "-e", script], capture_output=True, text=True)
    if r.returncode != 0:
        err = (r.stderr or "").strip()
        if "1002" in err or "not allowed" in err or "authoriz" in err.lower() or "assistive" in err.lower():
            print(f"  ✗ PERMISSION DENIED for keystrokes — grant Accessibility + Automation to THIS app "
                  f"(System Settings → Privacy & Security → Accessibility, and Automation → System Events). [{err[:80]}]", flush=True)
        else:
            print(f"  ✗ osascript error: {err[:120]}", flush=True)
        return False
    return True

def _inject(text):
    if _cancelled[0]: return                     # cancelled in the post-release window — don't paste
    with _inject_lock:
        prev = subprocess.run(["pbpaste"], capture_output=True).stdout
        subprocess.run(["pbcopy"], input=text.encode(), check=False)
        time.sleep(0.03)
        ok = _osa('tell application "System Events" to keystroke "v" using command down')
        if ok and SUBMIT:
            time.sleep(0.08)
            _osa('tell application "System Events" to key code 36')
        time.sleep(0.12)
        subprocess.run(["pbcopy"], input=prev, check=False)
    print(f"→ {text}" + ("" if ok else "  (paste did NOT fire — see error above)"), flush=True)

def _finish(txt, n_samp, sumsq):
    """Shared tail: guard cancel + tiny taps + silent mic, then inject."""
    try:
        if _cancelled[0]: return                 # Escape pressed — send nothing
        if n_samp / SAMPLE_RATE < 0.2: return
        rms = (sumsq / max(n_samp, 1)) ** 0.5
        if rms < RMS_FLOOR:
            print(f"⚠ mic silent (rms={rms:.5f}) — input device likely changed; relaunch ptt or set VOICE_MIC_DEVICE", flush=True)
            return
        txt = (txt or "").strip()
        if len(txt) >= MIN_CHARS:
            _inject(txt)
        else:
            print("(too short / no speech)", flush=True)
    finally:
        _pending[0] = False

def _pump_stream(myq):
    pending = []; pend_n = 0; n_samp = 0; sumsq = 0.0; txt = ""
    try:
        with model.transcribe_stream(context_size=CTX, depth=DEPTH) as st:
            while True:
                item = myq.get()
                if item is _SENTINEL: break
                pending.append(item); ln = len(item)
                pend_n += ln; n_samp += ln; sumsq += float(np.dot(item, item))
                if pend_n >= CHUNK:
                    st.add_audio(mx.array(np.concatenate(pending))); pending = []; pend_n = 0
            if pending:
                st.add_audio(mx.array(np.concatenate(pending)))
            txt = st.result.text
    except Exception as e:
        print(f"  ✗ stream error: {e}", flush=True); _pending[0] = False; return
    _clear_mlx_cache()            # free this transcription's Metal buffers
    _finish(txt, n_samp, sumsq)

def _drain_batch(myq):
    chunks = []
    try:
        while True: chunks.append(myq.get_nowait())
    except queue.Empty: pass
    if not chunks: _pending[0] = False; return
    audio = np.concatenate(chunks)
    txt = ""
    try:
        txt = model.generate(get_logmel(mx.array(audio), preproc))[0].text
    except Exception as e:
        print(f"  ✗ transcribe error: {e}", flush=True); _pending[0] = False; return
    _clear_mlx_cache()            # free this transcription's Metal buffers (prevents the >10GB leak)
    _finish(txt, len(audio), float(np.dot(audio, audio)))

def _cancel():
    """Escape: abort the current press — stop the mic, drop the audio, send nothing."""
    _cancelled[0] = True
    s = _stream[0]; _stream[0] = None
    if s is not None:
        try: s.stop(); s.close()
        except Exception: pass
    _ptt_release()
    try:
        while True: _qref[0].get_nowait()
    except queue.Empty: pass
    print("✗ cancelled — nothing sent", flush=True)

def on_press(key):
    if CANCEL_KEY is not None and key == CANCEL_KEY and (_stream[0] is not None or _pending[0]):
        _cancel(); return
    _track(key, True)
    if _combo_active() and _stream[0] is None:
        _cancelled[0] = False                    # fresh recording
        _qref[0] = queue.Queue()
        myq = _qref[0]
        try:
            _stream[0] = _open_stream()
        except Exception as e:
            print(f"  ✗ mic open failed: {e}", flush=True); return
        _ptt_hold()                              # overseer won't speak while you hold
        if STREAM:
            threading.Thread(target=_pump_stream, args=(myq,), daemon=True).start()
        print("● listening…", flush=True)

def on_release(key):
    _track(key, False)
    if _stream[0] is not None and not _combo_active():
        s = _stream[0]; _stream[0] = None
        try: s.stop(); s.close()
        except Exception: pass
        _ptt_release()                           # mic closed -> clear the flag UNCONDITIONALLY
        if _cancelled[0]:                        # Escape already fired during the hold
            return
        print("○ transcribing…", flush=True)
        _pending[0] = True
        myq = _qref[0]
        if STREAM:
            myq.put(_SENTINEL)
        else:
            threading.Thread(target=_drain_batch, args=(myq,), daemon=True).start()

print(f"🎙  PTT READY — HOLD {COMBO}, speak, release → text drops into the focused app (submit={SUBMIT}). Tap {_cancel_name} to cancel. Ctrl-C to quit.", flush=True)
print("    (first run: macOS will ask to grant Accessibility — allow it for the terminal + System Events)", flush=True)
try:
    with keyboard.Listener(on_press=on_press, on_release=on_release) as l:
        l.join()
except KeyboardInterrupt:
    _ptt_release()
    print("\nPTT stopped.")
