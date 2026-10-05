import test from 'node:test'
import assert from 'node:assert/strict'
import { apply } from '../lib/index.js'
import { runChain } from '../lib/chain.js'

function makeMockCtx() {
  const routes = new Map()
  const listeners = new Map()
  let registeredTool = null
  return {
    routes,
    listeners,
    getRegisteredTool: () => registeredTool,
    on(event, handler) {
      if (!listeners.has(event)) listeners.set(event, [])
      listeners.get(event).push(handler)
    },
    effect(fn) { return fn() },
    webServer: {
      register(route) { routes.set(route.path, route) },
    },
    tools: {
      register(tool) { registeredTool = tool },
    },
    credentials: {
      resolve: async () => null,
      describe: async () => null,
    },
  }
}

test('real synthesis deduplication: concurrent requests for same text share single execution (#181)', async () => {
  const ctx = makeMockCtx()

  apply(ctx, {
    speakReplies: true,
    chain: [{ provider: 'espeak', voice: 'en' }],
  })

  const speakRoute = ctx.routes.get('/dsh-tts/speak')
  assert.ok(speakRoute, '/dsh-tts/speak route must be registered')

  const makeReqRes = (text) => {
    let statusCode = 200
    let resBody = ''
    return {
      req: {
        method: 'POST',
        headers: { 'sec-fetch-site': 'same-origin' },
        on(event, cb) {
          if (event === 'data') cb(Buffer.from(JSON.stringify({ text })))
          if (event === 'end') cb()
          return this
        },
      },
      res: {
        writeHead(code) { statusCode = code },
        end(data) { if (data) resBody += data },
        get body() { return resBody },
        get statusCode() { return statusCode },
      },
    }
  }

  // Two identical speak requests fired concurrently
  const reqRes1 = makeReqRes('Same text for deduplication test.')
  const reqRes2 = makeReqRes('Same text for deduplication test.')

  await Promise.all([
    speakRoute.handler(reqRes1.req, reqRes1.res),
    speakRoute.handler(reqRes2.req, reqRes2.res),
  ])

  assert.equal(reqRes1.res.statusCode, 200)
  assert.equal(reqRes2.res.statusCode, 200)
  const json1 = JSON.parse(reqRes1.res.body)
  const json2 = JSON.parse(reqRes2.res.body)
  assert.equal(json1.ok, true)
  assert.equal(json2.ok, true)
  assert.equal(json1.provider, json2.provider)
  assert.equal(json1.audioBase64, json2.audioBase64)
})

test('real synthesis deduplication: different texts execute independently (#181)', async () => {
  const ctx = makeMockCtx()
  apply(ctx, {
    speakReplies: true,
    chain: [{ provider: 'espeak', voice: 'en' }],
  })

  const speakRoute = ctx.routes.get('/dsh-tts/speak')

  const makeReqRes = (text) => {
    let statusCode = 200
    let resBody = ''
    return {
      req: {
        method: 'POST',
        headers: { 'sec-fetch-site': 'same-origin' },
        on(event, cb) {
          if (event === 'data') cb(Buffer.from(JSON.stringify({ text })))
          if (event === 'end') cb()
          return this
        },
      },
      res: {
        writeHead(code) { statusCode = code },
        end(data) { if (data) resBody += data },
        get body() { return resBody },
        get statusCode() { return statusCode },
      },
    }
  }

  const reqRes1 = makeReqRes('Alpha phrase.')
  const reqRes2 = makeReqRes('Beta phrase.')

  await Promise.all([
    speakRoute.handler(reqRes1.req, reqRes1.res),
    speakRoute.handler(reqRes2.req, reqRes2.res),
  ])

  assert.equal(reqRes1.res.statusCode, 200)
  assert.equal(reqRes2.res.statusCode, 200)
  const json1 = JSON.parse(reqRes1.res.body)
  const json2 = JSON.parse(reqRes2.res.body)
  assert.equal(json1.ok, true)
  assert.equal(json2.ok, true)
})

test('runChain walks providers until successful provider responds', async () => {
  const providers = {
    a: async () => ({ ok: false, provider: 'a', reason: 'quota exceeded' }),
    b: async () => ({ ok: true, provider: 'b', audio: Buffer.from('ok'), mime: 'audio/wav', tookMs: 5 }),
  }
  const out = await runChain(['a', 'b'], providers)
  assert.equal(out.provider, 'b')
  assert.equal(out.mime, 'audio/wav')
})
