---
name: project-bug-bounty-money-push
description: RESUME: lock Keycloak #49246 (keyAlias NPE) as first contribution; build env first; clone isolated at ~/bb-targets/keycloak; corpus wired; YWH parked; Rust held
metadata:
  type: project
  tier: working
  scope: all
  trig: ["bug bounty", "keycloak", "49246", "resume", "next session", "contribution", "build", "nexus-recon", "rust", "faisal", "mike"]
  refs: ["[[project-nexus-link-app-vision]]", "[[feedback-prefer-rust]]", "[[project-next-session-mike-call]]"]
---

GOAL  LEARN + EARN via bug bounties, precision/quality-first. Career pivot (Marcel + Mike).

RESUME NEXT SESSION → LOCK IN ON KEYCLOAK ISSUE #49246 (first open-source contribution, to prove our work gets accepted).
#49246 = NullPointerException in CertificateInfoHelper.java line 242 (services/src/main/java/org/keycloak/services/util/): `uploadForm.getFirst("keyAlias").asString()` NPEs when the keyAlias param is missing; sibling params (keyPassword L244, storePassword L247) ARE null-guarded, keyAlias isn't. FIX = guard keyAlias + return 400. Labels: help-wanted, priority/low, 1 comment = high acceptance odds, low contention. Ideal pipeline-prover.
PIPELINE to land it: (1) Marcel comments on #49246 to claim it (his GH account); (2) stand up local Keycloak build — Rick reads docs/building.md (100 lines, in clone) + guides; JDK+Maven, 183M Quarkus monorepo — THE first real hurdle; (3) reproduce the NPE; (4) Rick writes guard + test in Keycloak's style; (5) Marcel builds/verifies + submits PR (one commit, rebased on main, issue-linked, test included). Rick drafts, Marcel submits (external action = Marcel's account).

PHASING  Phase 1 = become an ACCEPTED Keycloak contributor. FORGET YWH/bounty for now (Marcel's explicit call — Rick was over-scoping it). Once contributions land -> later introduce HackerOne + bounty hunting. Rust arc HELD; build nexus-recon in Rust in parallel.

STATE  Keycloak cloned ISOLATED at /Users/marcelspatz/bb-targets/keycloak (outside YURI tree; GitNexus won't index it). Cockpit notes: 03_NEXUS-LINK/bug-bounty/keycloak.md. Process understood = 3 channels (paid vuln->YWH / responsible disclosure->keycloak.org+GH-private / non-security contribution->Discussion->Issue->PR w/ tests+docs); NEVER open a public issue for a vuln. Weak-area map from 40 GHSA (authz/privesc 8, auth-bypass 6, SAML 4, redirect 3) in keycloak.md. Corpus WIRED: 03_NEXUS-LINK/bug-bounty/corpus/bugbounty.db FTS5 (9,487 reports + 643 programs) via bb-corpus.py (build/search). Full intel: 03_NEXUS-LINK/bug-bounty/intel-2026-06-01.md.

WHO  Marcel = hunter/contributor (solo). Mike = tax/org/admin lane (no subscription yet; hunting deferred until crash course). Org route decided, not yet registered.

KYC  YWH/MangoPay wallet KYC blocked by a name-validation bug; support email sent. Irrelevant to Phase-1 contribution work (no KYC needed to contribute).

NETWORKING  Faisal Hourani (Threads, verified, WebMedic / eCommerce Specialist, mutual follow) DM'd — saw Marcel's Opus-4.8 posts, asked what he's working on. Reply drafted: YURI framed as a DYNAMIC extension of Jake Van Clief's ICM/MWP (static structured context -> live self-curating context OS around Claude).

SEE  [[project-nexus-link-app-vision]] · [[feedback-prefer-rust]] · [[project-next-session-mike-call]] · 03_NEXUS-LINK/bug-bounty/keycloak.md · YURI Track-A: business-structure decision + bug-bounty-corpus (2026-06-01)
