# Trading Bot Runtime

## Control Path

Use `npm run trading-bot:control -- <route>`.

Routes:

- `status`
- `readiness`
- `kill-switch status`
- `kill-switch arm <operator>`
- `kill-switch disarm <operator>`
- `approve`
- `audit`
- `mode set sandbox|paper|staging|live <operator>`
- `coworker on|off`

## Safety Rules

- Default mode is sandbox.
- Kill switch starts disarmed.
- Live execution requires readiness, approval, and auditability.
- `--dry-run` must exit cleanly without API keys.
