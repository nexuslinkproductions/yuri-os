"""M2.1: env_to_process edge emission — .env consumer mapping (metadata-only).

Orion M2.1 order (2026-08-04): emit env->process edges so the env_to_process
lens measures TRUE orphans instead of the structural gap (F-043: the graph had
zero env_to_process edges => every env_file carded).

Source: rev-pinned consumer mapping — git grep at ctx.revision over tracked
script/config files for env-file references (`source .env`, `--env-file=`,
`env_file=`, `dotenv.config({path: ...})`); resolve each reference relative to
the consumer's directory; emit env_to_process edge env_file:X -> file:consumer
only when X is in the tracked env-file inventory (metadata-only: env file
VALUES are never read or emitted — ids and reference strings only).

Determinism: git grep + git ls-tree at the pinned revision (branch- and
working-tree-independent, like file_inventory); sorted emission; no live
state. (M2.2: env inventory was working-tree rglob — now revision-pinned.)
"""
from __future__ import annotations
import os
import re
import subprocess
from .base import BaseScanner, ScanResult
from .env_files import tracked_env_files
from reconloop.model import Node, Edge

SCRIPT_EXTS = (".sh", ".mjs", ".js", ".cjs", ".ts", ".py", ".json")
# ref forms: source .env | --env-file=.env | env_file: '.env' | dotenv path
ENV_REF_RE = re.compile(
    r"(?:--env-file\s*[= ]\s*|env[-_]?file\s*['\"]?\s*[:=]\s*['\"]?|source\s+|"
    r"dotenv(?:\.config)?\s*\(\s*\{?\s*path\s*[:=]\s*['\"]?)"
    r"([^'\"\s,;}]+\.env[^'\"\s,;}]*?)['\"]?", re.IGNORECASE)


class EnvProcessEdgesScanner(BaseScanner):
    name = "env_process_edges"
    dim = "protected"

    def run(self, ctx) -> ScanResult:
        r = ScanResult()
        env_inventory = self._tracked_env_files(ctx)
        refs = self._git_grep_env_refs(ctx)
        edges = 0
        by_env: dict[str, int] = {}
        for consumer in sorted(refs):
            for env_path in sorted(set(refs[consumer])):
                if env_path not in env_inventory:
                    continue  # reference to a file that isn't a tracked env file
                r.edges.append(Edge(
                    from_=f"env_file:{env_path}", to=f"file:{consumer}",
                    kind="env_to_process", props={},
                    evidence=[f"git grep {ctx.revision} {consumer}"],
                    boundary="none"))
                edges += 1
                by_env[env_path] = by_env.get(env_path, 0) + 1
        r.nodes.append(Node(
            id="env_process_edges:consumers",
            kind="layer",
            props={"env_edges": edges,
                   "env_files_inventory": len(env_inventory),
                   "consumer_files": len(refs),
                   "envs_with_consumer": len(by_env),
                   "envs_by_refs": dict(sorted(by_env.items()))},
            evidence=[f"git grep {ctx.revision}"],
            src=self.name))
        r.nodes.sort(key=lambda n: n.id)
        r.edges.sort(key=lambda e: (e.from_, e.to, e.kind))
        return r

    def _tracked_env_files(self, ctx) -> set:
        """Env inventory: SAME revision-pinned inventory as the env_files
        scanner (git ls-tree -r --name-only <rev>, *.env* glob semantics,
        node_modules/.venv excluded) so emitted edges connect to the same
        env_file node ids the graph carries. M2.2: was working-tree rglob;
        now working-tree-independent like file_inventory."""
        return set(tracked_env_files(ctx))

    def _git_grep_env_refs(self, ctx) -> dict[str, list]:
        out: dict[str, list] = {}
        # one grep per pattern (no pathspecs — plain `git grep -n -E pat <rev>`
        # is reliable; filter consumer extensions in Python). POSIX ERE only:
        # no non-capturing groups.
        pattern = (r"--env-file[ =]|env[-_]?file|source[ ]+"
                   r"|dotenv(\.config)?\([ ]*\{[ ]*path[ :]|dotenv(\.config)?\([ ]*['\"]")
        try:
            p = subprocess.run(
                ["git", "grep", "-n", "-I", "-E", "-e", pattern, ctx.revision],
                cwd=ctx.root, capture_output=True, text=True, timeout=120)
        except Exception:
            return out
        if p.returncode not in (0, 1):
            return out
        for line in p.stdout.splitlines():
            parts = line.split(":", 2)
            if len(parts) < 3:
                continue
            consumer, content = parts[1], parts[2]
            if not consumer.endswith(SCRIPT_EXTS):
                continue
            for m in ENV_REF_RE.finditer(content):
                ref = m.group(1).strip().strip("'\"")
                if not ref or "process.env" in ref:
                    continue
                if ref.startswith("."):
                    cand = os.path.normpath(
                        os.path.join(os.path.dirname(consumer) or ".", ref))
                    cand = cand.lstrip("./")
                    out.setdefault(consumer, []).append(cand)
                elif ref.startswith("/"):
                    root = str(ctx.root)
                    if ref.startswith(root + "/"):
                        out.setdefault(consumer, []).append(ref[len(root) + 1:])
                else:
                    out.setdefault(consumer, []).append(ref)
        return out
