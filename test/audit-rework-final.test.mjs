import test from 'node:test'
import assert from 'node:assert/strict'
import { EventEmitter } from 'node:events'
import fs from 'node:fs/promises'
import path from 'node:path'
import os from 'node:os'
import { apply, Config } from '../lib/index.js'
import { SettingsForms } from '@deepseek-ai/dsh-settings'
import { createModelManager } from '../lib/engines/manager.js'
import { createSpeechCache } from '../lib/cache.js'
import {
  addStreamSubscriber,
  broadcastStream,
  clearStreamSubscribers,
  MAX_SUBSCRIBER_BUFFER,
  streamSubscriberCount,
} from '../lib/stream-hub.js'

function makeMockServer(svc) {
  const routes = new Map()
  const events = new Map()
  const tools = []
  const ctx = {
    effect: (fn) => fn(),
    on: (n, fn) => { events.set(n, fn); return () => {} },
    get: () => svc,
    webServer: { register: (r) => { routes.set(r.path, r); return () => {} } },
    credentials: {
      resolve: () => ({ value: 'mock-only-key' }),
      describe: () => ({ configured: true, writable: true }),
    },
    tools: { register: (t) => tools.push(t) },
  }
  return { ctx, routes, events, tools }
}

async function callRoute(server, routePath, method = 'GET', payload = undefined, headers = {}) {
  const req = new EventEmitter()
  req.method = method
  req.headers = { 'sec-fetch-site': 'same-origin', ...headers }
  req.socket = { remoteAddress: '127.0.0.1' }
  req.url = routePath
  let status = 200
  let body = null
  const res = {
    writeHead: (code) => { status = code },
    end: (data) => {
      try { body = JSON.parse(data) } catch { body = data }
    },
  }
  const handlerPromise = server.routes.get(routePath).handler(req, res)
  if (payload !== undefined) {
    req.emit('data', Buffer.from(JSON.stringify(payload)))
    req.emit('end')
  }
  await handlerPromise
  return { status, body }
}

test('Audit Final #151: settings save rolls back on credential storage failure', async () => {
  let revision = 10
  let stored = {}
  let keyValue = 'original-key'

  const svc = Object.create(SettingsForms.prototype)
  svc.describe = () => [{ ns: 'dsh-tts', revision }]
  const entry = { options: { id: 'dsh-tts' }, fiber: { runtime: { Config } } }
  svc.ownerContext = {
    configEditor: {
      entries: () => [entry],
      edit: async (_e, fn) => {
        stored = fn(stored, {})
        revision++
      },
    },
  }

  const s = makeMockServer(svc)
  s.ctx.credentials.set = async () => { throw new Error('mock credential storage offline') }
  s.ctx.credentials.resolve = async () => ({ value: keyValue })
  apply(s.ctx, Config({ speakReplies: true }))

  const saveRes = await callRoute(s, '/dsh-tts/config', 'PUT', {
    revision: 10,
    speakReplies: false,
    keys: { openai: 'new-key' },
  })

  assert.equal(saveRes.status, 500)
  assert.equal(saveRes.body.error?.code, 'save')

  const currentConfig = await callRoute(s, '/dsh-tts/config', 'GET')
  assert.equal(currentConfig.body.config.speakReplies, true, 'config must be rolled back on credential failure')
  assert.equal(keyValue, 'original-key', 'original credential must remain intact')
})

test('Audit Final #165: speak rejects plain gateway request when messengerTtsEnabled is false, allows web', async () => {
  const s = makeMockServer(null)
  apply(s.ctx, Config({
    messengerTtsEnabled: false,
    chain: [{ provider: 'custom' }],
    customBaseUrl: 'http://mock-provider.local',
    cache: false,
  }))

  // 1. Plain request without channel or web source (actual messenger gateway behavior)
  const plainRes = await callRoute(s, '/dsh-tts/speak', 'POST', { text: 'gateway prompt text' })
  assert.equal(plainRes.status, 403, 'plain request must be rejected with 403 when messenger TTS is disabled')
  assert.equal(plainRes.body.error?.code, 'disabled')

  // 2. Explicit messenger request
  const markedRes = await callRoute(s, '/dsh-tts/speak', 'POST', { text: 'marked prompt text', channel: 'messenger' })
  assert.equal(markedRes.status, 403)
})

test('Audit Final #179: validateFileIntegrity rejects repetitive non-dummy bytes and malformed formats', async () => {
  const tmpRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'dsh-tts-final-179-'))
  try {
    const mgr = createModelManager({ root: tmpRoot })
    const kokoroDir = mgr.getModelPath('kokoro')
    const f5Dir = mgr.getModelPath('f5')
    await fs.mkdir(kokoroDir, { recursive: true })
    await fs.mkdir(f5Dir, { recursive: true })

    // 2048 bytes of 0x41 ('A')
    await fs.writeFile(path.join(kokoroDir, 'kokoro-v0_19.onnx'), Buffer.alloc(2048, 0x41))
    await fs.writeFile(path.join(kokoroDir, 'voices.json'), Buffer.alloc(2048, 0x41))
    await fs.writeFile(path.join(f5Dir, 'model_1200000.safetensors'), Buffer.alloc(2048, 0x41))

    const stKokoro = await mgr.getStatus('kokoro')
    assert.equal(stKokoro.installed, false, 'kokoro with repeating 0x41 bytes must report installed: false')

    const stF5 = await mgr.getStatus('f5')
    assert.equal(stF5.installed, false, 'f5 with repeating 0x41 bytes must report installed: false')
  } finally {
    await fs.rm(tmpRoot, { recursive: true, force: true }).catch(() => {})
  }
})

test('Audit Final #186: oversized payload (>512 KB) is rejected before write on first broadcast', () => {
  clearStreamSubscribers()
  let written = 0
  let ended = false
  const res = new EventEmitter()
  res.write = (p) => {
    written += Buffer.byteLength(p)
    return true
  }
  res.end = () => { ended = true }

  addStreamSubscriber(res)
  assert.equal(streamSubscriberCount(), 1)

  // Broadcast oversized payload immediately on connected subscriber
  broadcastStream('utterance', {
    id: 'oversized-chunk',
    audioBase64: 'x'.repeat(MAX_SUBSCRIBER_BUFFER + 1024),
  })

  assert.equal(written, 0, 'no bytes must be written for oversized payload')
  assert.equal(streamSubscriberCount(), 0, 'subscriber must be detached')
  assert.equal(ended, true, 'res.end() must be called')
  clearStreamSubscribers()
})

test('Audit Final #202: L2 cache get preceding clear does not recreate metadata on disk', async () => {
  const tmpRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'dsh-tts-final-202-'))
  try {
    const setup = createSpeechCache({ root: tmpRoot, maxBytes: 100000 })
    await setup.put('one', 'audio/mpeg', Buffer.from('mock audio bytes'))

    const cache = createSpeechCache({ root: tmpRoot, maxBytes: 100000 })
    const nodeFs = await import('node:fs')
    const realReadFile = nodeFs.default.promises.readFile
    let enteredResolve, release
    const entered = new Promise((r) => { enteredResolve = r })

    nodeFs.default.promises.readFile = async (file, ...args) => {
      const data = await realReadFile(file, ...args)
      if (String(file).endsWith('/one.audio') || String(file).endsWith('.audio')) {
        enteredResolve()
        await new Promise((r) => { release = r })
      }
      return data
    }

    try {
      const getPromise = cache.get('one')
      await entered
      const clearedCount = await cache.clear()
      assert.equal(clearedCount, 1)

      const dirPath = path.join(tmpRoot, 'data', 'dsh-tts', 'cache')
      const beforeList = await fs.readdir(dirPath).catch(() => [])
      assert.deepEqual(beforeList, [])

      release()
      const hit = await getPromise
      assert.ok(hit, 'in-flight read completes')

      await new Promise((r) => setTimeout(r, 40))
      const afterList = await fs.readdir(dirPath).catch(() => [])
      assert.deepEqual(afterList, [], 'metadata must NOT be recreated after clear settled')
    } finally {
      nodeFs.default.promises.readFile = realReadFile
      release?.()
    }
  } finally {
    await fs.rm(tmpRoot, { recursive: true, force: true }).catch(() => {})
  }
})
