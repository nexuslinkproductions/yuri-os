---

description: "Task list template for feature implementation"
---

# Tasks: Feature Spec: contract-dispatch-drift-reconcile

**Input**: Design documents from `/specs/active/`

**Prerequisites**: plan.md (required), spec.md (required for user stories), research.md, data-model.md, contracts/

**Tests**: The examples below include test tasks. Tests are OPTIONAL - only include them if explicitly requested in the feature specification.

**Organization**: Tasks are grouped by user story to enable independent implementation and testing of each story.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2, US3)
- Include exact file paths in descriptions

## Path Conventions

- **Single project**: `src/`, `tests/` at repository root
- **Web app**: `backend/src/`, `frontend/src/`
- **Mobile**: `api/src/`, `ios/src/` or `android/src/`
- Paths shown below assume single project - adjust based on plan.md structure

<!--
  ============================================================================
  IMPORTANT: The tasks below are SAMPLE TASKS for illustration purposes only.

  The __SPECKIT_COMMAND_TASKS__ command MUST replace these with actual tasks based on:
  - User stories from spec.md (with their priorities P1, P2, P3...)
  - Feature requirements from plan.md
  - Entities from data-model.md
  - Endpoints from contracts/

  Tasks MUST be organized by user story so each story can be:
  - Implemented independently
  - Tested independently
  - Delivered as an MVP increment

  DO NOT keep these sample tasks in the generated tasks.md file.
  ============================================================================
-->

## Generated CODEX Task Scaffolds

### Task 1: `node _SYSTEM/Scripts/llm-compat-contract-dispatch-check.mjs` exits 0 (was 1)

GITNEXUS IMPACT (auto-generated):
  symbol: dispatchTokens
  direct dependents: 0
  affected processes: 0
  risk: LOW
  symbol: _SYSTEM/Scripts/llm-compat-contract.mjs
  direct dependents: 0
  affected processes: 0
  risk: LOW
  symbol: _SYSTEM/Scripts/llm-compat.sh
  direct dependents: 0
  affected processes: 0
  risk: LOW
  symbol: _SYSTEM/Scripts/llm-compat-contract-dispatch-check.mjs
  direct dependents: 0
  affected processes: 0
  risk: LOW
  symbol: node _SYSTEM/Scripts/llm-compat-contract-dispatch-check.mjs
  direct dependents: 0
  affected processes: 0
  risk: LOW
  symbol: llm-compat.sh
  direct dependents: 0
  affected processes: 0
  risk: LOW
  symbol: llm-compat-contract-dispatch-check.mjs
  direct dependents: 0
  affected processes: 0
  risk: LOW
  symbol: llm-compat-contract-regression.test.mjs
  direct dependents: 0
  affected processes: 0
  risk: LOW
  symbol: deepseek
  direct dependents: 0
  affected processes: 0
  risk: LOW

CODEX TASK SPEC SCAFFOLD:
  Goal: `node _SYSTEM/Scripts/llm-compat-contract-dispatch-check.mjs` exits 0 (was 1)
  Target files: <to be determined during implementation>
  Constraints: anime DNA gates apply; respect protected surfaces
  Acceptance criteria: `node _SYSTEM/Scripts/llm-compat-contract-dispatch-check.mjs` exits 0 (was 1)
  Test command: <to be defined>
  Rollback boundary: git checkout <files>

### Task 2: Every contract lane has a `dispatchTokens` array field listing the kebab-case tokens in `llm-compat.sh` that route to that lane

GITNEXUS IMPACT (auto-generated):
  symbol: dispatchTokens
  direct dependents: 0
  affected processes: 0
  risk: LOW
  symbol: _SYSTEM/Scripts/llm-compat-contract.mjs
  direct dependents: 0
  affected processes: 0
  risk: LOW
  symbol: _SYSTEM/Scripts/llm-compat.sh
  direct dependents: 0
  affected processes: 0
  risk: LOW
  symbol: _SYSTEM/Scripts/llm-compat-contract-dispatch-check.mjs
  direct dependents: 0
  affected processes: 0
  risk: LOW
  symbol: node _SYSTEM/Scripts/llm-compat-contract-dispatch-check.mjs
  direct dependents: 0
  affected processes: 0
  risk: LOW
  symbol: llm-compat.sh
  direct dependents: 0
  affected processes: 0
  risk: LOW
  symbol: llm-compat-contract-dispatch-check.mjs
  direct dependents: 0
  affected processes: 0
  risk: LOW
  symbol: llm-compat-contract-regression.test.mjs
  direct dependents: 0
  affected processes: 0
  risk: LOW
  symbol: deepseek
  direct dependents: 0
  affected processes: 0
  risk: LOW

CODEX TASK SPEC SCAFFOLD:
  Goal: Every contract lane has a `dispatchTokens` array field listing the kebab-case tokens in `llm-compat.sh` that route to that lane
  Target files: <to be determined during implementation>
  Constraints: anime DNA gates apply; respect protected surfaces
  Acceptance criteria: Every contract lane has a `dispatchTokens` array field listing the kebab-case tokens in `llm-compat.sh` that route to that lane
  Test command: <to be defined>
  Rollback boundary: git checkout <files>

### Task 3: Every dispatch token listed in `is_direct_lane_token` + `dispatch_model` + `list_models` is referenced by at least one contract lane's `dispatchTokens` (unless explicitly documented as a deprecated/legacy surface-only alias)

GITNEXUS IMPACT (auto-generated):
  symbol: dispatchTokens
  direct dependents: 0
  affected processes: 0
  risk: LOW
  symbol: _SYSTEM/Scripts/llm-compat-contract.mjs
  direct dependents: 0
  affected processes: 0
  risk: LOW
  symbol: _SYSTEM/Scripts/llm-compat.sh
  direct dependents: 0
  affected processes: 0
  risk: LOW
  symbol: _SYSTEM/Scripts/llm-compat-contract-dispatch-check.mjs
  direct dependents: 0
  affected processes: 0
  risk: LOW
  symbol: node _SYSTEM/Scripts/llm-compat-contract-dispatch-check.mjs
  direct dependents: 0
  affected processes: 0
  risk: LOW
  symbol: llm-compat.sh
  direct dependents: 0
  affected processes: 0
  risk: LOW
  symbol: llm-compat-contract-dispatch-check.mjs
  direct dependents: 0
  affected processes: 0
  risk: LOW
  symbol: llm-compat-contract-regression.test.mjs
  direct dependents: 0
  affected processes: 0
  risk: LOW
  symbol: deepseek
  direct dependents: 0
  affected processes: 0
  risk: LOW

CODEX TASK SPEC SCAFFOLD:
  Goal: Every dispatch token listed in `is_direct_lane_token` + `dispatch_model` + `list_models` is referenced by at least one contract lane's `dispatchTokens` (unless explicitly documented as a deprecated/legacy surface-only alias)
  Target files: <to be determined during implementation>
  Constraints: anime DNA gates apply; respect protected surfaces
  Acceptance criteria: Every dispatch token listed in `is_direct_lane_token` + `dispatch_model` + `list_models` is referenced by at least one contract lane's `dispatchTokens` (unless explicitly documented as a deprecated/legacy surface-only alias)
  Test command: <to be defined>
  Rollback boundary: git checkout <files>

### Task 4: No regression in `llm-compat-contract-regression.test.mjs`

GITNEXUS IMPACT (auto-generated):
  symbol: dispatchTokens
  direct dependents: 0
  affected processes: 0
  risk: LOW
  symbol: _SYSTEM/Scripts/llm-compat-contract.mjs
  direct dependents: 0
  affected processes: 0
  risk: LOW
  symbol: _SYSTEM/Scripts/llm-compat.sh
  direct dependents: 0
  affected processes: 0
  risk: LOW
  symbol: _SYSTEM/Scripts/llm-compat-contract-dispatch-check.mjs
  direct dependents: 0
  affected processes: 0
  risk: LOW
  symbol: node _SYSTEM/Scripts/llm-compat-contract-dispatch-check.mjs
  direct dependents: 0
  affected processes: 0
  risk: LOW
  symbol: llm-compat.sh
  direct dependents: 0
  affected processes: 0
  risk: LOW
  symbol: llm-compat-contract-dispatch-check.mjs
  direct dependents: 0
  affected processes: 0
  risk: LOW
  symbol: llm-compat-contract-regression.test.mjs
  direct dependents: 0
  affected processes: 0
  risk: LOW
  symbol: deepseek
  direct dependents: 0
  affected processes: 0
  risk: LOW

CODEX TASK SPEC SCAFFOLD:
  Goal: No regression in `llm-compat-contract-regression.test.mjs`
  Target files: <to be determined during implementation>
  Constraints: anime DNA gates apply; respect protected surfaces
  Acceptance criteria: No regression in `llm-compat-contract-regression.test.mjs`
  Test command: <to be defined>
  Rollback boundary: git checkout <files>

### Task 5: `offload --list` output remains identical to current (no visual change for users)

GITNEXUS IMPACT (auto-generated):
  symbol: dispatchTokens
  direct dependents: 0
  affected processes: 0
  risk: LOW
  symbol: _SYSTEM/Scripts/llm-compat-contract.mjs
  direct dependents: 0
  affected processes: 0
  risk: LOW
  symbol: _SYSTEM/Scripts/llm-compat.sh
  direct dependents: 0
  affected processes: 0
  risk: LOW
  symbol: _SYSTEM/Scripts/llm-compat-contract-dispatch-check.mjs
  direct dependents: 0
  affected processes: 0
  risk: LOW
  symbol: node _SYSTEM/Scripts/llm-compat-contract-dispatch-check.mjs
  direct dependents: 0
  affected processes: 0
  risk: LOW
  symbol: llm-compat.sh
  direct dependents: 0
  affected processes: 0
  risk: LOW
  symbol: llm-compat-contract-dispatch-check.mjs
  direct dependents: 0
  affected processes: 0
  risk: LOW
  symbol: llm-compat-contract-regression.test.mjs
  direct dependents: 0
  affected processes: 0
  risk: LOW
  symbol: deepseek
  direct dependents: 0
  affected processes: 0
  risk: LOW

CODEX TASK SPEC SCAFFOLD:
  Goal: `offload --list` output remains identical to current (no visual change for users)
  Target files: <to be determined during implementation>
  Constraints: anime DNA gates apply; respect protected surfaces
  Acceptance criteria: `offload --list` output remains identical to current (no visual change for users)
  Test command: <to be defined>
  Rollback boundary: git checkout <files>
