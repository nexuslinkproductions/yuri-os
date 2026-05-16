---
name: yuri-report
description: Generate styled HTML reports + slides + PDFs from technical content. Uses Mermaid for diagrams, Chart.js for data viz, CSS Grid for layouts. Outputs self-contained HTML, optionally headless-Chrome-renders to PDF. Inspired by visual-explainer (MIT). Used by /eot, /system-audit, /diff-review.
triggers:
  - "/report"
  - "yuri-report"
  - "/system-audit"
  - "/diff-review"
---

# Yuri Report

## Modes

- `/report --type=eot` -- EOT closeout artifact
- `/report --type=system-audit` -- Full system audit (30-page deep)
- `/report --type=diff-review` -- Code diff visualization
- `/report --type=plan-review` -- Plan review with mermaid flowchart

## Design system

- NVIDIA / Stripe / Linear-tier polish
- Inter display, JetBrains Mono technical, generous typography
- Charts: clean SVG, single accent per chart, no 3D
- Layout: A4 portrait or 16:9 web, 12-col grid

## Output

- HTML always (self-contained, opens in browser)
- PDF on request (headless Chrome render)
- Slides on request (16:9 deck mode)

## Trigger from EOT

EOT Phase 9 (synthesis) optionally invokes yuri-report to produce the human-readable closeout document.
