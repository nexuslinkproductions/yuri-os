# YURI Global Cyber Threat Intel Ingestion Protocol

Date: 2026-05-22
Owner: Codex main orchestrator
Purpose: convert external cyber research into YURI build decisions without hype drift.

## Input Classes

Accepted inputs:

- government and CERT advisories;
- vendor threat reports;
- academic papers;
- AI lab cyber evaluations;
- regional regulator guidance;
- client/partner interview notes;
- lab results from owned or explicitly authorized environments;
- Shintai advisory outputs.

Rejected or downgraded inputs:

- unsourced blog claims;
- marketing-only vendor pages;
- screenshots without primary source links;
- anonymous claims without corroboration;
- exploit instructions aimed at unauthorized real systems;
- AI-generated reports that do not cite primary sources.

## Source Quality Levels

| Level | Meaning | Examples |
|---|---|---|
| A | Primary authoritative source | CISA, NIST, ENISA, CERT-EU, FBI IC3, national CERTs, official regulator docs |
| B | High-quality vendor or lab source | Microsoft, Google/Mandiant, CrowdStrike, Fortinet, Cloudflare, Anthropic, OpenAI |
| C | Peer-reviewed or serious preprint | arXiv papers with clear method, reproducible claims, reputable authors |
| D | Useful but secondary | News summaries, vendor blogs without original data, market commentary |
| E | Do not promote | unsourced, anecdotal, hype, screenshots, copied claims |

## Required Normalization

Every ingested finding must become:

```json
{
  "source_id": "S-number or local path",
  "claim": "short factual claim",
  "claim_type": "fact|inference|forecast|unknown",
  "region": ["europe", "west", "asia", "global"],
  "threat_domain": "identity|ransomware|ai-agent|cloud|supply-chain|fraud|ot-ics|regulation|runtime",
  "affected_customers": ["sme", "enterprise", "msp", "startup", "private-user", "critical-infra"],
  "yuri_mapping": {
    "capability": "string",
    "missing_proof": "string",
    "lab": "string|null",
    "scanner_rule": "string|null",
    "guardrail": "string|null",
    "report_section": "string"
  },
  "decision": "build|watch|reject",
  "confidence": "high|medium|low"
}
```

## Evidence Rules

- Local YURI claims require local file paths.
- External factual claims require URLs.
- If a source mentions a category but not the exact YURI inference, mark the YURI part as inference.
- Unknowns must stay `UNKNOWN` until resolved.
- Do not convert future ambition into present capability.
- Do not accept any claim that YURI is a mature SOC/SIEM/XDR/MDR/pentest/malware platform without direct proof.

## Regional Rules

### Europe / DACH / Switzerland

Map findings to:

- baseline security;
- NIS2;
- DORA when financial resilience is relevant;
- GDPR/revFADP data handling;
- EU AI Act / AI governance;
- SME/MSP operational reality;
- conservative buyer language.

### West / US / UK / Canada

Map findings to:

- identity and cloud incident economics;
- NIST CSF / AI RMF;
- CISA KEV and vulnerability operations;
- hyperscaler AI adoption;
- cyber insurance and board risk;
- established vendor blind spots.

### Asia

Map findings to:

- China, Japan, Korea, Singapore, India, Taiwan, and SEA separately when possible;
- regional AI providers and model ecosystems;
- Singapore AI Verify and assurance posture;
- Japan/Korea industrial security posture;
- China regulatory divergence and model-provider governance;
- data routing, sovereignty, and cross-border model use.

## YURI Build Mapping

No research item is considered ingested until it maps to one of:

- ThreatIntelKernel;
- Security Lens;
- Cyber Lab Harness;
- Guardrail Kernel;
- Memory/RAG Kernel;
- Automation/Runtime Monitoring;
- Regional Intelligence Pack;
- Client Reporting;
- Watch-only backlog.

## Contradiction Handling

When sources disagree:

1. Prefer primary source over secondary.
2. Prefer latest source when methodology is comparable.
3. Preserve both claims if they measure different surfaces.
4. Ask Shintai to challenge high-impact contradictions.
5. Mark unresolved contradictions as `CONFLICT`, not settled truth.

## Promotion Gate

A research item may be promoted to the master plan only if:

- source quality is A, B, or strong C;
- YURI mapping is explicit;
- dangerous/offensive content remains lab/authorized only;
- there is a proof path or a conscious watch-only decision;
- Codex/main arbitration accepts it after Shintai contradiction review.

