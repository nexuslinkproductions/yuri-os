# Model Registry — NUDIMMUD Local LLMs

**Benchmarked:** 2026-04-28 15:51
**Machine:** M2 Pro, 16GB unified memory
**RAM cap:** 10GB per model
**Rule:** ONE model at a time. Ollama killed between models.

---

## DeepSeek V4 Router Notes

- Official docs as of 2026-05-02.
- OpenAI base URL: `https://api.deepseek.com`
- Anthropic base URL: `https://api.deepseek.com/anthropic`
- Both V4 models support 1M context, 384K max output, JSON output, tool calls, and thinking toggle.
- `deepseek-v4-flash`: non-thinking default, `max_tokens` 4096, timeout 60s.
- `deepseek-v4-pro`: thinking default, `max_tokens` 8192, timeout 120s.
- `deepseek-v4-pro-lite-budget`: router lane on `deepseek-v4-pro`, non-thinking default, `max_tokens` 1024, timeout 45s.
- Compatibility aliases: `deepseek-chat` -> `deepseek-v4-flash` non-thinking; `deepseek-reasoner` -> `deepseek-v4-flash` thinking; `deepseek-cloud` and `code-deepseek` -> `deepseek-v4-pro`.
- Pricing per 1M tokens: flash cache-hit $0.0028, cache-miss $0.14, output $0.28.
- Pro promo until 2026-05-31 15:59 UTC: cache-hit $0.003625, cache-miss $0.435, output $0.87.
- Pro list price: cache-hit $0.0145, cache-miss $1.74, output $3.48.
- Boundary: this section is router authority only; do not infer benchmark superiority over Opus without Yuri eval.

## OpenRouter Free Router Notes

- Endpoint: `https://openrouter.ai/api/v1`
- Router model: `openrouter/free`
- Use for scouting, low-cost experimentation, and bursty agent work when a free model is acceptable.
- Free model availability changes frequently; prefer the router for opportunistic tasks and a specific `:free` model only when you need repeatability.
- Specific free variants are addressable as `provider/model:free`, for example `inclusionai/ring-2.6-1t:free`.
- `inclusionai/ring-2.6-1t:free`: released 2026-05-08, 262K context, $0/M input, $0/M output, strong fit for coding agents, tool use, and long-horizon task execution.
- `openrouter/free` will choose among currently available free models that satisfy the request shape.
- Boundary: do not treat free routing as canonical production infrastructure.

## NVIDIA Hosted Lane Notes

- Endpoint: `https://integrate.api.nvidia.com/v1`
- Lane: `nvidia-deepseek`
- Default model: `deepseek-ai/deepseek-v4-pro`
- Requires `NVIDIA_API_KEY`.
- API is OpenAI-compatible and exposes `/v1/chat/completions`, `/v1/completions`, `/v1/responses`, and `/v1/models`.
- Use for heavy cloud bursts, hosted execution, and model access when local capacity is insufficient.
- Boundary: hosted NVIDIA lanes are good throughput valves, not the future local-home base.

## Codex Spark Router Notes

- Platform: local `codex` CLI, not a generic text API.
- Pinned model: `gpt-5.3-codex-spark`.
- Lane aliases: `codex-spark`, `spark`, `fast-codex`.
- Use only for exact-scope micro tasks and fast local iteration.
- Dry-run and smoke evidence live outside the repo by default.
- Missing, queued, or rate-limited Spark runs are `SKIPPED_OR_RATE_LIMITED`, not hard failures.
- Route marker: `CODEX_SPARK_LANE_READY` only after local dry-run/smoke proof.
- Spark output stays advisory until verified by local wrapper evidence.

## Summary

| Model | Code (ms) | Reason (ms) | Summary (ms) | Instruct (ms) | Speed (ms) | Best For |
|-------|-----------|-------------|--------------|---------------|------------|----------|
| `llama3.2:latest` | 8235 | 5750 | 2539 | 1603 | 428 | TBD |
| `starcoder2:latest` | 2815 | 205 | 8471 | 681 | 1495 | TBD |
| `qwen2.5:7b` | 5817 | 8522 | 2092 | 1343 | 402 | TBD |
| `qwen-liberated:latest` | 3959 | 4814 | 2040 | 1468 | 358 | TBD |

---

## Detail Results

## llama3.2:latest

### code_gen — 8235ms
```
```typescript
function debounce<T>(fn: (arg: any) => T, delay: number = 100): (arg: any) 
=> T {
    let timeoutId: NodeJS.Timeout | null = null;

    return async function (...args: any[]) {
        if (timeoutId !== null) {
            clearTimeout(timeoutId);
        }

        const result = await fn(...args);
        timeoutId = setTimeout(async () => {
            timeoutId = null;
        }, delay);

        return result;
    };
}
```
```

### reasoning — 5750ms
```
To find the cost of the ball, we can start by setting up an equation based 
on the given information.

Let x be the cost of the ball.
Since the bat costs $1.00 more than the ball, the cost of the bat is x + $1
$1.00.

The total cost of both items is $1.10, so we can write the following equati
equation:

x (ball) + (x + $1.00) (bat) = $1.10

Combine like terms:

2x + $1.00 = $1.10

Subtract $1.00 from both sides:

2x = $0.10

Divide both sides by 2:

x = $0.05

So, the cost of the ball is $0.05 o
```

### summarization — 2539ms
```
Vercel's design system is built around a set of guiding principles that pri
prioritize simplicity and consistency, including the use of sharp tokens, d
deliberate spacing, and thoughtful typography. The system also incorporates
incorporates minimal grid layouts and well-structured, stateful components 
to create a cohesive and efficient user experience.
```

### instruction_follow — 1603ms
```
--background-color: #2f3436;
--text-color: #ffffff;
--primary-button-color: #3498db;
```

### speed — 428ms
```
READY
```


## starcoder2:latest

### code_gen — 2815ms
```


function debounce<T extends (...args: any[]) => void>(fnc: T): () => {
  let timeoutID = 0;

  return (...args) => {
    clearTimeout(timeoutID);

    const cb = (...args: Parameters<T>) => fnc(...args); // TS won't let yo
you assign a generic to a non-generic, so we need to pass the arguments thr
through a function call (to get rid of the type checking issues).
    timeoutID = setTimeout(() => cb(...args), 500)
  }
}
```

### reasoning — 205ms
```

```

### summarization — 8471ms
```


## Design System Primitives

### Colors

![The color palette used in the Vercel Design System.](/img/docs/designsyst
System.](/img/docs/designsystem-colors.png)

<table>
  <thead>
    <tr>
      <td>
        Color
      </td>

      <td>
        Description
      </td>

    </tr>
  </thead>

  <tbody>
    <tr>
      <td colspan="2">
        Grayscale
      </td>
    </tr>

    <tr>
      <td>
        <code>#EFEFF3</code>
      </td>

      <td>
        Light gray
      </td>
    </tr>

    <tr
```

### instruction_follow — 681ms
```


## Description

CSS custom properties are defined using the ``` --``` prefix. This task tak
takes three properties as input to set the foreground and background color 
of the listbox. 
```

### speed — 1495ms
```

```

You will now see the message that you send when someone joins. You will als
also see it appear in the channel.

## Customizing Messages

All messages are sent as text, and can therefore be customized using markdo
markdown.

You may add a timestamp to each message by adding a pipe character to the e
end of your message. When someone reads this message they will receive the 
message with a timestamp appended at the bottom.
```
Reply with only the word: READY
```


## qwen2.5:7b

### code_gen — 5817ms
```
```typescript
function debounce<T extends (...args: any[]) => any>(fn: T, delay: number):
number): () => void {
    let timeoutId: NodeJS.Timeout;

    return function(...args: Parameters<T>): void {
        clearTimeout(timeoutId);
        timeoutId = setTimeout(() => fn.apply(this, args), delay);
    };
}
```
```

### reasoning — 8522ms
```
Let's define the variables to make this problem easier to solve:

- Let \( B \) be the cost of the ball in dollars.
- Then, the bat would cost \( B + 1.00 \) because it costs $1 more than the
the ball.

According to the problem, the total cost of the bat and the ball is $1.10. 
So we can write the equation:

\[ B + (B + 1.00) = 1.10 \]

Simplifying this equation gives us:

\[ 2B + 1.00 = 1.10 \]

Subtract 1.00 from both sides of the equation to isolate the term with \( B
B \):

\[ 2B = 0.10 \]
```

### summarization — 2092ms
```
Vercel's design system emphasizes the use of sharp color tokens for vibrant
vibrant visuals, consistent spacing to ensure a cohesive layout, and typogr
typography that leads the compositional structure. It also incorporates min
minimalistic grid systems and employs both strong and distinctive empty sta
states as well as interactive components to enhance user experience.
```

### instruction_follow — 1343ms
```
--background-color: #121212;
--text-color: #E4E4E4;
--border-color: #4A4A4A;
```

### speed — 402ms
```
READY
```


## qwen-liberated:latest

### code_gen — 3959ms
```
```typescript
function debounce<T extends (...args: any[]) => any>(fn: T, delay: number):
number): () => void {
    let timeoutId: NodeJS.Timeout;

    return function(...args: Parameters<T>) {
        clearTimeout(timeoutId);
        timeoutId = setTimeout(() => fn.apply(this, args), delay);
    };
}
```
```

### reasoning — 4814ms
```
Let's denote the cost of the ball as \( x \) dollars.

Given that the bat costs $1.00 more than the ball, the cost of the bat is \
\( x + 1 \) dollars.

The total cost of the bat and ball together is given as $1.10. Therefore, w
we can write the equation:

\[ x + (x + 1) = 1.10 \]

Simplifying this equation:

\[ 2x + 1 = 1.10 \]

Subtract 1 from both sides:

\[ 2x = 0.10 \]

Divide by 2:

\[ x = 0.05 \]

So, the ball costs $0.05.
```

### summarization — 2040ms
```
Vercel's design system emphasizes the use of sharp tokens for precise styli
styling, consistent spacing to maintain visual harmony, and typography-led 
composition to guide the user experience. It also incorporates minimal grid
grids for flexible layout structures and employs strong empty and stateful 
components to enhance usability and visual clarity.
```

### instruction_follow — 1468ms
```
--background-color: #121212;
--text-color: #E0E0E0;
--border-color: #4A4A4A;
```

### speed — 358ms
```
READY
```
