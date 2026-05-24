# YURI Authorized Replay Scope

Generated: 2026-05-24T16:21:27.878Z

## Decision

- Client: Upgreat pilot candidate
- Release allowed: false
- Status: blocked_until_signed_scope

Blockers:
- written authorization missing
- authorizedBy missing
- authorizationReference missing
- timeWindow missing
- emergencyStopContact missing

## Allowed Surfaces

- owned local synthetic fixture
- client-provided owned staging URL after written authorization
- client-provided AI-agent/tool manifest after written authorization
- client-provided repository snapshot after written authorization

## Allowed Actions

- read-only DOM/CDP inspection
- read-only manifest/schema review
- read-only repository/static analysis
- local fixture replay
- report-only finding documentation

## Forbidden Actions

- unscoped external scanning
- credential capture or credential replay
- form submission against client systems
- malware execution
- DDoS or availability pressure outside local owned systems
- persistence, lateral movement, or data exfiltration

## Required Artifacts Before Execution

- _SYSTEM/reports/YURI_CYBER_PROOF_CARDS_2026-05-23.md
- _SYSTEM/reports/YURI_CYBER_RETEST_PROOF_2026-05-24.md
- _SYSTEM/reports/YURI_BROWSER_REPLAY_PROOF_2026-05-24.md

## Stop Conditions

- scope ambiguity
- unexpected credential exposure
- client system instability
- request for out-of-scope offensive action
- missing owner contact during active replay
