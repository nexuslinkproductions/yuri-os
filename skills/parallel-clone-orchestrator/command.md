# Command Specification: `/yuri clone`

## Syntax

```bash
/yuri clone --target <path-or-artifact> --mode <mode> [flags]
```

## Modes

- `passive-delegation-suggestion`: passive delegation suggestion.
- `active-clone-swarm`: active clone swarm.
- `audit-clone-review`: audit clone review.
- `integration-clone-team`: integration clone team.
- `emergency-halt-on-runaway-parallelism`: emergency halt on runaway parallelism.

## Common flags

```bash
--enterprise                 Enable enterprise controls.
--non-destructive            Force stage-only behavior.
--audit-trail                Emit audit events.
--require-rollback           Require rollback plan for proposed mutations.
--domain <domain_id>         Bind execution to an existing domain.
--output <path>              Write reports to a staging path.
--max-risk <level>           low | medium | high | critical.
--approval-required          Mark all mutation proposals as approval-gated.
```

## Examples

```bash
/yuri clone --target ./repo --mode audit --enterprise --non-destructive --audit-trail
/yuri clone --target ./docs --mode active --domain current --output ./staging/parallel-clone-orchestrator/report.md
/yuri clone --target ./memory --mode integration --approval-required --require-rollback
```

## Behavior

1. Load active domain if present.
2. Route proposed actions through Infinity Guard.
3. Execute the extension workflow.
4. Produce reports and proposed changes.
5. Emit audit events.
6. Propose memory updates, never silently apply them.

## Safety restrictions

The command must refuse direct destructive operations unless:

- the action is explicitly requested
- the active domain permits it
- Infinity Guard classifies it as acceptable after approval
- rollback plan exists
- audit event is written
