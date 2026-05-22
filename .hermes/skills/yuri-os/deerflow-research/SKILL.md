---
name: deerflow-research
description: Delegate deep research to DeerFlow for long-horizon investigation
version: 1.0.0
metadata:
  hermes:
    tags: [research, deerflow, yuri-os]
    category: yuri-os
    requires_toolsets: [terminal]
---

# DeerFlow Research Bridge

## When to Use

- Task requires deep multi-source research
- Task would need 10+ web searches
- User wants a comprehensive report, not a quick answer
- Research should run in background while user does other work

## Procedure

1. Parse the research question from the user's request.
2. Run: `bash ~/NUDIMMUD/yuri-os/bin/deerflow-bridge.sh "<research question>"`
3. Wait for completion.
4. Read the output file.
5. Summarize key findings to the user.
6. Note the output file path for the user.

## Runtime Notes

- DeerFlow is installed at `~/NUDIMMUD/deerflow` on the `main-1.x` branch.
- This branch uses `main.py` and `conf.yaml`, not the newer 2.0 `backend/` app layout.
- `SEARCH_API` defaults to `duckduckgo` in the bridge.
- API keys are sourced from `~/NUDIMMUD/yuri-os/.env`.
- Docker sandbox is not active.

## Verification

- Output file exists and contains substantive content.
- User receives an actionable summary.
