---
tags:
  - research
  - templates
  - documentation
status: active
priority: high
kind: template
---
# Research Templates

Use these templates to keep research consistent and reusable.

---

## Source Note

```markdown
---
type: source
status: inbox
source_grade: A
date_accessed: 2026-04-22
source_type: article
---

# Title

## Source
- URL:
- Publisher:
- Author:
- Date published:

## Key Claim
- 

## Evidence
- 

## Notes
- Fact:
- Inference:
- Open question:

## Next Action
- 
```

## Synthesis Note

```markdown
---
type: synthesis
status: active
date_created: 2026-04-22
topics:
  - 
---

# Title

## Thesis
- 

## Sources Used
- 

## What We Know
- 

## What We Do Not Know
- 

## Conclusion
- 

## Next Action
- 
```

## Decision Note

```markdown
---
type: decision
status: final
date_created: 2026-04-22
decision_owner: 
---

# Decision Title

## Decision
- 

## Why
- 

## Evidence
- 

## Alternatives Considered
- 

## Consequences
- 

## Follow-Up
- 
```

## Watchlist Note

```markdown
---
type: watchlist
status: active
review_cadence: weekly
topics:
  - 
---

# Watchlist Title

## Why It Matters
- 

## Signals To Watch
- 

## Current Sources
- 

## Last Reviewed
- 

## Next Review
- 
```

## Capture Rule

Before saving anything, decide whether it is:
- raw source material
- synthesis
- decision
- watchlist
- archive

## Artifact Candidate

Use this when a research thread is mature enough to become a reusable skill, tool, or both.

```markdown
---
type: artifact-candidate
status: draft
artifact_kind: skill
artifact_name:
confidence: medium
source_notes:
  - 
tool_interface:
  - 
---

# Artifact Candidate Title

## Why This Exists
- 

## Stable Behavior
- 

## Evidence
- 

## Draft Output
- Skill:
- Tool:

## Review Gate
- What must be true before this becomes active?
```

Required fields:
- `artifact_kind` = `skill`, `tool`, or `both`
- `artifact_name` = the reusable artifact name
- `source_notes` = research notes that justify the artifact

That choice determines the note shape.
