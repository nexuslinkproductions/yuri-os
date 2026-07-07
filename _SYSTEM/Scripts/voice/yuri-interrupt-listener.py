#!/usr/bin/env python3
"""yuri-interrupt-listener.py — watches Right Command key, touches /tmp/yuri-interrupt on press.
Runs alongside the orchestrator. Requires Accessibility permission for the terminal/python.
Uses pynput (same lib as voice-ptt.py)."""
import os, sys
try:
    from pynput import keyboard
except ImportError:
    print("pynput not installed — pip install pynput", file=sys.stderr)
    sys.exit(1)

INTERRUPT_FILE = "/tmp/yuri-interrupt"

def on_press(key):
    if key == keyboard.Key.cmd_r:
        try:
            open(INTERRUPT_FILE, "w").close()
        except:
            pass

print("[yuri-interrupt] watching Right Command key — press to interrupt Yuri", flush=True)
with keyboard.Listener(on_press=on_press) as l:
    l.join()
