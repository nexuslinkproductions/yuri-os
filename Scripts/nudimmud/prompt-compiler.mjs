export const DEFAULT_COMPILER_FLAGS = Object.freeze({
  no_stage_narration: true,
  final_report_only: true,
  broad_command_ban: true,
  command_output_caps: true,
  split_required_trigger: true,
  report_line_cap: 25,
});

function normalizeList(value) {
  return Array.isArray(value) ? [...value] : [];
}

function normalizeReportLineCap(value) {
  if (typeof value === 'number' && Number.isInteger(value) && value > 0) {
    return value;
  }
  if (value === true || value === undefined) {
    return DEFAULT_COMPILER_FLAGS.report_line_cap;
  }
  return value;
}

function normalizeFlags(value) {
  const flags = {
    ...DEFAULT_COMPILER_FLAGS,
    ...(value && typeof value === 'object' ? value : {}),
  };

  flags.report_line_cap = normalizeReportLineCap(flags.report_line_cap);

  return flags;
}

function getBudgetLimit(value, fallback) {
  if (typeof value === 'number' && Number.isFinite(value) && value > 0) {
    return value;
  }

  return fallback;
}

function makeContractId(input = {}) {
  return input.contract_id ?? input.run_id ?? input.turn_id ?? 'nudimmud-one-transaction-contract';
}

export function compileOneTransactionContract(input = {}) {
  const normalizedInput = input && typeof input === 'object' ? input : {};
  const contract = {
    contract_id: makeContractId(normalizedInput),
    mode: 'ONE_TRANSACTION',
    output_policy: 'FINAL_REPORT_ONLY_UNLESS_BLOCKED',
    task_delta: normalizedInput.task_delta ?? '',
    stable_header: normalizedInput.stable_header ?? 'NUDIMMUD harness core skeleton',
    allowed_scope: normalizeList(normalizedInput.allowed_scope),
    forbidden_scope: normalizeList(normalizedInput.forbidden_scope),
    internal_checklist: normalizeList(normalizedInput.internal_checklist),
    output_schema: normalizedInput.output_schema ?? {
      type: 'final_report',
      fields: ['RESULT_LABEL', 'HEAD', 'STAGED', 'FILES_CHANGED', 'VALIDATION'],
    },
    failure_contract: normalizedInput.failure_contract ?? {
      blocked_result_label: '08L_NUDIMMUD_HARNESS_CORE_X1_BLOCKED',
      repair_result_label: '08L_NUDIMMUD_HARNESS_CORE_X1_REPAIR_REQUIRED',
    },
    flags: normalizeFlags(normalizedInput.flags),
  };

  contract.compiled_prompt = [
    `MODE: ${contract.mode}`,
    `OUTPUT: ${contract.output_policy}`,
    `NO_STAGE_NARRATION: ${contract.flags.no_stage_narration}`,
    `FINAL_REPORT_ONLY: ${contract.flags.final_report_only}`,
    `BROAD_COMMAND_BAN: ${contract.flags.broad_command_ban}`,
    `COMMAND_OUTPUT_CAPS: ${contract.flags.command_output_caps}`,
    `SPLIT_REQUIRED_TRIGGER: ${contract.flags.split_required_trigger}`,
    `REPORT_LINE_CAP: ${contract.flags.report_line_cap}`,
    `TASK_DELTA: ${contract.task_delta}`,
    `ALLOWED_SCOPE: ${JSON.stringify(contract.allowed_scope)}`,
    `FORBIDDEN_SCOPE: ${JSON.stringify(contract.forbidden_scope)}`,
    `INTERNAL_CHECKLIST: ${JSON.stringify(contract.internal_checklist)}`,
    `OUTPUT_SCHEMA: ${JSON.stringify(contract.output_schema)}`,
    `FAILURE_CONTRACT: ${JSON.stringify(contract.failure_contract)}`,
    `STABLE_HEADER: ${contract.stable_header}`,
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
    if (!contract.flags || contract.flags.no_stage_narration !== true) {
      issues.push('flag no_stage_narration must be true');
    }
    if (!contract.flags || contract.flags.final_report_only !== true) {
      issues.push('flag final_report_only must be true');
    }
    if (!contract.flags || contract.flags.broad_command_ban !== true) {
      issues.push('flag broad_command_ban must be true');
    }
    if (!contract.flags || contract.flags.command_output_caps !== true) {
      issues.push('flag command_output_caps must be true');
    }
    if (!contract.flags || contract.flags.split_required_trigger !== true) {
      issues.push('flag split_required_trigger must be true');
    }
    const reportLineCap = contract.flags ? contract.flags.report_line_cap : undefined;
    const reportLineCapOk =
      reportLineCap === true || (Number.isInteger(reportLineCap) && reportLineCap > 0);
    if (!reportLineCapOk) {
      issues.push('flag report_line_cap must be true or a positive integer');
    }
    if (typeof contract.compiled_prompt !== 'string' || contract.compiled_prompt.length === 0) {
      issues.push('compiled_prompt must be a non-empty string');
    } else {
      if (!contract.compiled_prompt.includes('ONE_TRANSACTION')) {
        issues.push('compiled_prompt must contain ONE_TRANSACTION');
      }
      if (!contract.compiled_prompt.includes('FINAL_REPORT_ONLY_UNLESS_BLOCKED')) {
        issues.push('compiled_prompt must contain FINAL_REPORT_ONLY_UNLESS_BLOCKED');
      }
      if (!contract.compiled_prompt.includes('NO_STAGE_NARRATION')) {
        issues.push('compiled_prompt must contain NO_STAGE_NARRATION');
      }
      if (!contract.compiled_prompt.includes('BROAD_COMMAND_BAN')) {
        issues.push('compiled_prompt must contain BROAD_COMMAND_BAN');
      }
      if (!contract.compiled_prompt.includes('SPLIT_REQUIRED')) {
        issues.push('compiled_prompt must contain SPLIT_REQUIRED');
      }
    }
  }

  return {
    ok: issues.length === 0,
    issues,
  };
}

export function compileDryRun(input = {}) {
  const normalizedInput = input && typeof input === 'object' ? input : {};
  const contract = compileOneTransactionContract(normalizedInput);
  const validation = validateCompiledContract(contract);
  const compiledPromptChars = contract.compiled_prompt.length;
  const metrics = {
    compiled_prompt_chars: compiledPromptChars,
    compiled_prompt_lines: contract.compiled_prompt.split('\n').length,
    allowed_scope_count: contract.allowed_scope.length,
    forbidden_scope_count: contract.forbidden_scope.length,
    internal_checklist_count: contract.internal_checklist.length,
    estimated_prompt_tokens: Math.ceil(compiledPromptChars / 4),
  };
  const warnings = [];
  const targetBudget = getBudgetLimit(normalizedInput.workflow_budget_target_tokens, 15000);
  const hardBudget = getBudgetLimit(normalizedInput.workflow_budget_hard_tokens, 40000);

  if (metrics.estimated_prompt_tokens > targetBudget) {
    warnings.push('BUDGET_TARGET_EXCEEDED');
  }
  if (contract.flags.report_line_cap === false || contract.flags.report_line_cap == null) {
    warnings.push('REPORT_LINE_CAP_MISSING');
  }
  if (contract.flags.broad_command_ban === false || contract.flags.broad_command_ban == null) {
    warnings.push('BROAD_COMMAND_BAN_MISSING');
  }
  if (contract.flags.no_stage_narration === false || contract.flags.no_stage_narration == null) {
    warnings.push('NO_STAGE_NARRATION_MISSING');
  }
  if (contract.flags.final_report_only === false || contract.flags.final_report_only == null) {
    warnings.push('FINAL_REPORT_ONLY_MISSING');
  }

  const blocked =
    !validation.ok ||
    metrics.estimated_prompt_tokens > hardBudget ||
    contract.flags.no_stage_narration !== true ||
    contract.flags.final_report_only !== true ||
    contract.flags.broad_command_ban !== true ||
    contract.flags.command_output_caps !== true ||
    contract.flags.split_required_trigger !== true ||
    !(contract.flags.report_line_cap === true || (Number.isInteger(contract.flags.report_line_cap) && contract.flags.report_line_cap > 0));

  return {
    ok: validation.ok && !blocked,
    contract,
    validation,
    metrics,
    warnings,
    blocked,
  };
}
