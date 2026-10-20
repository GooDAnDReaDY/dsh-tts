import test from 'node:test'
import assert from 'node:assert/strict'
import { EventEmitter } from 'node:events'
import { registerHttpRoutes } from '../lib/routes.js'
import { getRejectionStatus, isTrustedSettingsRequest, getClientIp, isLanAddress, isLoopback } from '../lib/http-util.js'

function mockReqRes({ method = 'GET', body = '', headers = {}, socket = null, url = '/' } = {}) {
  const req = new EventEmitter()
  req.method = method
  req.headers = headers
  req.url = url
  req.socket = socket
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

function makeMockCtx(connectionService = null) {
  const routes = new Map()
  return {
    routes,
    effect(fn) { return fn() },
    webServer: {
      register(route) { routes.set(route.path, route) }
    },
    connection: connectionService,
    get(name) {
      if (name === 'connection') return connectionService
      return undefined
    }
  }
}

test('Issue #210: getClientIp, isLanAddress, isLoopback helpers classify addresses correctly', () => {
  assert.equal(getClientIp(null), '')
  assert.equal(getClientIp({ socket: { remoteAddress: '192.168.1.50' } }), '192.168.1.50')
  assert.equal(getClientIp({ socket: { remoteAddress: '::ffff:192.168.1.50' } }), '192.168.1.50')
  assert.equal(getClientIp({ connection: { remoteAddress: '10.0.0.1' } }), '10.0.0.1')

  assert.equal(isLanAddress('192.168.1.1'), true)
  assert.equal(isLanAddress('10.20.30.40'), true)
  assert.equal(isLanAddress('172.16.0.1'), true)
  assert.equal(isLanAddress('172.31.255.255'), true)
  assert.equal(isLanAddress('172.32.0.1'), false)
  assert.equal(isLanAddress('127.0.0.1'), false)
  assert.equal(isLanAddress('8.8.8.8'), false)
  assert.equal(isLanAddress(null), false)

  assert.equal(isLoopback('127.0.0.1'), true)
  assert.equal(isLoopback('::1'), true)
  assert.equal(isLoopback('192.168.1.1'), false)
})

test('Issue #210: getRejectionStatus invokes connection.requestRejection(req) on all calls', () => {
  let checked = false
  const mockConn = {
    requestRejection(req) {
      checked = true
      return 401
    }
  }
  const req = { headers: { 'sec-fetch-site': 'same-origin', host: 'localhost:3000' } }
  const status = getRejectionStatus(req, { connection: mockConn })
  assert.equal(checked, true, 'connection.requestRejection must be called')
  assert.equal(status, 401, 'rejected with 401 when connection rejects with 401')
})

test('Issue #210: LAN address without connection auth is rejected (not trusted by default)', () => {
  const req = {
    headers: { host: '192.168.1.111:3000', origin: 'http://192.168.1.111:3000', 'sec-fetch-site': 'same-origin' },
    socket: { remoteAddress: '192.168.1.50' }
  }
  // Without connection or token auth, remote LAN IP must be rejected (fail-closed)
  const status = getRejectionStatus(req, { requireAuth: true })
  assert.ok(status === 401 || status === 403, `expected 401/403, got ${status}`)
  assert.equal(isTrustedSettingsRequest(req, { requireAuth: true }), false)
})

test('Issue #210: Remote PUT /credential without authentication is rejected with 401/403', async () => {
  const ctx = makeMockCtx({
    requestRejection(req) { return 401 }
  })
  let storedKey = null
  registerHttpRoutes(ctx, {
    live: () => ({ speakReplies: true }),
    credentialsView: async () => ({}),
    storeProviderKey: async (p, v) => { storedKey = v; return 'ref-1' },
    clearProviderKey: async () => '',
    configResponse: () => ({}),
    speechCache: { clear: async () => 0 },
    stats: { total: 0, cacheHits: 0, errors: 0, providers: {} },
    pending: [],
    getSettingsApi: () => null,
    validateConfig: (c) => c,
  })

  const credRoute = ctx.routes.get('/dsh-tts/credential')
  assert.ok(credRoute, 'credential route must exist')

  const { req, res } = mockReqRes({
    method: 'PUT',
    headers: {
      host: '192.168.1.111:3000',
      origin: 'http://192.168.1.111:3000',
      'sec-fetch-site': 'same-origin',
      'content-length': '35',
    },
    body: JSON.stringify({ provider: 'openai', value: 'sk-attack' }),
    socket: { remoteAddress: '192.168.1.55' }
  })

  await credRoute.handler(req, res)
  assert.ok(res.statusCode === 401 || res.statusCode === 403, `expected 401 or 403, got ${res.statusCode}`)
  assert.equal(storedKey, null, 'unauthorized remote caller must NOT be able to store provider key')
})

test('Issue #210: Remote DELETE /credential without authentication is rejected with 401/403', async () => {
  const ctx = makeMockCtx({
    requestRejection(req) { return 401 }
  })
  let cleared = false
  registerHttpRoutes(ctx, {
    live: () => ({ speakReplies: true }),
    credentialsView: async () => ({}),
    storeProviderKey: async () => '',
    clearProviderKey: async () => { cleared = true; return 'cleared' },
    configResponse: () => ({}),
    speechCache: { clear: async () => 0 },
    stats: { total: 0, cacheHits: 0, errors: 0, providers: {} },
    pending: [],
    getSettingsApi: () => null,
    validateConfig: (c) => c,
  })

  const credRoute = ctx.routes.get('/dsh-tts/credential')
  const { req, res } = mockReqRes({
    method: 'DELETE',
    headers: {
      host: '192.168.1.111:3000',
      origin: 'http://192.168.1.111:3000',
      'sec-fetch-site': 'same-origin',
      'content-length': '23',
    },
    body: JSON.stringify({ provider: 'openai' }),
    socket: { remoteAddress: '192.168.1.55' }
  })

  await credRoute.handler(req, res)
  assert.ok(res.statusCode === 401 || res.statusCode === 403, `expected 401 or 403, got ${res.statusCode}`)
  assert.equal(cleared, false, 'unauthorized remote caller must NOT be able to clear provider key')
})

test('Issue #210: Authenticated operator CAN manage credentials through DSH connection', async () => {
  const ctx = makeMockCtx({
    requestRejection(req) { return undefined } // Admitted by DSH connection
  })
  let storedKey = null
  registerHttpRoutes(ctx, {
    live: () => ({ speakReplies: true }),
    credentialsView: async () => ({}),
    storeProviderKey: async (p, v) => { storedKey = v; return 'ref-ok' },
    clearProviderKey: async () => '',
    configResponse: () => ({}),
    speechCache: { clear: async () => 0 },
    stats: { total: 0, cacheHits: 0, errors: 0, providers: {} },
    pending: [],
    getSettingsApi: () => null,
    validateConfig: (c) => c,
  })

  const credRoute = ctx.routes.get('/dsh-tts/credential')
  const { req, res } = mockReqRes({
    method: 'PUT',
    headers: {
      host: '192.168.1.111:3000',
      origin: 'http://192.168.1.111:3000',
      'sec-fetch-site': 'same-origin',
      'content-length': '35',
    },
    body: JSON.stringify({ provider: 'openai', value: 'sk-legit' }),
    socket: { remoteAddress: '192.168.1.55' }
  })

  await credRoute.handler(req, res)
  assert.equal(res.statusCode, 200)
  assert.equal(storedKey, 'sk-legit')
})