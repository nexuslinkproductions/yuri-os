#!/usr/bin/env python3
"""Fail closed on unsafe Gemini policy files.

This guard blocks Gemini startup when any loaded policy TOML is malformed
or contains a rule priority above the supported ceiling.
"""

from __future__ import annotations

import sys
import os
from pathlib import Path

try:
    import tomllib
except ModuleNotFoundError:  # pragma: no cover
    import tomli as tomllib  # type: ignore


MAX_PRIORITY = 999
POLICY_DIR = Path(os.environ.get("GEMINI_POLICY_DIR", str(Path.home() / ".gemini" / "policies")))


def fail(message: str) -> int:
    print(f"Gemini policy hard stop: {message}", file=sys.stderr)
    return 1


def validate_rule(path: Path, index: int, rule: object) -> list[str]:
    errors: list[str] = []

    if not isinstance(rule, dict):
        return [f"{path}: rule #{index} is not a table"]

    tool_name = rule.get("toolName")
    decision = rule.get("decision")
    priority = rule.get("priority")

    if not isinstance(tool_name, str) or not tool_name:
        errors.append(f"{path}: rule #{index} missing valid toolName")

    if not isinstance(decision, str) or not decision:
        errors.append(f"{path}: rule #{index} missing valid decision")

    if not isinstance(priority, int):
        errors.append(f"{path}: rule #{index} missing integer priority")
    elif priority < 0 or priority > MAX_PRIORITY:
        errors.append(
            f"{path}: rule #{index} priority {priority} exceeds supported range 0-{MAX_PRIORITY}"
        )

    modes = rule.get("modes")
    if modes is not None and (
        not isinstance(modes, list) or any(not isinstance(item, str) for item in modes)
    ):
        errors.append(f"{path}: rule #{index} modes must be a list of strings")

    subagent = rule.get("subagent")
    if subagent is not None and not isinstance(subagent, str):
        errors.append(f"{path}: rule #{index} subagent must be a string")

    return errors


def main() -> int:
    if not POLICY_DIR.exists():
        return 0

    errors: list[str] = []

    for path in sorted(POLICY_DIR.glob("*.toml")):
        try:
            with path.open("rb") as fh:
                data = tomllib.load(fh)
        except tomllib.TOMLDecodeError as exc:
            errors.append(f"{path}: TOML parse error: {exc}")
            continue
        except OSError as exc:
            errors.append(f"{path}: read error: {exc}")
            continue

        rules = data.get("rule")
        if rules is None:
            errors.append(f"{path}: missing [[rule]] entries")
            continue
        if not isinstance(rules, list):
            errors.append(f"{path}: rule root must be an array of tables")
            continue

        for index, rule in enumerate(rules, start=1):
            errors.extend(validate_rule(path, index, rule))

    if errors:
        print("Gemini policy hard stop: unsafe policy file(s) detected", file=sys.stderr)
        for error in errors:
            print(f"- {error}", file=sys.stderr)
        return 1

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
