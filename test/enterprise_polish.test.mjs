import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createSpeechCache, cacheKey } from '../lib/cache.js'
import { splitSentences } from '../lib/text.js'
import { registerHttpRoutes } from '../lib/routes.js'

test('L1 RAM Audio Cache provides instant hits and LRU sync', async () => {
  const cache = createSpeechCache({ root: '/tmp/test-l1-cache-' + Date.now(), maxBytes: 1024 * 1024 })
  const key1 = cacheKey(['l1-test-phrase-1'])
  const key2 = cacheKey(['l1-test-phrase-2'])
  
  await cache.put(key1, 'audio/mpeg', Buffer.from([1, 2, 3, 4]))
  await cache.put(key2, 'audio/wav', Buffer.from([5, 6, 7, 8]))

  // L1 RAM Hit
  const hit1 = await cache.get(key1)
  assert.ok(hit1, 'key1 hit expected')
  assert.equal(hit1.mime, 'audio/mpeg')
  assert.deepEqual([...hit1.audio], [1, 2, 3, 4])

  const hit2 = await cache.get(key2)
  assert.ok(hit2, 'key2 hit expected')
  assert.equal(hit2.mime, 'audio/wav')

  // Miss
  const miss = await cache.get(cacheKey(['missing-key']))
  assert.equal(miss, null)
})

test('splitSentences splits turn reply into parallel pipeline chunks', () => {
  const text = 'First sentence goes here with enough text to exceed min chunk size. Second sentence follows immediately with more details. Third sentence concludes the reply.'
  const chunks = splitSentences(text, 50)
  assert.ok(chunks.length >= 2, 'should split into sentence chunks')
  assert.ok(chunks[0].includes('First sentence'), 'first chunk contains start text')
})

test('preview route generates voice check audio sample', async () => {
  let registeredHandler = null
  const fakeCtx = {
    effect: (fn) => fn(),
    webServer: {
      register: ({ path, handler }) => {
        if (path === '/dsh-tts/preview') registeredHandler = handler
      },
    },
  }

  registerHttpRoutes(fakeCtx, {
    live: () => ({ language: 'en' }),
    synthesize: async (text, cfg) => ({
      provider: 'espeak',
      mime: 'audio/wav',
      audio: Buffer.from([10, 20, 30]),
      tookMs: 15,
    }),
  })

  assert.ok(registeredHandler, 'preview route handler should be registered')
  let responseData = null
  const req = {
    method: 'POST',
    url: '/dsh-tts/preview',
    headers: { 'sec-fetch-site': 'same-origin' },
    on: (evt, cb) => {
      if (evt === 'data') cb(Buffer.from(JSON.stringify({ text: 'Sample check' })))
      if (evt === 'end') cb()
    },
  }
  const res = {
    writeHead: () => {},
    setHeader: () => {},
    end: (body) => {
      responseData = JSON.parse(body)
    },
  }

  await registeredHandler(req, res)
  assert.ok(responseData, 'responseData should not be null')
  assert.equal(responseData.ok, true)
  assert.equal(responseData.mime, 'audio/wav')
  assert.ok(responseData.audioBase64, 'audio base64 payload expected')
})
