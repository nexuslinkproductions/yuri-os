# Image + Video Generation Protocol

**Status:** Active storage and quality protocol.  
**Scope:** Visual assets for client work, YURI presentations, internal motion studies, and storyboards.

## Platform Posture

Visual tools are disposable adapters. YURI owns the brief, naming, storage, quality
gate, and source tracking.

| Surface | Access | Output | Use Case |
| --- | --- | --- | --- |
| ChatGPT Images | Web or API when available | PNG/JPG | Client concepts, presentation assets, visual references |
| Qwen/Wan image-video tools | Web/API when available | PNG/JPG/MP4 | Motion previsualization and style exploration |
| Local/OSS visual tools | Local runtime | PNG/JPG/MP4 | Private tests, repeatable visual experiments |
| Browser/Playwright inspection | Local browser | Screenshots/DOM evidence | Visual QA and responsive checks |

## Storage Convention

```text
01_PROJECTS/[CLIENT]/
  05_ASSETS/
    generated/          # generated still assets
    storyboards/        # previsualization motion or boards
    references/         # human-curated style/source references
    proofs/             # QA screenshots and review captures
```

Internal YURI reports use:

```text
_SYSTEM/reports/
  assets/[artifact-name]/
```

## Required Metadata

Every durable generated asset should have nearby context in the project note,
daily capture, or artifact registry:

- source tool/model if known
- prompt or brief reference
- intended use
- output path
- license/confidentiality note if relevant
- reviewer/status

## Quality Gates

- No generated final client B-roll unless explicitly approved by the project owner.
- Storyboards and previsualization are labeled as preview/moodboard material.
- Generated assets are versioned; do not overwrite final candidates.
- Visual QA uses Playwright/browser screenshots for layout evidence when the target is HTML.
- Assets for presentations should be checked at the actual presentation viewport, not only a large monitor.

## Replacement Rule

If a new visual provider is added, do not create a provider-owned folder tree.
Add a thin adapter note, update the registry, and keep storage under the project or
YURI report artifact path.
