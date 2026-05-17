#!/usr/bin/env node
import { main } from './weekly-comp.mjs';

if (process.argv[1]?.endsWith('weekly-consolidation.mjs')) {
  main().catch(err => {
    console.error(err.message);
    process.exit(1);
  });
}

export * from './weekly-comp.mjs';
