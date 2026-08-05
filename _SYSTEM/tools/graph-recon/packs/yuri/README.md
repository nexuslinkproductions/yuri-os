# packs/yuri — optional YURI-OS scanner pack

**This pack is YURI-specific. The core template (`scanners/`) is project-agnostic.**

Contents: `organs.py`, `registries.py`, `memory_schema.py`, `formula_banks.py`
(originally `scanners/` in the pre-M4-W1 template).

## Loading

Registry auto-discovery loads `scanners/` (core) only. This pack loads only
when explicitly requested:

- CLI flag: `python3 -m reconloop.cli run --packs yuri ...`
- Config: `"packs": ["yuri"]` in `reconproject.json`

## Notes

- Pack scanners use absolute imports (`from scanners.base import ...`) since
  they do not live inside the core `scanners/` package.
- Pack scanner files are hashed in `hashfreeze.json` under the `packs`
  section (they are part of the template, but optional to load at runtime).
- To create your own pack: `packs/<name>/*.py` + `packs/<name>/manifest.json`,
  then load with `--packs <name>` or config.
