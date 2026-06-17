#!/usr/bin/env python3
# @capability: voice-ptt-control
# @serves: push to talk | voice control claude | hold key speak inject | voice into vscode claude | hands-on voice command
# @does: GLOBAL push-to-talk voice control. Hold a hotkey, speak, release -> Parakeet transcribes the clip on release (~39ms per second of audio, doesn't degrade with length) -> the text is pasted (clipboard + Cmd-V [+ Return]) into the FOCUSED app — VS Code's Claude input, a terminal Claude, anywhere. No always-on, no VAD wait, no TTS: intentional voice INPUT only. Sidesteps the no-injection-API wall by typing like a human into whatever's focused.
# @use: run `ptt` (grant Accessibility to the terminal/python on first run). HOLD the combo (default right-option), speak, release. Tune: VOICE_PTT_KEY ("ctrl+enter" | "alt+enter" | single like "alt_r"/"f13"), VOICE_PTT_SUBMIT (1=paste+Enter, 0=paste only), VOICE_MIC_DEVICE, VOICE_PTT_STREAM (1=experimental live streaming — only wins for short commands, falls behind on long ones; default 0=batch), VOICE_PTT_CHUNK_S (stream chunk seconds, default 0.4).
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

SAMPLE_RATE = 16000; BLOCK = 1600
# PTT trigger. Default: hold right-option. Tokens are split on "+" and matched EXACTLY:
#   bare modifiers -> ctrl|shift|alt|option ; main key -> enter|return OR a pynput Key name (alt_r, f13, ...).
#   e.g. "alt_r" (right-option, single) · "ctrl+enter" (combo) · "alt+enter" (combo)
COMBO    = os.environ.get("VOICE_PTT_KEY", "alt_r").lower().strip()
SUBMIT   = os.environ.get("VOICE_PTT_SUBMIT", "1") == "1"    # paste + Enter, or paste only (you hit Enter)
MIC      = os.environ.get("VOICE_MIC_DEVICE")
# BATCH is the default and the right tool: it transcribes the whole clip on release at ~39ms per
# second of audio (834ms for a 21.5s dictation) and does NOT degrade with length. The "live streaming"
# path (VOICE_PTT_STREAM=1) reprocesses a growing encoder context per chunk, so per-chunk cost climbs
# as you talk and long requests fall catastrophically behind (5.7s for that same 21.5s clip). Streaming
# only wins for SHORT commands on an idle machine — left behind the flag, off by default.
STREAM   = os.environ.get("VOICE_PTT_STREAM", "0") == "1"    # batch-on-release (default) vs live streaming
CHUNK    = int(SAMPLE_RATE * float(os.environ.get("VOICE_PTT_CHUNK_S", "0.4")))
CTX      = (256, 256); DEPTH = 2          # measured: depth=2 keeps real-time (≤0.3s/0.4s chunk) AND matches batch text exactly
RMS_FLOOR = 0.0008                        # below this, the mic handed us silence (device changed) — warn, don't transcribe
MIN_CHARS = 2

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
SINGLE     = getattr(keyboard.Key, _singles[0], None) if _singles else None  # e.g. alt_r, f13
_state = {"ctrl": False, "shift": False, "alt": False, "enter": False, "single": False}

def _combo_active():
    ok = ((_state["ctrl"] or not NEED_CTRL) and (_state["shift"] or not NEED_SHIFT)
          and (_state["alt"] or not NEED_ALT) and (_state["enter"] or not NEED_ENTER))
    if SINGLE is not None:
        ok = ok and _state["single"]
    return ok

def _track(key, down):
    if SINGLE is not None and key == SINGLE: _state["single"] = down   # exact key (e.g. right-option only)
    if key in CTRL_KEYS:  _state["ctrl"]  = down
    elif key in SHIFT_KEYS: _state["shift"] = down
    elif key in ALT_KEYS:   _state["alt"]   = down
    elif key == keyboard.Key.enter: _state["enter"] = down

print(f"loading Parakeet… (PTT = hold {COMBO}, mode={'stream' if STREAM else 'batch'})", flush=True)
# dtype: float32 is measured FASTER than bfloat16 on this Apple-Silicon build (83ms vs 97ms /2s clip); keep it.
model = from_pretrained("mlx-community/parakeet-tdt-0.6b-v2", dtype=mx.float32)
preproc = model.preprocessor_config
# WARMUP: the first transcribe pays a ~1.5s MLX kernel-compile. Burn it here (batch + stream paths)
# so your FIRST spoken command is already fast (measured 1473ms cold -> 78ms warm).
try:
    model.generate(get_logmel(mx.array(np.zeros(SAMPLE_RATE * 2, dtype=np.float32)), preproc)); mx.eval(model.parameters())
    if STREAM:
        with model.transcribe_stream(context_size=CTX, depth=DEPTH) as _w:
            _w.add_audio(mx.array(np.zeros(int(SAMPLE_RATE * 0.4), dtype=np.float32))); _ = _w.result.text
    print("  (kernels warm — first command will be fast)", flush=True)
except Exception:
    pass

_SENTINEL = object()
_qref   = [queue.Queue()]            # fresh queue per recording — isolates back-to-back presses
_stream = [None]                     # the live mic InputStream
_inject_lock = threading.Lock()      # serialize pastes so two recordings can't interleave keystrokes

def _cb(indata, frames, t, status):
    _qref[0].put(indata[:, 0].copy())

def _open_stream():
    dev = (int(MIC) if MIC and MIC.isdigit() else MIC) if MIC else None
    s = sd.InputStream(samplerate=SAMPLE_RATE, channels=1, dtype="float32", blocksize=BLOCK, callback=_cb, device=dev)
    s.start()
    return s

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
    with _inject_lock:
        prev = subprocess.run(["pbpaste"], capture_output=True).stdout      # save clipboard
        subprocess.run(["pbcopy"], input=text.encode(), check=False)
        time.sleep(0.03)                                                    # let pbcopy settle before paste
        ok = _osa('tell application "System Events" to keystroke "v" using command down')
        if ok and SUBMIT:
            time.sleep(0.08)                                               # paste must land before Return submits
            _osa('tell application "System Events" to key code 36')         # Return
        time.sleep(0.12)                                                    # paste must finish reading clipboard before restore
        subprocess.run(["pbcopy"], input=prev, check=False)                 # restore clipboard
    print(f"→ {text}" + ("" if ok else "  (paste did NOT fire — see error above)"), flush=True)

def _finish(txt, n_samp, sumsq):
    """Shared tail: guard tiny taps + silent mic, then inject the transcript."""
    if n_samp / SAMPLE_RATE < 0.2: return                                   # ignore key-taps
    rms = (sumsq / max(n_samp, 1)) ** 0.5
    if rms < RMS_FLOOR:                                                     # captured silence, not speech
        print(f"⚠ mic silent (rms={rms:.5f}) — input device likely changed; relaunch ptt or set VOICE_MIC_DEVICE", flush=True)
        return
    txt = (txt or "").strip()
    if len(txt) >= MIN_CHARS:
        _inject(txt)
    else:
        print("(too short / no speech)", flush=True)

def _pump_stream(myq):
    """STREAMING: consume mic chunks live and feed Parakeet's incremental encoder WHILE you talk.
    On release (sentinel) only the final <chunk tail needs transcribing -> near-constant felt latency."""
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
                st.add_audio(mx.array(np.concatenate(pending)))            # flush the release tail
            txt = st.result.text
    except Exception as e:
        print(f"  ✗ stream error: {e}", flush=True); return
    _finish(txt, n_samp, sumsq)

def _drain_batch(myq):
    """BATCH fallback (VOICE_PTT_STREAM=0): transcribe the whole clip on release."""
    chunks = []
    try:
        while True: chunks.append(myq.get_nowait())
    except queue.Empty: pass
    if not chunks: return
    audio = np.concatenate(chunks)
    txt = ""
    try:
        txt = model.generate(get_logmel(mx.array(audio), preproc))[0].text
    except Exception as e:
        print(f"  ✗ transcribe error: {e}", flush=True); return
    _finish(txt, len(audio), float(np.dot(audio, audio)))

def on_press(key):
    _track(key, True)
    if _combo_active() and _stream[0] is None:
        _qref[0] = queue.Queue()                                           # fresh queue isolates this recording
        myq = _qref[0]
        try:
            _stream[0] = _open_stream()                                    # bind to the CURRENT default mic each press
        except Exception as e:
            print(f"  ✗ mic open failed: {e}", flush=True); return
        if STREAM:
            threading.Thread(target=_pump_stream, args=(myq,), daemon=True).start()
        print("● listening…", flush=True)

def on_release(key):
    _track(key, False)
    if _stream[0] is not None and not _combo_active():
        s = _stream[0]; _stream[0] = None
        try: s.stop(); s.close()
        except Exception: pass
        print("○ transcribing…", flush=True)
        myq = _qref[0]
        if STREAM:
            myq.put(_SENTINEL)                                             # pump flushes tail, reads result, injects
        else:
            threading.Thread(target=_drain_batch, args=(myq,), daemon=True).start()

print(f"🎙  PTT READY — HOLD {COMBO}, speak, release → text drops into the focused app (submit={SUBMIT}, mode={'stream' if STREAM else 'batch'}). Ctrl-C to quit.", flush=True)
print("    (first run: macOS will ask to grant Accessibility — allow it for the terminal + System Events)", flush=True)
try:
    with keyboard.Listener(on_press=on_press, on_release=on_release) as l:
        l.join()
except KeyboardInterrupt:
    print("\nPTT stopped.")
