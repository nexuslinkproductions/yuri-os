// reasoning-finalize.mjs — capture-gap safety net for reasoning models (e.g. deepseek-v4-pro).
//
// Pure, dependency-free, and unit-testable (offload-runner.mjs imports kagami at module load,
// so the resolver lives here where it can be imported in isolation).
//
// The answer substance of a reasoning model can land in `reasoning_content` while `content`
// comes back empty/whitespace — most often when the thinking phase saturates max_tokens
// (finish_reason='length') before a content token is emitted (DeepSeek counts reasoning_tokens
// AGAINST max_tokens). Surfacing the empty content alone leaves the caller with nothing despite
// real model output. Prefer content; fall back to reasoning ONLY when content is blank.
//
// Nemotron-safe by construction: nemotron returns content normally and never populates
// reasoning_content, so the fallback branch never fires for it and its output is untouched.

export function resolveFinalText(content, reasoning, finishReason) {
  const c = typeof content === 'string' ? content : '';
  if (c.trim()) return c; // real content present (even if length-truncated) — return as-is
  const r = typeof reasoning === 'string' ? reasoning : '';
  if (r.trim()) {
    const truncated = finishReason === 'length';
    const tag = truncated
      ? '[reasoning-only — model exhausted its token budget thinking and returned no separate answer; raw reasoning follows]'
      : '[reasoning-only, no separate answer returned]';
    return `${tag}\n\n${r}`;
  }
  return c; // both empty — preserve the original empty-string contract
}
