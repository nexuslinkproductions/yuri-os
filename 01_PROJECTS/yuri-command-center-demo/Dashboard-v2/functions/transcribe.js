/**
 * transcribe.js — OpenAI Whisper transcription endpoint
 * POST { audio_b64: string, language?: 'de'|'en'|'auto', format?: 'webm'|'wav'|'mp4' }
 * Returns { text, language, duration, segments: [{id, start, end, text}] }
 */
const https = require('https');
const { CORS, ok, err, options } = require('./shared');
const { checkAuth } = require('./auth-check');

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return options();
  if (event.httpMethod !== 'POST') return err('Method not allowed', 405);

  const authFail = await checkAuth(event);
  if (authFail) return authFail;

  const OPENAI_KEY = process.env.OPENAI_API_KEY;
  if (!OPENAI_KEY) return err('OpenAI key not configured', 500);

  let audio_b64, language, format;
  try {
    const body = JSON.parse(event.body || '{}');
    audio_b64 = body.audio_b64;
    language  = body.language  || 'de';
    format    = body.format    || 'webm';
  } catch { return err('Invalid JSON', 400); }

  if (!audio_b64 || audio_b64.length < 100) return err('No audio data', 400);

  const audioBuffer = Buffer.from(audio_b64, 'base64');
  const boundary    = '----WB' + Date.now().toString(36);
  const mimeType    = format === 'wav' ? 'audio/wav' : format === 'mp4' ? 'audio/mp4' : 'audio/webm';
  const ext         = format === 'wav' ? 'wav' : format === 'mp4' ? 'mp4' : 'webm';

  const fieldPart = (name, value) =>
    `--${boundary}\r\nContent-Disposition: form-data; name="${name}"\r\n\r\n${value}\r\n`;

  const parts = [
    Buffer.from(fieldPart('model', 'whisper-1')),
    Buffer.from(fieldPart('response_format', 'verbose_json')),
    Buffer.from(fieldPart('timestamp_granularities[]', 'segment')),
  ];
  if (language && language !== 'auto') {
    parts.push(Buffer.from(fieldPart('language', language)));
  }
  parts.push(Buffer.from(
    `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="audio.${ext}"\r\nContent-Type: ${mimeType}\r\n\r\n`
  ));
  parts.push(audioBuffer);
  parts.push(Buffer.from(`\r\n--${boundary}--\r\n`));

  const payload = Buffer.concat(parts);

  return new Promise((resolve) => {
    const opts = {
      hostname: 'api.openai.com',
      path: '/v1/audio/transcriptions',
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${OPENAI_KEY}`,
        'Content-Type': `multipart/form-data; boundary=${boundary}`,
        'Content-Length': payload.length,
      },
    };
    let data = '';
    const req = https.request(opts, (res) => {
      res.on('data', c => { data += c; });
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          if (parsed.error) {
            resolve(err(`Whisper error: ${parsed.error.message}`, 502));
          } else {
            resolve(ok({
              text:     parsed.text     || '',
              language: parsed.language || language,
              duration: parsed.duration || 0,
              segments: (parsed.segments || []).map(s => ({
                id:   s.id,
                start: Math.round(s.start * 10) / 10,
                end:   Math.round(s.end   * 10) / 10,
                text:  (s.text || '').trim(),
              })),
            }));
          }
        } catch { resolve(err('Whisper response parse error', 502)); }
      });
    });
    req.on('error', (e) => resolve(err('Whisper request failed: ' + e.message, 502)));
    req.write(payload);
    req.end();
  });
};
