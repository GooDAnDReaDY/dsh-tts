import { test } from 'node:test'
import assert from 'node:assert/strict'
import { registerHttpRoutes } from '../lib/routes.js'
import { EventEmitter } from 'node:events'
import { addStreamSubscriber, removeStreamSubscriber, broadcastStream, clearStreamSubscribers } from '../lib/stream-hub.js'

function mockReqRes({ method = 'GET', body = '', headers = {}, url = '/' } = {}) {
  const req = new EventEmitter()
  req.method = method
  req.headers = headers
  req.url = url
  let statusCode = 200
  let writtenHeaders = null
  let data = ''
  let ended = false
  const res = {
    get statusCode() { return statusCode },
    set statusCode(code) { statusCode = code },
    get headers() { return writtenHeaders },
    get body() { return data },
    get ended() { return ended },
    writeHead(code, h) { statusCode = code; writtenHeaders = h },
    write(chunk) { data += chunk },
    end(chunk) { if (chunk) data += chunk; ended = true },
    destroy() { ended = true }
  }
  queueMicrotask(() => {
    if (body) req.emit('data', Buffer.from(body))
    req.emit('end')
  })
  return { req, res }
}

function makeCtx() {
  const routes = new Map()
  return {
    routes,
    effect(fn) { return fn() },
    webServer: {
      register(route) { routes.set(route.path, route) }
    }
  }
}

test('routes.js: /dsh-tts/status handles GET and rejects other methods', async () => {
  const ctx = makeCtx()
  registerHttpRoutes(ctx, {
    live: () => ({ speakReplies: true, rate: 1.0, chain: [] }),
    modelManager: {},
    stats: { total: 0, cacheHits: 0, errors: 0, providers: {} },
    speechCache: { clear: async () => 5 },
    cleanText: (t) => t,
    synthesize: async () => ({ provider: 'test', mime: 'audio/mpeg', audio: Buffer.from([]), tookMs: 10 }),
    credentialsView: async () => ({}),
    configResponse: () => ({}),
    storeProviderKey: async () => 'ref1',
    clearProviderKey: async () => 'ref1',
    pending: [],
    getSettingsApi: () => null,
    validateConfig: () => ({ valid: true })
  })

  const statusRoute = ctx.routes.get('/dsh-tts/status')
  assert.ok(statusRoute)

  // POST should return 405
  const { req: pReq, res: pRes } = mockReqRes({ method: 'POST' })
  await statusRoute.handler(pReq, pRes)
  assert.equal(pRes.statusCode, 405)

  // GET should return 200
  const { req: gReq, res: gRes } = mockReqRes({ method: 'GET' })
  await statusRoute.handler(gReq, gRes)
  assert.equal(gRes.statusCode, 200)
  const json = JSON.parse(gRes.body)
  assert.equal(json.ok, true)
  assert.equal(json.speakReplies, true)
})

test('routes.js: /dsh-tts/cache handles DELETE with trusted origin and clears cache', async () => {
  const ctx = makeCtx()
  let cleared = false
  registerHttpRoutes(ctx, {
    live: () => ({}),
    modelManager: {},
    stats: { total: 0, cacheHits: 0, errors: 0, providers: {} },
    speechCache: { clear: async () => { cleared = true; return 42 } },
    cleanText: (t) => t,
    synthesize: async () => ({}),
    credentialsView: async () => ({}),
    configResponse: () => ({}),
    storeProviderKey: async () => '',
    clearProviderKey: async () => '',
    pending: [],
    getSettingsApi: () => null,
    validateConfig: () => ({})
  })

  const cacheRoute = ctx.routes.get('/dsh-tts/cache')
  
  // GET should return 405
  const { req: gReq, res: gRes } = mockReqRes({ method: 'GET' })
  await cacheRoute.handler(gReq, gRes)
  assert.equal(gRes.statusCode, 405)

  // DELETE without origin (same-origin / trusted) should succeed
  const { req: dReq, res: dRes } = mockReqRes({ method: 'DELETE', headers: { 'sec-fetch-site': 'same-origin' } })
  await cacheRoute.handler(dReq, dRes)
  assert.equal(dRes.statusCode, 200)
  assert.equal(cleared, true)
  const json = JSON.parse(dRes.body)
  assert.equal(json.removed, 42)
})

test('routes.js: /dsh-tts/stats returns statistics', async () => {
  const ctx = makeCtx()
  registerHttpRoutes(ctx, {
    live: () => ({}),
    modelManager: {},
    stats: { total: 100, cacheHits: 80, errors: 2, providers: { edge: 98 } },
    speechCache: { clear: async () => 0 },
    cleanText: (t) => t,
    synthesize: async () => ({}),
    credentialsView: async () => ({}),
    configResponse: () => ({}),
    storeProviderKey: async () => '',
    clearProviderKey: async () => '',
    pending: [],
    getSettingsApi: () => null,
    validateConfig: () => ({})
  })

  const statsRoute = ctx.routes.get('/dsh-tts/stats')
  const { req, res } = mockReqRes({ method: 'GET' })
  await statsRoute.handler(req, res)
  assert.equal(res.statusCode, 200)
  const json = JSON.parse(res.body)
  assert.equal(json.total, 100)
  assert.equal(json.cacheHits, 80)
})

test('stream-hub.js: subscriber registration, broadcast, and cleanup', () => {
  const { res: sub1 } = mockReqRes()
  const { res: sub2 } = mockReqRes()

  addStreamSubscriber(sub1)
  addStreamSubscriber(sub2)

  broadcastStream('testEvent', { hello: 'world' })
  assert.ok(sub1.body.includes('event: testEvent'))
  assert.ok(sub1.body.includes('"hello":"world"'))
  assert.ok(sub2.body.includes('event: testEvent'))

  removeStreamSubscriber(sub1)
  clearStreamSubscribers()
  assert.equal(sub2.ended, true)
})
