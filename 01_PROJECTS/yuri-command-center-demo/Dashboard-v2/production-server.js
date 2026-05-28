// production-server.js — replaces Netlify hosting
// Runs SvelteKit (adapter-node) + all Netlify functions on a plain Node server.
// Start with PM2: pm2 start production-server.js --name ops-dashboard

import express from 'express'
import { readdirSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
import { createRequire } from 'module'
import dotenv from 'dotenv'

const __dirname = dirname(fileURLToPath(import.meta.url))
dotenv.config({ path: join(__dirname, '.env') })

// Raw body capture for HMAC webhook verification (Plane, Outlook, Telegram)
function rawBodyMiddleware(req, res, next) {
  let data = []
  req.on('data', chunk => data.push(chunk))
  req.on('end', () => {
    req.rawBody = Buffer.concat(data)
    const ct = req.headers['content-type'] || ''
    if (ct.includes('application/json')) {
      try { req.body = JSON.parse(req.rawBody.toString()) } catch { req.body = {} }
    } else if (ct.includes('application/x-www-form-urlencoded')) {
      req.body = Object.fromEntries(new URLSearchParams(req.rawBody.toString()))
    } else {
      req.body = req.rawBody.toString()
    }
    next()
  })
}

const app = express()

// ── Netlify function shim ────────────────────────────────────────────────────
const functionsDir = join(__dirname, 'netlify/functions')
const SKIP_PREFIXES = ['shared', 'brand-configs', 'client-match-rules']
const functionModules = {}

async function loadFunctions() {
  const files = readdirSync(functionsDir, { withFileTypes: true })
    .filter(f => f.isFile() && f.name.endsWith('.js') &&
      !SKIP_PREFIXES.some(p => f.name.startsWith(p)))
    .map(f => f.name)

  const require = createRequire(import.meta.url)

  for (const file of files) {
    const name = file.replace('.js', '')
    try {
      // Functions are CJS; require() them so exports.handler works
      const mod = require(join(functionsDir, file))
      const handler = mod.handler || mod.default?.handler
      if (typeof handler === 'function') {
        functionModules[name] = handler
        console.log(`  + ${name}`)
      } else {
        console.warn(`  - ${name}: no handler export`)
      }
    } catch (e) {
      console.warn(`  ! ${name}: ${e.message}`)
    }
  }
  console.log(`\nFunctions loaded: ${Object.keys(functionModules).length}`)
}

// ── Internal scheduled trigger (localhost-only, no auth required) ────────────
// PM2 cron jobs call POST /_internal/scheduled/:name from 127.0.0.1.
// We rewrite to the Netlify function shim with a signed internal auth header.
import crypto from 'crypto'
app.post('/_internal/scheduled/:name', rawBodyMiddleware, async (req, res) => {
  const { name } = req.params
  const fn = functionModules[name]
  if (!fn) return res.status(404).json({ error: `Function '${name}' not found` })

  // Reject requests not from loopback
  const ip = req.socket.remoteAddress || ''
  if (ip !== '127.0.0.1' && ip !== '::1' && ip !== '::ffff:127.0.0.1') {
    return res.status(403).json({ error: 'Forbidden' })
  }

  const body = '{}'
  const ts = String(Date.now())
  const key = process.env.INTERNAL_SERVICE_KEY || ''
  const sig = key ? crypto.createHmac('sha256', key).update(ts + '.' + body).digest('hex') : ''

  const event = {
    httpMethod: 'POST',
    path: req.path,
    headers: {
      'content-type': 'application/json',
      'x-internal-timestamp': ts,
      'x-internal-sig': sig,
    },
    queryStringParameters: {},
    multiValueQueryStringParameters: {},
    body,
    isBase64Encoded: false,
    rawUrl: `http://localhost:${process.env.PORT || 3000}${req.path}`,
    rawQuery: '',
  }
  const context = {
    functionName: name,
    functionVersion: '$LATEST',
    awsRequestId: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
    getRemainingTimeInMillis: () => 26000,
  }
  try {
    const result = await fn(event, context)
    if (result.headers) Object.entries(result.headers).forEach(([k, v]) => res.setHeader(k, v))
    res.status(result.statusCode || 200).send(result.body ?? '')
  } catch (err) {
    console.error(`[scheduled:${name}]`, err.message)
    res.status(500).json({ error: 'Function error', detail: err.message })
  }
})

app.all('/.netlify/functions/:name', rawBodyMiddleware, async (req, res) => {
  const { name } = req.params
  const fn = functionModules[name]
  if (!fn) {
    return res.status(404).json({ error: `Function '${name}' not found` })
  }

  const isGet = req.method === 'GET' || req.method === 'HEAD'
  const bodyStr = isGet ? null : (req.rawBody ? req.rawBody.toString() : JSON.stringify(req.body))

  const event = {
    httpMethod: req.method,
    path: req.path,
    headers: req.headers,
    queryStringParameters: req.query,
    multiValueQueryStringParameters: Object.fromEntries(
      Object.entries(req.query).map(([k, v]) => [k, Array.isArray(v) ? v : [v]])
    ),
    body: bodyStr,
    isBase64Encoded: false,
    rawUrl: `${req.protocol}://${req.get('host')}${req.originalUrl}`,
    rawQuery: req.originalUrl.split('?')[1] || '',
  }

  const context = {
    functionName: name,
    functionVersion: '$LATEST',
    awsRequestId: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
    getRemainingTimeInMillis: () => 26000,
  }

  try {
    const result = await fn(event, context)
    if (result.headers) {
      Object.entries(result.headers).forEach(([k, v]) => res.setHeader(k, v))
    }
    if (result.multiValueHeaders) {
      Object.entries(result.multiValueHeaders).forEach(([k, vals]) =>
        Array.isArray(vals) ? vals.forEach(v => res.append(k, v)) : res.setHeader(k, vals)
      )
    }
    res.status(result.statusCode || 200).send(result.body ?? '')
  } catch (err) {
    console.error(`[fn:${name}]`, err.message)
    res.status(500).json({ error: 'Function error', detail: err.message })
  }
})

// ── SvelteKit (everything else) ──────────────────────────────────────────────
// Lazy-import the ESM build so startup can await loadFunctions first
const { handler: svelteHandler } = await import('./build/handler.js')
app.use(svelteHandler)

// ── Boot ─────────────────────────────────────────────────────────────────────
await loadFunctions()
const PORT = parseInt(process.env.PORT || '3000')
app.listen(PORT, '0.0.0.0', () => {
  console.log(`\nops.c2moviez.com running on :${PORT}`)
  console.log(`  SvelteKit  -> /`)
  console.log(`  Functions  -> /.netlify/functions/:name`)
})
