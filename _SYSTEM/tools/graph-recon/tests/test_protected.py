import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from reconloop.protected import is_protected
from reconloop.context import ScanContext
ctx = ScanContext("/Users/marcelspatz/YURI-OS-MUSUBI")
assert is_protected(".env") and is_protected("backend/.env")
assert is_protected(".claude/state/x.json") and is_protected("backend/data/db.sqlite")
assert is_protected("_SYSTEM/OS_KERNEL/memory.db")
assert is_protected("Library/Application Support/October/app.db")
assert not is_protected("_SYSTEM/Scripts/x.mjs")
assert not is_protected("Library/Application Support/October/worktrees/w/y.mjs")
assert ctx.read_text("backend/.env") is None
meta = ctx.meta_only("backend/.env")
assert "content_sha256_prefix" in meta and "size" in meta
print("test_protected OK")
