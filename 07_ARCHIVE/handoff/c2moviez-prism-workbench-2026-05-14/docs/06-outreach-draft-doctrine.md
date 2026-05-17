# PRISM Outreach Draft Doctrine

> **SUPERSEDED FOR BODY GENERATION:** Email/LinkedIn body copy is now governed by `17-coldreach-body-instruction.md` and the embedded `18-profiler-prompt-header.md`. The "Tiny thought" / "may be worth" templates below are deprecated and forbidden by the new doctrine. This file remains authoritative for the profile YAML schema, evaluation rubric structure, and the follow-up framing pattern.

## Purpose

PRISM drafts are not sales blasts. They are concise, real-world cold outreach entry points for Fanny to review and rework before manual sending.

The desired feeling:

> "Hey, we noticed something specific about your company that may be worth checking. If useful, we can show you a small angle."

The draft should create a low-pressure opening, not force a pitch.

## Authority Order

Draft content must follow this evidence order:

1. Direct website evidence from the company or contact.
2. Public company registry/source data.
3. LinkedIn/company public profile signals.
4. Enrichment evidence with source URL and timestamp.
5. Industry pattern inference, clearly softened.
6. c2moviez offer framing.

If a claim is not supported by 1-4, it must be phrased as a hypothesis or omitted.

## Client Profile Required Before Draft

Each lead must produce a compact profile before drafts are marked ready:

```yaml
company_name:
contact_name:
contact_role:
market:
website:
primary_source_url:
what_we_noticed:
why_it_might_matter:
likely_relevance_to_c2moviez:
best_outreach_channel:
safe_opening_angle:
claims_to_avoid:
evidence_confidence: high | medium | low
draft_readiness: ready | needs_research | blocked
```

If `evidence_confidence` is `low`, PRISM should not generate a ready-to-send draft. It may generate a research note for Fanny instead.

## Draft Style

Use:

- English only.
- 60-110 words for cold email body, excluding subject/signature.
- 250-450 characters for LinkedIn intro.
- One specific observation.
- One gentle inference.
- One low-friction next step.
- Plain words.
- Human uncertainty: "might", "may", "I noticed", "could be worth checking".

Avoid:

- Long pitch sequences.
- "I hope this email finds you well."
- "We help companies like yours scale."
- "I was impressed by..."
- "I know you are struggling with..."
- "Just checking in" as the opening.
- Fake urgency.
- Fake familiarity.
- Overconfident diagnosis.
- Unrelated services.
- Mentioning anything not found in the Dossier.
- Buzzwords unless the prospect uses them first.

## Strategic Shape

Every cold draft should follow this shape:

1. Human opener: name plus one real observed signal.
2. Pivot: why that signal may matter commercially.
3. c2moviez relevance: one specific, grounded next asset or angle Fanny can offer to send, not a claim about fixing or improving the prospect's communication.
4. Soft invitation: ask permission to send a short idea, overview, or example.
5. Easy exit: make it safe to ignore or decline.

## Cold Email Template

```text
Subject: quick thought on <specific signal>

Hi <first_name>,

I came across <company> while looking at <market/source>. I noticed <specific evidence from website/profile/source>.

Tiny thought: if <surface from evidence> is often someone's first look, a short first-impression angle may be worth checking before they book or enquire.

I can send a short example angle if useful.

Worth sending you a short example angle?

Best,
Fanny
c2moviez

If this is not relevant, just reply "no thanks" and I will close the loop.
```

## LinkedIn Intro Template

```text
Hi <first_name>, I noticed <specific evidence about company>. Tiny thought: if that surface is part of a first impression for potential clients, a concise angle may be worth checking. I can send the short angle if useful.
```

## Follow-Up Template

```text
Hi <first_name>, quick follow-up on <specific signal>. The only reason I reached out is that <evidence-based observation> looked like a useful first-impression moment to review. If useful, I can send the short angle. If not, I will leave it here.
```

## Evaluation Rubric

A draft passes only when all checks are true:

```yaml
mentions_company: true
uses_contact_name_if_available: true
uses_specific_evidence: true
evidence_visible_in_dossier: true
one_primary_observation: true
one_soft_inference: true
one_low_pressure_cta: true
english_only: true
no_fake_familiarity: true
no_unsupported_pain_claim: true
no_unrelated_services: true
no_flashy_pitch: true
no_ai_spam_phrases: true
word_count_within_channel_limit: true
```

If any of these fail, draft state becomes `needs_rework` or `needs_research`, not `ready`.

## Generator Contract

The draft generator must output:

```yaml
profile:
  company_name:
  contact_name:
  contact_role:
  what_we_noticed:
  why_it_might_matter:
  c2moviez_relevance:
  claims_to_avoid:
  evidence_confidence:
drafts:
  linkedin_intro:
  linkedin_followup:
  email_cold:
  email_followup:
quality:
  passed:
  missing:
  warnings:
  blocked_reason:
```

## Rewrite Rule For Current Generator

The existing diagnosis-heavy pattern must be softened.

Replace:

- "The likely friction I see is..."
- "Potential solution..."
- "Why it matters..."
- broad stack pitches

With:

- "Small thought..."
- "This may be worth checking..."
- "I can send the short angle if useful."
- one concrete example angle Fanny can offer to send

The draft should feel like a knock on the door, not a sales deck pushed through the letterbox.
