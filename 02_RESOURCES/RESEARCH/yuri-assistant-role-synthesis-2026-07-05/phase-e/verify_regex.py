import importlib.util, sys, os, types

# Stub heavy/optional sibling deps so we can import the brain module for regex-only checks.
for mod in ("jarvis_memory", "jarvis_energy", "jarvis_spreading", "jarvis_xref"):
    if mod not in sys.modules:
        m = types.ModuleType(mod)
        # jarvis_memory is used as `import jarvis_memory as jm` then jm.JarvisMemory(...)
        m.JarvisMemory = lambda *a, **k: types.SimpleNamespace(
            remember=lambda *a, **k: "ok", recall=lambda *a, **k: "", canonical_block=lambda *a, **k: "")
        sys.modules[mod] = m

os.environ["YURI_Z_NO_BASH"] = "1"
BRAIN = os.path.join(os.path.dirname(__file__), "..", "..", "..", "_SYSTEM", "Scripts", "voice", "yuri-z-brain.py")
spec = importlib.util.spec_from_file_location("yzb", BRAIN)
m = importlib.util.module_from_spec(spec)
try:
    spec.loader.exec_module(m)
except SystemExit:
    pass
except Exception as e:
    print("IMPORT NOTE:", type(e).__name__, str(e)[:120])

cb = getattr(m, "_CRITICAL_BASH", None)
ae = getattr(m, "_affirms_early", None)
fails = 0

if cb:
    GATE = ["pip install requests", "pip3 install x", "sudo pip install x", "python -m pip install x",
            "brew install wget", "brew install --cask foo", "npm install -g x", "yarn add x && npm install",
            "cargo install ripgrep", "gem install bundler", "go install ./cmd", "apt-get install vim",
            "curl -O http://x/f", "curl -o f http://x", "wget http://x/f", "curl http://x > f",
            "git clone https://github.com/a/b", "git clone git@github.com:a/b", "git push origin main"]
    SAFE = ["npm run build", "pip list", "pip show requests", "git status", "git clone /local/path",
            "git clone ../sibling", "ls -la", "cargo build", "go build ./...", "echo install foo",
            "curl http://localhost:8014/health", "wget -qO- http://x | jq"]
    print("=== SHOULD GATE (installs/downloads/push) ===")
    for c in GATE:
        hit = bool(cb.search(c))
        print(("  GATED   " if hit else "  **MISS** ") + c)
        if not hit: fails += 1
    print("=== SHOULD NOT GATE (benign local) ===")
    for c in SAFE:
        hit = bool(cb.search(c))
        print(("  **FALSEPOS** " if hit else "  ok      ") + c)
        if hit: fails += 1
else:
    print("_CRITICAL_BASH not found"); fails += 1

if ae:
    print("=== AFFIRM (short=confirm, long/redirect=not) ===")
    cases = [("yes", True), ("do it", True), ("go ahead", True), ("yep", True), ("confirm", True),
             ("yeah but also check my calendar", False), ("yes please go ahead and do that", False),
             ("no", False), ("actually no", False)]
    for s, want in cases:
        got = bool(ae(s))
        flag = "ok" if got == want else "**WRONG**"
        if got != want: fails += 1
        print(f"  {flag:11} want={want!s:5} got={got!s:5}  {s!r}")
else:
    print("_affirms_early not found"); fails += 1

print(f"\nRESULT: {'ALL PASS' if fails == 0 else str(fails)+' FAILURES'}")
sys.exit(1 if fails else 0)
