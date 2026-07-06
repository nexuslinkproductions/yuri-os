---
name: yuri-public-release-spec
description: "YURI public MIT release = deterministic exoskeleton + curated research DB ONLY (export-filtered, non-destructive); product layer/connectors/licensed-third-party/private content excluded; line locked"
metadata: 
  node_type: memory
  type: project
  tier: semantic
  scope: all
  trig: 
    - release
    - ship
    - public repo
    - open source
    - export
    - research database
    - curated db
    - exoskeleton
    - what ships
    - clean repo
    - tagline
    - one-liner
  refs: 
    - "[[agent-economy-positioning-thesis]]"
    - "[[bug-bounty-corpus-location-schema]]"
  originSessionId: d72eab55-5e8c-43cf-ac7c-94d32555cd81
---

GOAL  Ship YURI as a public MIT open-source release. The release is EXACTLY two
things: (1) the deterministic governance+continuity EXOSKELETON, (2) a CURATED
research database to operate it. Nothing else.

WHO  Marcel (owner). First public release; Threads/IG rollout planned.

WHEN  Scope locked 2026-06-09. Build waves pending.

WHERE  Full spec: `_SYSTEM/reports/YURI_RELEASE_SPEC_2026-06-09.md`. Positioning
+ landscape: `02_RESOURCES/research/yuri-positioning-and-landscape-2026-06-09.md`.
State assessment: `_SYSTEM/reports/YURI_RELEASE_READINESS_ASSESSMENT_2026-06-09.md`.

STATE  The clean repo is a NON-DESTRUCTIVE filtered EXPORT of this private repo
(no `git rm` of Marcel's product). LOCKED LINE: "The deterministic gateway for
AI." + sub "Governance, safety, and continuity that hold on any model." EXCLUDE
from export: all `_SYSTEM/backend/` product layer; external connectors (Plane,
Linear, Obsidian, Outlook, Austrian registries) — Marcel uses NONE; licensed
non-shippable third-party (Playwright, Whisper, browser-harness, bundled
local-model infra); private content (persona.md, user-profile, .claude/memory,
campaigns, bug-bounty corpus, business, personal research, private DBs);
openclaw/hermes/obliteratus naming. RESEARCH DB rule: general research useful for
OPERATING/building-with YURI, genuinely useful + curated (not dumped), FTS5-indexed;
NO personal research, NO bug-bounty, NO business.

Foundation landed 2026-06-09: assessment, openMass/geass/launch-readiness fixes,
independence-check retired (launch gate GREEN), shellService dev-login key deleted
+ daemon killed (dev role intact, anchored in `_SYSTEM/SELF/dev-credential.json`),
LICENSE/SECURITY/persona.template/.env.example, wiki-rag watcher scrapped, `.env*`
guard narrowed to free `.env.example`.

NEXT  W1 de-hardcode 56 `/Users/marcelspatz` sites (inventory ready; `~/.claude`
symlink means `__dirname` derivations need per-file verify). W2 `yuri-init`
docking contract + INSTALL.md. W3 research-DB curation. W4 export tooling. W5
launch. SEE [[agent-economy-positioning-thesis]].
