# YURI Contributor Consent — v1

By using YURI you actively contribute to its development and to Marcel Spatz's
energy-landscape research. While you work, YURI records **privacy-sanitized,
numeric-only** telemetry about its own decision gate — never your prompts, file
contents, secrets, paths, or any free text. This is enforced *mechanically*: the
Privacy Gate refuses to write any record containing a free-text value at a
non-allow-listed field. It is structurally impossible for your content to leave.

## What is collected
Per-dispatch gate events — the decision (accept/reject), the energy value `U` and
its change `ΔU`, which component dominated, the lane name, a timestamp, and your
chosen handle. All numeric or fixed-enum. Nothing else.

## Why (purpose limitation — GDPR Art.5(1)(b))
Two purposes only: (1) find what frustrates real users early and fix it, and
(2) gather honest real-world evidence for the research. Your data is used for
nothing else.

## Data minimisation (Art.5(1)(c))
Only what is adequate, relevant, and limited to those purposes is kept. The
allow-list keeps everything else out by default — new fields are dropped, not
collected.

## Where it goes & how long (storage limitation — Art.5(1)(e))
A compacted daily file on the `user-data` branch under your handle's folder.
Nothing lands on `main`. You can read every record you produce. Ask Marcel to
remove your folder at any time to delete your contributed data.

## Your control
Opt-in is explicit: you type `I AGREE` at onboarding, and consent (version + a
timestamp) is recorded in the roster. No telemetry is attributed to you before
that. Stop contributing any time — unset `YURI_ENERGY_OBSERVABILITY`, uninstall
the collector, or request deletion.

Typing `I AGREE` records consent version **v1**.
