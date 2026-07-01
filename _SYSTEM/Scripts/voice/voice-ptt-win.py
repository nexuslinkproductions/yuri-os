#!/usr/bin/env python3
# @capability: voice-ptt-control-win
# @serves: push to talk windows | ptt windows | voice control claude windows | hold key speak inject | dictate into vscode claude | parakeet windows gpu
# @does: GLOBAL push-to-talk voice control for WINDOWS + NVIDIA (RTX). Hold a hotkey, speak, release -> Parakeet-TDT-0.6B (ONNX on onnxruntime-gpu / CUDAExecutionProvider) transcribes the clip on release (~125x real-time on an RTX 5060 Ti; the model does NOT degrade with clip length) -> the text is pasted (Windows clipboard + Ctrl-V [+ Enter]) into the FOCUSED window — VS Code's Claude input, a terminal, anywhere. Press Escape to CANCEL mid-thought (nothing sent). Windows twin of voice-ptt.py (which is Apple-Silicon/MLX-only). No always-on, no VAD wait, no TTS: intentional voice INPUT only.
# @use: run `python voice-ptt-win.py` in the parakeet-ptt venv (or the ptt.bat launcher). HOLD the combo (default RIGHT-CTRL), speak, release. Tap ESC to cancel. `--list-devices` prints mic indices. Tune via env: VOICE_PTT_KEY ("ctrl_r"|"alt_r"|"f13"|"ctrl+enter"...), VOICE_PTT_CANCEL_KEY (default "esc"), VOICE_PTT_SUBMIT (1=paste+Enter, 0=paste only), VOICE_PTT_PASTE ("ctrl+v" default | "ctrl+shift+v" for some terminals), VOICE_MIC_DEVICE (index/name), VOICE_PTT_MODEL (default nemo-parakeet-tdt-0.6b-v2), VOICE_PTT_QUANT (e.g. "int8" for less VRAM), VOICE_PTT_PROVIDER (default CUDAExecutionProvider; set "cpu" to force CPU).
# @exports: main
"""Windows/CUDA push-to-talk. Parakeet-TDT ONNX -> paste into the focused window."""
import os, sys, glob, site, time, threading, queue, socket

# Windows consoles default to a legacy codepage (cp1252) that can't encode the
# status glyphs (✓ ● ○ → 🎙). Force UTF-8 on the streams so a print never crashes
# the listener; errors="replace" degrades gracefully if a stream refuses.
for _s in (sys.stdout, sys.stderr):
    try: _s.reconfigure(encoding="utf-8", errors="replace")
    except Exception: pass

# ---------------------------------------------------------------------------
# BOOTSTRAP (must run before `import onnxruntime`): make the CUDA-13 + cuDNN-9
# pip wheels loadable, and route TLS through the Windows trust store.
# ---------------------------------------------------------------------------
# TLS: on this box AVG antivirus does HTTPS inspection (avgMonFltProxy) and
# presents a private root CA that certifi does not carry -> huggingface_hub
# downloads fail with CERTIFICATE_VERIFY_FAILED. truststore routes Python's ssl
# through the Windows cert store (which DOES trust the AVG CA). Harmless once the
# model is cached (HF_HUB_OFFLINE below skips the network entirely).
try:
    import truststore; truststore.inject_into_ssl()
except Exception:
    pass

# CUDA DLLs: the modern nvidia-*-cu13 wheels nest their DLLs at
# site-packages/nvidia/cu13/bin/x86_64/ (compute) and nvidia/cudnn/bin/ (cuDNN)
# — one level deeper than onnxruntime.preload_dlls() searches, so ORT can't find
# cublasLt64_13.dll and silently falls back to CPU. Walk the nvidia tree and add
# EVERY dir that actually holds a .dll to the loader search path. Layout-agnostic
# on purpose (survives future wheel-layout changes).
def _wire_cuda_dlls():
    added = 0
    for sp in site.getsitepackages() + [site.getusersitepackages()]:
        root = os.path.join(sp, "nvidia")
        if not os.path.isdir(root):
            continue
        for dp, _dirs, files in os.walk(root):
            if any(f.lower().endswith(".dll") for f in files):
                try:
                    os.add_dll_directory(dp)
                    os.environ["PATH"] = dp + os.pathsep + os.environ.get("PATH", "")
                    added += 1
                except Exception:
                    pass
    return added

_CUDA_DIRS = _wire_cuda_dlls()

# Skip the HF Hub round-trip on every launch once the model is cached locally.
# Override with HF_HUB_OFFLINE=0 to re-check for updates.
os.environ.setdefault("HF_HUB_OFFLINE", "1")
os.environ.setdefault("TOKENIZERS_PARALLELISM", "false")
os.environ.setdefault("HF_HUB_DISABLE_PROGRESS_BARS", "1")

import numpy as np
import sounddevice as sd
import onnxruntime as ort
import onnx_asr
import pyperclip
from pynput import keyboard

# --list-devices: print input devices so the user can pick VOICE_MIC_DEVICE, then exit.
if "--list-devices" in sys.argv:
    print("Input (microphone) devices — set VOICE_MIC_DEVICE to the index or a name substring:")
    for i, d in enumerate(sd.query_devices()):
        if d.get("max_input_channels", 0) > 0:
            print(f"  [{i}] {d['name']}  ({d['max_input_channels']}ch @ {int(d['default_samplerate'])}Hz)")
    sys.exit(0)

# ---------------------------------------------------------------------------
# CONFIG
# ---------------------------------------------------------------------------
SAMPLE_RATE = 16000
BLOCK       = 1600                                   # 0.1s frames
# v3 = multilingual (25 European languages incl. GERMAN) with AUTOMATIC language
# detection — handles English AND German (even mixed) with no lang flag, keeping
# punctuation + capitalization. Set VOICE_PTT_MODEL=nemo-parakeet-tdt-0.6b-v2 to
# fall back to the English-only model (marginally higher English accuracy).
MODEL_NAME  = os.environ.get("VOICE_PTT_MODEL", "nemo-parakeet-tdt-0.6b-v3")
QUANT       = os.environ.get("VOICE_PTT_QUANT") or None   # e.g. "int8" for less VRAM
MIC         = os.environ.get("VOICE_MIC_DEVICE")
SUBMIT      = os.environ.get("VOICE_PTT_SUBMIT", "1") == "1"   # paste + Enter, or paste only
RMS_FLOOR   = float(os.environ.get("VOICE_PTT_RMS", "0.0008"))
MIN_CHARS   = 2

# PTT trigger. Default: hold RIGHT-CTRL. Tokens split on "+" and matched EXACTLY.
# Examples: "ctrl_r" | "alt_r" | "f13" | "ctrl+enter" | "ctrl+shift+space".
COMBO = os.environ.get("VOICE_PTT_KEY", "ctrl_r").lower().strip()

# Provider: CUDA by default; VOICE_PTT_PROVIDER=cpu forces CPU (no GPU needed).
_prov = os.environ.get("VOICE_PTT_PROVIDER", "cuda").lower().strip()
PROVIDERS = ["CPUExecutionProvider"] if _prov in ("cpu", "cpuexecutionprovider") \
    else ["CUDAExecutionProvider", "CPUExecutionProvider"]

# Paste keystroke. Windows Terminal / VS Code / most apps take Ctrl+V; some
# terminals want Ctrl+Shift+V.
PASTE = os.environ.get("VOICE_PTT_PASTE", "ctrl+v").lower().strip()

# CANCEL key (blackout escape hatch): tap while holding / right after release -> discard.
_cancel_name = os.environ.get("VOICE_PTT_CANCEL_KEY", "esc").lower().strip()
CANCEL_KEY = keyboard.Key.esc if _cancel_name in ("esc", "escape") else getattr(keyboard.Key, _cancel_name, None)

# ptt-held flag: present while the mic is open (so an overseer/TTS lane can defer).
_VOICE_STATE = os.path.abspath(os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "..", "state", "voice"))
PTT_HELD = os.path.join(_VOICE_STATE, "ptt-held.flag")

# ---------------------------------------------------------------------------
# combo tracking (mirrors voice-ptt.py so the env interface matches the Mac lane)
# ---------------------------------------------------------------------------
CTRL_KEYS  = {keyboard.Key.ctrl, keyboard.Key.ctrl_l, keyboard.Key.ctrl_r}
SHIFT_KEYS = {keyboard.Key.shift, keyboard.Key.shift_l, keyboard.Key.shift_r}
ALT_KEYS   = {keyboard.Key.alt, keyboard.Key.alt_l, keyboard.Key.alt_r, getattr(keyboard.Key, "alt_gr", keyboard.Key.alt_r)}
_parts = [p.strip() for p in COMBO.split("+") if p.strip()]
_MODS  = {"ctrl", "shift", "alt", "option"}
NEED_CTRL  = "ctrl" in _parts
NEED_SHIFT = "shift" in _parts
NEED_ALT   = ("alt" in _parts) or ("option" in _parts)
NEED_ENTER = ("enter" in _parts) or ("return" in _parts)
_singles   = [p for p in _parts if p not in _MODS and p not in ("enter", "return")]
# a single may be a named special key (ctrl_r, f13, space) or a char key ("v")
_single_tok = _singles[0] if _singles else None
SINGLE = getattr(keyboard.Key, _single_tok, None) if _single_tok else None
SINGLE_CHAR = _single_tok if (_single_tok and SINGLE is None and len(_single_tok) == 1) else None
_state = {"ctrl": False, "shift": False, "alt": False, "enter": False, "single": False}

def _combo_active():
    ok = ((_state["ctrl"] or not NEED_CTRL) and (_state["shift"] or not NEED_SHIFT)
          and (_state["alt"] or not NEED_ALT) and (_state["enter"] or not NEED_ENTER))
    if SINGLE is not None or SINGLE_CHAR is not None:
        ok = ok and _state["single"]
    return ok

def _match_single(key):
    if SINGLE is not None:
        return key == SINGLE
    if SINGLE_CHAR is not None:
        return getattr(key, "char", None) == SINGLE_CHAR
    return False

def _track(key, down):
    if _match_single(key): _state["single"] = down
    if key in CTRL_KEYS:  _state["ctrl"]  = down
    elif key in SHIFT_KEYS: _state["shift"] = down
    elif key in ALT_KEYS:   _state["alt"]   = down
    elif key == keyboard.Key.enter: _state["enter"] = down

# ---------------------------------------------------------------------------
# model load + warmup
# ---------------------------------------------------------------------------
print(f"loading Parakeet ({MODEL_NAME}) on {PROVIDERS[0]}…  (PTT = hold {COMBO}, cancel = {_cancel_name})", flush=True)
if _CUDA_DIRS == 0 and PROVIDERS[0].startswith("CUDA"):
    print("  ⚠ no nvidia CUDA wheels found on the DLL path — will fall back to CPU. "
          "Install nvidia-cublas / nvidia-cudnn-cu13 etc. or set VOICE_PTT_PROVIDER=cpu.", flush=True)

model = onnx_asr.load_model(MODEL_NAME, quantization=QUANT, providers=PROVIDERS)

# report the provider the sessions ACTUALLY bound (CUDA can silently fall back to CPU).
def _bound_providers(obj, depth=0, seen=None):
    seen = seen or set(); out = []
    if id(obj) in seen or depth > 3: return out
    seen.add(id(obj))
    for a in dir(obj):
        if a.startswith("__"): continue
        try: v = getattr(obj, a)
        except Exception: continue
        if isinstance(v, ort.InferenceSession): out.append(v.get_providers()[0])
        elif hasattr(v, "__dict__") and not callable(v): out += _bound_providers(v, depth + 1, seen)
    return out

_bp = _bound_providers(model)
_on_gpu = any(p.startswith("CUDA") for p in _bp)
print(f"  bound: {sorted(set(_bp)) or ['?']}  {'✓ GPU' if _on_gpu else '(CPU)'}", flush=True)

# WARMUP: burn the one-time CUDA kernel JIT (sm_120 on Blackwell) so the FIRST
# spoken command is fast, not a 400ms+ cold hit.
try:
    model.recognize(np.zeros(SAMPLE_RATE * 2, dtype=np.float32), sample_rate=SAMPLE_RATE)
    print("  (kernels warm — first command will be fast)", flush=True)
except Exception as e:
    print(f"  warmup skipped: {e!r}"[:160], flush=True)

# ---------------------------------------------------------------------------
# recording + injection
# ---------------------------------------------------------------------------
_qref        = [queue.Queue()]      # fresh queue per recording
_stream      = [None]               # live mic InputStream
_inject_lock = threading.Lock()     # serialize pastes
_cancelled   = [False]              # set by Escape — abort this recording, send nothing
_pending     = [False]              # a transcribe is in flight (Escape can still cancel)
_kbd         = keyboard.Controller()

def _cb(indata, frames, t, status):
    _qref[0].put(indata[:, 0].copy())

def _open_stream():
    dev = (int(MIC) if MIC and MIC.isdigit() else MIC) if MIC else None
    s = sd.InputStream(samplerate=SAMPLE_RATE, channels=1, dtype="float32",
                       blocksize=BLOCK, callback=_cb, device=dev)
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

_MODKEY = {"ctrl": keyboard.Key.ctrl, "shift": keyboard.Key.shift, "alt": keyboard.Key.alt}
def _send_combo(combo):
    """Send a key combo like 'ctrl+v' / 'ctrl+shift+v' via synthetic keystrokes."""
    toks = [t.strip() for t in combo.split("+") if t.strip()]
    mods = [t for t in toks if t in _MODKEY]
    keys = [t for t in toks if t not in _MODKEY]
    for m in mods: _kbd.press(_MODKEY[m])
    try:
        for k in keys:
            kk = getattr(keyboard.Key, k, None) or k
            _kbd.press(kk); _kbd.release(kk)
    finally:
        for m in reversed(mods): _kbd.release(_MODKEY[m])

def _inject(text):
    if _cancelled[0]: return                     # cancelled in the post-release window
    with _inject_lock:
        try: prev = pyperclip.paste()
        except Exception: prev = ""
        pyperclip.copy(text)
        time.sleep(0.03)
        _send_combo(PASTE)
        if SUBMIT:
            time.sleep(0.08)
            _kbd.press(keyboard.Key.enter); _kbd.release(keyboard.Key.enter)
        time.sleep(0.12)
        try: pyperclip.copy(prev)                # restore the user's clipboard (text only)
        except Exception: pass
    print(f"→ {text}", flush=True)

def _finish(txt, n_samp, sumsq):
    try:
        if _cancelled[0]: return
        if n_samp / SAMPLE_RATE < 0.2: return    # too short a tap
        rms = (sumsq / max(n_samp, 1)) ** 0.5
        if rms < RMS_FLOOR:
            print(f"⚠ mic silent (rms={rms:.5f}) — device changed? set VOICE_MIC_DEVICE (--list-devices)", flush=True)
            return
        txt = (txt or "").strip()
        if len(txt) >= MIN_CHARS: _inject(txt)
        else: print("(too short / no speech)", flush=True)
    finally:
        _pending[0] = False

def _drain_batch(myq):
    chunks = []
    try:
        while True: chunks.append(myq.get_nowait())
    except queue.Empty: pass
    if not chunks: _pending[0] = False; return
    audio = np.concatenate(chunks)
    txt = ""
    try:
        txt = model.recognize(audio, sample_rate=SAMPLE_RATE) or ""
    except Exception as e:
        print(f"  ✗ transcribe error: {e}", flush=True); _pending[0] = False; return
    _finish(txt, len(audio), float(np.dot(audio, audio)))

def _cancel():
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
        _cancelled[0] = False
        _qref[0] = queue.Queue()
        try:
            _stream[0] = _open_stream()
        except Exception as e:
            print(f"  ✗ mic open failed: {e}", flush=True); return
        _ptt_hold()
        print("● listening…", flush=True)

def on_release(key):
    _track(key, False)
    if _stream[0] is not None and not _combo_active():
        s = _stream[0]; _stream[0] = None
        try: s.stop(); s.close()
        except Exception: pass
        _ptt_release()
        if _cancelled[0]: return
        print("○ transcribing…", flush=True)
        _pending[0] = True
        threading.Thread(target=_drain_batch, args=(_qref[0],), daemon=True).start()

def _single_instance_guard():
    """One PTT at a time: two listeners fight over the mic + hotkey. Bind a fixed
    localhost port as a lock (freed automatically on exit)."""
    s = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    try:
        s.bind(("127.0.0.1", 47615))
        s.listen(1)
        return s                                 # keep ref alive for process lifetime
    except OSError:
        print("✗ another voice-ptt-win.py is already running (port 47615 held). Exiting.", flush=True)
        sys.exit(1)

def main():
    _guard = _single_instance_guard()  # noqa: F841  (held for process lifetime)
    print(f"🎙  PTT READY — HOLD {COMBO}, speak, release → text drops into the focused window "
          f"(submit={SUBMIT}, paste={PASTE}). Tap {_cancel_name} to cancel. Ctrl-C to quit.", flush=True)
    try:
        with keyboard.Listener(on_press=on_press, on_release=on_release) as l:
            l.join()
    except KeyboardInterrupt:
        _ptt_release()
        print("\nPTT stopped.")

if __name__ == "__main__":
    main()
