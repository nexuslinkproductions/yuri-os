#!/usr/bin/env python3
"""screen-tools.py — screen-awareness utility for the Yuri voice assistant.

Provides on-device screen context the brain can query:
  * OCR text from a screenshot (macOS Vision VNRecognizeTextRequest, free, ~131ms)
  * the live window list (reuses the compiled ``window-list`` binary)
  * the frontmost app + window title (reuses ``frontmost.swift``)
  * a compact combined screen summary

CLI:
  python3 screen-tools.py [summary|frontmost|windows [filter]|ocr [window_id]]

IPC: every command prints exactly one JSON document (or the summary text) on
stdout, so the orchestrator can treat us as a one-shot subprocess query.
"""

import json
import os
import subprocess
import sys
import time

# --- asset locations -------------------------------------------------------
_DIR = os.path.dirname(os.path.abspath(__file__))
_WINDOW_LIST_BIN = os.path.join(_DIR, "window-list")
_WINDOW_LIST_SWIFT = _WINDOW_LIST_BIN + ".swift"
_FRONTMOST_SWIFT = os.path.join(_DIR, "frontmost.swift")


# --- Vision OCR (embedded Swift, on-device) --------------------------------
# PyObjC/Vision bindings are not importable in the system python3, so we drive
# the Vision framework through a small Swift program piped via `swift -`. The
# image path is passed through the environment (YURI_OCR_IMG) to avoid any
# argv-indexing ambiguity with `swift -`.
_SWIFT_OCR_SOURCE = r"""
import Vision
import AppKit
import Foundation

let env = ProcessInfo.processInfo.environment
guard let imgPath = env["YURI_OCR_IMG"] else {
    FileHandle.standardError.write("no YURI_OCR_IMG\n".data(using: .utf8)!)
    exit(2)
}
guard let nsImage = NSImage(contentsOf: URL(fileURLWithPath: imgPath)),
      let cg = nsImage.cgImage(forProposedRect: nil, context: nil, hints: nil) else {
    FileHandle.standardError.write("cannot load image\n".data(using: .utf8)!)
    exit(3)
}

let req = VNRecognizeTextRequest()
req.recognitionLevel = .accurate
req.usesLanguageCorrection = true

let handler = VNImageRequestHandler(cgImage: cg, options: [:])
do { try handler.perform([req]) } catch {
    FileHandle.standardError.write("vision perform failed\n".data(using: .utf8)!)
    exit(4)
}

let lines = (req.results ?? []).compactMap { $0.topCandidates(1).first?.string }
let joined = lines.joined(separator: "\n")
FileHandle.standardOutput.write(joined.data(using: .utf8)!)
"""


def _vision_ocr(path):
    """Run the embedded Vision Swift on *path*; return extracted text or "".

    Degrades gracefully when ``swift`` is absent, Vision is unavailable, or the
    recognition step fails/times out.
    """
    try:
        env = dict(os.environ, YURI_OCR_IMG=path)
        proc = subprocess.run(
            ["swift", "-"],
            input=_SWIFT_OCR_SOURCE,
            capture_output=True,
            text=True,
            timeout=20,
            env=env,
        )
    except (FileNotFoundError, subprocess.TimeoutExpired):
        return ""
    if proc.returncode != 0:
        return ""
    return proc.stdout.strip()


def ocr_screenshot(window_id=None):
    """Capture the full screen (or *window_id*) and OCR it via macOS Vision.

    Returns the extracted text string. On any failure (screencapture denied,
    Vision unavailable, timeout) returns "".
    """
    path = f"/tmp/yuri-ocr-{int(time.time() * 1000)}.png"
    try:
        if window_id:
            subprocess.run(
                ["screencapture", "-l" + str(window_id), "-x", path], timeout=5
            )
        else:
            subprocess.run(["screencapture", "-x", path], timeout=5)
    except (FileNotFoundError, subprocess.TimeoutExpired):
        return ""

    if not os.path.exists(path):
        return ""

    try:
        return _vision_ocr(path)
    finally:
        try:
            os.remove(path)
        except OSError:
            pass


# --- window list -----------------------------------------------------------
def list_windows(filter_str=None):
    """Return the on-screen window list as a JSON-decoded array.

    Reuses the compiled ``window-list`` binary when present, else falls back to
    ``swift window-list.swift``. When *filter_str* is given, windows are kept
    whose ``app``+``title`` contains it (case-insensitive).
    """
    if os.path.exists(_WINDOW_LIST_BIN) and os.access(_WINDOW_LIST_BIN, os.X_OK):
        cmd = [_WINDOW_LIST_BIN]
    elif os.path.exists(_WINDOW_LIST_SWIFT):
        cmd = ["swift", _WINDOW_LIST_SWIFT]
    else:
        return []

    try:
        out = subprocess.run(cmd, capture_output=True, text=True, timeout=5)
    except (FileNotFoundError, subprocess.TimeoutExpired):
        return []
    if out.returncode != 0 or not out.stdout.strip():
        return []

    try:
        windows = json.loads(out.stdout)
    except json.JSONDecodeError:
        return []

    if filter_str:
        needle = filter_str.lower()
        windows = [
            w
            for w in windows
            if needle in (str(w.get("app", "")) + " " + str(w.get("title", ""))).lower()
        ]
    return windows


# --- frontmost app ---------------------------------------------------------
def frontmost_app():
    """Return ``{"app","title"}`` for the currently focused app.

    Prefers the bundled ``frontmost.swift`` (NSWorkspace + Accessibility API,
    more reliable titles) and falls back to a System Events osascript.
    """
    if os.path.exists(_FRONTMOST_SWIFT):
        try:
            out = subprocess.run(
                ["swift", _FRONTMOST_SWIFT],
                capture_output=True,
                text=True,
                timeout=8,
            )
            if out.returncode == 0 and out.stdout.strip():
                data = json.loads(out.stdout)
                return {"app": data.get("app", ""), "title": data.get("title", "")}
        except (FileNotFoundError, subprocess.TimeoutExpired, json.JSONDecodeError):
            pass

    # Fallback: osascript via System Events.
    script = '''tell application "System Events"
  set p to first application process whose frontmost is true
  set winList to ""
  try
    set winList to name of window 1 of p
  end try
  return (name of p) & "|" & winList
end tell'''
    try:
        out = subprocess.run(
            ["osascript", "-e", script], capture_output=True, text=True, timeout=3
        )
    except (FileNotFoundError, subprocess.TimeoutExpired):
        return {"app": "unknown", "title": ""}
    if out.returncode == 0:
        parts = out.stdout.strip().split("|", 1)
        return {"app": parts[0], "title": parts[1] if len(parts) > 1 else ""}
    return {"app": "unknown", "title": ""}


# --- combined summary ------------------------------------------------------
def screen_summary():
    """Compact text summary of the current screen state for the brain."""
    fm = frontmost_app()
    wins = list_windows()[:10]  # top 10 windows
    apps = ", ".join(w.get("app", "?") for w in wins) if wins else "(none)"
    return (
        f"Frontmost: {fm['app']} ({fm['title']})\n"
        f"Windows: {apps}"
    )


# --- CLI -------------------------------------------------------------------
if __name__ == "__main__":
    cmd = sys.argv[1] if len(sys.argv) > 1 else "summary"
    if cmd == "ocr":
        wid = int(sys.argv[2]) if len(sys.argv) > 2 else None
        print(json.dumps(ocr_screenshot(wid)))
    elif cmd == "windows":
        filt = sys.argv[2] if len(sys.argv) > 2 else None
        print(json.dumps(list_windows(filt)))
    elif cmd == "frontmost":
        print(json.dumps(frontmost_app()))
    else:
        print(screen_summary())
