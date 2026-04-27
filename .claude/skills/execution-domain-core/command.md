# Command Specification: `/yuri domain`

## Syntax

```bash
/yuri domain --target <path-or-artifact> --mode <mode> [flags]
```

## Modes

- `passive-scope-detection`: passive scope detection.
- `active-domain-creation`: active domain creation.
- `audit-domain-review`: audit domain review.
- `integration-domain`: integration domain.
- `emergency-containment-domain`: emergency containment domain.

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
/yuri domain --target ./repo --mode audit --enterprise --non-destructive --audit-trail
/yuri domain --target ./docs --mode active --domain current --output ./staging/execution-domain-core/report.md
/yuri domain --target ./memory --mode integration --approval-required --require-rollback
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
