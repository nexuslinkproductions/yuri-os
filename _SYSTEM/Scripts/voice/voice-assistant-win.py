#!/usr/bin/env python3
# @capability: voice-assistant-clicky-win
# @serves: screen aware voice assistant | clicky windows | hold key ask about screen | voice question claude | talk to claude about my screen | yuri voice assistant
# @does: Phase-1 "Clicky"-equivalent for WINDOWS — a screen-aware push-to-talk voice ASSISTANT. Hold a hotkey, ask a question out loud; on release Parakeet-TDT-v3 (local ONNX/CUDA, EN+DE auto) transcribes it, a screenshot of the screen is captured (mss) and sent WITH the question to CLAUDE (Anthropic Messages API, vision), and the answer is spoken back via local Windows SAPI TTS (pyttsx3). Voice-in + screen-aware + voice-out. Phase 1 = no cursor/halo overlay and no background-agent spawn yet (see the YURI-Clicky plan). Local-first: STT + TTS + capture all run on-device; only the vision+reasoning hop goes to Claude (Claude has no local model).
# @use: run `python voice-assistant-win.py` (or assistant-win.bat). Needs ANTHROPIC_API_KEY (or an `ant auth login` profile) for the Claude brain — everything else is local. HOLD the combo (default RIGHT-SHIFT — distinct from the PTT-dictation lane's right-ctrl), speak a question, release. Tap ESC to cancel. `--check` prints readiness (STT/TTS/screen/Claude) and exits. `--list-devices` lists mics. Tune via env: VOICE_ASSIST_KEY, VOICE_ASSIST_MODEL (default claude-opus-4-8), VOICE_ASSIST_CANCEL_KEY, VOICE_ASSIST_MONITOR (0=all|1=primary|N), VOICE_ASSIST_MAXPX (screenshot long-edge cap, default 1280), VOICE_MIC_DEVICE, VOICE_ASSIST_MAXTOK (default 512).
# @exports: main
"""Windows screen-aware push-to-talk voice assistant. Parakeet STT -> screenshot -> Claude vision -> SAPI TTS.
Jeffrey mode (operator.json overlay / VOICE_ASSIST_BRAIN=local) routes instead to the LOCAL Ollama brain
(:8013) — text-only, no screenshot, no cloud."""
import os, sys, io, glob, site, time, threading, queue, socket, base64, json, urllib.request

# Force UTF-8 console (Windows cp1252 can't encode the status glyphs).
for _s in (sys.stdout, sys.stderr):
    try: _s.reconfigure(encoding="utf-8", errors="replace")
    except Exception: pass

# ---------------------------------------------------------------------------
# BOOTSTRAP — must precede `import onnxruntime` AND the Anthropic SDK.
# ---------------------------------------------------------------------------
# TLS: AVG antivirus HTTPS-inspection (avgMonFltProxy) presents a private root CA
# that certifi lacks -> both huggingface_hub (model download) AND the Anthropic
# SDK's httpx client fail with CERTIFICATE_VERIFY_FAILED. truststore routes
# Python ssl through the Windows cert store (which trusts the AVG CA), fixing both.
try:
    import truststore; truststore.inject_into_ssl()
except Exception:
    pass

# CUDA DLLs: the nvidia-*-cu13 wheels nest DLLs under nvidia/cu13/bin/x86_64/ and
# nvidia/cudnn/bin/ — deeper than onnxruntime.preload_dlls() searches, so ORT
# silently falls back to CPU. Add every dir under site-packages/nvidia holding a
# .dll to the loader search path (layout-agnostic).
def _wire_cuda_dlls():
    added = 0
    for sp in site.getsitepackages() + [site.getusersitepackages()]:
        root = os.path.join(sp, "nvidia")
        if not os.path.isdir(root): continue
        for dp, _d, files in os.walk(root):
            if any(f.lower().endswith(".dll") for f in files):
                try:
                    os.add_dll_directory(dp)
                    os.environ["PATH"] = dp + os.pathsep + os.environ.get("PATH", "")
                    added += 1
                except Exception: pass
    return added
_CUDA_DIRS = _wire_cuda_dlls()

os.environ.setdefault("HF_HUB_OFFLINE", "1")
os.environ.setdefault("TOKENIZERS_PARALLELISM", "false")
os.environ.setdefault("HF_HUB_DISABLE_PROGRESS_BARS", "1")

import numpy as np
import sounddevice as sd
import mss
from PIL import Image
from pynput import keyboard

# ---------------------------------------------------------------------------
# CONFIG
# ---------------------------------------------------------------------------
SAMPLE_RATE = 16000
BLOCK       = 1600
STT_MODEL   = os.environ.get("VOICE_ASSIST_STT_MODEL", "nemo-parakeet-tdt-0.6b-v3")  # multilingual EN+DE
BRAIN_MODEL = os.environ.get("VOICE_ASSIST_MODEL", "claude-opus-4-8")
MAXTOK      = int(os.environ.get("VOICE_ASSIST_MAXTOK", "512"))

# Brain routing — mirrors .claude/operator.json persona.overlay (same identity the brains + brain-inject
# read). Jeffrey (René) defaults to the LOCAL on-device brain (Ollama, :8013, text-only, no screenshot,
# $0, private); Marcel/others keep the Claude vision path. Force with VOICE_ASSIST_BRAIN=local|claude.
def _detect_operator():
    op = os.environ.get("YURI_VOICE_OPERATOR", "").strip().lower()
    if op:
        return op
    try:
        _p = os.path.join(os.path.dirname(__file__), "..", "..", "..", ".claude", "operator.json")
        with open(_p, encoding="utf-8") as _f:
            ov = (json.load(_f).get("persona", {}).get("overlay") or "").strip().lower()
        if ov:
            return ov
    except Exception:
        pass
    return "marcel"
_OPERATOR     = _detect_operator()
BRAIN_MODE    = os.environ.get("VOICE_ASSIST_BRAIN", "").strip().lower() or ("local" if _OPERATOR == "jeffrey" else "claude")
LOCAL_URL     = os.environ.get("VOICE_ASSIST_LOCAL_URL", "http://127.0.0.1:8013/v1/chat/completions")
LOCAL_TIMEOUT = float(os.environ.get("VOICE_ASSIST_LOCAL_TIMEOUT", "180"))
MIC         = os.environ.get("VOICE_MIC_DEVICE")
RMS_FLOOR   = float(os.environ.get("VOICE_ASSIST_RMS", "0.0008"))
MIN_CHARS   = 2
MONITOR     = int(os.environ.get("VOICE_ASSIST_MONITOR", "1"))   # 1 = primary (readable res); 0 = all monitors (squished)
MAXPX       = int(os.environ.get("VOICE_ASSIST_MAXPX", "1280"))  # screenshot long-edge cap (token/latency control)
_prov       = os.environ.get("VOICE_ASSIST_PROVIDER", "cuda").lower().strip()
PROVIDERS   = ["CPUExecutionProvider"] if _prov in ("cpu", "cpuexecutionprovider") \
              else ["CUDAExecutionProvider", "CPUExecutionProvider"]

# Hotkey — default RIGHT-SHIFT so it never collides with the PTT-dictation lane
# (voice-ptt-win.py, default right-ctrl). Both can run at once on distinct keys.
COMBO = os.environ.get("VOICE_ASSIST_KEY", "shift_r").lower().strip()

_cancel_name = os.environ.get("VOICE_ASSIST_CANCEL_KEY", "esc").lower().strip()
CANCEL_KEY = keyboard.Key.esc if _cancel_name in ("esc", "escape") else getattr(keyboard.Key, _cancel_name, None)

SYSTEM_PROMPT = (
    "You are Yuri, a screen-aware voice assistant for René. You receive a screenshot of his "
    "screen plus a spoken question. Answer in 1-3 SHORT sentences meant to be SPOKEN ALOUD: "
    "plain text only — no markdown, no code fences, no bullet lists, no preamble, no emoji. "
    "Be direct and concrete. Use the screenshot when the question refers to what's on screen; "
    "if you genuinely can't tell, say so briefly. Reply in the SAME language as the question "
    "(English or German)."
)

# ---------------------------------------------------------------------------
# combo tracking (mirrors the PTT harness)
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
    if SINGLE is not None: return key == SINGLE
    if SINGLE_CHAR is not None: return getattr(key, "char", None) == SINGLE_CHAR
    return False

def _track(key, down):
    if _match_single(key): _state["single"] = down
    if key in CTRL_KEYS:  _state["ctrl"]  = down
    elif key in SHIFT_KEYS: _state["shift"] = down
    elif key in ALT_KEYS:   _state["alt"]   = down
    elif key == keyboard.Key.enter: _state["enter"] = down

# ---------------------------------------------------------------------------
# screenshot
# ---------------------------------------------------------------------------
def grab_screenshot_png():
    """Capture a monitor, downscale to MAXPX long edge, return (png_bytes, w, h)."""
    with mss.MSS() as sct:
        idx = MONITOR if 0 <= MONITOR < len(sct.monitors) else 1
        raw = sct.grab(sct.monitors[idx])
        img = Image.frombytes("RGB", raw.size, raw.rgb)
    w, h = img.size
    scale = MAXPX / max(w, h)
    if scale < 1.0:
        img = img.resize((max(1, int(w * scale)), max(1, int(h * scale))), Image.LANCZOS)
    buf = io.BytesIO(); img.save(buf, format="PNG")
    return buf.getvalue(), img.size[0], img.size[1]

# ---------------------------------------------------------------------------
# Claude brain (vision) — lazy client so --check can report auth state cleanly
# ---------------------------------------------------------------------------
_anthropic = [None]
def _client():
    if _anthropic[0] is None:
        import anthropic
        _anthropic[0] = anthropic.Anthropic()   # picks up ANTHROPIC_API_KEY / ANTHROPIC_AUTH_TOKEN / base_url
    return _anthropic[0]

def ask_claude(question, png_bytes):
    b64 = base64.b64encode(png_bytes).decode()
    resp = _client().messages.create(
        model=BRAIN_MODEL,
        max_tokens=MAXTOK,
        system=SYSTEM_PROMPT,
        messages=[{"role": "user", "content": [
            {"type": "image", "source": {"type": "base64", "media_type": "image/png", "data": b64}},
            {"type": "text", "text": question},
        ]}],
    )
    return "".join(b.text for b in resp.content if getattr(b, "type", None) == "text").strip()

def ask_local(question):
    """POST the spoken question to the LOCAL Jeffrey brain (Ollama-backed, :8013). Text-only — no
    screenshot, no cloud. The brain injects Jeffrey's persona server-side, so no system prompt here."""
    body = json.dumps({"messages": [{"role": "user", "content": question}]}).encode()
    req = urllib.request.Request(LOCAL_URL, data=body, headers={"Content-Type": "application/json"})
    with urllib.request.urlopen(req, timeout=LOCAL_TIMEOUT) as r:
        d = json.loads(r.read())
    return (d.get("choices", [{}])[0].get("message", {}).get("content", "") or "").strip()

# ---------------------------------------------------------------------------
# TTS (local Windows SAPI via pyttsx3) — spoken on a worker thread
# ---------------------------------------------------------------------------
_tts_lock = threading.Lock()
def speak(text):
    with _tts_lock:
        try:
            import pyttsx3
            eng = pyttsx3.init()                 # SAPI5; re-init per utterance (pyttsx3 loop is not reentrant)
            eng.say(text); eng.runAndWait(); eng.stop()
        except Exception as e:
            print(f"  ✗ TTS failed: {e}  (answer shown above)", flush=True)

# ---------------------------------------------------------------------------
# recording
# ---------------------------------------------------------------------------
_qref = [queue.Queue()]; _stream = [None]; _cancelled = [False]; _busy = [False]

def _cb(indata, frames, t, status): _qref[0].put(indata[:, 0].copy())

def _open_stream():
    dev = (int(MIC) if MIC and MIC.isdigit() else MIC) if MIC else None
    s = sd.InputStream(samplerate=SAMPLE_RATE, channels=1, dtype="float32",
                       blocksize=BLOCK, callback=_cb, device=dev)
    s.start(); return s

def _handle(myq):
    chunks = []
    try:
        while True: chunks.append(myq.get_nowait())
    except queue.Empty: pass
    _busy[0] = False
    if _cancelled[0] or not chunks: return
    audio = np.concatenate(chunks)
    if len(audio) / SAMPLE_RATE < 0.2: return
    rms = float(np.sqrt(np.mean(audio ** 2)))
    if rms < RMS_FLOOR:
        print(f"⚠ mic silent (rms={rms:.5f}) — check VOICE_MIC_DEVICE (--list-devices)", flush=True); return
    # 1) transcribe (local GPU)
    try:
        q = (MODEL.recognize(audio, sample_rate=SAMPLE_RATE) or "").strip()
    except Exception as e:
        print(f"  ✗ transcribe error: {e}", flush=True); return
    if len(q) < MIN_CHARS:
        print("(too short / no speech)", flush=True); return
    print(f"❓ {q}", flush=True)
    if _cancelled[0]: return
    # 2) brain: LOCAL Jeffrey (text, on-device) or CLAUDE (vision + screenshot)
    if BRAIN_MODE == "local":
        try:
            ans = ask_local(q)
        except Exception as e:
            print(f"  ✗ local brain error ({type(e).__name__}): {e}  — is it running? start it with `jeffrey`", flush=True)
            return
    else:
        try:
            png, w, h = grab_screenshot_png()
        except Exception as e:
            print(f"  ✗ screenshot failed: {e}", flush=True); return
        try:
            ans = ask_claude(q, png)
        except Exception as e:
            cls = type(e).__name__
            if "Authentication" in cls or "PermissionDenied" in cls:
                print("  ✗ Claude auth failed — set ANTHROPIC_API_KEY (or run `ant auth login`).", flush=True)
            elif "Connection" in cls:
                print(f"  ✗ Claude connection error: {e}", flush=True)
            else:
                print(f"  ✗ Claude error ({cls}): {e}", flush=True)
            return
    if _cancelled[0]: return
    print(f"💬 {ans}", flush=True)
    # 4) speak (local)
    speak(ans)

def _cancel():
    _cancelled[0] = True
    s = _stream[0]; _stream[0] = None
    if s is not None:
        try: s.stop(); s.close()
        except Exception: pass
    try:
        while True: _qref[0].get_nowait()
    except queue.Empty: pass
    print("✗ cancelled", flush=True)

def on_press(key):
    if CANCEL_KEY is not None and key == CANCEL_KEY and (_stream[0] is not None or _busy[0]):
        _cancel(); return
    _track(key, True)
    if _combo_active() and _stream[0] is None:
        _cancelled[0] = False; _qref[0] = queue.Queue()
        try: _stream[0] = _open_stream()
        except Exception as e:
            print(f"  ✗ mic open failed: {e}", flush=True); return
        print("● listening…", flush=True)

def on_release(key):
    _track(key, False)
    if _stream[0] is not None and not _combo_active():
        s = _stream[0]; _stream[0] = None
        try: s.stop(); s.close()
        except Exception: pass
        if _cancelled[0]: return
        print("○ thinking…", flush=True)
        _busy[0] = True
        threading.Thread(target=_handle, args=(_qref[0],), daemon=True).start()

# ---------------------------------------------------------------------------
# model load / readiness
# ---------------------------------------------------------------------------
MODEL = None
def _load_stt():
    global MODEL
    import onnx_asr
    MODEL = onnx_asr.load_model(STT_MODEL, providers=PROVIDERS)
    try: MODEL.recognize(np.zeros(SAMPLE_RATE * 1, dtype=np.float32), sample_rate=SAMPLE_RATE)  # warm
    except Exception: pass

def _bound_provider():
    import onnxruntime as ort
    def dig(o, d=0, s=None):
        s = s or set(); out = []
        if id(o) in s or d > 3: return out
        s.add(id(o))
        for a in dir(o):
            if a.startswith("__"): continue
            try: v = getattr(o, a)
            except Exception: continue
            if isinstance(v, ort.InferenceSession): out.append(v.get_providers()[0])
            elif hasattr(v, "__dict__") and not callable(v): out += dig(v, d + 1, s)
        return out
    return sorted(set(dig(MODEL)))

def _check():
    print("YURI voice assistant — readiness check\n" + "-" * 40)
    ok = True
    # STT
    try:
        _load_stt(); prov = _bound_provider()
        gpu = any(p.startswith("CUDA") for p in prov)
        print(f"STT   : ✓ {STT_MODEL} on {prov} {'(GPU)' if gpu else '(CPU)'}")
    except Exception as e:
        print(f"STT   : ✗ {e}"); ok = False
    # screen
    try:
        png, w, h = grab_screenshot_png(); print(f"SCREEN: ✓ capture {w}x{h}, {len(png)//1024} KB PNG")
    except Exception as e:
        print(f"SCREEN: ✗ {e}"); ok = False
    # TTS
    try:
        import pyttsx3; eng = pyttsx3.init(); n = len(eng.getProperty("voices")); eng.stop()
        print(f"TTS   : ✓ SAPI5, {n} voice(s) installed")
    except Exception as e:
        print(f"TTS   : ✗ {e}"); ok = False
    # Brain reachability — local Jeffrey brain (:8013) or Claude auth
    if BRAIN_MODE == "local":
        try:
            with urllib.request.urlopen(LOCAL_URL.replace("/v1/chat/completions", "/health"), timeout=5) as r:
                h = json.loads(r.read())
            print(f"BRAIN : ✓ local {h.get('model','?')} (operator={h.get('operator','?')}, on-device, $0)")
        except Exception as e:
            print(f"BRAIN : ✗ local brain not answering on {LOCAL_URL} — start it with `jeffrey`  ({type(e).__name__})")
            ok = False
    else:
        try:
            import anthropic
            c = anthropic.Anthropic()
            c.messages.create(model=BRAIN_MODEL, max_tokens=4, messages=[{"role": "user", "content": "hi"}])
            print(f"BRAIN : ✓ Claude {BRAIN_MODEL} reachable, auth OK")
        except Exception as e:
            cls = type(e).__name__
            if "Authentication" in cls or "PermissionDenied" in cls:
                print("BRAIN : ✗ Claude — no/invalid credentials — set ANTHROPIC_API_KEY (or `ant auth login`)")
            else:
                print(f"BRAIN : ✗ Claude {cls}: {str(e)[:100]}")
            ok = False
    print("-" * 40)
    print("READY ✓ — hold the hotkey and ask." if ok else "NOT READY — fix the ✗ lines above.")
    return ok

def _single_instance_guard():
    s = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    try:
        s.bind(("127.0.0.1", 47616)); s.listen(1); return s
    except OSError:
        print("✗ another voice-assistant-win.py is already running (port 47616). Exiting.", flush=True)
        sys.exit(1)

def main():
    if "--list-devices" in sys.argv:
        for i, d in enumerate(sd.query_devices()):
            if d.get("max_input_channels", 0) > 0:
                print(f"  [{i}] {d['name']}")
        return
    if "--check" in sys.argv:
        sys.exit(0 if _check() else 1)
    _guard = _single_instance_guard()  # noqa: F841
    print(f"loading Parakeet ({STT_MODEL})…", flush=True)
    _load_stt()
    prov = _bound_provider()
    print(f"  STT bound: {prov} {'✓ GPU' if any(p.startswith('CUDA') for p in prov) else '(CPU)'}", flush=True)
    _brain_desc = f"local {LOCAL_URL}" if BRAIN_MODE == "local" else f"claude {BRAIN_MODEL}"
    _ask_what = "ask a question" if BRAIN_MODE == "local" else "ask about your screen"
    print(f"🧠 {'Jeffrey' if _OPERATOR == 'jeffrey' else 'YURI'} voice assistant READY — HOLD {COMBO}, {_ask_what}, "
          f"release. Brain={_brain_desc}. Tap {_cancel_name} to cancel. Ctrl-C to quit.", flush=True)
    try:
        with keyboard.Listener(on_press=on_press, on_release=on_release) as l:
            l.join()
    except KeyboardInterrupt:
        print("\nassistant stopped.")

if __name__ == "__main__":
    main()
