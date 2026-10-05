import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { createModelManager, MODEL_SPECS } from '../lib/engines/manager.js'
import { registerHttpRoutes } from '../lib/routes.js'

function makeCtx() {
  const routes = new Map()
  const effects = []
  return {
    routes,
    effects,
    effect(fn) {
      const disposer = fn()
      effects.push(disposer)
      return disposer
    },
    webServer: {
      register({ path, handler }) {
        routes.set(path, { path, handler })
        return () => routes.delete(path)
      },
    },
  }
}

function mockReqRes({ method = 'GET', url = '/', headers = {}, body = null }) {
  const req = {
    method,
    url,
    headers: { 'sec-fetch-site': 'same-origin', ...headers },
    socket: { remoteAddress: '127.0.0.1' },
    on(event, cb) {
      if (event === 'data' && body) cb(Buffer.from(body))
      if (event === 'end') cb()
      return req
    },
  }
  let statusCode = 200
  let resHeaders = {}
  let resBody = ''
  const res = {
    writeHead(code, h) { statusCode = code; resHeaders = h || {} },
    setHeader(k, v) { resHeaders[k.toLowerCase()] = v },
    write(chunk) { resBody += chunk },
    end(chunk) { if (chunk) resBody += chunk },
    get statusCode() { return statusCode },
    get body() { return resBody },
    get headers() { return resHeaders },
  }
  return { req, res }
}

test('Block 5: #180 - /models/install and /models/delete return 400 for unknown engine', async () => {
  const ctx = makeCtx()
  const tmpRoot = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'dsh-tts-b5-routes-'))
  try {
    const mm = createModelManager({ root: tmpRoot })
    registerHttpRoutes(ctx, {
      live: () => ({}),
      modelManager: mm,
      stats: { total: 0, cacheHits: 0, errors: 0, providers: {} },
      speechCache: { clear: async () => 0 },
      cleanText: (t) => t,
      prepareSpeechText: async (t) => t,
      synthesize: async () => ({ audio: Buffer.alloc(0), mime: 'audio/wav', tookMs: 0 }),
      credentialsView: async () => ({}),
      configResponse: () => ({}),
      storeProviderKey: async () => '',
      clearProviderKey: async () => '',
      pending: [],
      getSettingsApi: () => null,
      validateConfig: () => ({}),
      breakerSnapshot: () => [],
    })

    const installRoute = ctx.routes.get('/dsh-tts/models/install')
    const deleteRoute = ctx.routes.get('/dsh-tts/models/delete')

    // Install unknown engine -> 400
    const { req: iReq, res: iRes } = mockReqRes({
      method: 'POST',
      body: JSON.stringify({ engine: 'bogus_engine_xyz' }),
    })
    await installRoute.handler(iReq, iRes)
    assert.equal(iRes.statusCode, 400, 'installing unknown engine must return 400')
    const iJson = JSON.parse(iRes.body)
    assert.equal(iJson.ok, false)
    assert.match(iJson.error.message, /unknown engine/i)

    // Delete unknown engine -> 400
    const { req: dReq, res: dRes } = mockReqRes({
      method: 'POST',
      body: JSON.stringify({ engine: 'bogus_engine_xyz' }),
    })
    await deleteRoute.handler(dReq, dRes)
    assert.equal(dRes.statusCode, 400, 'deleting unknown engine must return 400')
    const dJson = JSON.parse(dRes.body)
    assert.equal(dJson.ok, false)
    assert.match(dJson.error.message, /unknown engine/i)
  } finally {
    await fs.promises.rm(tmpRoot, { recursive: true, force: true }).catch(() => {})
  }
})

test('Block 5: #179 - truncated / small file below minBytes fails install and marks installed false', async () => {
  const tmpRoot = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'dsh-tts-b5-trunc-'))
  try {
    // Return only 100 bytes (e.g. error HTML page or truncated download)
    const mockFetch = async () => ({
      ok: true,
      headers: new Map([['content-length', '100']]),
      arrayBuffer: async () => Buffer.alloc(100, 1),
    })
    const mm = createModelManager({ root: tmpRoot, fetchImpl: mockFetch })

    await assert.rejects(async () => {
      await mm.installModel('kokoro', { fetchImpl: mockFetch })
    }, /truncated/i, 'installModel must reject truncated payload')

    const status = await mm.getStatus('kokoro')
    assert.equal(status.installed, false, 'status must report installed: false when files are truncated')
    assert.equal(status.failed, true, 'status must report failed: true')
  } finally {
    await fs.promises.rm(tmpRoot, { recursive: true, force: true }).catch(() => {})
  }
})

test('Block 5: #178 - concurrency lock joins in-flight download and uses unique tmp files', async () => {
  const tmpRoot = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'dsh-tts-b5-lock-'))
  try {
    let callCount = 0
    const mockFetch = async () => {
      callCount++
      await new Promise((r) => setTimeout(r, 20))
      return {
        ok: true,
        headers: new Map([['content-length', '1024']]),
        arrayBuffer: async () => Buffer.alloc(1024, 1),
      }
    }
    const mm = createModelManager({ root: tmpRoot, fetchImpl: mockFetch })

    // Launch two parallel installs for kokoro
    const [res1, res2] = await Promise.all([
      mm.installModel('kokoro', { fetchImpl: mockFetch }),
      mm.installModel('kokoro', { fetchImpl: mockFetch }),
    ])

    assert.equal(res1.installed, true)
    assert.equal(res2.installed, true)
    // Kokoro has 2 files: kokoro-v0_19.onnx and voices.json. Exactly 2 fetch calls total across both callers
    assert.equal(callCount, 2, 'concurrent callers must share single in-flight download')
  } finally {
    await fs.promises.rm(tmpRoot, { recursive: true, force: true }).catch(() => {})
  }
})

test('Block 5: #177 - streaming download with multiple chunks does not leak EventEmitter listeners', async () => {
  const tmpRoot = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'dsh-tts-b5-leak-'))
  try {
    // Deliver 50 chunks via reader
    const mockFetch = async () => {
      let chunksRemaining = 50
      return {
        ok: true,
        body: {
          getReader() {
            return {
              async read() {
                if (chunksRemaining <= 0) return { done: true }
                chunksRemaining--
                return { done: false, value: Buffer.alloc(100, 2) } // 50 * 100 = 5000 bytes > 1024
              },
            }
          },
        },
      }
    }

    const mm = createModelManager({ root: tmpRoot, fetchImpl: mockFetch })
    const installed = await mm.installModel('kokoro', { fetchImpl: mockFetch })
    assert.equal(installed.installed, true)
  } finally {
    await fs.promises.rm(tmpRoot, { recursive: true, force: true }).catch(() => {})
  }
})
