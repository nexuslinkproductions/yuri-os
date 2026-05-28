/**
 * nlp-ticket.js — Create a Plane.so issue from an NLP command.
 * POST { name, project, priority, due_date }
 */
const https = require("https");
const { PROJECTS, WORKSPACE } = require("./shared-config");

function planePost(path, body) {
  return new Promise((resolve) => {
    const data = JSON.stringify(body);
    const opts = {
      hostname: "api.plane.so",
      path: `/api/v1${path}`,
      method: "POST",
      headers: {
        "X-API-Key": process.env.PLANE_API_KEY,
        "Content-Type": "application/json",
        "Content-Length": Buffer.byteLength(data),
      },
    };
    let raw = "";
    const req = https.request(opts, (res) => {
      res.on("data", (c) => (raw += c));
      res.on("end", () => {
        try { resolve({ status: res.statusCode, body: JSON.parse(raw) }); }
        catch { resolve({ status: res.statusCode, body: {} }); }
      });
    });
    req.on("error", (e) => resolve({ status: 500, body: { error: e.message } }));
    req.write(data);
    req.end();
  });
}

const CORS = {
  "Access-Control-Allow-Origin": process.env.ALLOWED_ORIGIN || "https://ops.c2moviez.com",
  "Access-Control-Allow-Methods": "POST,OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

exports.handler = async (event) => {
  if (event.httpMethod === "OPTIONS") return { statusCode: 200, headers: CORS, body: "" };
  if (event.httpMethod !== "POST") return { statusCode: 405, headers: CORS, body: "Method Not Allowed" };

  const { checkAuth } = require("./auth-check");
  const fail = await checkAuth(event);
  if (fail) return fail;

  let payload;
  try { payload = JSON.parse(event.body || "{}"); } catch { return { statusCode: 400, headers: CORS, body: JSON.stringify({ error: "Invalid JSON" }) }; }

  const { name, project = "C2M", priority = "medium", due_date } = payload;
  if (!name || !name.trim()) return { statusCode: 400, headers: CORS, body: JSON.stringify({ error: "name is required" }) };

  // Resolve project ID — default to C2M for client work
  const proj = (project || "C2M").toUpperCase();
  const projectId = PROJECTS[proj] || PROJECTS.C2M;
  const workspace = WORKSPACE || "c2moviez";

  const issue = { name: name.trim(), priority };
  if (due_date) issue.target_date = due_date;

  const result = await planePost(`/workspaces/${workspace}/projects/${projectId}/issues/`, issue);

  if (result.status >= 400) {
    return { statusCode: result.status, headers: CORS, body: JSON.stringify({ error: "Plane API error", detail: result.body }) };
  }

  return {
    statusCode: 201,
    headers: { ...CORS, "Content-Type": "application/json" },
    body: JSON.stringify({
      id: result.body.sequence_id,
      ref: `${proj}-${result.body.sequence_id}`,
      name: result.body.name,
      priority: result.body.priority,
      due_date: result.body.target_date,
    }),
  };
};
