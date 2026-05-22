# Weft / WeaveMind Audit Pack

## Overview

Weft is an open-source programming language and execution platform for AI systems, created by WeaveMindAI and described by the project as “a programming language for AI systems.”[cite:81][cite:82] The repository presents Weft as a graph-native, typed, durable coordination language where LLMs, humans, APIs, triggers, storage, and infrastructure are first-class primitives rather than library calls.[cite:81][cite:82]

This audit pack consolidates the public repo structure, design principles, runtime architecture, docs content, and implementation signals from the open-source codebase and official docs pages. It is written as a Codex-ingestible reference rather than a marketing summary.[cite:81][cite:82]

## Identity

| Field | Value |
|---|---|
| Project | Weft [cite:81] |
| Organization | WeaveMindAI [cite:79] |
| Repo | [github.com/WeaveMindAI/weft](https://github.com/WeaveMindAI/weft) [cite:79] |
| Docs | [weavemind.ai/docs](https://weavemind.ai/docs) [cite:81][cite:83] |
| Design doc | `DESIGN.md` in repo [cite:82] |
| License | Repo includes a license file; open-source release is explicit in README/repo layout [cite:79] |
| Primary framing | “A programming language for AI systems” [cite:81] |

## Core thesis

Weft’s central thesis is that modern software already coordinates LLMs, humans, APIs, databases, messaging systems, and long-lived workflows, so those should be language primitives instead of external SDK plumbing.[cite:81][cite:82] The README and design doc repeatedly frame Weft as a **coordination language**, not a replacement for underlying tools and services.[cite:81][cite:82]

The design principles make three commitments especially clear: the compiler should validate architectural correctness before runtime, the source program should be natively representable as a graph, and execution should be durable across crashes and long waits through Restate-backed services.[cite:82]

## Product split

Public docs reveal three distinct layers:

| Layer | Role |
|---|---|
| Weft language | Typed graph DSL for declaring nodes, interfaces, groups, and connections.[cite:81][cite:83] |
| Builder / dashboard | Visual graph editor plus code editor where code remains source of truth.[cite:81][cite:83] |
| Tangle | Cloud-only AI builder that scaffolds and edits Weft projects using the catalog.[cite:81][cite:83] |

The docs explicitly say Tangle is cloud-only and that OSS users add nodes manually, which matters if the goal is self-hosting or extending the language without depending on the hosted builder.[cite:81] This means the open-source repo gives the runtime, compiler, dashboard, extension, catalog, and node implementations, but not the full hosted AI-building experience as a local product clone.[cite:81]

## Language model

Weft code defines a graph, and the graph view is not secondary visualization but a native projection of the same program.[cite:82][cite:83] The docs say the code panel is the authoritative source of truth: graph edits patch the text in place, and code edits re-parse and sync the graph after a short delay.[cite:83]

A minimal project consists of a parsed header, node declarations, and connections.[cite:83] Nodes have IDs, types, config blocks, and typed ports; connections are assignment-like expressions mapping one node’s output into another node’s input.[cite:81][cite:83]

The docs emphasize that some ports are marked `MustOverride`, requiring the author to explicitly set the output type when the node cannot infer it statically, and these appear as red ports in the graph UI until resolved.[cite:81] This is one of the clearest signals that Weft is trying to preserve strong compile-time architecture guarantees even around dynamic nodes like LLM calls.[cite:81][cite:82]

## Design principles

The design document lays out the project’s hard constraints rather than loose aspirations.[cite:82] The most important ones are below.

### Coordination, not replacement

Weft does not replace LLMs, databases, code execution, or humans; it coordinates them as typed nodes connected by a common language surface.[cite:82] Each node is implemented in Rust, while the language handles composition, checking, and execution semantics.[cite:82]

### If it compiles, the architecture is sound

The compiler is intended to validate connection types, completeness of required inputs, absence of orphaned/dangling architecture, and node-level config sanity before runtime.[cite:82] The design doc explicitly compares this to Rust’s philosophy, but applied to architecture rather than memory safety.[cite:82]

### No special cases

The language should gain general features instead of node-specific exceptions, so a new node capability must map to a reusable language concept rather than compiler hacks.[cite:82] This matters for long-term extensibility because it keeps the core language small and pushes complexity into nodes.[cite:82]

### Recursive composability

Groups are the structural answer to graph spaghetti: any set of nodes can collapse into a typed group that behaves like a single node externally.[cite:82] The docs also mention `self` inside a group as the reference to the group interface, reinforcing lexical boundaries and scoped connectivity.[cite:83]

### Null propagation

Null is treated as a graph flow primitive: required inputs refuse to run on null, optional inputs marked with `?` may accept it, and skipped branches propagate naturally without exception-heavy control flow.[cite:82] This effectively turns inactive routes and absent data into first-class execution semantics rather than error cases.[cite:82]

### Graph-native and durable-by-default

Weft treats the graph as a native artifact for debugging, inspection, and analysis, while using Restate to persist workflow progress, suspension points, and resumability for long-running tasks such as human approvals.[cite:82] The design doc notes this part was built early and may still have rough edges, which is useful as an implementation maturity signal.[cite:82]

## Runtime architecture

The repo structure makes the architecture unusually legible.[cite:81] The root README maps the system into catalog, Rust crates, dashboard, extension, scripts, and sidecars.[cite:81]

### Top-level layout

| Path | Role |
|---|---|
| `catalog/` | Source of truth for node definitions by domain; each node generally has `backend.rs` and `frontend.ts`.[cite:81] |
| `crates/weft-core/` | Type system, compiler, executor, infrastructure abstractions, Restate-related shared types.[cite:81] |
| `crates/weft-nodes/` | Node trait, registry, runner binary, services around node execution.[cite:81] |
| `crates/weft-api/` | REST API for triggers, files, infra, publish/usage, extension token handling.[cite:81] |
| `crates/weft-orchestrator/` | Restate services plus Axum-based project executor.[cite:81] |
| `dashboard/` | Web UI, declared in README as SvelteKit + Svelte 5.[cite:81] |
| `extension/` | Browser extension for human-in-the-loop flows.[cite:81] |
| `sidecars/` | Sidecar implementations and templates for infrastructure nodes.[cite:82] |

### Node catalog model

The README states the `catalog/` directory is the source of truth for every node and that each node is represented by a Rust backend implementation plus a frontend definition for the dashboard UI.[cite:81] A helper script links the catalog into both Rust crates and dashboard code, while the `inventory` crate auto-discovers node implementations at startup.[cite:81]

This means node addition is intentionally optimized into a two-surface operation: implement behavior in Rust and define UI/ports/config in TypeScript.[cite:81] That split gives Weft a strong “typed runtime + editable graph builder” architecture without requiring the compiler itself to know about each node family.[cite:81][cite:82]

## Rust crate architecture

Source inspection shows four main crates at the center of the open-source runtime.[cite:79]

### `weft-core`

`weft-core` exports modules for types, project modeling, node structures, executor logic, instance registry, sidecars, infrastructure, Kubernetes provisioning, media types, and the Weft compiler.[cite:79] It also exposes shared execution/request/response types used by the orchestrator and other services, which indicates this crate functions as the canonical domain model for the whole platform.[cite:79]

The bindings directory contains generated TypeScript artifacts such as `NodeDefinition.ts`, `PortDefinition.ts`, `ProjectDefinition.ts`, `WeftType.ts`, `ExecutionStatus.ts`, and `InfrastructureSpec.ts`, strongly implying that type definitions are shared across backend and frontend rather than duplicated manually.[cite:79] That is an important implementation clue: Weft is not just “Rust backend + JS frontend,” but a cross-language typed schema system.[cite:79]

### `weft-orchestrator`

The orchestrator’s main file says it runs **two servers**: Restate auxiliary services and an Axum-based in-memory project executor.[cite:79] The comments make a key distinction: project execution happens in-memory in the Axum executor with zero journaling overhead, while Restate is used for durable auxiliary services such as `TaskRegistry`, `NodeInstanceRegistry`, and `InfrastructureManager`.[cite:79]

That architecture is more nuanced than a naive “everything durable, everything in Restate” design. It suggests Weft keeps the hot execution path lightweight while offloading durability-critical system services to Restate.[cite:79] The result is likely lower runtime overhead during active graph execution while preserving recovery and long-lived coordination primitives where they matter most.[cite:79][cite:82]

### `weft-api`

The API crate starts an Axum server and exposes routes for health checks, trigger registration/unregistration, webhook handling, extension token management, and background maintenance such as trigger recovery and usage aggregation.[cite:79] Its startup logic also enforces a fail-closed `INTERNAL_API_KEY` requirement in cloud mode while remaining permissive in local OSS mode, which is a significant signal that the same codebase is used for both hosted and local deployments.[cite:79]

That dual-mode design matters strategically: it means the OSS runtime is not a toy demo disconnected from production assumptions, but rather a local/developer shape of the same broader system.[cite:79]

### `weft-nodes`

The nodes crate includes constants, registry, runner, service, trigger service, form-related files, passthrough support, and infra helpers.[cite:79] Together with the README’s description of auto-discovered catalog nodes, this crate appears to be the runtime substrate for executing concrete node behavior once a project graph has been compiled.[cite:79][cite:81]

## Executor model

The orchestrator comments clarify one of Weft’s most important runtime choices: the executor is **Axum-based and in-memory**, while Restate handles durability for auxiliary coordination services.[cite:79] This likely means graph execution state during active node scheduling is managed outside a fully journaled durable engine, then reconciled with durable services for pending tasks, node instances, and infrastructure lifecycle.[cite:79]

For practical evaluation, that suggests Weft’s durability story is partly architectural and partly service-layered rather than universally transactional across every computation step.[cite:79][cite:82] The design document still frames the language as durable-by-default, but the code comments reveal a more precise internal split that advanced users should understand before trusting behavior under failure conditions.[cite:79][cite:82]

## Infrastructure-as-nodes and sidecars

One of the most distinctive design sections is infrastructure provisioning as graph nodes bridged through sidecars.[cite:82] The design doc says an infrastructure node packages raw Kubernetes manifests with placeholders, a sidecar image implementing a small HTTP contract, and an action endpoint definition that consumer nodes call via an `InfraClient` wrapper.[cite:82]

The sidecar contract is explicit: `POST /action` for typed actions, `GET /health` for liveness, and `GET /outputs` for runtime-computed values exported as node outputs.[cite:82] The platform fills placeholders, injects ownership labels, applies manifests, waits for health, queries outputs, and exposes those outputs to the graph.[cite:82]

This is a strong separation-of-concerns design. Consumer nodes talk to **capabilities** through typed actions, not directly to databases or protocol drivers, which the design doc argues improves security, portability, lifecycle handling, isolation, and language freedom.[cite:82] In other words, Weft models infra not as “bring your own secret DSN” but as managed graph-native resources with adapter boundaries.[cite:82]

## Language ergonomics and AI-first syntax

The docs page “Write Weft by hand” is especially revealing because it is unusually candid: Weft was designed to be written by an AI builder first, with syntax choices optimized for model speed rather than human comfort.[cite:83] At the same time, the docs claim the language is still dense and consistent enough for manual authoring, and that formatting/comments are preserved because graph edits patch the source rather than rewriting it wholesale.[cite:83]

That leads to an important insight: Weft is not trying to be a general-purpose human-first programming language in the Rust/TypeScript sense. It is closer to a **compiler-checked agent graph notation** that is deliberately tuned for LLM generation quality, token efficiency, and edit locality.[cite:82][cite:83]

## Dashboard and extension

The README says the dashboard is built with SvelteKit and Svelte 5, and the extension exists for human-in-the-loop functionality.[cite:81] The docs describe the code panel as a CodeMirror editor with syntax highlighting, multi-cursor editing, and synchronized graph/code projections, which strongly implies the dashboard is not just a viewer but a real bidirectional structural editor.[cite:83]

The extension’s existence, together with API routes for extension tokens, suggests Weft’s human approval/query flows extend outside the core dashboard into browser-mediated workflows.[cite:79][cite:81] That fits the project’s repeated “first-class humans” framing.[cite:81]

## Supported node families

The README names a deliberately opinionated but still broad set of built-in node categories spanning LLMs, code, communication, flow control, storage, enrichment, and triggers.[cite:81] The catalog tree shown in the README includes `ai`, `code`, `communication`, `data`, `enrichment`, `flow`, `storage`, and `triggers` folders.[cite:81]

Named node families and integrations in the README include LLM, Code, HTTP, Human Query, Gate, Template, Discord, Slack, Telegram, WhatsApp, Email, X, Postgres, Memory, Apollo, Web Search, and more.[cite:81] Because the catalog is the source of truth and the long-term vision is user-defined nodes through the language itself, the current system should be read as a curated base layer rather than a finished universal library.[cite:81]

## Docs-derived execution semantics

The hello-world guide explains Weft through an LLM poem example: a `Text` node supplies a topic, an `LlmConfig` node supplies model and prompt config, an `LlmInference` node declares a typed response output, and a `Debug` node displays it.[cite:81] That example is simple, but it highlights the language’s core mechanics: explicit node IDs, typed output signatures, assignment-style connections, and compiler-managed validation.[cite:81]

The docs also explain that graph search uses Ctrl+P to locate nodes and that the catalog defines each node’s required config, inputs, outputs, and types.[cite:81] This means authoring is designed around discoverability through the builder even though the source language remains the canonical representation.[cite:81][cite:83]

## Maturity signals and caveats

The README is explicit that Weft is “young,” that breaking changes are expected, and that it should be treated as a foundation rather than a finished production platform.[cite:81] It also says the language, type system, and durable executor are the stable parts, while the node catalog is intentionally small and opinionated for now.[cite:81]

The design doc repeats that some durable execution code was implemented very early and may not be fully wired correctly, inviting PRs if issues are found.[cite:82] Taken together, these are unusually transparent maturity signals: the foundational abstractions appear serious, but the project is still in a shape-setting phase rather than a hardening phase.[cite:81][cite:82]

## Strategic read

Weft is best understood as a **typed orchestration language for AI-native software**, not as another prompt workflow toy.[cite:81][cite:82] The strongest ideas in the public material are recursive groups, compile-time architecture checking, null-propagating graph semantics, code-as-source/graph-as-view duality, and infrastructure-as-nodes through sidecars.[cite:82][cite:83]

Its most promising technical leverage is the combination of a small core language with a node catalog and a shared schema layer across Rust and TypeScript.[cite:79][cite:81] Its biggest current constraints are obvious from the repo and docs: immature ecosystem breadth, cloud-only Tangle, expected breaking changes, and likely rough edges in the durable orchestration path.[cite:81][cite:82]

## Codex-oriented conclusions

For a Codex or agent-system audit, Weft is interesting in five precise ways:

- It treats **architecture** as something that should compile, not merely execute.[cite:82]
- It uses a **graph DSL** rather than imperative orchestration code as the top-level abstraction.[cite:81][cite:83]
- It separates **runtime capabilities** from raw service drivers using sidecars and typed action endpoints.[cite:82]
- It appears to share core type definitions between backend and frontend through generated bindings, reducing schema drift.[cite:79]
- It is designed for **AI-authored systems**, meaning syntax density and compiler feedback are part of the product strategy rather than incidental language traits.[cite:82][cite:83]

If the evaluation criterion is “could this become a serious substrate for AI-native local/cloud orchestration,” the answer is yes in architecture, but not yet in ecosystem maturity.[cite:81][cite:82] If the criterion is “is this already a stable production stack,” the project’s own docs say no; it is a strong foundation still settling its shape.[cite:81]
