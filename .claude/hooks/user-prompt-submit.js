#!/usr/bin/env node
/**
 * UserPromptSubmit Hook
 * Detects end-of-session keywords (done/finished/end) and triggers EOT cleanly
 */

const EOT_KEYWORDS = ['done', 'finished', 'end'];

let raw = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', c => raw += c);
process.stdin.on('end', () => {
  try {
    const event = JSON.parse(raw);
    const { messages } = event;

    if (!Array.isArray(messages) || messages.length === 0) {
      process.exit(0);
      return;
    }

    // Check the last user message for EOT keywords
    const lastMsg = messages[messages.length - 1];
    if (!lastMsg || lastMsg.role !== 'user') {
      process.exit(0);
      return;
    }

    const content = lastMsg.content || [];
    const text = Array.isArray(content)
      ? content.filter(b => b.type === 'text').map(b => b.text).join(' ')
      : String(content);

    const trimmed = text.trim().toLowerCase();
    const isEOTKeyword = EOT_KEYWORDS.some(kw => trimmed === kw);

    if (isEOTKeyword) {
      // Signal EOT completion — respond with correct format
      console.log(JSON.stringify({
        continue: false,
        systemMessage: '⏹ EOT triggered. Finishing session reflection...'
      }));
      process.exit(0);
    }

    // Continue normally
    console.log(JSON.stringify({
      continue: true
    }));
    process.exit(0);
  } catch (e) {
    // Silent fail — let the submission proceed
    console.log(JSON.stringify({ continue: true }));
    process.exit(0);
  }
});
