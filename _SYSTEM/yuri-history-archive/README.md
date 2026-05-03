# Yuri OS / NUDIMMUD History Archive

Raw markdown source files documenting session history, continuity, and operational DNA.

## Versioned Archives

### 2026-05-03 Clean Snapshot (30 files)
- **Path:** `raw_2026-05-03_30/`
- **Manifest:** `manifest_2026-05-03_30.json`
- **Source:** ~/Downloads (strict match rule: YURI_OS_NUDIMMUD* or yuri_os_nudimmud* basenames)
- **Files:** 30 markdown documents
- **Status:** Verified, de-duplicated, false-positives removed

### Previous / Legacy Archives
Preserved without modification. See git history for intake details.

## Manifest Schema (Versioned)

Each manifest entry contains:
- `original_path` — source path in ~/Downloads
- `archived_path` — absolute path in versioned archive
- `original_basename` — filename as inventoried
- `archived_basename` — basename (may include __dupNN if collision)
- `size_bytes` — file size at intake
- `sha256` — content hash
- `mtime_iso` — original file mtime
- `intake_status` — "copied"

## Validation

All files in versioned archives:
- Start with `YURI_OS_NUDIMMUD` or `yuri_os_nudimmud`
- End with `.md`
- Pass content hash verification
- Are present in corresponding manifest
- Are counted in archive summary
