# /research

Offload research task to best available lane.

**Usage**: `/research <prompt>`

Routes automatically:
- Complex/reasoning work → `deepseek-v4-pro` (thinking enabled)
- Simple extraction → `deepseek-v4-flash` (faster, cheaper)

**Examples**:
```
/research "What are the latest trends in AI safety?"
/research "Analyze this codebase for security vulnerabilities"
```

Picks the most cost-effective lane for your task type.
