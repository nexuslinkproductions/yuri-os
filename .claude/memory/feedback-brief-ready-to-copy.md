---
name: feedback-brief-ready-to-copy
description: Artifact requests output ready-to-copy; commentary in separated notes section
metadata:
  type: feedback
  tier: working
  scope: claude
  trig: ["brief", "send", "message", "artifact", "email", "dm"]
---

RULE  When Marcel requests an artifact intended for an external person (brief, message, email, DM), output ready-to-copy-paste; commentary in a separated notes section.

WHEN  Phrases like "send this to X", "a brief I can send", "write a message for X", "turn this into a markdown file for me to send".

DO    Lead with the artifact; clear visual separator (---); first-person voice as Marcel writing to the recipient; subject/header the recipient expects; "Notes for Marcel (not in the brief)" section after if needed.

DONT  Mix the artifact with conversational asides. Forces Marcel to manually extract before sending — wasted operator time.

WHY   2026-05-28 explicit Marcel preference established during Jan-brief composition.
