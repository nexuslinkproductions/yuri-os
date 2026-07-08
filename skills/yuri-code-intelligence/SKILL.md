---
name: yuri-code-intelligence
description: "Unified code quality intelligence layer that diagnoses code smells (Long Method, Feature Envy, design pattern issues), prescribes targeted Fowler refactoring techniques, and reviews code for security, performance, and clarity. Use when user says 'review this code', 'refactor this', 'what's wrong with this method', 'code smells', or 'clean this up'."
triggers:
  - "/code-intelligence"
  - "/yuri-refactor"
  - "refactor this"
  - "code review"
  - "smell diagnosis"
  - "improve code quality"
scope: harness
invocation: ability
---

# Yuri Code Intelligence — Unified Refactoring + Review Layer

*Synthesized from OpenClaw corpus: method-decomposition-refactoring, class-responsibility-realignment, web-presentation-pattern-selector, code-review-skill-agent*

## Doctrine

Refactoring without diagnosis is noise. Diagnosis without a repair plan is observation. Intelligence means: see what is wrong, know what to apply, execute with tests passing at every step.

## Phase 1: Smell Diagnosis

Before any tool call or edit, answer:

| Smell | Signal | Technique |
|-------|--------|-----------|
| Long Method | Method body requires a comment to understand a block | Extract Method, Replace Temp with Query |
| Dual-purpose Temp | A variable is assigned for two different purposes | Split Temporary Variable |
| Feature Envy | A method uses another class's data more than its own | Move Method, Extract Method |
| Large Class | Class has too many instance variables or responsibilities | Extract Class, Extract Subclass |
| Inappropriate Intimacy | Two classes know too much about each other's internals | Move Method + Move Field |
| Web Presentation Pattern | Inconsistency between how data is formatted/rendered | Pattern Selector (see Phase 3) |

## Phase 2: Refactoring Execution (Fowler Catalog)

### Method-Level Techniques

**Extract Method**: When a code fragment can be grouped behind a name.
```
1. Create a new method named after the fragment's intent (what, not how)
2. Move the fragment into the new method
3. Pass any referenced local variables as parameters
4. If one variable is assigned: return it
5. Compile + test after every extraction
```

**Replace Temp with Query**: When a temp holds a side-effect-free expression.
```
1. Mark temp final — confirm single assignment
2. Extract right-hand side into a private query method
3. Replace all references to temp with method call
4. Remove temp declaration
5. Compile + test
```

**Split Temporary Variable**: When a temp is assigned twice for different purposes.
```
1. Rename at first declaration to reflect first use, mark final
2. Update references up to second assignment
3. At second assignment, declare new temp with original name
4. Compile + test. Repeat for further assignments.
```

### Class-Level Techniques

**Extract Class**: When a class is doing the work of two.
```
1. Decide how to split responsibilities
2. Create a new class. Move relevant fields to it.
3. Create a reference from old class to new.
4. Move methods that reference the new class's fields.
5. Decide on exposure: delegate through old class or expose new class directly.
```

**Move Method**: When a method uses more data from another class than its own.
```
1. Examine methods called by candidate method — move them together or before
2. Declare the method in the target class
3. Copy the method body, adjust to reference target class's fields
4. In source class: delegate to target, or remove if caller can reference target directly
5. Compile + test at every step
```

## Phase 3: Web Presentation Pattern Selection

When the task involves rendering, formatting, or displaying data in a UI:

| Context | Pattern | When to Use |
|---------|---------|-------------|
| Complex conditional rendering | Strategy | Variation is fixed at construction time |
| Decorator/wrapper UI | Decorator | Behaviors layered dynamically |
| Data transformation pipeline | Pipeline | Sequential transforms with composable stages |
| Theme-driven display | Template Method | Skeleton fixed, subclass fills in the details |
| Component state management | State | Object behavior changes with internal state |

## Phase 4: Code Review Checklist

Run after any non-trivial change:

**Correctness**
- [ ] Does the code do what it claims to do?
- [ ] Are edge cases (empty input, nulls, boundary values) handled?
- [ ] Is error handling specific and actionable?

**Security**
- [ ] Are user inputs validated at system boundaries?
- [ ] Are secrets and tokens absent from code (env-var only)?
- [ ] Are SQL/shell commands parameterized (not concatenated)?

**Clarity**
- [ ] Can a new reader understand a method from its name alone?
- [ ] Are variable names intention-revealing (not i, j, tmp, data)?
- [ ] Do comments explain WHY, not WHAT?

**Performance**
- [ ] Are there N+1 query patterns? (loop that queries inside)
- [ ] Are expensive operations computed once, not repeated?
- [ ] Are results cached where the input is stable?

**Logging**
- [ ] Do logs not include PII, secrets, or stack traces in production?
- [ ] Are log levels used correctly (debug/info/warn/error)?

## Delivery

Always return:
1. **Smell diagnosis** (what patterns were found)
2. **Refactoring prescription** (which techniques, in which order)
3. **Step-by-step execution** with test command between each step
4. **Review checklist** result for the final state

## Session Notes

### 2026-05-29
- session: 349m | peak ctx: 71% | compacts: 4
- tools: Bash×268, Read×133, Edit×104, TodoWrite×12, Write×8, StructuredOutput×8, Workflow×2, ToolSearch×1, AskUserQuestion×1
- corrections: none
- errors: none

### 2026-05-17
- Created from corpus synthesis: 4 code quality skills merged into Musubi-native form
- Sources: method-decomposition-refactoring (Fowler catalog, Long Method), class-responsibility-realignment (Feature Envy, Extract Class), web-presentation-pattern-selector (UI rendering patterns), code-review-skill-agent (security, clarity, logging checklist)
- Corrections: none
- Errors: none
