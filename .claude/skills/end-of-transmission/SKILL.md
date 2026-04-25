---
name: end-of-transmission
description: "Global session-close command. Full-auto evidence-based reflection: freeze work, backtrack session, verify claims, log success/failure, extract skill patches, produce next-session boot packet. No mid-run confirmations. Finalised by Sonnet 4.6 auto."
triggers:
  - "end of transmission"
  - "/eot"
  - "/end-of-transmission"
---

# End of Transmission

Global session-close command for NUDIMMUD. When triggered, stop normal implementation mode and enter **End-of-Session Reflection Mode**.

## Trigger

When the user says exactly or semantically `end of transmission`, begin with:

```text
End of transmission received. Entering full auto reflection mode.

I will not ask for further permission during this run. I will freeze new feature work, reconstruct the session from available evidence, verify what was actually completed, log successes and failures, extract skill updates, update the self-improvement system where safe, offload mechanical checks, and finalise the reflection with Sonnet 4.6 auto reasoning.
```

Then execute the pipeline below.

## Command Precedence

Overrides ordinary continuation, feature work, UI polish, or new-task execution.

- Do not start new feature work unless directly required to document the self-improvement system.
- Do not invent session outcomes.
- Do not claim tests, audits, file edits, or checks were performed without evidence.
- Do not expose chain-of-thought. Provide concise, inspectable reasoning summaries.
- Do not modify Conclave, secrets, credentials, private environment files, T7, or unrelated production code.
- Do not convert failures into vague "learnings." Record them clearly and practically.
- Do not end with only a motivational summary. Produce operational next steps and system refinements.

If the command conflicts with another project instruction, safety and evidence requirements win.

## Full Auto Permission Grant

`end of transmission` is a deliberate execution command, not a request for a plan, confirmation, or optional summary. By invoking it, the user grants standing permission to run the complete EOT pipeline from beginning to end without asking for additional approval.

This permission includes: running all required deterministic checks · searching and inspecting session files, artifacts, logs, prompts, and self-improvement docs · creating new reflection artifacts · updating existing EOT/self-improvement documentation where the target path is clearly within scope · appending skill refinements, failure ledgers, boot packets, and patch proposals · offloading mechanical work · sending high-reasoning synthesis to Sonnet 4.6 auto · making reasonable implementation choices independently when evidence is sufficient · continuing through non-critical uncertainty by recording it and choosing the safest useful fallback.

Do **not** ask the user:
- "Do you want me to proceed?"
- "Should I update the document?"
- "Should I run the reflection?"
- "Should I create the artifacts?"
- "Which format do you prefer?"

The command itself answers those questions. Proceed automatically.

## No-Interruption Rule

Once triggered, the pipeline runs uninterrupted until the final EOT output is produced. No mid-session approval, preference selection, scope confirmation, or optional review.

If a choice is required, resolve using this order:
1. existing NUDIMMUD CLAUDE.md / masterplan instructions
2. current self-improvement system rules
3. repository or document evidence
4. safety, protected-area, and data-truth constraints
5. smallest reversible useful update
6. explicit patch proposal instead of direct mutation if safe mutation is not available

If a tool, permission, or platform-level approval blocks an action: log it as blocked, produce the best available patch proposal or fallback artifact, and continue the remaining pipeline. Do not ask the user to unblock it during the EOT run.

## Hard Boundaries (Full Auto Cannot Override)

The system must still not:
- expose hidden chain-of-thought
- invent evidence, tests, artifacts, tool results, or successful injections
- modify Conclave
- read, reveal, edit, or exfiltrate secrets, credentials, private keys, or `.env` values
- perform destructive production actions unrelated to EOT
- send external messages, publish content, make purchases, deploy production changes, delete data, or trigger irreversible external side effects unless separately and explicitly requested
- bypass authentication, authorization, sandboxing, or repository safety rules

If a desired update conflicts with these boundaries, create a patch proposal marked `not_applied` with the reason.

## Execution Model

### Orchestrator owns:
- trigger recognition, freeze and scope control
- evidence inventory, worker routing
- council review, final acceptance judgment, final report assembly

### Sonnet 4.6 Auto (final synthesiser only):
- cross-session pattern recognition
- identifying subtle reasoning gaps
- reconciling conflicting evidence
- producing the final self-improvement patch
- validating that lessons become executable rules, not vague advice

Do not use Sonnet for mechanical extraction, grep, raw diff collection, formatting, or log enumeration.

### Offload before Sonnet (deterministic tools / smaller workers):
transcript extraction · file inventory · diff generation · grep/search self-improvement docs · test/build/lint results · artifact list · TODO/FIXME collection · failure log extraction · duplicate section detection · markdown validation · checklist tally · evidence table generation

---

## Reflection Pipeline

### Phase 0 — Freeze Active Work

```xml
<end_of_transmission_state mode="full_auto" requires_user_confirmation="false">
  <mode>reflection</mode>
  <new_feature_work_allowed>false</new_feature_work_allowed>
  <protected_areas>
    <area>Conclave</area>
    <area>secrets and credentials</area>
    <area>private environment files</area>
    <area>T7 drive (/Volumes/T7)</area>
    <area>unrelated production logic</area>
  </protected_areas>
</end_of_transmission_state>
```

### Phase 1 — Evidence Inventory

Collect: user requests, assistant responses, files uploaded/created/modified, tool calls, command outputs, tests/checks run, errors, citations, accepted assumptions, unresolved questions.

```xml
<session_evidence_inventory>
  <user_goals></user_goals>
  <source_documents></source_documents>
  <artifacts_created></artifacts_created>
  <artifacts_modified></artifacts_modified>
  <tools_used></tools_used>
  <checks_run></checks_run>
  <errors_or_limitations></errors_or_limitations>
  <unverified_claims></unverified_claims>
</session_evidence_inventory>
```

### Phase 2 — Timeline Backtrack

Reconstruct what happened in order. Material decision points only — not every trivial message.

```xml
<session_timeline>
  <event order="1">
    <input></input>
    <action_taken></action_taken>
    <evidence></evidence>
    <result>success | partial | fail | unknown</result>
  </event>
</session_timeline>
```

### Phase 3 — Claim Double-Check

Audit important claims made during the session. If a response said "done," verify a file exists or a tool result supports it. If not, correct the record.

```xml
<claim_audit>
  <claim status="verified | partial | unsupported | contradicted | not_checked">
    <statement></statement>
    <evidence></evidence>
    <correction_if_needed></correction_if_needed>
  </claim>
</claim_audit>
```

### Phase 4 — Success and Failure Ledger

```xml
<session_ledger>
  <successes>
    <item evidence=""></item>
  </successes>
  <failures>
    <item severity="low | medium | high" evidence=""></item>
  </failures>
  <partials>
    <item remaining_work=""></item>
  </partials>
</session_ledger>
```

Successes must be concrete: file generated, prompt consolidated, unsafe assumption removed, routing improved, test passed, issue documented.
Failures must be concrete: insufficient inspection, missed validation, overclaimed completion, wrong worker routing, unresolved ambiguity.

### Phase 5 — Could-Have-Done-Better Review

```xml
<improvement_review>
  <improvement>
    <observed_behavior></observed_behavior>
    <better_behavior></better_behavior>
    <system_update_type>skill | prompt | checklist | test | backlog | no_change</system_update_type>
    <new_rule></new_rule>
  </improvement>
</improvement_review>
```

### Phase 6 — Skill Refinement

A skill update must be: specific, triggerable, testable, short, connected to a failure/success/repeated pattern.

Good: `Before claiming a generated artifact is done, run ls -l and inspect first lines or metadata.`
Bad: `Be more careful with artifacts.`

```xml
<skill_refinement_patch>
  <skill id="">
    <trigger></trigger>
    <rule></rule>
    <validation></validation>
    <source_session_evidence></source_session_evidence>
  </skill>
</skill_refinement_patch>
```

### Phase 7 — Self-Improvement System Update

Update current self-improvement system and related docs where allowed. If direct mutation is not safe or not possible, output a patch proposal — do not claim injection.

```xml
<self_improvement_update>
  <mode>applied | patch_proposed | skipped</mode>
  <targets>
    <target path=""></target>
  </targets>
  <changes></changes>
  <reason_if_skipped></reason_if_skipped>
</self_improvement_update>
```

### Phase 8 — Next Session Boot Packet

```xml
<next_session_boot_packet>
  <current_state></current_state>
  <must_remember></must_remember>
  <open_threads></open_threads>
  <recommended_first_actions></recommended_first_actions>
  <do_not_repeat></do_not_repeat>
  <artifacts_to_load_first></artifacts_to_load_first>
</next_session_boot_packet>
```

### Phase 9 — Sonnet Finalisation

After deterministic/offloaded work is complete, Sonnet 4.6 auto finalises:
- final reflection summary
- corrected record of what happened
- skill refinement patch
- self-improvement update
- next-session boot packet
- remaining risks

Sonnet must reject vague learning summaries and require evidence-backed updates.

---

## 33 Architect Council Reflection Review

Mandatory veto seats:

Prime Systems Architect · Orchestrator Architect · Worker Delegation Architect · Deterministic Tooling Architect · Repository Truth Architect · Backend Data Architect · Metric Truth Architect · Security Architect · Observability Architect · Swarm Learning Architect · Physis System Health Architect · Conclave Guardian Architect

```xml
<architect_council_reflection_review>
  <stage>end_of_transmission</stage>
  <mode>full_auto</mode>
  <decision>pass | pass_with_corrections | fail_requires_followup</decision>
  <vetoes></vetoes>
  <major_findings></major_findings>
  <required_skill_updates></required_skill_updates>
  <protected_area_status></protected_area_status>
  <auto_execution_status>completed | completed_with_blocked_items | failed_safe</auto_execution_status>
</architect_council_reflection_review>
```

Seat duties:
- **Repository Truth Architect** — flags claims made without inspecting files or source truth
- **Deterministic Tooling Architect** — flags missed grep, tests, validators, diff tools
- **Worker Delegation Architect** — checks Sonnet/tool/worker routing was appropriate
- **Metric Truth Architect** — checks "success" and "completion" claims are evidence-based
- **Swarm Learning Architect** — checks session learning became measurable skill refinement
- **Physis System Health Architect** — checks system-health lessons became recommendations
- **Conclave Guardian Architect** — confirms protected areas remained untouched

---

## Offload Routing Map

```xml
<end_of_transmission_routing mode="full_auto" user_permission="pre_granted">
  <task id="eot-001" owner="deterministic_tool" permission="granted">Collect session artifacts, file paths, timestamps, sizes, and generated outputs.</task>
  <task id="eot-002" owner="deterministic_tool" permission="granted">Extract tool calls, errors, checks, command outputs, and validation evidence.</task>
  <task id="eot-003" owner="deterministic_tool" permission="granted">Search current self-improvement docs, related protocols, TODOs, and duplicated prompt sections.</task>
  <task id="eot-004" owner="deterministic_tool" permission="granted">Compare promised artifacts against actual files and inspect generated artifact headers where practical.</task>
  <task id="eot-005" owner="smaller_worker" permission="granted">Draft success, failure, partial, and risk ledgers from evidence.</task>
  <task id="eot-006" owner="smaller_worker" permission="granted">Draft skill patch candidates with trigger, rule, validation, and evidence.</task>
  <task id="eot-007" owner="sonnet_4_6_auto" permission="granted">Perform high-reasoning synthesis and finalise the self-improvement update.</task>
</end_of_transmission_routing>
```

---

## Required Artifacts

When environment allows file output, produce or update in `.claude/eot/YYYY-MM-DD_HHMM/`:

1. `SESSION_REFLECTION_REPORT.md`
2. `SESSION_SUCCESS_FAILURE_LEDGER.md`
3. `SKILL_REFINEMENT_PATCH.md`
4. `SELF_IMPROVEMENT_SYSTEM_UPDATE.md`
5. `NEXT_SESSION_BOOT_PACKET.md`

---

## Final Output Contract

```xml
<end_of_transmission_final mode="full_auto">
  <session_summary></session_summary>
  <verified_successes>
    <item evidence=""></item>
  </verified_successes>
  <failures_or_partials>
    <item severity="low | medium | high" evidence="" correction=""></item>
  </failures_or_partials>
  <what_could_have_been_done_better>
    <item></item>
  </what_could_have_been_done_better>
  <skill_updates>
    <skill trigger="" validation=""></skill>
  </skill_updates>
  <self_improvement_updates>
    <update target="" status="applied | proposed | skipped"></update>
  </self_improvement_updates>
  <next_session_boot_packet>
    <item></item>
  </next_session_boot_packet>
  <offload_summary>
    <tools_used></tools_used>
    <smaller_workers_used></smaller_workers_used>
    <sonnet_finalisation></sonnet_finalisation>
  </offload_summary>
  <blocked_items>
    <item reason=""></item>
  </blocked_items>
  <remaining_risks>
    <risk></risk>
  </remaining_risks>
</end_of_transmission_final>
```

If XML is too heavy for the user-facing response, use readable Markdown with the same headings and fields.

---

## Session Notes

### 2026-04-25
- session: injection + first live EOT run
- peak ctx: ~40%
- compacts: 0
- tools: Read×6, Write×9, Edit×3, Bash×3, Agent×1, Skill×1
- corrections: /eot CLI alias missing — fixed during EOT run (commands/eot.md created)
- errors: "Unknown command: /eot" on user test — root cause: triggers frontmatter ≠ CLI command file
- notes: symbiosed from MARCEL_UwU_End_of_Transmission_Global_Command.md; artifacts at .claude/eot/2026-04-25_1207/; skill refinement patch 001+002 logged

### 2026-04-25 (update 2)
- session: FULL_AUTO upgrade from MARCEL_UwU_End_of_Transmission_Global_Command_FULL_AUTO.md
- peak ctx: ~30%
- compacts: 0
- tools: Read×2, Edit×8
- corrections: none
- errors: none
- notes: added Full Auto Permission Grant + No-Interruption Rule + Hard Boundaries sections; updated Phase 0/Routing/Council/Output XMLs with full_auto attrs and blocked_items field; updated both CLAUDE.md inject blocks to full-auto version
