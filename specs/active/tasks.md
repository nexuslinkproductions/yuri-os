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

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Project initialization and basic structure

- [ ] T001 Create project structure per implementation plan
- [ ] T002 Initialize [language] project with [framework] dependencies
- [ ] T003 [P] Configure linting and formatting tools

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Core infrastructure that MUST be complete before ANY user story can be implemented

**⚠️ CRITICAL**: No user story work can begin until this phase is complete

Examples of foundational tasks (adjust based on your project):

- [ ] T004 Setup database schema and migrations framework
- [ ] T005 [P] Implement authentication/authorization framework
- [ ] T006 [P] Setup API routing and middleware structure
- [ ] T007 Create base models/entities that all stories depend on
- [ ] T008 Configure error handling and logging infrastructure
- [ ] T009 Setup environment configuration management

**Checkpoint**: Foundation ready - user story implementation can now begin in parallel

---

## Phase 3: User Story 1 - [Title] (Priority: P1) 🎯 MVP

**Goal**: [Brief description of what this story delivers]

**Independent Test**: [How to verify this story works on its own]

### Tests for User Story 1 (OPTIONAL - only if tests requested) ⚠️

> **NOTE: Write these tests FIRST, ensure they FAIL before implementation**

- [ ] T010 [P] [US1] Contract test for [endpoint] in tests/contract/test_[name].py
- [ ] T011 [P] [US1] Integration test for [user journey] in tests/integration/test_[name].py

### Implementation for User Story 1

- [ ] T012 [P] [US1] Create [Entity1] model in src/models/[entity1].py
- [ ] T013 [P] [US1] Create [Entity2] model in src/models/[entity2].py
- [ ] T014 [US1] Implement [Service] in src/services/[service].py (depends on T012, T013)
- [ ] T015 [US1] Implement [endpoint/feature] in src/[location]/[file].py
- [ ] T016 [US1] Add validation and error handling
- [ ] T017 [US1] Add logging for user story 1 operations

**Checkpoint**: At this point, User Story 1 should be fully functional and testable independently

---

## Phase 4: User Story 2 - [Title] (Priority: P2)

**Goal**: [Brief description of what this story delivers]

**Independent Test**: [How to verify this story works on its own]

### Tests for User Story 2 (OPTIONAL - only if tests requested) ⚠️

- [ ] T018 [P] [US2] Contract test for [endpoint] in tests/contract/test_[name].py
- [ ] T019 [P] [US2] Integration test for [user journey] in tests/integration/test_[name].py

### Implementation for User Story 2

- [ ] T020 [P] [US2] Create [Entity] model in src/models/[entity].py
- [ ] T021 [US2] Implement [Service] in src/services/[service].py
- [ ] T022 [US2] Implement [endpoint/feature] in src/[location]/[file].py
- [ ] T023 [US2] Integrate with User Story 1 components (if needed)

**Checkpoint**: At this point, User Stories 1 AND 2 should both work independently

---

## Phase 5: User Story 3 - [Title] (Priority: P3)

**Goal**: [Brief description of what this story delivers]

**Independent Test**: [How to verify this story works on its own]

### Tests for User Story 3 (OPTIONAL - only if tests requested) ⚠️

- [ ] T024 [P] [US3] Contract test for [endpoint] in tests/contract/test_[name].py
- [ ] T025 [P] [US3] Integration test for [user journey] in tests/integration/test_[name].py

### Implementation for User Story 3

- [ ] T026 [P] [US3] Create [Entity] model in src/models/[entity].py
- [ ] T027 [US3] Implement [Service] in src/services/[service].py
- [ ] T028 [US3] Implement [endpoint/feature] in src/[location]/[file].py

**Checkpoint**: All user stories should now be independently functional

---

[Add more user story phases as needed, following the same pattern]

---

## Phase N: Polish & Cross-Cutting Concerns

**Purpose**: Improvements that affect multiple user stories

- [ ] TXXX [P] Documentation updates in docs/
- [ ] TXXX Code cleanup and refactoring
- [ ] TXXX Performance optimization across all stories
- [ ] TXXX [P] Additional unit tests (if requested) in tests/unit/
- [ ] TXXX Security hardening
- [ ] TXXX Run quickstart.md validation

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies - can start immediately
- **Foundational (Phase 2)**: Depends on Setup completion - BLOCKS all user stories
- **User Stories (Phase 3+)**: All depend on Foundational phase completion
  - User stories can then proceed in parallel (if staffed)
  - Or sequentially in priority order (P1 → P2 → P3)
- **Polish (Final Phase)**: Depends on all desired user stories being complete

### User Story Dependencies

- **User Story 1 (P1)**: Can start after Foundational (Phase 2) - No dependencies on other stories
- **User Story 2 (P2)**: Can start after Foundational (Phase 2) - May integrate with US1 but should be independently testable
- **User Story 3 (P3)**: Can start after Foundational (Phase 2) - May integrate with US1/US2 but should be independently testable

### Within Each User Story

- Tests (if included) MUST be written and FAIL before implementation
- Models before services
- Services before endpoints
- Core implementation before integration
- Story complete before moving to next priority

### Parallel Opportunities

- All Setup tasks marked [P] can run in parallel
- All Foundational tasks marked [P] can run in parallel (within Phase 2)
- Once Foundational phase completes, all user stories can start in parallel (if team capacity allows)
- All tests for a user story marked [P] can run in parallel
- Models within a story marked [P] can run in parallel
- Different user stories can be worked on in parallel by different team members

---

## Parallel Example: User Story 1

```bash
# Launch all tests for User Story 1 together (if tests requested):
Task: "Contract test for [endpoint] in tests/contract/test_[name].py"
Task: "Integration test for [user journey] in tests/integration/test_[name].py"

# Launch all models for User Story 1 together:
Task: "Create [Entity1] model in src/models/[entity1].py"
Task: "Create [Entity2] model in src/models/[entity2].py"
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 1: Setup
2. Complete Phase 2: Foundational (CRITICAL - blocks all stories)
3. Complete Phase 3: User Story 1
4. **STOP and VALIDATE**: Test User Story 1 independently
5. Deploy/demo if ready

### Incremental Delivery

1. Complete Setup + Foundational → Foundation ready
2. Add User Story 1 → Test independently → Deploy/Demo (MVP!)
3. Add User Story 2 → Test independently → Deploy/Demo
4. Add User Story 3 → Test independently → Deploy/Demo
5. Each story adds value without breaking previous stories

### Parallel Team Strategy

With multiple developers:

1. Team completes Setup + Foundational together
2. Once Foundational is done:
   - Developer A: User Story 1
   - Developer B: User Story 2
   - Developer C: User Story 3
3. Stories complete and integrate independently

---

## Notes

- [P] tasks = different files, no dependencies
- [Story] label maps task to specific user story for traceability
- Each user story should be independently completable and testable
- Verify tests fail before implementing
- Commit after each task or logical group
- Stop at any checkpoint to validate story independently
- Avoid: vague tasks, same file conflicts, cross-story dependencies that break independence

## Generated CODEX Task Scaffolds

### Task 1: Do NOT auto-generate `offload.sh` from the contract.

GITNEXUS IMPACT (auto-generated):
  symbol: dispatchTokens
  direct dependents: 0
  affected processes: 0
  risk: LOW
  symbol: Scripts/offload-contract.mjs
  direct dependents: 0
  affected processes: 0
  risk: LOW
  symbol: Scripts/offload.sh
  direct dependents: 0
  affected processes: 0
  risk: LOW
  symbol: Scripts/offload-contract-dispatch-check.mjs
  direct dependents: 0
  affected processes: 0
  risk: LOW
  symbol: node Scripts/offload-contract-dispatch-check.mjs
  direct dependents: 0
  affected processes: 0
  risk: LOW
  symbol: offload.sh
  direct dependents: 0
  affected processes: 0
  risk: LOW
  symbol: offload-contract-dispatch-check.mjs
  direct dependents: 0
  affected processes: 0
  risk: LOW
  symbol: offload-contract-regression.test.mjs
  direct dependents: 0
  affected processes: 0
  risk: LOW
  symbol: deepseek
  direct dependents: 0
  affected processes: 0
  risk: LOW

CODEX TASK SPEC SCAFFOLD:
  Goal: Do NOT auto-generate `offload.sh` from the contract.
  Target files: <to be determined during implementation>
  Constraints: Preserve existing behavior; follow repository task spec and protected-path rules.
  Acceptance criteria: Do NOT auto-generate `offload.sh` from the contract.
  Test command: <to be determined during implementation>
  Rollback boundary: Revert files changed for this task only.

### Task 2: Do NOT rename existing dispatch tokens (would break user muscle memory).

GITNEXUS IMPACT (auto-generated):
  symbol: dispatchTokens
  direct dependents: 0
  affected processes: 0
  risk: LOW
  symbol: Scripts/offload-contract.mjs
  direct dependents: 0
  affected processes: 0
  risk: LOW
  symbol: Scripts/offload.sh
  direct dependents: 0
  affected processes: 0
  risk: LOW
  symbol: Scripts/offload-contract-dispatch-check.mjs
  direct dependents: 0
  affected processes: 0
  risk: LOW
  symbol: node Scripts/offload-contract-dispatch-check.mjs
  direct dependents: 0
  affected processes: 0
  risk: LOW
  symbol: offload.sh
  direct dependents: 0
  affected processes: 0
  risk: LOW
  symbol: offload-contract-dispatch-check.mjs
  direct dependents: 0
  affected processes: 0
  risk: LOW
  symbol: offload-contract-regression.test.mjs
  direct dependents: 0
  affected processes: 0
  risk: LOW
  symbol: deepseek
  direct dependents: 0
  affected processes: 0
  risk: LOW

CODEX TASK SPEC SCAFFOLD:
  Goal: Do NOT rename existing dispatch tokens (would break user muscle memory).
  Target files: <to be determined during implementation>
  Constraints: Preserve existing behavior; follow repository task spec and protected-path rules.
  Acceptance criteria: Do NOT rename existing dispatch tokens (would break user muscle memory).
  Test command: <to be determined during implementation>
  Rollback boundary: Revert files changed for this task only.

### Task 3: Do NOT remove dispatch-only surface tokens from `offload.sh` (e.g., deprecated DeepSeek aliases, legacy Claude versions).

GITNEXUS IMPACT (auto-generated):
  symbol: dispatchTokens
  direct dependents: 0
  affected processes: 0
  risk: LOW
  symbol: Scripts/offload-contract.mjs
  direct dependents: 0
  affected processes: 0
  risk: LOW
  symbol: Scripts/offload.sh
  direct dependents: 0
  affected processes: 0
  risk: LOW
  symbol: Scripts/offload-contract-dispatch-check.mjs
  direct dependents: 0
  affected processes: 0
  risk: LOW
  symbol: node Scripts/offload-contract-dispatch-check.mjs
  direct dependents: 0
  affected processes: 0
  risk: LOW
  symbol: offload.sh
  direct dependents: 0
  affected processes: 0
  risk: LOW
  symbol: offload-contract-dispatch-check.mjs
  direct dependents: 0
  affected processes: 0
  risk: LOW
  symbol: offload-contract-regression.test.mjs
  direct dependents: 0
  affected processes: 0
  risk: LOW
  symbol: deepseek
  direct dependents: 0
  affected processes: 0
  risk: LOW

CODEX TASK SPEC SCAFFOLD:
  Goal: Do NOT remove dispatch-only surface tokens from `offload.sh` (e.g., deprecated DeepSeek aliases, legacy Claude versions).
  Target files: <to be determined during implementation>
  Constraints: Preserve existing behavior; follow repository task spec and protected-path rules.
  Acceptance criteria: Do NOT remove dispatch-only surface tokens from `offload.sh` (e.g., deprecated DeepSeek aliases, legacy Claude versions).
  Test command: <to be determined during implementation>
  Rollback boundary: Revert files changed for this task only.

### Task 4: Do NOT change `list_models`, `is_direct_lane_token`, or `dispatch_model` in `offload.sh` unless strictly required to close a drift row.

GITNEXUS IMPACT (auto-generated):
  symbol: dispatchTokens
  direct dependents: 0
  affected processes: 0
  risk: LOW
  symbol: Scripts/offload-contract.mjs
  direct dependents: 0
  affected processes: 0
  risk: LOW
  symbol: Scripts/offload.sh
  direct dependents: 0
  affected processes: 0
  risk: LOW
  symbol: Scripts/offload-contract-dispatch-check.mjs
  direct dependents: 0
  affected processes: 0
  risk: LOW
  symbol: node Scripts/offload-contract-dispatch-check.mjs
  direct dependents: 0
  affected processes: 0
  risk: LOW
  symbol: offload.sh
  direct dependents: 0
  affected processes: 0
  risk: LOW
  symbol: offload-contract-dispatch-check.mjs
  direct dependents: 0
  affected processes: 0
  risk: LOW
  symbol: offload-contract-regression.test.mjs
  direct dependents: 0
  affected processes: 0
  risk: LOW
  symbol: deepseek
  direct dependents: 0
  affected processes: 0
  risk: LOW

CODEX TASK SPEC SCAFFOLD:
  Goal: Do NOT change `list_models`, `is_direct_lane_token`, or `dispatch_model` in `offload.sh` unless strictly required to close a drift row.
  Target files: <to be determined during implementation>
  Constraints: Preserve existing behavior; follow repository task spec and protected-path rules.
  Acceptance criteria: Do NOT change `list_models`, `is_direct_lane_token`, or `dispatch_model` in `offload.sh` unless strictly required to close a drift row.
  Test command: <to be determined during implementation>
  Rollback boundary: Revert files changed for this task only.

### Task 5: NUDIMMUD operators who rely on `offload -l` and direct `-m` invocations.

GITNEXUS IMPACT (auto-generated):
  symbol: dispatchTokens
  direct dependents: 0
  affected processes: 0
  risk: LOW
  symbol: Scripts/offload-contract.mjs
  direct dependents: 0
  affected processes: 0
  risk: LOW
  symbol: Scripts/offload.sh
  direct dependents: 0
  affected processes: 0
  risk: LOW
  symbol: Scripts/offload-contract-dispatch-check.mjs
  direct dependents: 0
  affected processes: 0
  risk: LOW
  symbol: node Scripts/offload-contract-dispatch-check.mjs
  direct dependents: 0
  affected processes: 0
  risk: LOW
  symbol: offload.sh
  direct dependents: 0
  affected processes: 0
  risk: LOW
  symbol: offload-contract-dispatch-check.mjs
  direct dependents: 0
  affected processes: 0
  risk: LOW
  symbol: offload-contract-regression.test.mjs
  direct dependents: 0
  affected processes: 0
  risk: LOW
  symbol: deepseek
  direct dependents: 0
  affected processes: 0
  risk: LOW

CODEX TASK SPEC SCAFFOLD:
  Goal: NUDIMMUD operators who rely on `offload -l` and direct `-m` invocations.
  Target files: <to be determined during implementation>
  Constraints: Preserve existing behavior; follow repository task spec and protected-path rules.
  Acceptance criteria: NUDIMMUD operators who rely on `offload -l` and direct `-m` invocations.
  Test command: <to be determined during implementation>
  Rollback boundary: Revert files changed for this task only.

### Task 6: Future Spec Kit campaigns that depend on consistent routing between the contract and dispatch surfaces.

GITNEXUS IMPACT (auto-generated):
  symbol: dispatchTokens
  direct dependents: 0
  affected processes: 0
  risk: LOW
  symbol: Scripts/offload-contract.mjs
  direct dependents: 0
  affected processes: 0
  risk: LOW
  symbol: Scripts/offload.sh
  direct dependents: 0
  affected processes: 0
  risk: LOW
  symbol: Scripts/offload-contract-dispatch-check.mjs
  direct dependents: 0
  affected processes: 0
  risk: LOW
  symbol: node Scripts/offload-contract-dispatch-check.mjs
  direct dependents: 0
  affected processes: 0
  risk: LOW
  symbol: offload.sh
  direct dependents: 0
  affected processes: 0
  risk: LOW
  symbol: offload-contract-dispatch-check.mjs
  direct dependents: 0
  affected processes: 0
  risk: LOW
  symbol: offload-contract-regression.test.mjs
  direct dependents: 0
  affected processes: 0
  risk: LOW
  symbol: deepseek
  direct dependents: 0
  affected processes: 0
  risk: LOW

CODEX TASK SPEC SCAFFOLD:
  Goal: Future Spec Kit campaigns that depend on consistent routing between the contract and dispatch surfaces.
  Target files: <to be determined during implementation>
  Constraints: Preserve existing behavior; follow repository task spec and protected-path rules.
  Acceptance criteria: Future Spec Kit campaigns that depend on consistent routing between the contract and dispatch surfaces.
  Test command: <to be determined during implementation>
  Rollback boundary: Revert files changed for this task only.

### Task 7: The checker itself (`offload-contract-dispatch-check.mjs`), which gates drift visibility.

GITNEXUS IMPACT (auto-generated):
  symbol: dispatchTokens
  direct dependents: 0
  affected processes: 0
  risk: LOW
  symbol: Scripts/offload-contract.mjs
  direct dependents: 0
  affected processes: 0
  risk: LOW
  symbol: Scripts/offload.sh
  direct dependents: 0
  affected processes: 0
  risk: LOW
  symbol: Scripts/offload-contract-dispatch-check.mjs
  direct dependents: 0
  affected processes: 0
  risk: LOW
  symbol: node Scripts/offload-contract-dispatch-check.mjs
  direct dependents: 0
  affected processes: 0
  risk: LOW
  symbol: offload.sh
  direct dependents: 0
  affected processes: 0
  risk: LOW
  symbol: offload-contract-dispatch-check.mjs
  direct dependents: 0
  affected processes: 0
  risk: LOW
  symbol: offload-contract-regression.test.mjs
  direct dependents: 0
  affected processes: 0
  risk: LOW
  symbol: deepseek
  direct dependents: 0
  affected processes: 0
  risk: LOW

CODEX TASK SPEC SCAFFOLD:
  Goal: The checker itself (`offload-contract-dispatch-check.mjs`), which gates drift visibility.
  Target files: <to be determined during implementation>
  Constraints: Preserve existing behavior; follow repository task spec and protected-path rules.
  Acceptance criteria: The checker itself (`offload-contract-dispatch-check.mjs`), which gates drift visibility.
  Test command: <to be determined during implementation>
  Rollback boundary: Revert files changed for this task only.

### Task 8: node Scripts/offload-contract-dispatch-check.mjs` exits 0 (was 1)

GITNEXUS IMPACT (auto-generated):
  symbol: dispatchTokens
  direct dependents: 0
  affected processes: 0
  risk: LOW
  symbol: Scripts/offload-contract.mjs
  direct dependents: 0
  affected processes: 0
  risk: LOW
  symbol: Scripts/offload.sh
  direct dependents: 0
  affected processes: 0
  risk: LOW
  symbol: Scripts/offload-contract-dispatch-check.mjs
  direct dependents: 0
  affected processes: 0
  risk: LOW
  symbol: node Scripts/offload-contract-dispatch-check.mjs
  direct dependents: 0
  affected processes: 0
  risk: LOW
  symbol: offload.sh
  direct dependents: 0
  affected processes: 0
  risk: LOW
  symbol: offload-contract-dispatch-check.mjs
  direct dependents: 0
  affected processes: 0
  risk: LOW
  symbol: offload-contract-regression.test.mjs
  direct dependents: 0
  affected processes: 0
  risk: LOW
  symbol: deepseek
  direct dependents: 0
  affected processes: 0
  risk: LOW

CODEX TASK SPEC SCAFFOLD:
  Goal: node Scripts/offload-contract-dispatch-check.mjs` exits 0 (was 1)
  Target files: <to be determined during implementation>
  Constraints: Preserve existing behavior; follow repository task spec and protected-path rules.
  Acceptance criteria: node Scripts/offload-contract-dispatch-check.mjs` exits 0 (was 1)
  Test command: <to be determined during implementation>
  Rollback boundary: Revert files changed for this task only.

### Task 9: Every contract lane has a `dispatchTokens` array field listing the kebab-case tokens in `offload.sh` that route to that lane

GITNEXUS IMPACT (auto-generated):
  symbol: dispatchTokens
  direct dependents: 0
  affected processes: 0
  risk: LOW
  symbol: Scripts/offload-contract.mjs
  direct dependents: 0
  affected processes: 0
  risk: LOW
  symbol: Scripts/offload.sh
  direct dependents: 0
  affected processes: 0
  risk: LOW
  symbol: Scripts/offload-contract-dispatch-check.mjs
  direct dependents: 0
  affected processes: 0
  risk: LOW
  symbol: node Scripts/offload-contract-dispatch-check.mjs
  direct dependents: 0
  affected processes: 0
  risk: LOW
  symbol: offload.sh
  direct dependents: 0
  affected processes: 0
  risk: LOW
  symbol: offload-contract-dispatch-check.mjs
  direct dependents: 0
  affected processes: 0
  risk: LOW
  symbol: offload-contract-regression.test.mjs
  direct dependents: 0
  affected processes: 0
  risk: LOW
  symbol: deepseek
  direct dependents: 0
  affected processes: 0
  risk: LOW

CODEX TASK SPEC SCAFFOLD:
  Goal: Every contract lane has a `dispatchTokens` array field listing the kebab-case tokens in `offload.sh` that route to that lane
  Target files: <to be determined during implementation>
  Constraints: Preserve existing behavior; follow repository task spec and protected-path rules.
  Acceptance criteria: Every contract lane has a `dispatchTokens` array field listing the kebab-case tokens in `offload.sh` that route to that lane
  Test command: <to be determined during implementation>
  Rollback boundary: Revert files changed for this task only.

### Task 10: Every dispatch token listed in `is_direct_lane_token` + `dispatch_model` + `list_models` is referenced by at least one contract lane's `dispatchTokens` (unless explicitly documented as a deprecated/legacy surface-only alias)

GITNEXUS IMPACT (auto-generated):
  symbol: dispatchTokens
  direct dependents: 0
  affected processes: 0
  risk: LOW
  symbol: Scripts/offload-contract.mjs
  direct dependents: 0
  affected processes: 0
  risk: LOW
  symbol: Scripts/offload.sh
  direct dependents: 0
  affected processes: 0
  risk: LOW
  symbol: Scripts/offload-contract-dispatch-check.mjs
  direct dependents: 0
  affected processes: 0
  risk: LOW
  symbol: node Scripts/offload-contract-dispatch-check.mjs
  direct dependents: 0
  affected processes: 0
  risk: LOW
  symbol: offload.sh
  direct dependents: 0
  affected processes: 0
  risk: LOW
  symbol: offload-contract-dispatch-check.mjs
  direct dependents: 0
  affected processes: 0
  risk: LOW
  symbol: offload-contract-regression.test.mjs
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
  Constraints: Preserve existing behavior; follow repository task spec and protected-path rules.
  Acceptance criteria: Every dispatch token listed in `is_direct_lane_token` + `dispatch_model` + `list_models` is referenced by at least one contract lane's `dispatchTokens` (unless explicitly documented as a deprecated/legacy surface-only alias)
  Test command: <to be determined during implementation>
  Rollback boundary: Revert files changed for this task only.

### Task 11: No regression in `offload-contract-regression.test.mjs

GITNEXUS IMPACT (auto-generated):
  symbol: dispatchTokens
  direct dependents: 0
  affected processes: 0
  risk: LOW
  symbol: Scripts/offload-contract.mjs
  direct dependents: 0
  affected processes: 0
  risk: LOW
  symbol: Scripts/offload.sh
  direct dependents: 0
  affected processes: 0
  risk: LOW
  symbol: Scripts/offload-contract-dispatch-check.mjs
  direct dependents: 0
  affected processes: 0
  risk: LOW
  symbol: node Scripts/offload-contract-dispatch-check.mjs
  direct dependents: 0
  affected processes: 0
  risk: LOW
  symbol: offload.sh
  direct dependents: 0
  affected processes: 0
  risk: LOW
  symbol: offload-contract-dispatch-check.mjs
  direct dependents: 0
  affected processes: 0
  risk: LOW
  symbol: offload-contract-regression.test.mjs
  direct dependents: 0
  affected processes: 0
  risk: LOW
  symbol: deepseek
  direct dependents: 0
  affected processes: 0
  risk: LOW

CODEX TASK SPEC SCAFFOLD:
  Goal: No regression in `offload-contract-regression.test.mjs
  Target files: <to be determined during implementation>
  Constraints: Preserve existing behavior; follow repository task spec and protected-path rules.
  Acceptance criteria: No regression in `offload-contract-regression.test.mjs
  Test command: <to be determined during implementation>
  Rollback boundary: Revert files changed for this task only.

### Task 12: offload --list` output remains identical to current (no visual change for users)

GITNEXUS IMPACT (auto-generated):
  symbol: dispatchTokens
  direct dependents: 0
  affected processes: 0
  risk: LOW
  symbol: Scripts/offload-contract.mjs
  direct dependents: 0
  affected processes: 0
  risk: LOW
  symbol: Scripts/offload.sh
  direct dependents: 0
  affected processes: 0
  risk: LOW
  symbol: Scripts/offload-contract-dispatch-check.mjs
  direct dependents: 0
  affected processes: 0
  risk: LOW
  symbol: node Scripts/offload-contract-dispatch-check.mjs
  direct dependents: 0
  affected processes: 0
  risk: LOW
  symbol: offload.sh
  direct dependents: 0
  affected processes: 0
  risk: LOW
  symbol: offload-contract-dispatch-check.mjs
  direct dependents: 0
  affected processes: 0
  risk: LOW
  symbol: offload-contract-regression.test.mjs
  direct dependents: 0
  affected processes: 0
  risk: LOW
  symbol: deepseek
  direct dependents: 0
  affected processes: 0
  risk: LOW

CODEX TASK SPEC SCAFFOLD:
  Goal: offload --list` output remains identical to current (no visual change for users)
  Target files: <to be determined during implementation>
  Constraints: Preserve existing behavior; follow repository task spec and protected-path rules.
  Acceptance criteria: offload --list` output remains identical to current (no visual change for users)
  Test command: <to be determined during implementation>
  Rollback boundary: Revert files changed for this task only.

### Task 13: Anime DNA gates apply (evidence-forward, no speculation).

GITNEXUS IMPACT (auto-generated):
  symbol: dispatchTokens
  direct dependents: 0
  affected processes: 0
  risk: LOW
  symbol: Scripts/offload-contract.mjs
  direct dependents: 0
  affected processes: 0
  risk: LOW
  symbol: Scripts/offload.sh
  direct dependents: 0
  affected processes: 0
  risk: LOW
  symbol: Scripts/offload-contract-dispatch-check.mjs
  direct dependents: 0
  affected processes: 0
  risk: LOW
  symbol: node Scripts/offload-contract-dispatch-check.mjs
  direct dependents: 0
  affected processes: 0
  risk: LOW
  symbol: offload.sh
  direct dependents: 0
  affected processes: 0
  risk: LOW
  symbol: offload-contract-dispatch-check.mjs
  direct dependents: 0
  affected processes: 0
  risk: LOW
  symbol: offload-contract-regression.test.mjs
  direct dependents: 0
  affected processes: 0
  risk: LOW
  symbol: deepseek
  direct dependents: 0
  affected processes: 0
  risk: LOW

CODEX TASK SPEC SCAFFOLD:
  Goal: Anime DNA gates apply (evidence-forward, no speculation).
  Target files: <to be determined during implementation>
  Constraints: Preserve existing behavior; follow repository task spec and protected-path rules.
  Acceptance criteria: Anime DNA gates apply (evidence-forward, no speculation).
  Test command: <to be determined during implementation>
  Rollback boundary: Revert files changed for this task only.

### Task 14: Codex-primary for implementation (gpt-5.5 / gpt-5.4-mini).

GITNEXUS IMPACT (auto-generated):
  symbol: dispatchTokens
  direct dependents: 0
  affected processes: 0
  risk: LOW
  symbol: Scripts/offload-contract.mjs
  direct dependents: 0
  affected processes: 0
  risk: LOW
  symbol: Scripts/offload.sh
  direct dependents: 0
  affected processes: 0
  risk: LOW
  symbol: Scripts/offload-contract-dispatch-check.mjs
  direct dependents: 0
  affected processes: 0
  risk: LOW
  symbol: node Scripts/offload-contract-dispatch-check.mjs
  direct dependents: 0
  affected processes: 0
  risk: LOW
  symbol: offload.sh
  direct dependents: 0
  affected processes: 0
  risk: LOW
  symbol: offload-contract-dispatch-check.mjs
  direct dependents: 0
  affected processes: 0
  risk: LOW
  symbol: offload-contract-regression.test.mjs
  direct dependents: 0
  affected processes: 0
  risk: LOW
  symbol: deepseek
  direct dependents: 0
  affected processes: 0
  risk: LOW

CODEX TASK SPEC SCAFFOLD:
  Goal: Codex-primary for implementation (gpt-5.5 / gpt-5.4-mini).
  Target files: <to be determined during implementation>
  Constraints: Preserve existing behavior; follow repository task spec and protected-path rules.
  Acceptance criteria: Codex-primary for implementation (gpt-5.5 / gpt-5.4-mini).
  Test command: <to be determined during implementation>
  Rollback boundary: Revert files changed for this task only.

### Task 15: No T7 writes; keep changes scoped to `Scripts/offload-contract.mjs` lanes object and, minimally, `Scripts/offload-contract-dispatch-check.mjs`.

GITNEXUS IMPACT (auto-generated):
  symbol: dispatchTokens
  direct dependents: 0
  affected processes: 0
  risk: LOW
  symbol: Scripts/offload-contract.mjs
  direct dependents: 0
  affected processes: 0
  risk: LOW
  symbol: Scripts/offload.sh
  direct dependents: 0
  affected processes: 0
  risk: LOW
  symbol: Scripts/offload-contract-dispatch-check.mjs
  direct dependents: 0
  affected processes: 0
  risk: LOW
  symbol: node Scripts/offload-contract-dispatch-check.mjs
  direct dependents: 0
  affected processes: 0
  risk: LOW
  symbol: offload.sh
  direct dependents: 0
  affected processes: 0
  risk: LOW
  symbol: offload-contract-dispatch-check.mjs
  direct dependents: 0
  affected processes: 0
  risk: LOW
  symbol: offload-contract-regression.test.mjs
  direct dependents: 0
  affected processes: 0
  risk: LOW
  symbol: deepseek
  direct dependents: 0
  affected processes: 0
  risk: LOW

CODEX TASK SPEC SCAFFOLD:
  Goal: No T7 writes; keep changes scoped to `Scripts/offload-contract.mjs` lanes object and, minimally, `Scripts/offload-contract-dispatch-check.mjs`.
  Target files: <to be determined during implementation>
  Constraints: Preserve existing behavior; follow repository task spec and protected-path rules.
  Acceptance criteria: No T7 writes; keep changes scoped to `Scripts/offload-contract.mjs` lanes object and, minimally, `Scripts/offload-contract-dispatch-check.mjs`.
  Test command: <to be determined during implementation>
  Rollback boundary: Revert files changed for this task only.

### Task 16: Preserve all existing dispatch behavior in `offload.sh`.

GITNEXUS IMPACT (auto-generated):
  symbol: dispatchTokens
  direct dependents: 0
  affected processes: 0
  risk: LOW
  symbol: Scripts/offload-contract.mjs
  direct dependents: 0
  affected processes: 0
  risk: LOW
  symbol: Scripts/offload.sh
  direct dependents: 0
  affected processes: 0
  risk: LOW
  symbol: Scripts/offload-contract-dispatch-check.mjs
  direct dependents: 0
  affected processes: 0
  risk: LOW
  symbol: node Scripts/offload-contract-dispatch-check.mjs
  direct dependents: 0
  affected processes: 0
  risk: LOW
  symbol: offload.sh
  direct dependents: 0
  affected processes: 0
  risk: LOW
  symbol: offload-contract-dispatch-check.mjs
  direct dependents: 0
  affected processes: 0
  risk: LOW
  symbol: offload-contract-regression.test.mjs
  direct dependents: 0
  affected processes: 0
  risk: LOW
  symbol: deepseek
  direct dependents: 0
  affected processes: 0
  risk: LOW

CODEX TASK SPEC SCAFFOLD:
  Goal: Preserve all existing dispatch behavior in `offload.sh`.
  Target files: <to be determined during implementation>
  Constraints: Preserve existing behavior; follow repository task spec and protected-path rules.
  Acceptance criteria: Preserve all existing dispatch behavior in `offload.sh`.
  Test command: <to be determined during implementation>
  Rollback boundary: Revert files changed for this task only.

### Task 17: Max 90 lines in this spec file.

GITNEXUS IMPACT (auto-generated):
  symbol: dispatchTokens
  direct dependents: 0
  affected processes: 0
  risk: LOW
  symbol: Scripts/offload-contract.mjs
  direct dependents: 0
  affected processes: 0
  risk: LOW
  symbol: Scripts/offload.sh
  direct dependents: 0
  affected processes: 0
  risk: LOW
  symbol: Scripts/offload-contract-dispatch-check.mjs
  direct dependents: 0
  affected processes: 0
  risk: LOW
  symbol: node Scripts/offload-contract-dispatch-check.mjs
  direct dependents: 0
  affected processes: 0
  risk: LOW
  symbol: offload.sh
  direct dependents: 0
  affected processes: 0
  risk: LOW
  symbol: offload-contract-dispatch-check.mjs
  direct dependents: 0
  affected processes: 0
  risk: LOW
  symbol: offload-contract-regression.test.mjs
  direct dependents: 0
  affected processes: 0
  risk: LOW
  symbol: deepseek
  direct dependents: 0
  affected processes: 0
  risk: LOW

CODEX TASK SPEC SCAFFOLD:
  Goal: Max 90 lines in this spec file.
  Target files: <to be determined during implementation>
  Constraints: Preserve existing behavior; follow repository task spec and protected-path rules.
  Acceptance criteria: Max 90 lines in this spec file.
  Test command: <to be determined during implementation>
  Rollback boundary: Revert files changed for this task only.

### Task 18: **Missed alias breaks routing**: if a `dispatchTokens` entry doesn't match the token an operator types, `offload -m <token>` fails. Mitigation: regression test + dispatch-check both pass; review every `is_direct_lane_token` case and `list_models` entry.

GITNEXUS IMPACT (auto-generated):
  symbol: dispatchTokens
  direct dependents: 0
  affected processes: 0
  risk: LOW
  symbol: Scripts/offload-contract.mjs
  direct dependents: 0
  affected processes: 0
  risk: LOW
  symbol: Scripts/offload.sh
  direct dependents: 0
  affected processes: 0
  risk: LOW
  symbol: Scripts/offload-contract-dispatch-check.mjs
  direct dependents: 0
  affected processes: 0
  risk: LOW
  symbol: node Scripts/offload-contract-dispatch-check.mjs
  direct dependents: 0
  affected processes: 0
  risk: LOW
  symbol: offload.sh
  direct dependents: 0
  affected processes: 0
  risk: LOW
  symbol: offload-contract-dispatch-check.mjs
  direct dependents: 0
  affected processes: 0
  risk: LOW
  symbol: offload-contract-regression.test.mjs
  direct dependents: 0
  affected processes: 0
  risk: LOW
  symbol: deepseek
  direct dependents: 0
  affected processes: 0
  risk: LOW

CODEX TASK SPEC SCAFFOLD:
  Goal: **Missed alias breaks routing**: if a `dispatchTokens` entry doesn't match the token an operator types, `offload -m <token>` fails. Mitigation: regression test + dispatch-check both pass; review every `is_direct_lane_token` case and `list_models` entry.
  Target files: <to be determined during implementation>
  Constraints: Preserve existing behavior; follow repository task spec and protected-path rules.
  Acceptance criteria: **Missed alias breaks routing**: if a `dispatchTokens` entry doesn't match the token an operator types, `offload -m <token>` fails. Mitigation: regression test + dispatch-check both pass; review every `is_direct_lane_token` case and `list_models` entry.
  Test command: <to be determined during implementation>
  Rollback boundary: Revert files changed for this task only.

### Task 19: **Over-normalization**: collapsing too many aliases into one lane may break the "smallest lane" contract principle. Mitigation: each lane's `dispatchTokens` should only include tokens that genuinely route to that lane.

GITNEXUS IMPACT (auto-generated):
  symbol: dispatchTokens
  direct dependents: 0
  affected processes: 0
  risk: LOW
  symbol: Scripts/offload-contract.mjs
  direct dependents: 0
  affected processes: 0
  risk: LOW
  symbol: Scripts/offload.sh
  direct dependents: 0
  affected processes: 0
  risk: LOW
  symbol: Scripts/offload-contract-dispatch-check.mjs
  direct dependents: 0
  affected processes: 0
  risk: LOW
  symbol: node Scripts/offload-contract-dispatch-check.mjs
  direct dependents: 0
  affected processes: 0
  risk: LOW
  symbol: offload.sh
  direct dependents: 0
  affected processes: 0
  risk: LOW
  symbol: offload-contract-dispatch-check.mjs
  direct dependents: 0
  affected processes: 0
  risk: LOW
  symbol: offload-contract-regression.test.mjs
  direct dependents: 0
  affected processes: 0
  risk: LOW
  symbol: deepseek
  direct dependents: 0
  affected processes: 0
  risk: LOW

CODEX TASK SPEC SCAFFOLD:
  Goal: **Over-normalization**: collapsing too many aliases into one lane may break the "smallest lane" contract principle. Mitigation: each lane's `dispatchTokens` should only include tokens that genuinely route to that lane.
  Target files: <to be determined during implementation>
  Constraints: Preserve existing behavior; follow repository task spec and protected-path rules.
  Acceptance criteria: **Over-normalization**: collapsing too many aliases into one lane may break the "smallest lane" contract principle. Mitigation: each lane's `dispatchTokens` should only include tokens that genuinely route to that lane.
  Test command: <to be determined during implementation>
  Rollback boundary: Revert files changed for this task only.

### Task 20: Should `codex` (= gpt-5.5 alias in `offload.sh`) be a `dispatchToken` of the `gpt55` lane, or should `codex` get its own contract lane entry? Current `offload.sh` treats `codex`, `codex-high`, `codex-full` as aliases → gpt-5.5; proposal: include them in `gpt55.dispatchTokens`.

GITNEXUS IMPACT (auto-generated):
  symbol: dispatchTokens
  direct dependents: 0
  affected processes: 0
  risk: LOW
  symbol: Scripts/offload-contract.mjs
  direct dependents: 0
  affected processes: 0
  risk: LOW
  symbol: Scripts/offload.sh
  direct dependents: 0
  affected processes: 0
  risk: LOW
  symbol: Scripts/offload-contract-dispatch-check.mjs
  direct dependents: 0
  affected processes: 0
  risk: LOW
  symbol: node Scripts/offload-contract-dispatch-check.mjs
  direct dependents: 0
  affected processes: 0
  risk: LOW
  symbol: offload.sh
  direct dependents: 0
  affected processes: 0
  risk: LOW
  symbol: offload-contract-dispatch-check.mjs
  direct dependents: 0
  affected processes: 0
  risk: LOW
  symbol: offload-contract-regression.test.mjs
  direct dependents: 0
  affected processes: 0
  risk: LOW
  symbol: deepseek
  direct dependents: 0
  affected processes: 0
  risk: LOW

CODEX TASK SPEC SCAFFOLD:
  Goal: Should `codex` (= gpt-5.5 alias in `offload.sh`) be a `dispatchToken` of the `gpt55` lane, or should `codex` get its own contract lane entry? Current `offload.sh` treats `codex`, `codex-high`, `codex-full` as aliases → gpt-5.5; proposal: include them in `gpt55.dispatchTokens`.
  Target files: <to be determined during implementation>
  Constraints: Preserve existing behavior; follow repository task spec and protected-path rules.
  Acceptance criteria: Should `codex` (= gpt-5.5 alias in `offload.sh`) be a `dispatchToken` of the `gpt55` lane, or should `codex` get its own contract lane entry? Current `offload.sh` treats `codex`, `codex-high`, `codex-full` as aliases → gpt-5.5; proposal: include them in `gpt55.dispatchTokens`.
  Test command: <to be determined during implementation>
  Rollback boundary: Revert files changed for this task only.

### Task 21: Should deprecated DeepSeek aliases (`deepseek-r1:8b`, `deepseek-r1:latest`, `deepseek-v2:16b`) that appear only in `list_models`/`is_direct_lane_token` be added as `dispatchTokens` of the `deepseek` lane, or left surface-only with a documented exemption in the checker?

GITNEXUS IMPACT (auto-generated):
  symbol: dispatchTokens
  direct dependents: 0
  affected processes: 0
  risk: LOW
  symbol: Scripts/offload-contract.mjs
  direct dependents: 0
  affected processes: 0
  risk: LOW
  symbol: Scripts/offload.sh
  direct dependents: 0
  affected processes: 0
  risk: LOW
  symbol: Scripts/offload-contract-dispatch-check.mjs
  direct dependents: 0
  affected processes: 0
  risk: LOW
  symbol: node Scripts/offload-contract-dispatch-check.mjs
  direct dependents: 0
  affected processes: 0
  risk: LOW
  symbol: offload.sh
  direct dependents: 0
  affected processes: 0
  risk: LOW
  symbol: offload-contract-dispatch-check.mjs
  direct dependents: 0
  affected processes: 0
  risk: LOW
  symbol: offload-contract-regression.test.mjs
  direct dependents: 0
  affected processes: 0
  risk: LOW
  symbol: deepseek
  direct dependents: 0
  affected processes: 0
  risk: LOW

CODEX TASK SPEC SCAFFOLD:
  Goal: Should deprecated DeepSeek aliases (`deepseek-r1:8b`, `deepseek-r1:latest`, `deepseek-v2:16b`) that appear only in `list_models`/`is_direct_lane_token` be added as `dispatchTokens` of the `deepseek` lane, or left surface-only with a documented exemption in the checker?
  Target files: <to be determined during implementation>
  Constraints: Preserve existing behavior; follow repository task spec and protected-path rules.
  Acceptance criteria: Should deprecated DeepSeek aliases (`deepseek-r1:8b`, `deepseek-r1:latest`, `deepseek-v2:16b`) that appear only in `list_models`/`is_direct_lane_token` be added as `dispatchTokens` of the `deepseek` lane, or left surface-only with a documented exemption in the checker?
  Test command: <to be determined during implementation>
  Rollback boundary: Revert files changed for this task only.
