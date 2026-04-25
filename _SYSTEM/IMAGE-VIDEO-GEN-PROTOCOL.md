# Image + Video Generation Protocol

**Created:** 2026-04-24  
**Status:** Manual trigger — no automated pipeline yet  
**Scope:** Visual assets for client work + internal storyboards/moodboards

---

## Platform Roles

| Platform | Tool | Access | Output | Use Case |
|----------|------|--------|--------|----------|
| ChatGPT | **Images 2.0** | Web (paid subscription) | PNG/JPG | Client visual assets, concepts |
| Gemini App | **Imagen** | Mobile/Web app (Google) | PNG/JPG | Moodboards, style references |
| Gemini App | **Veo** | Mobile/Web app (Google) | MP4 | Storyboards, motion previsualization |
| Gemini Flash | Markdown digest | `g` CLI | .md | Pre-process prompts for NotebookLM |
| NotebookLM | Audio/visual digest | Manual upload | Audio/Notes | Research synthesis, brief prep |

> **C2MOVIEZ constraint:** Generative video for storyboards and moodboards ONLY.  
> No AI-generated B-roll as deliverable content. All final footage is live capture.

---

## Workflow: Client Visual Assets (ChatGPT Images 2.0)

1. Define visual brief in chat or prompt file
2. Generate in ChatGPT Images 2.0 (web interface)
3. Download output
4. Save to project folder:
   ```
   01_PROJECTS/[CLIENT]/05_ASSETS/generated/[YYYYMMDD]-[description].png
   ```
5. Add to session log if relevant to deliverables

**Prompt tips:**
- Specify aspect ratio (16:9, 1:1, 9:16) in prompt
- Include brand colors if available
- Reference style (cinematic, editorial, product, etc.)

---

## Workflow: Storyboards / Moodboards (Gemini App)

1. Write visual brief — mood, lighting, movement, color palette
2. Generate in Gemini App (Imagen for stills, Veo for motion)
3. Download + save:
   ```
   01_PROJECTS/[CLIENT]/05_ASSETS/storyboards/[YYYYMMDD]-[scene]-[v1].mp4
   ```
4. Use for client pre-visualization only — never as deliverable

**Notes:**
- Veo outputs are watermarked — not suitable for client delivery
- Use for pitch decks, mood communication, scene planning
- Kling / Wan 2.5 (Chinese tools) available as alternatives for longer previsualization — see `noesis-intake.md`

---

## Workflow: NotebookLM Audio Digest

1. Gemini Flash (`g`) generates strict technical markdown from source material:
   ```bash
   g "prepare a structured markdown digest of this content for NotebookLM. Include: key concepts, named entities, relationships, open questions"
   ```
2. Save to `_SYSTEM/session-outputs/notebooklm-prep-[date].md`
3. Manually upload to NotebookLM as source document
4. Generate audio overview or interactive notes
5. Export key insights → save as research note in vault

---

## File Storage Conventions

```
01_PROJECTS/[CLIENT]/
  05_ASSETS/
    generated/          ← ChatGPT Images 2.0 output
    storyboards/        ← Gemini Veo / Imagen for previsualization
    references/         ← Mood/style references (not generated)
```

---

## Quality Gates

- [ ] No AI-generated content delivered to C2MOVIEZ clients as final B-roll
- [ ] Storyboard files labeled as `[PREVIEW]` or `[MOODBOARD]` — not `[FINAL]`
- [ ] ChatGPT Images 2.0 outputs: check for brand alignment before sharing
- [ ] All generated assets versioned (`v1`, `v2`) — never overwrite

---

## Related

- [`EVONEXUS_INTEGRATION_MAP.md`](EVONEXUS_INTEGRATION_MAP.md) — full platform map
- [`noesis-intake.md`](../../../.claude/noesis/noesis-intake.md) — AI video tool research (Kling, Wan 2.5, Hailuo)
