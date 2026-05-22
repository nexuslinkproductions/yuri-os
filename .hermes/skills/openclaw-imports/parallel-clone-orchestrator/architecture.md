# Architecture: Parallel Clone Orchestrator

## System role

`parallel-clone-orchestrator` serves as Yuri OS's budgeted multi-agent decomposition, specialist execution, and synthesis layer.

## Architectural position

```text
User Intent
  ↓
Execution Domain Core
  ↓
Non-Destructive Infinity Guard
  ↓
Parallel Clone Orchestrator
  ↓
Outputs: plans, reports, staged patches, memory proposals
```

For extensions that require other layers, the order is adjusted according to `EXTENSION_REGISTRY.yaml`.

## Components

### 1. Intake Adapter

Normalizes user goals and target artifacts into the extension schema.

### 2. Context Mapper

Maps target files, docs, logs, prompts, repos, or workflows to a safe working context.

### 3. Policy Adapter

Loads enterprise rules from:

- `DNA_MANIFEST.yaml`
- `ENTERPRISE_CONTROL_PLANE.md`
- active domain manifest
- Infinity Guard decision matrix

### 4. Execution Engine

Runs the extension-specific workflow:

- task decomposition
- clone role assignment
- budget allocation
- parallel execution
- evidence collection
- contradiction detection
- synthesis
- merge decision
- clone memory distillation

### 5. Evidence Collector

Stores citations, source paths, diffs, test output, command output, and decision rationale.

### 6. Output Composer

Produces implementation-ready artifacts, not vague advice.

### 7. Memory Proposal Writer

Creates reviewable memory updates. It does not directly overwrite memory unless the active domain explicitly permits it.

## Integration points

- Claude Code task execution
- Skills directory
- Commands directory
- Memory system
- Session reflection
- EOT workflow
- Logs and audit events
- Test suites
- Security guardrails

## File mutation policy

Default: read-only.

Allowed without approval:

- create analysis reports in a staging directory
- create proposed patches
- write audit logs
- write temporary domain reports

Requires approval:

- modifying existing skill files
- modifying memory indexes
- changing global commands
- applying patches to source files
- deleting files
- overwriting existing docs

## Failure handling

If the extension cannot complete safely, it must produce:

1. reason for halt
2. partial findings
3. missing information
4. safe next action
5. risk if proceeding anyway
