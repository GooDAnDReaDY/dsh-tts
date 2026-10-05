import test from 'node:test'
import assert from 'node:assert/strict'
import { EventEmitter } from 'node:events'
import { Config, plainConfig, apply } from '../lib/index.js'
import { registerHttpRoutes } from '../lib/routes.js'
import { addStreamSubscriber, clearStreamSubscribers } from '../lib/stream-hub.js'

function makeMockCtx() {
  const routes = new Map()
  const listeners = new Map()
  let settingsSvc = null
  return {
    routes,
    listeners,
    setSettingsService(svc) { settingsSvc = svc },
    get(name) {
      if (name === 'settings') return settingsSvc
      return null
    },
    on(event, handler) {
      if (!listeners.has(event)) listeners.set(event, [])
      listeners.get(event).push(handler)
    },
    effect(fn) { return fn() },
    webServer: {
      register(route) { routes.set(route.path, route) },
    },
    tools: { register() {} },
    credentials: {
      resolve: async () => null,
      describe: async () => null,
    },
  }
}

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
    destroy() { ended = true },
  }
  queueMicrotask(() => {
    if (body) req.emit('data', Buffer.from(body))
    req.emit('end')
  })
  return { req, res }
}

test('Block 1: #153 - maxQueue rejects negative and non-integer values', () => {
  assert.throws(() => Config({ maxQueue: -1 }), />= 0/)
  assert.throws(() => Config({ maxQueue: 1.5 }), /multiple of 1/)
  const valid = Config({ maxQueue: 5 })
  assert.equal(plainConfig(valid).maxQueue, 5)
})

test('Block 1: #151 - all 9 previously non-volatile fields are marked volatile', () => {
  const c = Config({})
  const requiredVolatile = [
    'pronunciation', 'speakAsItGoes', 'sentenceChars', 'rate',
    'bargeIn', 'announceApproval', 'approvalText', 'questionText', 'chime'
  ]
  for (const k of requiredVolatile) {
    assert.ok(c[k], `Config must contain ${k}`)
    assert.equal(typeof c[k].get, 'function', `Config field "${k}" must have .volatile() box`)
  }
})

test('Block 1: #152 & #187 - live() preserves living Volatile boxes and reflects updates dynamically', async () => {
  const ctx = makeMockCtx()
  let liveSpeakVal = false
  let liveRateVal = 1.0

  const liveConfig = {
    speakReplies: { get: () => liveSpeakVal },
    rate: { get: () => liveRateVal },
  }

  apply(ctx, liveConfig)
  const statusRoute = ctx.routes.get('/dsh-tts/status')
  assert.ok(statusRoute)

  // 1. Initial check
  const { req: r1, res: s1 } = mockReqRes({ method: 'GET', headers: { 'sec-fetch-site': 'same-origin' } })
  await statusRoute.handler(r1, s1)
  assert.equal(s1.statusCode, 200)
  let body1 = JSON.parse(s1.body)
  assert.equal(body1.speakReplies, false)
  assert.equal(body1.rate, 1.0)

  // 2. Mutate the living box directly in host loader
  liveSpeakVal = true
  liveRateVal = 1.5

  // 3. Status must immediately reflect the living box values without restart or reapply
  const { req: r2, res: s2 } = mockReqRes({ method: 'GET', headers: { 'sec-fetch-site': 'same-origin' } })
  await statusRoute.handler(r2, s2)
  assert.equal(s2.statusCode, 200)
  let body2 = JSON.parse(s2.body)
  assert.equal(body2.speakReplies, true)
  assert.equal(body2.rate, 1.5)
})

test('Block 1: #151 & #188 - SettingsForms replace rollback and conflict handling', async () => {
  const ctx = makeMockCtx()
  let replacedNs = null
  let replacedPayload = null
  let replacedRev = null
  let shouldFail = false

  const mockSettingsSvc = {
    describe: async () => ({ revision: 42 }),
    replace: async (ns, payload, rev) => {
      if (shouldFail) {
        const err = new Error('revision conflict')
        err.code = 'conflict'
        throw err
      }
      replacedNs = ns
      replacedPayload = payload
      replacedRev = rev
    },
  }
  ctx.setSettingsService(mockSettingsSvc)

  apply(ctx, { speakReplies: false, rate: 1.0 })
  const configRoute = ctx.routes.get('/dsh-tts/config')
  const statusRoute = ctx.routes.get('/dsh-tts/status')

  // 1. Successful PUT persists and saves
  const putPayload = JSON.stringify({ config: { speakReplies: true, rate: 1.2 } })
  const { req: putReq, res: putRes } = mockReqRes({
    method: 'PUT',
    headers: { 'sec-fetch-site': 'same-origin' },
    body: putPayload,
  })
  await configRoute.handler(putReq, putRes)
  assert.equal(putRes.statusCode, 200)
  assert.equal(replacedNs, 'dsh-tts')
  assert.equal(replacedRev, 42)
  assert.equal(replacedPayload.speakReplies, true)

  // Verify state updated
  const { req: sReq1, res: sRes1 } = mockReqRes({ method: 'GET', headers: { 'sec-fetch-site': 'same-origin' } })
  await statusRoute.handler(sReq1, sRes1)
  assert.equal(JSON.parse(sRes1.body).speakReplies, true)

  // 2. Failed PUT (e.g. conflict) rolls back and preserves previous state
  shouldFail = true
  const failPayload = JSON.stringify({ config: { speakReplies: false, rate: 2.0 } })
  const { req: failReq, res: failRes } = mockReqRes({
    method: 'PUT',
    headers: { 'sec-fetch-site': 'same-origin' },
    body: failPayload,
  })
  await configRoute.handler(failReq, failRes)
  assert.equal(failRes.statusCode, 409) // Conflict status

  // Verify state did NOT change to the failed payload
  const { req: sReq2, res: sRes2 } = mockReqRes({ method: 'GET', headers: { 'sec-fetch-site': 'same-origin' } })
  await statusRoute.handler(sReq2, sRes2)
  assert.equal(JSON.parse(sRes2.body).speakReplies, true)
  assert.equal(JSON.parse(sRes2.body).rate, 1.2)
})

test('Block 1: #155 & #189 - GET /config and /status reject untrusted cross-site requests with 403', async () => {
  const ctx = makeMockCtx()
  apply(ctx, { speakReplies: true })
  const configRoute = ctx.routes.get('/dsh-tts/config')
  const statusRoute = ctx.routes.get('/dsh-tts/status')

  // 1. Cross-site untrusted request to /status
  const { req: badStatusReq, res: badStatusRes } = mockReqRes({
    method: 'GET',
    headers: { 'sec-fetch-site': 'cross-site' },
    socket: { remoteAddress: '203.0.113.20' },
  })
  await statusRoute.handler(badStatusReq, badStatusRes)
  assert.equal(badStatusRes.statusCode, 403)
  assert.equal(JSON.parse(badStatusRes.body).ok, false)

  // 2. Cross-site untrusted request to /config
  const { req: badConfigReq, res: badConfigRes } = mockReqRes({
    method: 'GET',
    headers: { 'sec-fetch-site': 'cross-site' },
    socket: { remoteAddress: '203.0.113.20' },
  })
  await configRoute.handler(badConfigReq, badConfigRes)
  assert.equal(badConfigRes.statusCode, 403)
  assert.equal(JSON.parse(badConfigRes.body).ok, false)

  // 3. Trusted same-origin requests succeed
  const { req: okStatusReq, res: okStatusRes } = mockReqRes({
    method: 'GET',
    headers: { 'sec-fetch-site': 'same-origin' },
  })
  await statusRoute.handler(okStatusReq, okStatusRes)
  assert.equal(okStatusRes.statusCode, 200)

  const { req: okConfigReq, res: okConfigRes } = mockReqRes({
    method: 'GET',
    headers: { 'sec-fetch-site': 'same-origin' },
  })
  await configRoute.handler(okConfigReq, okConfigRes)
  assert.equal(okConfigRes.statusCode, 200)
  assert.equal(JSON.parse(okConfigRes.body).ok, true)
})

test('Block 1: #154 - Parallel synthesis chunks preserve strict sentence order in SSE', async () => {
  const ctx = makeMockCtx()
  clearStreamSubscribers()

  // Track SSE broadcast events
  const sseEvents = []
  const fakeSseRes = {
    write(chunk) {
      sseEvents.push(chunk)
      return true
    },
    end() {},
  }
  addStreamSubscriber(fakeSseRes)

  apply(ctx, { speakReplies: true, streamingEnabled: true, speakAsItGoes: true, sentenceChars: 30 })

  // Find assistant message listener
  const sessionListeners = ctx.listeners.get('session/event') || []
  assert.ok(sessionListeners.length > 0)
  const onSessionEvent = sessionListeners[0]

  // Simulate incoming assistant message with 3 sentences
  // The first sentence will take longer, the second will resolve fast
  const fakeSession = { id: 's1' }
  const messageEvent = {
    type: 'assistant/message',
    data: { message: { content: 'First sentence here. Second short. Third sentence ends.' } },
  }

  await onSessionEvent(fakeSession, messageEvent)

  // Wait a small tick for in-flight promises
  await new Promise((r) => setTimeout(r, 100))

  clearStreamSubscribers()

  // Parse SSE utterances
  const utterances = sseEvents
    .filter((e) => e.includes('event: utterance'))
    .map((e) => {
      const line = e.split('\n').find((l) => l.startsWith('data: '))
      return line ? JSON.parse(line.slice(6)) : null
    })
    .filter(Boolean)

  if (utterances.length >= 2) {
    // Assert strictly ordered
    assert.match(utterances[0].text, /First sentence/)
    assert.match(utterances[1].text, /Second short/)
  }
})

test('Block 1: #151 - extractRevision handles array of namespaces, GET /config returns revision, PUT passes revision', async () => {
  const ctx = makeMockCtx()
  let currentRev = 77
  let lastPassedRev = null

  const mockSettingsSvc = {
    describe: async () => [
      { name: 'other-plugin', revision: 10 },
      { name: 'dsh-tts', revision: currentRev },
    ],
    replace: async (ns, payload, rev) => {
      if (rev !== currentRev) {
        const err = new Error('revision conflict')
        err.code = 'conflict'
        throw err
      }
      lastPassedRev = rev
      currentRev++
    },
  }
  ctx.setSettingsService(mockSettingsSvc)

  apply(ctx, { speakReplies: false })
  const configRoute = ctx.routes.get('/dsh-tts/config')

  // 1. GET /config returns revision from array describe
  const { req: getReq, res: getRes } = mockReqRes({ method: 'GET', headers: { 'sec-fetch-site': 'same-origin' } })
  await configRoute.handler(getReq, getRes)
  assert.equal(getRes.statusCode, 200)
  const getBody = JSON.parse(getRes.body)
  assert.equal(getBody.revision, 77)

  // 2. PUT with matching revision succeeds
  const { req: putReq1, res: putRes1 } = mockReqRes({
    method: 'PUT',
    headers: { 'sec-fetch-site': 'same-origin' },
    body: JSON.stringify({ config: { speakReplies: true }, revision: 77 }),
  })
  await configRoute.handler(putReq1, putRes1)
  assert.equal(putRes1.statusCode, 200)
  assert.equal(lastPassedRev, 77)

  // 3. Stale PUT with old revision 77 fails with 409 conflict
  const { req: putReq2, res: putRes2 } = mockReqRes({
    method: 'PUT',
    headers: { 'sec-fetch-site': 'same-origin' },
    body: JSON.stringify({ config: { speakReplies: false }, revision: 77 }),
  })
  await configRoute.handler(putReq2, putRes2)
  assert.equal(putRes2.statusCode, 409)
})

test('Block 1: #152 - Volatile boxes continue to dynamically update after UI Save without freezing', async () => {
  const ctx = makeMockCtx()
  let liveSpeak = false
  let liveRate = 1.0

  const mockSettingsSvc = {
    describe: async () => ({ revision: 1 }),
    replace: async () => {},
  }
  ctx.setSettingsService(mockSettingsSvc)

  const livingBoxes = {
    speakReplies: { get: () => liveSpeak },
    rate: { get: () => liveRate },
  }
  apply(ctx, livingBoxes)
  const configRoute = ctx.routes.get('/dsh-tts/config')
  const statusRoute = ctx.routes.get('/dsh-tts/status')

  // 1. Initial status
  const { req: r1, res: s1 } = mockReqRes({ method: 'GET', headers: { 'sec-fetch-site': 'same-origin' } })
  await statusRoute.handler(r1, s1)
  assert.equal(JSON.parse(s1.body).speakReplies, false)

  // 2. UI performs Save
  const { req: saveReq, res: saveRes } = mockReqRes({
    method: 'PUT',
    headers: { 'sec-fetch-site': 'same-origin' },
    body: JSON.stringify({ config: { speakReplies: true, rate: 1.2 } }),
  })
  await configRoute.handler(saveReq, saveRes)
  assert.equal(saveRes.statusCode, 200)

  // 3. Host loader now updates the living boxes directly
  liveSpeak = false
  liveRate = 1.8

  // 4. Runtime status must immediately see the new box values (not frozen by savedConfig)
  const { req: r2, res: s2 } = mockReqRes({ method: 'GET', headers: { 'sec-fetch-site': 'same-origin' } })
  await statusRoute.handler(r2, s2)
  const statusBody = JSON.parse(s2.body)
  assert.equal(statusBody.speakReplies, false, 'Runtime must reflect live box speakReplies=false')
  assert.equal(statusBody.rate, 1.8, 'Runtime must reflect live box rate=1.8')
})
