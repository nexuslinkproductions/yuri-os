#!/usr/bin/env node
// determinism-test.mjs — hash-pinned regen contract: run merge twice, assert identical sha256.
// Exit 0 = PASS (deterministic), exit 1 = FAIL.
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const GRAPH = path.resolve(path.dirname(fileURLToPath(import.meta.url)));
const run = () => { execFileSync(process.execPath, [path.join(GRAPH, "merge-prototype.mjs")], { cwd: GRAPH, encoding: "utf8" }); return fs.readFileSync(path.join(GRAPH, "merged.jsonl.sha256"), "utf8").trim(); };
const a = run(); const b = run();
console.log(a === b ? `DETERMINISM PASS ${a.slice(0, 16)}...` : `DETERMINISM FAIL ${a} != ${b}`);
process.exit(a === b ? 0 : 1);
