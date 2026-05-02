export const DEFAULT_COMPILER_FLAGS = Object.freeze({
  no_stage_narration: true,
  final_report_only: true,
  broad_command_ban: true,
  command_output_caps: true,
  split_required_trigger: true,
  report_line_cap: true,
});

function normalizeList(value) {
  return Array.isArray(value) ? [...value] : [];
}

function makeContractId(input = {}) {
  return input.contract_id ?? input.run_id ?? input.turn_id ?? 'nudimmud-one-transaction-contract';
}

export function compileOneTransactionContract(input = {}) {
  const contract = {
    contract_id: makeContractId(input),
    mode: 'ONE_TRANSACTION',
    output_policy: 'FINAL_REPORT_ONLY_UNLESS_BLOCKED',
    task_delta: input.task_delta ?? '',
    stable_header: input.stable_header ?? 'NUDIMMUD harness core skeleton',
    allowed_scope: normalizeList(input.allowed_scope),
    forbidden_scope: normalizeList(input.forbidden_scope),
    internal_checklist: normalizeList(input.internal_checklist),
    output_schema: input.output_schema ?? {
      type: 'final_report',
      fields: ['RESULT_LABEL', 'HEAD', 'STAGED', 'FILES_CHANGED', 'VALIDATION'],
    },
    failure_contract: input.failure_contract ?? {
      blocked_result_label: '08L_NUDIMMUD_HARNESS_CORE_X1_BLOCKED',
      repair_result_label: '08L_NUDIMMUD_HARNESS_CORE_X1_REPAIR_REQUIRED',
    },
    flags: { ...DEFAULT_COMPILER_FLAGS },
  };

  contract.compiled_prompt = [
    `mode: ${contract.mode}`,
    `output_policy: ${contract.output_policy}`,
    `stable_header: ${contract.stable_header}`,
    `task_delta: ${contract.task_delta}`,
    `allowed_scope: ${JSON.stringify(contract.allowed_scope)}`,
    `forbidden_scope: ${JSON.stringify(contract.forbidden_scope)}`,
    `internal_checklist: ${JSON.stringify(contract.internal_checklist)}`,
    `output_schema: ${JSON.stringify(contract.output_schema)}`,
    `failure_contract: ${JSON.stringify(contract.failure_contract)}`,
    `flags: ${JSON.stringify(contract.flags)}`,
  ].join('\n');

  return contract;
}

export function validateCompiledContract(contract) {
  const issues = [];

  if (!contract || typeof contract !== 'object') {
    issues.push('contract must be an object');
  } else {
    if (contract.mode !== 'ONE_TRANSACTION') {
      issues.push('mode must be ONE_TRANSACTION');
    }
    if (contract.output_policy !== 'FINAL_REPORT_ONLY_UNLESS_BLOCKED') {
      issues.push('output_policy must be FINAL_REPORT_ONLY_UNLESS_BLOCKED');
    }
    for (const flag of Object.keys(DEFAULT_COMPILER_FLAGS)) {
      if (!contract.flags || contract.flags[flag] !== true) {
        issues.push(`flag ${flag} must be true`);
      }
    }
    if (typeof contract.compiled_prompt !== 'string' || contract.compiled_prompt.length === 0) {
      issues.push('compiled_prompt must be a non-empty string');
    }
  }

  return {
    ok: issues.length === 0,
    issues,
  };
}
