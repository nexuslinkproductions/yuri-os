/**
 * netlify-adapter.js — Adapts Netlify Function handlers to Express middleware
 *
 * Netlify: async handler(event, context) → { statusCode, headers, body }
 * Express: (req, res) → res.status(n).set(headers).send(body)
 */

'use strict';

function netlifyadapter(mod) {
  const fn = mod.handler || mod.default || mod;
  if (typeof fn !== 'function') throw new Error(`netlify-adapter: module has no handler export`);

  return async (req, res) => {
    const event = {
      httpMethod: req.method,
      path: req.path,
      headers: req.headers,
      queryStringParameters: req.query || {},
      body: req.body ? (typeof req.body === 'string' ? req.body : JSON.stringify(req.body)) : null,
      isBase64Encoded: false,
    };
    const context = {
      // scheduled = true when called by PM2 cron via _internal/scheduled/*
      schedule: req.path.startsWith('/_internal/scheduled/') ? '0 0 * * *' : undefined,
    };

    try {
      const result = await fn(event, context);
      const { statusCode = 200, headers = {}, body = '' } = result || {};
      res.status(statusCode).set(headers).send(body);
    } catch (err) {
      console.error(`[adapter] ${req.path} threw:`, err.message);
      res.status(500).json({ error: 'internal server error' });
    }
  };
}

module.exports = { netlifyadapter };
