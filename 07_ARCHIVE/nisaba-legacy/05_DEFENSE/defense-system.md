# NISABA — HOUSE 5: DEFENSE SYSTEM
*The Arsenal. Where the empire's walls are built and its sentries patrol.*

---

## THE DEFENSE DOCTRINE

> Most vulnerabilities are preventable basics.
> The exploit you didn't check for is the one that breaks you.
> Defense is not a feature request. Defense is a gate.

NISABA's defense system operates in three modes:
1. **Active scanning** — automated security pipeline on every deployment
2. **Resilience architecture** — failure detection and recovery across the empire
3. **Compliance tracking** — mapping findings to standards (OWASP, GDPR, SOC2)

---

## SECURITY PIPELINE (Three-Phase)

### Phase 1: REPORTER (Broad Scan)

The reporter scans everything. It finds potential issues. It does not prove them.

```
Reporter agent prompt:

You are a security REPORTER. Your job is to find potential vulnerabilities.
Scan the following codebase areas and report findings.

## Scan targets
1. Authentication & session management
2. Input validation & injection points
3. Access control & authorization
4. Data exposure (PII in logs, unencrypted storage)
5. Dependency vulnerabilities (outdated packages)
6. Secrets in code (API keys, passwords, tokens)
7. Configuration security (default credentials, verbose errors)
8. API security (rate limiting, auth, input validation)

## For each finding, report:
- Severity: P1 (critical), P2 (high), P3 (medium), P4 (low)
- Category: which of the 15 taxonomy categories (see below)
- Location: exact file + line number
- Description: what the vulnerability is
- Business context: what an attacker could achieve
- Confidence: HIGH (certain it's a real issue) or MEDIUM (needs verification)

## Rules:
- Report EVERYTHING you find, even low-severity items
- Include file paths and line numbers for every finding
- Do NOT attempt exploitation — that's Phase 2's job
- Business context is required — a finding without business impact context is noise
```

### Phase 2: EXPLOITER (Proof-of-Concept)

The exploiter takes Phase 1's P1 and P2 findings and attempts to exploit them.
**A finding without proof is noise.** The exploiter proves or discards.

```
Exploiter agent prompt:

You are a security EXPLOITER. Phase 1 found these potential vulnerabilities.
Your job: attempt to exploit each one.

## Findings to verify:
{paste P1 and P2 findings from Phase 1}

## For each finding:
1. Attempt to exploit it (craft payload, test the vector, demonstrate impact)
2. If exploitation succeeds:
   - Document the exact steps to reproduce
   - Document the impact (what data is exposed, what access is gained)
   - Mark as CONFIRMED
3. If exploitation fails:
   - Document why it fails (what protection blocked it)
   - Mark as UNCONFIRMED — drop from report

## Rules:
- Operate in a safe testing environment only
- Do not modify production data
- Do not exfiltrate real user data
- If you cannot safely test, mark as UNTESTABLE with explanation
- Document EXACTLY what you tried, even if it failed
```

### Phase 3: DOCUMENTER (Remediation)
**NISABA original — BTN stops at Phase 2.**

The documenter takes confirmed findings and produces actionable remediation specs.

```
Documenter agent prompt:

You are a security DOCUMENTER. Phase 2 confirmed these vulnerabilities.
Your job: produce remediation specs that a developer can implement immediately.

## Confirmed findings:
{paste confirmed findings from Phase 2}

## For each finding, produce:
1. Remediation ticket:
   - Title: specific, not generic
   - Priority: P1 (block deploy), P2 (fix this sprint), P3 (backlog)
   - Exact code location (file:line)
   - Current vulnerable code (quoted)
   - Fixed code (complete replacement, not pseudocode)
   - Test to verify fix (specific test case)
   - Compliance mapping: which standards this violates (OWASP, GDPR, SOC2)

2. Exceptions (if applicable):
   - Why this finding is accepted as a known risk
   - Who approved the exception
   - When the exception expires (max 90 days)
   - What compensating controls exist

## Rules:
- Fixed code must be a complete drop-in replacement
- Generic advice ("validate inputs") is not acceptable
- Every fix must include a test to verify
- Exceptions must have an expiration date
```

---

## VULNERABILITY TAXONOMY (15 Categories)

```
 1. INJECTION
    SQL, NoSQL, LDAP, OS command, template injection
    Test: craft payloads for every user input that reaches a query

 2. BROKEN AUTHENTICATION
    Weak sessions, credential exposure, MFA bypass, session fixation
    Test: attempt session hijacking, brute force, credential stuffing

 3. SENSITIVE DATA EXPOSURE
    PII in logs, unencrypted storage, over-broad API responses
    Test: grep logs for emails/names/IPs, check encryption at rest

 4. XML EXTERNAL ENTITIES (XXE)
    XML parser configured to resolve external entities
    Test: craft XXE payload if XML parsing exists

 5. BROKEN ACCESS CONTROL
    IDOR, path traversal, privilege escalation, missing function-level access
    Test: access resources as wrong user, traverse paths, escalate roles

 6. SECURITY MISCONFIGURATION
    Default credentials, verbose errors, open S3/storage buckets, CORS misconfiguration
    Test: check defaults, trigger errors, enumerate storage, test CORS

 7. CROSS-SITE SCRIPTING (XSS)
    Reflected, stored, DOM-based
    Test: inject script payloads in every user-controlled output

 8. INSECURE DESERIALIZATION
    Object injection, remote code execution via crafted objects
    Test: craft malicious serialized objects if deserialization exists

 9. KNOWN VULNERABLE COMPONENTS
    Outdated dependencies, EOL libraries, unpatched frameworks
    Test: npm audit / pip audit / dependency check against CVE databases

10. INSUFFICIENT LOGGING & MONITORING
    Missing audit trails, no alerting on suspicious activity
    Test: perform suspicious actions, verify they're logged and alerted

11. SERVER-SIDE REQUEST FORGERY (SSRF)
    Requests to internal services via user-controlled URLs
    Test: provide internal URLs (169.254.169.254, localhost) in URL parameters

12. API SECURITY
    Broken object-level auth, mass assignment, missing rate limiting
    Test: access other users' objects via API, send unexpected fields, flood endpoints

13. SUPPLY CHAIN
    Compromised packages, dependency confusion, typosquatting
    Test: audit package sources, check for known compromised packages

14. BUSINESS LOGIC
    Race conditions, negative balance exploits, workflow bypass
    Test: concurrent requests, edge-case values, skip required steps

15. SECRETS EXPOSURE
    API keys in git history, environment variables in client bundle, hardcoded credentials
    Test: search git history for secrets, inspect client bundles, check environment handling
```

---

## RESILIENCE FRAMEWORK

Defense is not only about external attackers. Internal system failures are the more common threat.

### Failure detection matrix

```
FAILURE TYPE              │ DETECTION METHOD                │ RESPONSE
─────────────────────────┼─────────────────────────────────┼──────────────────────────
Silent failure            │ No output for 60+ min           │ Check cron logs, API status
(system stops producing)  │ State file unchanged            │ Restart trigger, alert human
                          │                                 │
Semantic error            │ Output passes gates but is      │ GAN evaluator catches via
(wrong answer, right      │ semantically wrong              │ rubric scoring
format)                   │                                 │
                          │                                 │
Constraint drift          │ Agent writes outside its        │ File system audit: compare
(agent exceeds scope)     │ assigned directory/files        │ changed files vs spec
                          │                                 │
Cost explosion            │ Token usage tracking per        │ Hard budget cap per cycle
(2x+ baseline spend)      │ agent per cycle                 │ Alert at 1.5x, kill at 2x
                          │                                 │
Memory conflict           │ Rules contradict each other     │ Conflict detection scan
(evolution introduced     │ (dream worker check)            │ Write to conflicts.md
contradiction)            │                                 │ Human resolves
                          │                                 │
Learning regression       │ Recent patterns reverse older   │ NOESIS audit: compare new
(new rule undoes old      │ confirmed knowledge             │ rules against canon
knowledge)                │                                 │
                          │                                 │
Dependency failure        │ External service down or        │ Circuit breaker: retry 3x
(API, database, service   │ returning errors                │ then fallback or sleep
down)                     │                                 │
                          │                                 │
Data corruption           │ State file malformed or         │ Backup state before every
(state becomes invalid)   │ contains impossible values      │ cycle, restore from backup
                          │                                 │
Cascade failure           │ One specialist's bad output     │ Isolation: each specialist
(error propagates         │ poisons downstream specialists  │ validates its OWN inputs
through pipeline)         │                                 │ before processing
```

### Recovery protocol

```
Every failure follows this sequence:

1. DETECT — automated monitoring catches the signal
   (monitoring runs independently of the system being monitored)

2. ISOLATE — quarantine the failing component
   (don't let the failure spread to other specialists)

3. IDENTIFY — find last known-good state
   (state file backups, git history, deployment logs)

4. RESTORE — rollback to last-good
   (automated if possible, manual if state is complex)

5. VERIFY — confirm restoration
   (run gates against restored state)

6. POST-MORTEM — document what happened
   (write to .nisaba/defense/incidents/{date}-{id}.md)

7. HARDEN — prevent recurrence
   (add gate, rule, or monitoring for this failure mode)
   (promote preventive measure to CLAUDE.md if cross-project)
```

### Circuit breaker pattern

```
For external dependencies (APIs, databases, services):

CLOSED (normal operation)
  → Request succeeds → stay CLOSED
  → Request fails → increment failure counter
  → Failure counter ≥ 3 → transition to OPEN

OPEN (blocking requests)
  → All requests immediately return fallback/error
  → Start cooldown timer (60 seconds)
  → Timer expires → transition to HALF-OPEN

HALF-OPEN (testing recovery)
  → Send ONE test request
  → Success → transition to CLOSED, reset counter
  → Failure → transition to OPEN, restart timer

Implementation:
  Store circuit state in state file
  Every agent checks circuit state before external calls
  Shared state means all agents respect the same circuit
```

---

## COST TRACKING & BUDGET DEFENSE

```
Every agent cycle logs:
  {
    "agent": "builder",
    "task_id": "task-001",
    "timestamp": "2026-04-19T21:30:00Z",
    "tokens": {
      "input": 12400,
      "output": 3200,
      "cache_read": 8000
    },
    "cost_usd": 0.47,
    "model": "claude-sonnet-4-6",
    "duration_ms": 14200
  }

Budget rules:
  - Daily budget ceiling: $20.00 (configurable per project)
  - Per-cycle alert threshold: $5.00 (single expensive cycle)
  - Per-agent alert threshold: $3.00 (single agent running up costs)
  - Monthly budget ceiling: $300.00 (hard stop)

  When ceiling hit:
  1. Current cycle completes (don't corrupt mid-execution)
  2. All future triggers suppressed until:
     a. Human raises the ceiling, OR
     b. New day/month resets the counter
  3. Alert written to .nisaba/defense/budget-alerts/{date}.md
```

---

## INCIDENT LOG FORMAT

```markdown
# Incident: {date}-{id}

## Summary
One sentence: what broke, when, how long until recovery

## Timeline
- HH:MM — first signal detected
- HH:MM — isolation complete
- HH:MM — root cause identified
- HH:MM — restoration complete
- HH:MM — verification passed

## Root Cause
What actually caused the failure (not symptoms — the cause)

## Impact
- What was affected
- How long it was affected
- What data/output was lost or corrupted

## Resolution
What was done to fix it (specific steps)

## Prevention
What gate, rule, or monitoring was added to prevent recurrence
Reference: {link to new rule or gate specification}

## Cost
- Direct cost of the incident (wasted compute, lost time)
- Cost of remediation (engineering time, new tooling)
```

---

**Status**: ACTIVE
**House**: 05 — Defense
**Last updated**: 2026-04-19
