/**
 * whisper-transcribe — Netlify function fallback for Whisper transcription.
 * Used when the local Whisper server (localhost:9876) is unreachable (mobile / remote).
 * Accepts multipart/form-data with fields:
 *   audio   — audio blob (webm/ogg/wav/mp4)
 *   lang    — optional language hint (default: "de")
 *   prompt  — optional Whisper context prompt
 */
const https = require("https");
const { Readable } = require("stream");

const OPENAI_KEY = process.env.OPENAI_API_KEY;

exports.handler = async (event) => {
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: "Method not allowed" };
  }
  if (!OPENAI_KEY) {
    return { statusCode: 503, body: JSON.stringify({ error: "OpenAI key not configured" }) };
  }

  try {
    const body = Buffer.from(event.body, event.isBase64Encoded ? "base64" : "utf8");
    const ct = event.headers["content-type"] || "";
    const boundary = ct.split("boundary=")[1];
    if (!boundary) return { statusCode: 400, body: JSON.stringify({ error: "Missing multipart boundary" }) };

    const parts = parseMultipart(body, boundary);
    const audioPart = parts.find((p) => p.name === "audio");
    const lang = (parts.find((p) => p.name === "lang")?.data?.toString() || "de").trim();
    const prompt = parts.find((p) => p.name === "prompt")?.data?.toString() || "";

    if (!audioPart) return { statusCode: 400, body: JSON.stringify({ error: "No audio field" }) };

    const result = await callOpenAIWhisper(audioPart.data, audioPart.filename || "audio.webm", lang, prompt);
    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: result.text }),
    };
  } catch (err) {
    console.error("whisper-transcribe error:", err.message);
    return { statusCode: 500, body: JSON.stringify({ error: err.message }) };
  }
};

function callOpenAIWhisper(audioBuffer, filename, lang, prompt) {
  return new Promise((resolve, reject) => {
    const CRLF = "\r\n";
    const bnd = "----FormBoundary" + Date.now();

    let header = "";
    header += `--${bnd}${CRLF}`;
    header += `Content-Disposition: form-data; name="file"; filename="${filename}"${CRLF}`;
    header += `Content-Type: audio/webm${CRLF}${CRLF}`;
    const headerBuf = Buffer.from(header, "utf8");

    let model = `${CRLF}--${bnd}${CRLF}Content-Disposition: form-data; name="model"${CRLF}${CRLF}whisper-1`;
    let langField = lang ? `${CRLF}--${bnd}${CRLF}Content-Disposition: form-data; name="language"${CRLF}${CRLF}${lang}` : "";
    let promptField = prompt ? `${CRLF}--${bnd}${CRLF}Content-Disposition: form-data; name="prompt"${CRLF}${CRLF}${prompt}` : "";
    let footer = `${CRLF}--${bnd}--${CRLF}`;

    const payload = Buffer.concat([
      headerBuf,
      audioBuffer,
      Buffer.from(model + langField + promptField + footer, "utf8"),
    ]);

    const opts = {
      method: "POST",
      hostname: "api.openai.com",
      path: "/v1/audio/transcriptions",
      headers: {
        Authorization: `Bearer ${OPENAI_KEY}`,
        "Content-Type": `multipart/form-data; boundary=${bnd}`,
        "Content-Length": payload.length,
      },
    };

    const req = https.request(opts, (res) => {
      let data = "";
      res.on("data", (c) => (data += c));
      res.on("end", () => {
        try {
          const j = JSON.parse(data);
          if (j.error) reject(new Error(j.error.message || JSON.stringify(j.error)));
          else resolve(j);
        } catch (e) {
          reject(new Error("Invalid JSON from OpenAI: " + data.slice(0, 200)));
        }
      });
    });
    req.on("error", reject);
    req.write(payload);
    req.end();
  });
}

function parseMultipart(buffer, boundary) {
  const sep = Buffer.from("--" + boundary);
  const parts = [];
  let start = 0;
  while (start < buffer.length) {
    const idx = buffer.indexOf(sep, start);
    if (idx === -1) break;
    const end = buffer.indexOf(sep, idx + sep.length);
    if (end === -1) break;
    const chunk = buffer.slice(idx + sep.length + 2, end - 2); // skip \r\n
    const headerEnd = chunk.indexOf("\r\n\r\n");
    if (headerEnd === -1) { start = end; continue; }
    const hdrs = chunk.slice(0, headerEnd).toString();
    const data = chunk.slice(headerEnd + 4);
    const nameMath = hdrs.match(/name="([^"]+)"/);
    const fileMath = hdrs.match(/filename="([^"]+)"/);
    if (nameMath) parts.push({ name: nameMath[1], filename: fileMath?.[1], data });
    start = end;
  }
  return parts;
}
