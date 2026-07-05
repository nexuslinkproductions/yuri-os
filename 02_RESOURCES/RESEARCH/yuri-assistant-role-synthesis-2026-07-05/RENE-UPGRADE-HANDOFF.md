# Jeffrey upgrade pull — paste this to your assistant, René

> Marcel here. My session just shipped a batch of upgrades to `main` that also help your Jeffrey setup. **Don't hand-copy anything from my branch** — this is a guide for *your* assistant to pull `main` into your `rene` branch and adapt each piece to Jeffrey, keeping everything that's yours. Paste this whole message into your Claude/Jeffrey session on your machine and let it work through the steps. Nothing here touches your branch until you approve each step.

---

## To René's assistant: your job

You are on René's `rene` branch of `YURI-OS-MUSUBI`. `main` received upgrades that partly apply to Jeffrey (René's assistant — Windows, local Ollama, British-butler "Sir" persona, Custom Gear Solution business). **Bring over the transferable improvements; keep everything René-specific; break nothing.** Work one upgrade at a time, show René the diff, get his nod, then move on. Do NOT force-overwrite Jeffrey's persona or any CGS config.

### Step 0 — see what's coming (safe, read-only)
```bash
git fetch origin
git log --oneline origin/main -15
git diff --stat rene...origin/main -- _SYSTEM/Scripts/voice/yuri-z-brain.py _SYSTEM/persona.md .claude/CLAUDE.md _SYSTEM/SELF/
```
You share the same operator-aware voice brain (`yuri-z-brain.py`) as Marcel, so most of the brain upgrades merge cleanly. The persona and CLAUDE.md changes are Marcel-private in content but the *structure* is worth adopting.

---

## The upgrades, and how to adapt each to Jeffrey

### 1. Voice-brain features (HIGH value for Jeffrey — you share this file)
`main`'s `_SYSTEM/Scripts/voice/yuri-z-brain.py` gained four things. Merge `origin/main` for this file, then re-apply René's operator-aware bits on top if they conflict:
- **`read_doc` tool** — extracts TEXT from PDF / Word / Excel (`pdftotext` + `soffice --headless`). **This is the one René explicitly wanted** (real-doc ingestion, not raw bytes). On Windows, swap the CLI: `pdftotext` (poppler for Windows) and `soffice.com --headless --convert-to txt` (LibreOffice) — verify both are installed and on PATH, adjust the paths in `_extract_doc_text()`.
- **Download/install confirm-gate** — the critical-command gate now also holds before `pip/npm/brew/cargo install`, `curl/wget` file-downloads, and non-local `git clone`. This matches Jeffrey's hard rule ("never act outward / never install without René"). Keep it — it strengthens your gate. Windows note: consider adding `winget/choco/scoop install` and PowerShell `Invoke-WebRequest`/`iwr` to the regex.
- **Affirm-regex hardening** — a pending confirm now only fires on a SHORT affirmation (≤3 words), so "yeah, but also check the mail" no longer wrongly triggers the held action. Pure win for a confirm-gated assistant like Jeffrey. Keep it.
- **Work-state carryover** — a `work-state.json` ("where we left off": open items + next step) injected into the system prompt, so the morning greeting can say "we left off on X, next step Y" instead of only "what happened." Fits Jeffrey's morning-brief + carryover requirement (your S5/S19 answers). Adopt it; seed the file with René's real open loops.
- **`MEM_CAP` raised** 14k→20k so the memory index stops truncating. Harmless, adopt.

**Verify after merge (from `_SYSTEM/Scripts/voice/`):** `python3 -c "import ast;ast.parse(open('yuri-z-brain.py').read());print('OK')"` then `python3 test_yuri_z_brain.py`. Expect the same pre-existing 3 failures (stale write_file/edit_file/bash-rm-critical tests from a 2026-06-19 gate narrowing) — those are not new.

### 2. Persona structure (adopt the FRAME, keep Jeffrey's voice)
Marcel sharpened his private `_SYSTEM/persona.md`. **Do NOT copy its content** (Rick/Deadpool, Marcel's operating model — none of that is Jeffrey). What to lift into `_SYSTEM/SELF/jeffrey-persona.md` is the *structural* improvement:
- A **"How to run this doc"** frame at the top: identity is a lens not a costume; an explicit **conflict-resolution precedence** (owner intent → binding floor → local evidence → persona → model instinct); **the floor always wins**; every turn ends on a move.
- Tighten each rule into a **testable behavior**; drop redundancy.
Keep Jeffrey's British-butler "Sir" register, the INTERN vs GÄSTE two-register system, the CGS highest-stakes (HDPE mill waste, wrong-product-to-customer), and Rule-B split-routing exactly as they are. Only the *scaffolding* transfers.

### 3. Global CLAUDE.md hygiene (check if it bites you)
Marcel found his global `~/.claude/CLAUDE.md` was `@`-including the whole YURI-OS project spine into EVERY session, contaminating unrelated projects and creating an authority contradiction. The fix: a **lean global** (identity, safety floor, git discipline, memory routing, verification, wayfinding) that stops pulling any project adapter; project spines load per-repo.
- Check your own setup: `cat ~/.claude/CLAUDE.md` (or the Windows equivalent). If it pulls a project adapter globally, apply the same slimming. If René's Jeffrey global is already clean/minimal, skip this.
- The reference lean global is on `main` at `.claude/CLAUDE.md` — read it for the shape, adapt to René's machine (his projects, his authority rules), don't copy verbatim.

### 4. Wayfinding (nice-to-have)
`main`'s global gained a "Finding your way through YURI" section (front-doors to navigate a large repo). If Jeffrey works in this repo, the front-doors differ for René's side — Jeffrey's branch still uses `context-router.mjs` for navigation, not `xref-query.mjs`. Adapt the idea (list Jeffrey's real front-doors), don't copy Marcel's tool list.

### 5. Symlink enforcement (macOS-specific — probably skip)
Marcel added `_SYSTEM/Scripts/enforce-claude-symlink.mjs` to keep his `~/.claude → repo/.claude` symlink alive. This is a **macOS** convenience. On René's Windows box the mechanism differs (junctions/`mklink`); only worth doing if René actually symlinks `~/.claude` into the repo. Otherwise skip.

---

## Guardrails (non-negotiable)
- Adapt onto the `rene` branch only; keep it on `main`-tracking, never force-push.
- Merge the shared brain file, re-apply René's operator-aware code, run the tests before trusting it.
- Never overwrite `jeffrey-persona.md`, `jeffrey-confirm-gate.json`, or any CGS/customer config with Marcel's content — take structure, keep substance.
- Anything customer-data or outward-facing stays inside Jeffrey's existing confirm-gate + Rule-B split-routing.
- Show René each diff; his one-word yes gates each apply. When unsure, stop and ask him.

## Suggested order
1 (brain features — biggest win, especially `read_doc`) → 2 (persona frame) → 3 (global hygiene, only if it bites) → 4 (wayfinding) → 5 (skip unless symlinking). Verify after each. Report back to René what merged clean, what needed reconciliation, and what you skipped and why.
