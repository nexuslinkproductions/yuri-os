---
name: yuri-musubi-naming-convention
description: "YURI = product name; MUSUBI = version line; this release ships as YURI \"MUSUBI ONE\"; version NAMES not numbers (Apple-Tahoe style), each update a fitting codename"
metadata: 
  node_type: memory
  type: project
  tier: semantic
  scope: main
  trig: 
    - naming
    - version
    - musubi
    - release name
    - ship
    - version name
    - branding
  refs: 
    - "[[agent-economy-positioning-thesis]]"
    - "[[native-only-op-resume-2026-06-02]]"
  originSessionId: 77a85f6c-ab3f-44dd-a9ee-6299873e2241
---

GOAL: hold the canonical product/version naming convention for shipping. WHO: Marcel (owner directive 2026-06-03).

RULES:
- **YURI** = the product / brand name of what we built (what users see; the thing).
- **MUSUBI** = the version line / codename axis (the "core" / version name).
- This release ships as **YURI · "MUSUBI ONE"** — YURI is the name worn publicly, "MUSUBI ONE" is the software version, treated like Apple's named OS releases (e.g. "Tahoe 26.4.1" — the NAME is the identity, not the number).
- **Version NAMES, never version numbers.** Each shipped update gets a NEW cool codename that fits what that version delivered. No semver-style numbering as the public identity.

IMPLICATION: the OpenClaw-adapter release (see [[agent-economy-positioning-thesis]]) ships as "YURI" with version "MUSUBI ONE". When packaging the open-source repo / install guide / release notes, lead with YURI as product + the named version; pick a fitting codename for each subsequent release.
