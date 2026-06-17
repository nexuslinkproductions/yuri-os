#!/usr/bin/env python3
# @capability: voice-ptt-control
# @serves: push to talk | voice control claude | hold key speak inject | voice into vscode claude | hands-on voice command
# @does: GLOBAL push-to-talk voice control. Hold a hotkey, speak, release -> Parakeet transcribes -> the text is pasted (clipboard + Cmd-V [+ Return]) into the FOCUSED app — VS Code's Claude input, a terminal Claude, anywhere. No always-on, no VAD wait, no TTS: intentional voice INPUT only. Sidesteps the no-injection-API wall by typing like a human into whatever's focused.
# @use: run `ptt` (grant Accessibility to the terminal/python on first run). HOLD the combo (default ctrl+enter), speak, release. Tune: VOICE_PTT_KEY ("ctrl+enter" | "alt+enter" | single like "alt_r"/"f13"), VOICE_PTT_SUBMIT (1=paste+Enter, 0=paste only), VOICE_MIC_DEVICE.
import os, sys, time, threading, subprocess
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

print(f"loading Parakeet… (PTT = hold {COMBO})", flush=True)
model = from_pretrained("mlx-community/parakeet-tdt-0.6b-v2", dtype=mx.float32)
preproc = model.preprocessor_config

_buf = []; _rec = [False]; _lock = threading.Lock()

def _cb(indata, frames, t, status):
    if _rec[0]:
        with _lock: _buf.append(indata[:, 0].copy())

dev = (int(MIC) if MIC and MIC.isdigit() else MIC) if MIC else None
stream = sd.InputStream(samplerate=SAMPLE_RATE, channels=1, dtype="float32", blocksize=BLOCK, callback=_cb, device=dev)
stream.start()

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
    prev = subprocess.run(["pbpaste"], capture_output=True).stdout      # save clipboard
    subprocess.run(["pbcopy"], input=text.encode(), check=False)
    time.sleep(0.05)
    ok = _osa('tell application "System Events" to keystroke "v" using command down')
    if ok and SUBMIT:
        time.sleep(0.15)
        _osa('tell application "System Events" to key code 36')         # Return
    time.sleep(0.2)
    subprocess.run(["pbcopy"], input=prev, check=False)                 # restore clipboard
    print(f"→ {text}" + ("" if ok else "  (paste did NOT fire — see error above)"), flush=True)

def _transcribe_and_inject():
    with _lock:
        if not _buf: return
        audio = np.concatenate(_buf); _buf.clear()
    if len(audio) / SAMPLE_RATE < 0.2: return                           # ignore key-taps
    txt = (model.generate(get_logmel(mx.array(audio), preproc))[0].text or "").strip()
    if len(txt) >= MIN_CHARS:
        _inject(txt)
    else:
        print("(too short / no speech)", flush=True)

def on_press(key):
    _track(key, True)
    if _combo_active() and not _rec[0]:
        with _lock: _buf.clear()
        _rec[0] = True
        print("● listening…", flush=True)

def on_release(key):
    _track(key, False)
    if _rec[0] and not _combo_active():
        _rec[0] = False
        print("○ transcribing…", flush=True)
        threading.Thread(target=_transcribe_and_inject, daemon=True).start()

print(f"🎙  PTT READY — HOLD {COMBO}, speak, release → text drops into the focused app (submit={SUBMIT}). Ctrl-C to quit.", flush=True)
print("    (first run: macOS will ask to grant Accessibility — allow it for the terminal + System Events)", flush=True)
try:
    with keyboard.Listener(on_press=on_press, on_release=on_release) as l:
        l.join()
except KeyboardInterrupt:
    print("\nPTT stopped.")
