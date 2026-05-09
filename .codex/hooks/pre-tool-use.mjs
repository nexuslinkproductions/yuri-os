#!/usr/bin/env node

import { runHookFromStdin } from '../../Scripts/policy/nudimmud-safety-core.mjs';

await runHookFromStdin({ check: process.argv.includes('--check') });
