#!/usr/bin/env python3
"""voice-serve.py — persistent voice server. Loads models ONCE, serves via Unix socket.
First call: ~15s (model load). Subsequent calls: ~0.5-1s (models already in memory).
Started automatically by voice-call.py when the socket isn't found."""
import socket, os, json, sys, threading, signal, time

SOCKET_PATH = "/tmp/yuri-voice.sock"
SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))

# Import the voice module (has voice_listen, voice_speak, voice_screenshot, startup)
import importlib.util
spec = importlib.util.spec_from_file_location("voice_mcp", os.path.join(SCRIPT_DIR, "voice-mcp-server.py"))
mod = importlib.util.module_from_spec(spec)
spec.loader.exec_module(mod)

# Load models ONCE
print("[voice-serve] loading models (one-time, ~15s)…", file=sys.stderr, flush=True)
t0 = time.time()
mod.startup()
print(f"[voice-serve] models loaded in {time.time()-t0:.1f}s — serving on {SOCKET_PATH}", file=sys.stderr, flush=True)

# Write PID file so voice-call.py can check if we're alive
with open("/tmp/yuri-voice.pid", "w") as f:
    f.write(str(os.getpid()))

# Clean up on exit
def cleanup(*_):
    try: os.unlink(SOCKET_PATH)
    except: pass
    try: os.unlink("/tmp/yuri-voice.pid")
    except: pass
    os._exit(0)
signal.signal(signal.SIGTERM, cleanup)
signal.signal(signal.SIGINT, cleanup)

if os.path.exists(SOCKET_PATH):
    os.unlink(SOCKET_PATH)

server = socket.socket(socket.AF_UNIX, socket.SOCK_STREAM)
server.bind(SOCKET_PATH)
server.listen(5)
os.chmod(SOCKET_PATH, 0o666)  # allow connections from any process

def handle_client(conn):
    """One request per connection: {tool, args} → {result} or {error}"""
    try:
        data = b""
        while b"\n" not in data:
            chunk = conn.recv(65536)
            if not chunk:
                return
            data += chunk
        req = json.loads(data.decode().strip())
        tool = req.get("tool", "")
        args = req.get("args") or {}

        if tool == "voice_listen":
            result = mod.voice_listen(float(args.get("timeout_secs", 10)))
        elif tool == "voice_speak":
            result = mod.voice_speak(str(args.get("text", "")))
        elif tool == "voice_screenshot":
            import subprocess, base64
            wid = args.get("window_id")
            path = f"/tmp/yuri-voice-shot-{int(time.time())}.png"
            if wid:
                subprocess.run(["screencapture", "-l"+str(wid), "-x", path], timeout=5)
            else:
                subprocess.run(["screencapture", "-x", path], timeout=5)
            if os.path.exists(path) and os.path.getsize(path) > 2048:
                with open(path, "rb") as f:
                    img_b64 = base64.b64encode(f.read()).decode()
                conn.sendall(json.dumps({"image": img_b64}).encode() + b"\n")
            else:
                conn.sendall(json.dumps({"result": "screenshot capture failed"}).encode() + b"\n")
            return
        else:
            result = f"unknown tool: {tool}"

        conn.sendall(json.dumps({"result": result}).encode() + b"\n")
    except Exception as e:
        try:
            conn.sendall(json.dumps({"error": str(e)[:200]}).encode() + b"\n")
        except:
            pass
    finally:
        conn.close()

print("[voice-serve] ready — waiting for calls", file=sys.stderr, flush=True)
while True:
    try:
        conn, _ = server.accept()
        threading.Thread(target=handle_client, args=(conn,), daemon=True).start()
    except Exception as e:
        print(f"[voice-serve] accept error: {e}", file=sys.stderr, flush=True)
