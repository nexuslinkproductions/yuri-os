#!/usr/bin/env node

import { runHookFromStdin } from '../../_SYSTEM/Scripts/policy/nudimmud-safety-core.mjs';

await runHookFromStdin({ check: process.argv.includes('--check') });
