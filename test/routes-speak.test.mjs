import { test } from 'node:test'
import assert from 'node:assert/strict'
import { registerHttpRoutes } from '../lib/routes.js'
import { EventEmitter } from 'node:events'

function mockReqRes({ method = 'POST', body = '', headers = {} } = {}) {
  const req = new EventEmitter()
  req.method = method
  req.headers = headers
  req.url = '/dsh-tts/speak'
  const res = {
    statusCode: 0,
    headers: null,
    body: '',
    ended: false,
    writeHead(code, h) { this.statusCode = code; this.headers = h },
    end(chunk) { this.ended = true; if (chunk) this.body += chunk },
    destroy() { this.ended = true },
  }
  queueMicrotask(() => {
    if (body) req.emit('data', Buffer.from(body))
    req.emit('end')
  })
  return { req, res }
}

function makeCtx() {
  const routes = []
  return {
    routes,
    effect(fn, name) { const dispose = fn(); routes.push({ name, dispose }); return dispose },
    webServer: {
      register(route) { routes.push(route) },
    },
  }
}

test('registerHttpRoutes receives cleanText in api (speak must not ReferenceError)', () => {
  const ctx = makeCtx()
  const calls = []
  const api = {
    live: () => ({ language: 'en', maxChars: 0, chain: [], roles: {}, timeoutMs: 1000 }),
    modelManager: {},
    stats: {},
    speechCache: null,
    cleanText: (raw) => { calls.push(raw); return String(raw || '').trim() },
    synthesize: async () => { throw new Error('no engine') },
    credentialsView: () => ({}),
    configResponse: () => ({ ok: true }),
    storeProviderKey: async () => {},
    clearProviderKey: async () => {},
    pending: () => [],
  }
  registerHttpRoutes(ctx, api)
  const speak = ctx.routes.find((r) => r && r.path === '/dsh-tts/speak')
  assert.ok(speak, 'speak route must be registered')
  assert.equal(typeof api.cleanText, 'function')
})

test('speak handler returns JSON error instead of crashing when chain fails', async () => {
  const ctx = makeCtx()
  const api = {
    live: () => ({ language: 'en', maxChars: 0, chain: [{ provider: 'edge' }], roles: {}, timeoutMs: 50 }),
    modelManager: {},
    stats: {},
    speechCache: null,
    cleanText: (raw) => String(raw || '').trim(),
    synthesize: async () => { throw new Error('edge-tts unavailable') },
    credentialsView: () => ({}),
    configResponse: () => ({ ok: true }),
    storeProviderKey: async () => {},
    clearProviderKey: async () => {},
    pending: () => [],
  }
  registerHttpRoutes(ctx, api)
  const speak = ctx.routes.find((r) => r && r.path === '/dsh-tts/speak')
  const { req, res } = mockReqRes({ body: JSON.stringify({ text: 'hello' }) })
  await speak.handler(req, res)
  assert.equal(res.statusCode, 502)
  const parsed = JSON.parse(res.body)
  assert.equal(parsed.ok, false)
  assert.equal(parsed.error.code, 'chain')
  assert.match(parsed.error.message, /edge-tts unavailable/)
})

test('speak handler returns 400 no-text when cleanText strips input', async () => {
  const ctx = makeCtx()
  const api = {
    live: () => ({ language: 'en', maxChars: 0, chain: [], roles: {}, timeoutMs: 50 }),
    modelManager: {},
    stats: {},
    speechCache: null,
    cleanText: () => '',
    synthesize: async () => { throw new Error('should not run') },
    credentialsView: () => ({}),
    configResponse: () => ({ ok: true }),
    storeProviderKey: async () => {},
    clearProviderKey: async () => {},
    pending: () => [],
  }
  registerHttpRoutes(ctx, api)
  const speak = ctx.routes.find((r) => r && r.path === '/dsh-tts/speak')
  const { req, res } = mockReqRes({ body: JSON.stringify({ text: '   ' }) })
  await speak.handler(req, res)
  assert.equal(res.statusCode, 400)
  const parsed = JSON.parse(res.body)
  assert.equal(parsed.error.code, 'no-text')
})

test('index.js passes cleanText into registerHttpRoutes api', async () => {
  const { readFileSync } = await import('node:fs')
  const { fileURLToPath } = await import('node:url')
  const path = await import('node:path')
  const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')
  const src = readFileSync(path.join(root, 'lib/index.js'), 'utf8')
  assert.match(src, /registerHttpRoutes\(ctx,\s*\{[\s\S]*?cleanText,/, 'apply must pass cleanText to routes')
  const routesSrc = readFileSync(path.join(root, 'lib/routes.js'), 'utf8')
  assert.match(routesSrc, /const \{[\s\S]*?cleanText,[\s\S]*?\} = api/, 'routes must destructure cleanText from api')
})
