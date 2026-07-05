# René / Jeffrey Pilot — Usage Learnings (2026-07-05)

> Pilot-user signal captured from `origin/rene` today. René is the first real user of the
> assistant track (Jeffrey, Windows, local models). His friction + choices are the ground truth
> that feeds Yuri's improvement loop + the `pilot-feedback` skill. Per research-capture mandate.

## The signal — today's commits on `origin/rene`

| commit | what René hit / chose | the underlying need |
|---|---|---|
| `a57179c3` | robotic SAPI TTS **rejected** → Kokoro British "Sir" voice | **voice quality is non-negotiable** for a spoken assistant; default TTS was a dealbreaker |
| `075420c5` | default voice = `bm_lewis` (his pick) | operator wants to **choose the persona voice** |
| `46db2945` | research: local TTS landscape (cited) | he ran the **research-first** flow himself |
| `c1aedbcd` | read_file extracts **PDF/Word/Excel text** (not raw bytes) | **real-doc ingestion** is core; raw bytes were useless |
| `10713aad` | gated read/edit/save scoped to **CGS folders** | organic **safety-scoping** (blast-radius by folder) |
| `dffc8a16` | **local second-brain** — FTS5 index + `search_files` | he independently built the RAG/local-memory surface |
| `5fde0292` | wired Windows voice loop to the local brain | end-to-end voice ↔ brain integration |
| `f879c84c` | **one-word launcher** (jeffrey / jeffrey test / jeffrey stop) | UX must be **one command**, not a ceremony |
| `3c007caa` | local Ollama brain on **qwen3:14b**, operator-aware | his hardware runs 14B locally; persona wired in |
| `ebc6dda3` | persona from **deep interview** | the questionnaire flow works for real users |
| `1f0d8a99` | added **LightBurn Pro** to daily-tool list (S7.25) | tool inventory filled by **real usage**, not guesswork |
| `c1ff12dc` | **auto-reindex** via Windows Task Scheduler | automation = the launchd beat, cross-platform |

## Decoded patterns (the compounding signal)

1. **Default voice quality is a maker-or-breaker.** Robotic TTS got replaced same-day. → Yuri must
   ship a human Kokoro voice by default (already does — keep it), and let the operator pick the voice.
2. **Real-document ingestion (PDF/Word/Excel) is table stakes.** Text extraction, not raw bytes.
   → Yuri's `read_file` equivalent must handle Office formats.
3. **Safety-scoping emerges organically.** René gated file tools to his business (CGS) folders —
   the same blast-radius-by-path pattern YURI's PreToolUse hooks use. Validate this is intuitive.
4. **A local second-brain (FTS5 + search) is a felt need** — René built it unprompted. This is
   independent validation of Yuri's A3 (NEURO_CORE) + A5 (ambient capture) roadmap.
5. **One-word launchers.** `jeffrey` / `jeffrey stop`. → Yuri's CLI entry must be one syllable
   (`yuri`), and stop/status must be symmetric.
6. **Persona-from-interview works.** The deep-questionnaire flow produced a persona a real user
   accepted. Reuse for Yuri verbatim.
7. **Tool inventory from reality.** LightBurn Pro surfaced from use, not the questionnaire's
   guesses. → the feedback mechanism must capture "tools actually used" passively.
8. **Auto-reindex is required**, not optional — the corpus goes stale fast; a scheduled reindex
   beat (launchd on macOS) must run without the operator asking.

## Transferable improvements for Yuri (the payoff)

- **Voice:** confirm Kokoro default + expose a `YURI_VOICE` pick (René chose `bm_lewis`).
- **Files:** Yuri's file tool must do PDF/Word/Excel text extraction (not raw bytes).
- **Second-brain:** the FTS5 + `search_files` pattern René built ≈ Yuri's planned local RAG — port
  the shape, don't redesign.
- **Launcher:** `yuri` / `yuri stop` / `yuri test` symmetry (the runtimed supervisor already
  supports start/stop/status).
- **Capture:** passively log "tools/files touched" so the tool inventory self-populates (feeds the
  feedback mechanism + A5 ambient capture).

## Feeds
- `pilot-feedback` skill (item 5) — negative-feedback signals (TTS rejection, raw-bytes failure)
  = the ΔU/surprise that NEURO_CORE should weight heavily.
- A3 (NEURO_CORE) + A5 (ambient capture) — independent validation of the roadmap from a real user.
