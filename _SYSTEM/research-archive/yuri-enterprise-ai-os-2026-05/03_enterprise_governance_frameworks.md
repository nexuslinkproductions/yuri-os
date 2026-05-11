# Enterprise Governance Frameworks

Enterprise governance mapping for Yuri OS — a multi-CLI, multi-agent, locally governed AI operating system.

**Date**: 2026-05-04
**advisory_only**: true
**local_truth_claim**: false
**ingestion_status**: READY_FOR_RAG_AFTER_APPROVAL
**rag_approved_at**: 2026-05-11T16:51:43+02:00
**rag_approved_by**: owner:marcel-spatz
**pdf_extraction_tool**: pdftotext (Poppler 26.04.0)
**extracted_at**: 2026-05-04

## Sources

| URL | Type | Status | Hash |
|-----|------|--------|------|
| https://www.nist.gov/artificial-intelligence/executive-order | official | FETCHED | 035f5421 |
| https://artificialintelligenceact.eu/the-act/ | secondary_mirror | FETCHED | 8f68fbe0 |

Note: NIST AI RMF PDF (NIST.AI.100-1) extracted via pdftotext. Excerpt below.
Note: EU AI Act legal truth remains the official EUR-Lex publication; this archive is advisory mapping only.

## NIST AI RMF — Yuri Mapping

The NIST AI RMF (govern, map, measure, manage) maps to Yuri OS as:

| NIST Function | Yuri OS Surface |
|
| GOVERN | `_SYSTEM/yuri-origin.md` — canonical origin, authority hierarchy |
| GOVERN | `_SYSTEM/yuri-content-governance.md` — content classification, provenance |
| MAP | `Scripts/yuri-evidence-contract.mjs` — evidence grammar, PASS gate |
| MAP | `_SYSTEM/research-archive/01_source_registry.md` — source tracking |
| MEASURE | `TERM_COUNT` / `FILE_COUNT` / `MATCH` evidence lines — deterministic metrics |
| MANAGE | Fused swarm timeout doctrine (120s, no GNU timeout) |
| MANAGE | Protected surfaces, no auto-commit, mutation contract |

## EU AI Act — Yuri Mapping

Relevant provisions for Yuri OS enterprise readiness:

| EU AI Act Article | Yuri Surface | Status |
|
| Art 10: Data governance | `_SYSTEM/yuri-content-governance.md` — provenance, classification | PLANNED |
| Art 11: Technical documentation | `_SYSTEM/yuri-origin.md`, research archive | CURRENT |
| Art 12: Record-keeping | Evidence contract, summary.json, artifact logs | CURRENT |
| Art 14: Human oversight | advisory_only=true, local_truth_claim=false, no auto-commit | CURRENT |
| Art 15: Accuracy/robustness | Evidence contract PASS gate, TERM_COUNT/FILE_COUNT/MATCH | CURRENT |
| Art 49: Transparency | All model output marked advisory; non-claims required | CURRENT |

## Implications

- Yuri OS already satisfies several EU AI Act governance requirements through origin doc, content governance, and evidence contract.
- Full NIST AI RMF mapping requires the full PDF (pending text extraction).
- Supply-chain / plugin governance (Art 10, SLSA) is documented in 05_supply_chain_provenance.md.
- Prompt injection / security (Art 15, OWASP) is documented in 04_security_prompt_injection_browser_agents.md.

## Extracted Text — NIST AI RMF (NIST.AI.100-1)

Extracted via pdftotext (Poppler 26.04.0). First 300 lines.

```
NIST AI 100-1

Artificial Intelligence Risk Management
Framework (AI RMF 1.0)

NIST AI 100-1

Artificial Intelligence Risk Management
Framework (AI RMF 1.0)

This publication is available free of charge from:
https://doi.org/10.6028/NIST.AI.100-1

January 2023

U.S. Department of Commerce
Gina M. Raimondo, Secretary
National Institute of Standards and Technology
Laurie E. Locascio, NIST Director and Under Secretary of Commerce for Standards and Technology

Certain commercial entities, equipment, or materials may be identified in this document in order to describe
an experimental procedure or concept adequately. Such identification is not intended to imply recommendation or endorsement by the National Institute of Standards and Technology, nor is it intended to imply that
the entities, materials, or equipment are necessarily the best available for the purpose.

This publication is available free of charge from: https://doi.org/10.6028/NIST.AI.100-1

Update Schedule and Versions
The Artificial Intelligence Risk Management Framework (AI RMF) is intended to be a living document.
NIST will review the content and usefulness of the Framework regularly to determine if an update is appropriate; a review with formal input from the AI community is expected to take place no later than 2028. The
Framework will employ a two-number versioning system to track and identify major and minor changes. The
first number will represent the generation of the AI RMF and its companion documents (e.g., 1.0) and will
change only with major revisions. Minor revisions will be tracked using “.n” after the generation number
(e.g., 1.1). All changes will be tracked using a Version Control Table which identifies the history, including
version number, date of change, and description of change. NIST plans to update the AI RMF Playbook
frequently. Comments on the AI RMF Playbook may be sent via email to AIframework@nist.gov at any time
and will be reviewed and integrated on a semi-annual basis.

Table of Contents
Executive Summary

1

Part 1: Foundational Information

4

1 Framing Risk
1.1 Understanding and Addressing Risks, Impacts, and Harms
1.2 Challenges for AI Risk Management
1.2.1 Risk Measurement
1.2.2 Risk Tolerance
1.2.3 Risk Prioritization
1.2.4 Organizational Integration and Management of Risk

4
4
5
5
7
7
8

2 Audience

9

3 AI Risks and Trustworthiness
3.1 Valid and Reliable
3.2 Safe
3.3 Secure and Resilient
3.4 Accountable and Transparent
3.5 Explainable and Interpretable
3.6 Privacy-Enhanced
3.7 Fair – with Harmful Bias Managed

12
13
14
15
15
16
17
17

4 Effectiveness of the AI RMF

19

Part 2: Core and Profiles

20

5 AI RMF Core
5.1 Govern
5.2 Map
5.3 Measure
5.4 Manage

20
21
24
28
31

6 AI RMF Profiles

33

Appendix A: Descriptions of AI Actor Tasks from Figures 2 and 3

35

Appendix B: How AI Risks Differ from Traditional Software Risks

38

Appendix C: AI Risk Management and Human-AI Interaction

40

Appendix D: Attributes of the AI RMF

42

List of Tables
Table 1 Categories and subcategories for the GOVERN function.
Table 2 Categories and subcategories for the MAP function.
Table 3 Categories and subcategories for the MEASURE function.
Table 4 Categories and subcategories for the MANAGE function.
i

22
26
29
32

AI RMF 1.0

NIST AI 100-1

List of Figures
Fig. 1 Examples of potential harms related to AI systems. Trustworthy AI systems
and their responsible use can mitigate negative risks and contribute to benefits for people, organizations, and ecosystems.
Fig. 2 Lifecycle and Key Dimensions of an AI System. Modified from OECD
(2022) OECD Framework for the Classification of AI systems — OECD
Digital Economy Papers. The two inner circles show AI systems’ key dimensions and the outer circle shows AI lifecycle stages. Ideally, risk management efforts start with the Plan and Design function in the application
context and are performed throughout the AI system lifecycle. See Figure 3
for representative AI actors.
Fig. 3 AI actors across AI lifecycle stages. See Appendix A for detailed descriptions of AI actor tasks, including details about testing, evaluation, verification, and validation tasks. Note that AI actors in the AI Model dimension
(Figure 2) are separated as a best practice, with those building and using the
models separated from those verifying and validating the models.
Fig. 4 Characteristics of trustworthy AI systems. Valid & Reliable is a necessary
condition of trustworthiness and is shown as the base for other trustworthiness characteristics. Accountable & Transparent is shown as a vertical box
because it relates to all other characteristics.
Fig. 5 Functions organize AI risk management activities at their highest level to
govern, map, measure, and manage AI risks. Governance is designed to be
a cross-cutting function to inform and be infused throughout the other three
functions.

5

10

11

12

20

Page ii

NIST AI 100-1

AI RMF 1.0

Executive Summary
Artificial intelligence (AI) technologies have significant potential to transform society and
people’s lives – from commerce and health to transportation and cybersecurity to the environment and our planet. AI technologies can drive inclusive economic growth and support
scientific advancements that improve the conditions of our world. AI technologies, however, also pose risks that can negatively impact individuals, groups, organizations, communities, society, the environment, and the planet. Like risks for other types of technology, AI
risks can emerge in a variety of ways and can be characterized as long- or short-term, highor low-probability, systemic or localized, and high- or low-impact.
The AI RMF refers to an AI system as an engineered or machine-based system that
can, for a given set of objectives, generate outputs such as predictions, recommendations, or decisions influencing real or virtual environments. AI systems are designed
to operate with varying levels of autonomy (Adapted from: OECD Recommendation
on AI:2019; ISO / IEC 22989:2022).
While there are myriad standards and best practices to help organizations mitigate the risks
of traditional software or information-based systems, the risks posed by AI systems are in
many ways unique (See Appendix B). AI systems, for example, may be trained on data that
can change over time, sometimes significantly and unexpectedly, affecting system functionality and trustworthiness in ways that are hard to understand. AI systems and the contexts
in which they are deployed are frequently complex, making it difficult to detect and respond
to failures when they occur. AI systems are inherently socio-technical in nature, meaning
they are influenced by societal dynamics and human behavior. AI risks – and benefits –
can emerge from the interplay of technical aspects combined with societal factors related
to how a system is used, its interactions with other AI systems, who operates it, and the
social context in which it is deployed.
These risks make AI a uniquely challenging technology to deploy and utilize both for organizations and within society. Without proper controls, AI systems can amplify, perpetuate,
or exacerbate inequitable or undesirable outcomes for individuals and communities. With
proper controls, AI systems can mitigate and manage inequitable outcomes.
AI risk management is a key component of responsible development and use of AI systems. Responsible AI practices can help align the decisions about AI system design, development, and uses with intended aim and values. Core concepts in responsible AI emphasize human centricity, social responsibility, and sustainability. AI risk management can
drive responsible uses and practices by prompting organizations and their internal teams
who design, develop, and deploy AI to think more critically about context and potential
or unexpected negative and positive impacts. Understanding and managing the risks of AI
systems will help to enhance trustworthiness, and in turn, cultivate public trust.

Page 1

NIST AI 100-1

AI RMF 1.0

Social responsibility can refer to the organization’s responsibility “for the impacts
of its decisions and activities on society and the environment through transparent
and ethical behavior” (ISO 26000:2010). Sustainability refers to the “state of the
global system, including environmental, social, and economic aspects, in which the
needs of the present are met without compromising the ability of future generations
to meet their own needs” (ISO / IEC TR 24368:2022). Responsible AI is meant to
result in technology that is also equitable and accountable. The expectation is that
organizational practices are carried out in accord with “professional responsibility,”
defined by ISO as an approach that “aims to ensure that professionals who design,
develop, or deploy AI systems and applications or AI-based products or systems,
recognize their unique position to exert influence on people, society, and the future
of AI” (ISO / IEC TR 24368:2022).
As directed by the National Artificial Intelligence Initiative Act of 2020 (P.L. 116-283),
the goal of the AI RMF is to offer a resource to the organizations designing, developing,
deploying, or using AI systems to help manage the many risks of AI and promote trustworthy and responsible development and use of AI systems. The Framework is intended to be
voluntary, rights-preserving, non-sector-specific, and use-case agnostic, providing flexibility to organizations of all sizes and in all sectors and throughout society to implement the
approaches in the Framework.
The Framework is designed to equip organizations and individuals – referred to here as
AI actors – with approaches that increase the trustworthiness of AI systems, and to help
foster the responsible design, development, deployment, and use of AI systems over time.
AI actors are defined by the Organisation for Economic Co-operation and Development
(OECD) as “those who play an active role in the AI system lifecycle, including organizations and individuals that deploy or operate AI” [OECD (2019) Artificial Intelligence in
Society—OECD iLibrary] (See Appendix A).
The AI RMF is intended to be practical, to adapt to the AI landscape as AI technologies
continue to develop, and to be operationalized by organizations in varying degrees and
capacities so society can benefit from AI while also being protected from its potential
harms.
The Framework and supporting resources will be updated, expanded, and improved based
on evolving technology, the standards landscape around the world, and AI community experience and feedback. NIST will continue to align the AI RMF and related guidance with
applicable international standards, guidelines, and practices. As the AI RMF is put into
use, additional lessons will be learned to inform future updates and additional resources.
The Framework is divided into two parts. Part 1 discusses how organizations can frame
the risks related to AI and describes the intended audience. Next, AI risks and trustworthiness are analyzed, outlining the characteristics of trustworthy AI systems, which include
Page 2

NIST AI 100-1

AI RMF 1.0

valid and reliable, safe, secure and resilient, accountable and transparent, explainable and
interpretable, privacy enhanced, and fair with their harmful biases managed.
Part 2 comprises the “Core” of the Framework. It describes four specific functions to help
organizations address the risks of AI systems in practice. These functions – GOVERN,
MAP , MEASURE , and MANAGE – are broken down further into categories and subcategories. While GOVERN applies to all stages of organizations’ AI risk management processes and procedures, the MAP, MEASURE, and MANAGE functions can be applied in AI
system-specific contexts and at specific stages of the AI lifecycle.
Additional resources related to the Framework are included in the AI RMF Playbook,
which is available via the NIST AI RMF website:
https://www.nist.gov/itl/ai-risk-management-framework.
Development of the AI RMF by NIST in collaboration with the private and public sectors is directed and consistent with its broader AI efforts called for by the National AI
Initiative Act of 2020, the National Security Commission on Artificial Intelligence recommendations, and the Plan for Federal Engagement in Developing Technical Standards and
Related Tools. Engagement with the AI community during this Framework’s development
– via responses to a formal Request for Information, three widely attended workshops,
public comments on a concept paper and two drafts of the Framework, discussions at multiple public forums, and many small group meetings – has informed development of the AI
RMF 1.0 as well as AI research and development and evaluation conducted by NIST and
others. Priority research and additional guidance that will enhance this Framework will be
captured in an associated AI Risk Management Framework Roadmap to which NIST and
the broader community can contribute.

Page 3

NIST AI 100-1

AI RMF 1.0

Part 1: Foundational Information
1.

Framing Risk

AI risk management offers a path to minimize potential negative impacts of AI systems,
such as threats to civil liberties and rights, while also providing opportunities to maximize
positive impacts. Addressing, documenting, and managing AI risks and potential negative
impacts effectively can lead to more trustworthy AI systems.
1.1

Understanding and Addressing Risks, Impacts, and Harms

In the context of the AI RMF, risk refers to the composite measure of an event’s probability
of occurring and the magnitude or degree of the consequences of the corresponding event.
The impacts, or consequences, of AI systems can be positive, negative, or both and can
result in opportunities or threats (Adapted from: ISO 31000:2018). When considering the
negative impact of a potential event, risk is a function of 1) the negative impact, or magnitude of harm, that would arise if the circumstance or event occurs and 2) the likelihood of
occurrence (Adapted from: OMB Circular A-130:2016). Negative impact or harm can be
experienced by individuals, groups, communities, organizations, society, the environment,
and the planet.
“Risk management refers to coordinated activities to direct and control an organization with regard to risk” (Source: ISO 31000:2018).
While risk management processes generally address negative impacts, this Framework offers approaches to minimize anticipated negative impacts of AI systems and identify opportunities to maximize positive impacts. Effectively managing the risk of potential harms
could lead to more trustworthy AI systems and unleash potential benefits to people (individuals, communities, and society), organizations, and systems/ecosystems. Risk management
can enable AI developers and users to understand impacts and account for the inherent limitations and uncertainties in their models and systems, which in turn can improve overall
system performance and trustworthiness and the likelihood that AI technologies will be
used in ways that are beneficial.
```

## Non-Claims

- Curated archive Markdown is approved for RAG ingestion.
- This is not legal advice. EU AI Act compliance requires certified legal review.
- NIST AI RMF excerpt is text-extracted; this file is not a substitute for the official NIST publication.
- Owner approval for this archive's curated RAG ingestion was granted on 2026-05-11.
