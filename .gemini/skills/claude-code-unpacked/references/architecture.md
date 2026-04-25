# Claude Code Architecture & Unpacked Insights

## Core Architecture: The Agent Loop
Claude Code operates on a tight `Model -> Tool Call -> Execution -> Model` loop.
- **Agentic Core**: Manages the state machine of the conversation and tool execution.
- **Tool System**: A registry of capabilities (read, write, grep, shell) with strict permissioning.
- **Permission Model**: Multi-tier system (User, Session, Project) to manage security risks.

## Internal Mechanisms (Leaked Insights)
- **Anti-Distillation**: Injects "fake" tool calls to pollute data if scraped for training other models.
- **Undercover Mode**: Prompt instructions to write code and commit messages like a human (avoiding "AI-generated" markers).
- **Frustration Detection**: Uses a large regex of swear words/negative patterns to adjust tone when users are angry.
- **KAIROS**: Persistent mode with long-term memory.
- **ULTRAPLAN**: High-reasoning planning sessions using "Opus" class models.

## Easter Eggs
- **Tengu (Buddy)**: A terminal-based pet system. Pets (ducks, capybaras, dragons) hatch and react to coding progress. Appearance tied to user account hash.

## Local Execution Considerations
Running the leaked source requires:
1. Reconstructing the TypeScript environment.
2. Handling or mocking Anthropic's internal APIs (unless valid keys are provided).
3. Bypassing or configuring the complex permission system.
