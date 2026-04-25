# CLI Workflow

Small launcher for the terminal tools already installed on this machine.

## Entry Point

- `./Scripts/ai`

## Commands

- `./Scripts/ai code .`
  - Opens the repo in VS Code.

- `./Scripts/ai claude "question"`
  - Runs Claude interactively if no prompt is passed.
  - Runs `claude --print` for one-shot prompts.

- `./Scripts/ai gemini "question"`
  - Runs Gemini interactively if no prompt is passed.
  - Runs `gemini -p` for one-shot prompts.

- `./Scripts/ai codex "question"`
  - Runs Codex interactively if no prompt is passed.
  - Runs `codex exec` for one-shot prompts.
  - Runs `./Scripts/ai @kimi "question"` for Kimi offload.
  - Runs `./Scripts/ai @gpt-oss "question"` for local GPT-OSS offload.
  - Runs `./Scripts/ai @ollama "question"` for local Ollama offload.
  - Runs `./Scripts/ai @swarm "question"` to fan out to all three lanes in parallel and print each result.

- `./Scripts/ai @kimi "question"`
  - Short alias for Codex offload through Kimi.

- `./Scripts/ai @gpt-oss "question"`
  - Short alias for Codex offload through local GPT-OSS.

- `./Scripts/ai @ollama "question"`
  - Short alias for Codex offload through local Ollama.

- `./Scripts/ai @swarm "question"`
  - Fan-out lane: runs Kimi, GPT-OSS, and Ollama in parallel, then prints each output for comparison.

- `./Scripts/ai triage "question"`
  - Runs Claude, Gemini, and Codex in parallel.
  - Good for research, cross-checks, and quick second opinions.

## Suggested Pattern

1. Open the repo in VS Code with `./Scripts/ai code .`
2. Use one model for a focused task.
3. Use `triage` when the answer is ambiguous or high leverage.
4. Keep shell work in the terminal and chat for decisions only.
