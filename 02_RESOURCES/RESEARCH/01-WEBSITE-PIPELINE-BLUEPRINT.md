# The Pipeline: From Prompt → Production-Quality Website

> How to make the system absorb all the architectural discipline so you don't have to
> enforce it manually every time. Feed in a request, get a properly built result.

---

## The Core Idea

You don't want to *remember* to check all those boxes each time. You want a system that **cannot proceed** past a quality gate that isn't met. The architecture itself prevents the "two idiots" loop.

```
Your Input → [Pipeline] → Production-Quality Output
                 ↑
            (No bypass. Every gate must pass.)
```

---

## Architecture Diagram

```
                    YOUR INPUT
                        │
                        ▼
             ┌─────────────────────┐
             │   PLANNER AGENT     │  Breaks request into tasks
             │   (NABU-HOUSE 1)    │  Checks component library
             └──────────┬──────────┘
                        │ task list
                        ▼
             ┌─────────────────────┐
             │   ARCHITECT AGENT   │  Validates against past decisions (RAG)
             │   (RAG MEMORY)       │  Checks for conflicts with existing patterns
             └──────────┬──────────┘
                        │ architecture doc
                        ▼
             ┌─────────────────────┐
             │   CODING AGENTS     │  Parallel: each component/hook/file
             │   (3-5 agents)      │  Uses component library as source of truth
             └──────────┬──────────┘
                        │ generated code
                        ▼
             ┌─────────────────────┐
             │   REVIEWER AGENT    │  Static analysis + pattern enforcement
             │   (QUALITY GATE)    │  TypeScript strict, no `any`, no duplication
             └──────────┬──────────┘
                        │ approved code
                        ▼
             ┌─────────────────────┐
             │   TESTER AGENT      │  Generates + runs tests
             │   (AUTOMATED)       │  Fails if coverage below threshold
             └──────────┬──────────┘
                        │ passing tests
                        ▼
             ┌─────────────────────┐
             │   ASSEMBLER AGENT   │  Composes components into pages
             │   (FINAL PASS)      │  Validates against acceptance criteria
             └──────────┬──────────┘
                        │ final output
                        ▼
              [HUMAN REVIEW]
                        │
                        ▼
              [LEARN & STORE]
              Decision → RAG index
              New component → library
              Bug pattern → governance rule
```

---

## File-by-File Blueprint

### File 1: `pipeline.config.md` — The Rules of the Road

This is loaded by every agent at the start. Non-negotiable.

```yaml
# pipeline.config.md
# Loaded as context by every agent in the pipeline

ARCHITECTURE:
  framework: sveltekit    # or nextjs — pick one
  typescript: strict      # no exceptions
  component_library: /src/lib/components/
  css: tailwind
  testing: playwright + vitest

QUALITY_GATES:
  no_any: true           # TypeScript `any` = hard fail
  no_unused_imports: true
  component_uniqueness: true  # Don't re-create what exists
  test_coverage: 70       # percentage, minimum
  max_file_size: 300      # lines, single file

MEMORY:
  decision_store: .rag/decisions/
  component_inventory: .rag/components/
  bug_patterns: .rag/bugs/

FORBIDDEN:
  - inline styles (use tailwind classes)
  - direct DOM manipulation
  - any library without explicit approval
  - any without types
```

---

### File 2: `pipeline/planner.ts` — The Router

Takes your input and produces a structured task list.

```typescript
// Concept: What the planner agent does
// Implemented as a prompt + structured output

interface TaskPlan {
  input: string                    // Original request
  components_needed: string[]      // New components to create
  existing_components: string[]    // Components to reuse
  pages: string[]                  // Pages to build/modify
  hooks_needed: string[]           // Custom hooks
  tests_needed: string[]           // Test files to create
  acceptance_criteria: string[]    // How success is measured
  risk_flags: string[]             // Things to watch out for
}
```

**Prompt template for the planner:**

```
You are a web architect. Given this request:
"{{user_input}}"

You have access to the following component library:
{{component_inventory}}

You have these past architecture decisions stored:
{{rag_memory_decisions}}

Produce a TaskPlan with:
1. Which existing components to reuse (exact names)
2. Which new components are needed
3. Which pages to create/modify
4. Acceptance criteria (how we know it's done)
5. Risk flags (anything unusual about this request)

Rules: 
- NEVER recreate an existing component. Reference it.
- Every new component must have a single responsibility.
- Pages are compositions of components, not monolithic files.
```

---

### File 3: `pipeline/architect.ts` — The Memory Check

Validates the plan against everything stored in RAG.

```typescript
// Concept: Before writing code, search all past decisions

async function validateArchitecture(plan: TaskPlan): Promise<Validation> {
  // 1. Search past decisions for conflicts
  const similar = await ragSearch(plan.input, { 
    namespace: 'decisions',
    topK: 5 
  });
  
  // 2. Check component inventory for overlaps
  const inventory = await ragSearch(plan.components_needed.join(' '), {
    namespace: 'components',
    topK: 10
  });
  
  // 3. Search bug patterns for potential issues
  const bugs = await ragSearch(plan.input, {
    namespace: 'bugs',
    topK: 3
  });
  
  // 4. Identify conflicts
  const conflicts = [];
  for (const decision of similar) {
    if (decision.content.contradicts(plan)) {
      conflicts.push({
        type: 'architectural_conflict',
        existing: decision,
        proposed: plan
      });
    }
  }
  
  return { 
    approved: conflicts.length === 0,
    conflicts,
    component_reuse_hits: inventory.filter(c => c.score > 0.85).length,
    risk_warnings: bugs.filter(b => b.score > 0.7).map(b => b.content)
  };
}
```

---

### File 4: `pipeline/coding-agents.ts` — The Parallel Builders

One agent per file. They communicate through shared context but write independently.

```
Coding Phase — parallel execution:

Agent 1: /src/lib/components/SearchFilter.svelte
Agent 2: /src/lib/components/DateRangePicker.svelte  
Agent 3: /src/lib/hooks/useDateFilter.ts
Agent 4: /src/routes/search/+page.svelte
Agent 5: /src/routes/search/+page.server.ts

Each agent receives:
  - The component it needs to build/create
  - The component library as source of truth
  - The architecture rules (pipeline.config.md)
  - The acceptance criteria for this feature
  
Each agent outputs:
  - Code file
  - Test file
  - Component documentation (for RAG)
```

**Critical rule for coding agents:**
```
You are writing ONE file. Not the page, not the CSS, not the tests — just this file.
If you find yourself doing more than one thing, STOP and file a task for another agent.
```

---

### File 5: `pipeline/reviewer.ts` — The Quality Gate

This is the gate that enforces the "two idiots" fix. It runs **before** tests, **before** assembly.

```typescript
// Checks performed automatically on every file:

interface ReviewResult {
  file: string;
  checks: {
    no_any: boolean;         // No TypeScript `any`
    no_any_cast: boolean;    // No `as` casts (smelly)
    max_lines: boolean;      // Under 300 lines
    single_responsibility: boolean;  // Only does one thing
    existing_component: boolean;     // Didn't recreate existing
    error_handling: boolean;         // Has try/catch or appropriate error handling
    loading_state: boolean;          // Handles loading state
    empty_state: boolean;            // Handles empty/data-not-found state
    accessibility: boolean;          // has aria labels, proper HTML structure
    style_via_tailwind: boolean;     // No inline styles
    types_proper: boolean;           // All props have interfaces/types
  };
  pass: boolean;  // All checkboxes must be green
}
```

**If the reviewer fails, the file goes back to the coding agent with the specific failures.** No human intervention needed for common failures.

---

### File 6: `pipeline/tester.ts` — The Exercise

Generates and runs tests for every new file.

```typescript
// For each new component, generate:

async function generateTests(component: string, content: string) {
  const tests = await agentPrompt(`
    Given this Svelte component:
    ${content}
    
    Generate Playwright/Vitest tests that verify:
    1. It renders without crashing
    2. It handles its loading state
    3. It handles its error state
    4. User interactions work (clicks, inputs, etc.)
    5. It is accessible (tab navigation works)
    6. Edge cases (empty data, null props)
    
    Output ONLY the test file. No explanation.
  `);
  
  return tests;
}

// Run:
const result = await exec('npx vitest run --coverage');
if (result.coverage < 70) {
  // Fail the pipeline
  return { failed: true, reason: `Coverage ${result.coverage}% < 70%` };
}
```

---

### File 7: `pipeline/learner.ts` — The Feedback Loop

This is what makes the system **better over time**. After every completed task:

```typescript
async function learnFromPipeline(requestId: string) {
  const { input, output, issues, decisions } = await getPipelineResult(requestId);
  
  // 1. Store the architecture decision
  await ragStore({
    type: 'decision',
    input: input,
    decisions: decisions,
    timestamp: Date.now(),
  });
  
  // 2. If a bug pattern emerged, store it
  if (issues.length > 0) {
    await ragStore({
      type: 'bug_pattern',
      input: input,
      symptoms: issues.map(i => i.description),
      cause: issues.map(i => i.rootCause),
      fix: issues.map(i => i.fixApplied),
    });
  }
  
  // 3. If a new component was created, add to inventory
  const newComponents = extractNewComponents(output);
  for (const comp of newComponents) {
    await ragStore({
      type: 'component',
      name: comp.name,
      description: comp.description,
      props: comp.props,
      usage: comp.usage,
    });
  }
  
  // 4. Update the component inventory lookup
  await rebuildComponentIndex();
}
```

---

## How to Wire This Into Your Current System

You already have the pieces. This is just assembly:

| Pipeline Stage | Maps To Your Existing System |
|----------------|------------------------------|
| **Planner** | A sub-agent spawned via `sessions_spawn` with a specific architect prompt |
| **RAG Memory** | Your RvfEmbeddingService + HNSW index for decisions/components/bugs |
| **Coding Agents** | Parallel sub-agents, each writing one file |
| **Reviewer** | A spawned agent that runs after all coding agents finish |
| **Tester** | `exec('npx vitest run')` with coverage enforcement |
| **Learner** | `ragStore()` calls after each pipeline completion |

---

## The Prompt That Starts It All

This is what you type. One input. Everything else is automatic.

```
/build: a landing page for my photography portfolio with a grid gallery 
        that filters by category and a lightbox viewer
```

The system would:
1. Check its component inventory → finds `ImageGrid`, `FilterBar`, `Lightbox`
2. Check architecture decisions → finds "we use SvelteKit" + "CSS via Tailwind"  
3. Plan: compose existing components, create one new `PhotographyPage` wrapper
4. Code: one agent writes the page file, one writes the route handler
5. Review: check for `any`, proper loading states, aria labels
6. Test: generate Playwright tests, run them
7. Assemble: verify the full page works end-to-end
8. Learn: store the new page pattern for future reference

**Result:** Instead of regenerating from scratch every time, the system *composes* from known-working parts. The "two idiots" problem disappears because the idiot-proofing is embedded in the pipeline, not in your head.

---

## To Build This, Do This:

1. **Create the pipeline config file** — `pipeline.config.md` (5 minutes)
2. **Seed your RAG with current component inventory** — run each of your existing components through `embedder.embed()` (10 minutes)
3. **Create the planner prompt** — the structured task list template (15 minutes)
4. **Wire up the reviewer checks** — TypeScript strict mode, line counts, component uniqueness via RAG lookup (30 minutes)  
5. **One pipeline cycle** — feed it `/build: fix the header bug` and see how far it gets (priceless)

The first cycle will fail in embarrassing ways. Fix those gaps. The second cycle will fail in subtler ways. Fix those too. By cycle 10, the system will produce output that's genuinely better than what either of you could produce alone — because it enforces everything you two know *the hard way* but keep forgetting in the moment.
