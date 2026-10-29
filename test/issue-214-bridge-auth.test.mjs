import test from 'node:test'
import assert from 'node:assert/strict'
import { EventEmitter } from 'node:events'
import { registerHttpRoutes } from '../lib/routes.js'
import {
  getRejectionStatus,
  isTrustedSettingsRequest,
  cookieNameForAuthority,
  isLoopbackCookieName,
  hasClientCredentials,
} from '../lib/http-util.js'

function mockReqRes({ method = 'GET', body = '', headers = {}, socket = null, url = '/' } = {}) {
  const req = new EventEmitter()
  req.method = method
  req.headers = headers
  req.url = url
  req.socket = socket || { remoteAddress: '127.0.0.1' }
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

test('Issue #214: cookieNameForAuthority and isLoopbackCookieName identify loopback bridge cookies', () => {
  const loopbackCookie1 = cookieNameForAuthority('127.0.0.1:3080')
  const loopbackCookie2 = cookieNameForAuthority('localhost:3000')
  const lanCookie = cookieNameForAuthority('192.168.1.111:3080')

  assert.ok(loopbackCookie1.startsWith('dsh-auth-'), 'cookie name must start with dsh-auth-')
  assert.equal(isLoopbackCookieName(loopbackCookie1), true, '127.0.0.1:3080 must be classified as loopback')
  assert.equal(isLoopbackCookieName(loopbackCookie2), true, 'localhost:3000 must be classified as loopback')
  assert.equal(isLoopbackCookieName(lanCookie), false, '192.168.1.111:3080 must NOT be classified as loopback')
  assert.equal(isLoopbackCookieName('custom-cookie'), false)
})

test('Issue #214: hasClientCredentials recognizes real credentials vs bridge loopback cookie', () => {
  const loopbackCookie = cookieNameForAuthority('127.0.0.1:3080')
  const lanCookie = cookieNameForAuthority('192.168.1.111:3080')

  // Bridge injected loopback cookie only -> no client credentials
  assert.equal(hasClientCredentials({
    headers: { cookie: `${loopbackCookie}=loopback-secret`, host: '192.168.1.111:3080' }
  }), false)

  // Real client session cookies -> client credentials present
  assert.equal(hasClientCredentials({
    headers: { cookie: `${lanCookie}=session-token`, host: '192.168.1.111:3080' }
  }), true)
  assert.equal(hasClientCredentials({
    headers: { cookie: `dsh_token=user-auth-token; ${loopbackCookie}=bridge-cookie`, host: '192.168.1.111:3080' }
  }), true)
  assert.equal(hasClientCredentials({
    headers: { cookie: 'dsh_lan_pin=1234', host: '192.168.1.111:3080' }
  }), true)
  assert.equal(hasClientCredentials({
    headers: { authorization: 'Bearer test-bearer', host: '192.168.1.111:3080' }
  }), true)
})

test('Issue #214: Unauthenticated request through dsh-lanmode bridge is rejected with 401', () => {
  const loopbackCookie = cookieNameForAuthority('127.0.0.1:3080')
  const mockConn = {
    // Core DSH would naively admit because bridge injected loopback auth cookie
    requestRejection() { return undefined }
  }

  // Request forwarded from LAN IP 192.168.1.55 via bridge with only loopback cookie
  const req = {
    headers: {
      host: '192.168.1.111:3080',
      'x-forwarded-for': '192.168.1.55',
      cookie: `${loopbackCookie}=bridge-secret`,
      'sec-fetch-site': 'same-origin',
    },
    socket: { remoteAddress: '127.0.0.1' }
  }

  // Must reject with 401 even though connection service returned undefined
  const status = getRejectionStatus(req, { connection: mockConn, requireAuth: true })
  assert.equal(status, 401, 'forwarded remote client without credentials must fail with 401')
  assert.equal(isTrustedSettingsRequest(req, { connection: mockConn, requireAuth: true }), false)
})

test('Issue #214: Write request from remote without Origin/Referer is rejected with 403', () => {
  const lanCookie = cookieNameForAuthority('192.168.1.111:3080')
  const mockConn = { requestRejection() { return undefined } }

  // Forwarded request has client session cookie, but NO Origin or Referer (e.g. raw curl)
  const req = {
    headers: {
      host: '192.168.1.111:3080',
      'x-forwarded-for': '192.168.1.55',
      cookie: `${lanCookie}=valid-session`,
      'sec-fetch-site': 'same-origin',
    },
    socket: { remoteAddress: '127.0.0.1' }
  }

  const status = getRejectionStatus(req, { connection: mockConn, requireAuth: true })
  assert.equal(status, 403, 'write request without Origin or Referer matching Host must be rejected with 403')
})

test('Issue #214: Write request with mismatched Origin is rejected with 403', () => {
  const lanCookie = cookieNameForAuthority('192.168.1.111:3080')
  const mockConn = { requestRejection() { return undefined } }

  const req = {
    headers: {
      host: '192.168.1.111:3080',
      origin: 'https://evil.test',
      'x-forwarded-for': '192.168.1.55',
      cookie: `${lanCookie}=valid-session`,
      'sec-fetch-site': 'same-origin',
    },
    socket: { remoteAddress: '127.0.0.1' }
  }

  const status = getRejectionStatus(req, { connection: mockConn, requireAuth: true })
  assert.equal(status, 403, 'mismatched origin must be rejected with 403')
})

test('Issue #214: Authenticated browser request from LAN via bridge is admitted (200)', () => {
  const lanCookie = cookieNameForAuthority('192.168.1.111:3080')
  const mockConn = { requestRejection() { return undefined } }

  const req = {
    headers: {
      host: '192.168.1.111:3080',
      origin: 'https://192.168.1.111:3080',
      referer: 'https://192.168.1.111:3080/chat',
      'x-forwarded-for': '192.168.1.55',
      cookie: `${lanCookie}=valid-user-session`,
      'sec-fetch-site': 'same-origin',
    },
    socket: { remoteAddress: '127.0.0.1' }
  }

  const status = getRejectionStatus(req, { connection: mockConn, requireAuth: true })
  assert.equal(status, undefined, 'legitimate authenticated LAN browser session must be admitted')
})

test('Issue #214: Direct loopback client without proxy headers is admitted', () => {
  const mockConn = { requestRejection() { return undefined } }
  const req = {
    headers: {
      host: '127.0.0.1:3080',
      origin: 'http://127.0.0.1:3080',
      'sec-fetch-site': 'same-origin',
    },
    socket: { remoteAddress: '127.0.0.1' }
  }

  const status = getRejectionStatus(req, { connection: mockConn, requireAuth: true })
  assert.equal(status, undefined, 'direct loopback requests must be admitted')
})

test('Issue #214: Routes integration: unauthenticated bridge requests fail on all sensitive routes', async () => {
  const loopbackCookie = cookieNameForAuthority('127.0.0.1:3080')
  const ctx = makeMockCtx({
    requestRejection() { return undefined } // Naive core mock
  })
  let storedKey = null
  let cacheCleared = false

  registerHttpRoutes(ctx, {
    live: () => ({ speakReplies: true }),
    credentialsView: async () => ({}),
    storeProviderKey: async (p, v) => { storedKey = v; return 'ref-ok' },
    clearProviderKey: async () => '',
    configResponse: () => ({}),
    speechCache: { clear: async () => { cacheCleared = true; return 1 } },
    stats: { total: 0, cacheHits: 0, errors: 0, providers: {} },
    pending: [],
    getSettingsApi: () => null,
    validateConfig: (c) => c,
  })

  // 1. PUT /credential through bridge without client credentials
  const credRoute = ctx.routes.get('/dsh-tts/credential')
  const { req: credReq, res: credRes } = mockReqRes({
    method: 'PUT',
    headers: {
      host: '192.168.1.111:3080',
      'x-forwarded-for': '192.168.1.55',
      cookie: `${loopbackCookie}=bridge-cookie`,
      'sec-fetch-site': 'same-origin',
      'content-length': '35',
    },
    body: JSON.stringify({ provider: 'elevenlabs', value: 'evil-key' }),
  })
  await credRoute.handler(credReq, credRes)
  assert.equal(credRes.statusCode, 401, 'PUT /credential must reject with 401')
  assert.equal(storedKey, null, 'key must NOT be stored')

  // 2. POST /cache/clear through bridge without client credentials
  const cacheRoute = ctx.routes.get('/dsh-tts/cache/clear')
  const { req: cacheReq, res: cacheRes } = mockReqRes({
    method: 'POST',
    headers: {
      host: '192.168.1.111:3080',
      'x-forwarded-for': '192.168.1.55',
      cookie: `${loopbackCookie}=bridge-cookie`,
      'sec-fetch-site': 'same-origin',
    },
  })
  await cacheRoute.handler(cacheReq, cacheRes)
  assert.equal(cacheRes.statusCode, 401, 'POST /cache/clear must reject with 401')
  assert.equal(cacheCleared, false, 'cache must NOT be cleared')

  // 3. Authenticated LAN operator with session cookie and Origin
  const lanCookie = cookieNameForAuthority('192.168.1.111:3080')
  const { req: authReq, res: authRes } = mockReqRes({
    method: 'PUT',
    headers: {
      host: '192.168.1.111:3080',
      origin: 'https://192.168.1.111:3080',
      'x-forwarded-for': '192.168.1.55',
      cookie: `${lanCookie}=user-session-token`,
      'sec-fetch-site': 'same-origin',
      'content-length': '35',
    },
    body: JSON.stringify({ provider: 'elevenlabs', value: 'legit-key' }),
  })
  await credRoute.handler(authReq, authRes)
  assert.equal(authRes.statusCode, 200, 'authenticated LAN operator must be admitted')
  assert.equal(storedKey, 'legit-key', 'key must be stored by authenticated operator')
})

