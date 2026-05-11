# Prompt Engineering Source Registry

Date: 2026-05-11
advisory_only: true
local_truth_claim: false

## Source Status Values

| Status | Meaning |
|---|---|
| REVIEWED_LINK | Reviewed enough to synthesize, not copied raw |
| PRIMARY_RESEARCH | Peer-reviewed, arXiv, or research paper source |
| OFFICIAL_DOC | Vendor or standards body documentation |
| SECURITY_STANDARD | Security standard or risk guidance |
| DO_NOT_INGEST_RAW | Link/reference only unless separately approved |

## Sources

| Source | Type | Status | Why It Matters | URL |
|---|---|---|---|---|
| OpenAI prompt engineering best practices | OFFICIAL_DOC | REVIEWED_LINK | Clear instructions, delimiters, examples, model-specific prompting | https://help.openai.com/en/articles/6654000-best-practices-for-promptengineering-with-the-openai-api |
| OpenAI prompting fundamentals | OFFICIAL_DOC | REVIEWED_LINK | Task clarity, audience, context, format, iteration | https://openai.com/academy/prompting/ |
| Anthropic prompt engineering overview | OFFICIAL_DOC | REVIEWED_LINK | Success criteria and empirical evals before prompt tuning | https://platform.claude.com/docs/en/build-with-claude/prompt-engineering/overview |
| Microsoft Azure/OpenAI prompt engineering | OFFICIAL_DOC | REVIEWED_LINK | Specificity, order effects, grounding data, citations, validation | https://learn.microsoft.com/en-us/azure/foundry/openai/concepts/prompt-engineering |
| The Prompt Report | PRIMARY_RESEARCH | REVIEWED_LINK | Taxonomy of prompt techniques and terminology fragmentation | https://arxiv.org/abs/2406.06608 |
| Systematic Survey of Prompt Engineering in LLMs | PRIMARY_RESEARCH | REVIEWED_LINK | Broad survey of prompting techniques and applications | https://arxiv.org/abs/2402.07927 |
| Chain-of-Thought Prompting | PRIMARY_RESEARCH | REVIEWED_LINK | Decomposition improves reasoning tasks, especially larger models | https://arxiv.org/abs/2201.11903 |
| Self-Consistency | PRIMARY_RESEARCH | REVIEWED_LINK | Multiple reasoning paths plus answer selection improves robustness | https://arxiv.org/abs/2203.11171 |
| ReAct | PRIMARY_RESEARCH | REVIEWED_LINK | Interleaves reasoning and actions for tool/environment tasks | https://arxiv.org/abs/2210.03629 |
| Tree of Thoughts | PRIMARY_RESEARCH | REVIEWED_LINK | Search over multiple candidate reasoning paths for hard planning | https://arxiv.org/abs/2305.10601 |
| Automatic Prompt Engineer | PRIMARY_RESEARCH | REVIEWED_LINK | LLM-generated instructions can outperform manual prompts on some tasks | https://arxiv.org/abs/2211.01910 |
| Promptbreeder | PRIMARY_RESEARCH | REVIEWED_LINK | Prompt evolution with evaluation can outperform hand-crafted strategies | https://arxiv.org/abs/2309.16797 |
| DSPy | PRIMARY_RESEARCH | REVIEWED_LINK | Replaces brittle prompt strings with metric-optimized LM programs | https://arxiv.org/abs/2310.03714 |
| OWASP Prompt Injection | SECURITY_STANDARD | REVIEWED_LINK | Direct/indirect injection, data boundary, tool-scope risk | https://owasp.org/www-community/attacks/PromptInjection |
| NIST AI RMF Generative AI Profile | SECURITY_STANDARD | REVIEWED_LINK | Trustworthiness, risk management, generative AI lifecycle controls | https://www.nist.gov/publications/artificial-intelligence-risk-management-framework-generative-artificial-intelligence |
| Indirect Prompt Injection benchmark/defense | PRIMARY_RESEARCH | REVIEWED_LINK | External content can override agent behavior in tool/RAG systems | https://arxiv.org/abs/2312.14197 |
| Prompt Injection Attacks and Defenses | PRIMARY_RESEARCH | REVIEWED_LINK | Formalizes attacks/defenses in LLM-integrated applications | https://arxiv.org/abs/2310.12815 |

## License / Ingestion Note

This archive stores synthesis and links only. Do not ingest raw source pages into RAG without a separate approval file, source license review, and dedicated ingestion runner.
