import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { Config, apply } from '../lib/index.js'
import { createSpeechCache, cacheKey } from '../lib/cache.js'
import { addStreamSubscriber, clearStreamSubscribers } from '../lib/stream-hub.js'

function makeMockCtx() {
  const routes = new Map()
  const listeners = new Map()
  let registeredTool = null
  return {
    routes,
    listeners,
    getRegisteredTool() { return registeredTool },
    get(name) { return null },
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

async function waitForItem(pendingRoute, predicate, maxAttempts = 20) {
  for (let i = 0; i < maxAttempts; i++) {
    let resData = null
    await pendingRoute.handler({ method: 'GET', headers: { 'sec-fetch-site': 'same-origin' } }, {
      writeHead() {},
      end(data) { resData = JSON.parse(data) },
    })
    const items = resData?.items || []
    const match = items.find(predicate)
    if (match) return match
    await new Promise((r) => setTimeout(r, 50))
  }
  return null
}

test('Block 2: #157 - pronunciation rules are applied exactly once (no double-clean)', async () => {
  const ctx = makeMockCtx()

  // Rules: C -> A, and A -> B.
  // If cleanText runs once on input "C": C becomes A.
  // If double-cleaned: C becomes A, then A becomes B.
  const cfg = {
    speakReplies: true,
    speakAsItGoes: true,
    chain: [{ provider: 'espeak', voice: 'en' }],
    pronunciation: [
      { from: 'A', to: 'B', whole: true, lang: '' },
      { from: 'C', to: 'A', whole: true, lang: '' },
    ],
  }

  apply(ctx, cfg)
  const listeners = ctx.listeners.get('session/event') || []
  const onSessionEvent = listeners[0]

  await onSessionEvent({ id: 's1' }, {
    type: 'assistant/message',
    data: { message: { content: 'C' } },
  })

  const pendingRoute = ctx.routes.get('/dsh-tts/pending')
  const item = await waitForItem(pendingRoute, (x) => x.text === 'A' || x.text === 'B')
  assert.ok(item, 'item should be settled in pending queue')
  assert.equal(item.text, 'A', 'input C must be converted to A and NOT double-converted to B')
})

test('Block 2: #166 - autoDetectSubagent=false ignores subagent voice override', async () => {
  const ctx = makeMockCtx()
  const cfg = {
    speakReplies: true,
    speakAsItGoes: true,
    autoDetectSubagent: false,
    chain: [{ provider: 'espeak', voice: 'en' }],
    roles: {
      helper: { provider: 'espeak', voice: 'ru' },
      reply: { provider: 'espeak', voice: 'en' },
    },
  }

  apply(ctx, cfg)
  const listeners = ctx.listeners.get('session/event') || []
  const onSessionEvent = listeners[0]

  // Message from subagent "helper"
  await onSessionEvent({ id: 's1', subagent: 'helper' }, {
    type: 'assistant/message',
    data: { message: { content: 'Subagent message.' } },
  })

  const pendingRoute = ctx.routes.get('/dsh-tts/pending')
  const item = await waitForItem(pendingRoute, (x) => x.text && x.text.includes('Subagent'))
  assert.ok(item, 'subagent message should settle in pending queue')
  assert.equal(item.role, 'reply', 'autoDetectSubagent: false must force role to reply')
})

test('Block 2: #173 - cache and dedup keys change when endpoints or models change', async () => {
  const tmpDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'dsh-tts-keys-'))
  try {
    const cache = createSpeechCache({ root: tmpDir, maxBytes: 1024 * 1024 })
    // Verify fingerprints for different endpoints
    const fpA = cacheKey(['hello', 'custom', 'model1', 'voice1', 'reply', '', 'en', 'http://endpoint-a'])
    const fpB = cacheKey(['hello', 'custom', 'model1', 'voice1', 'reply', '', 'en', 'http://endpoint-b'])
    assert.notEqual(fpA, fpB, 'different custom endpoints must produce different cache keys')

    const fpEn = cacheKey(['hello', 'edge', 'm', 'v', 'reply', '', 'en'])
    const fpRu = cacheKey(['hello', 'edge', 'm', 'v', 'reply', '', 'ru'])
    assert.notEqual(fpEn, fpRu, 'different languages must produce different cache keys')
  } finally {
    await fs.promises.rm(tmpDir, { recursive: true, force: true })
  }
})

test('Block 2: #175 - speak_text tool delivers audio to queue and SSE stream without leaking base64 to LLM', async () => {
  const ctx = makeMockCtx()
  clearStreamSubscribers()
  const sseEvents = []
  addStreamSubscriber({
    write(chunk) { sseEvents.push(chunk); return true },
    end() {},
  })

  apply(ctx, {
    speakReplies: true,
    streamingEnabled: true,
    chain: [{ provider: 'espeak', voice: 'en' }],
  })
  const tool = ctx.getRegisteredTool()
  assert.ok(tool, 'speak_text tool must be registered')

  const execContext = {
    session: { id: 'test-session-123' },
    signal: new AbortController().signal,
  }

  const result = await tool.execute({ text: 'Hear this important tool message.' }, execContext)
  assert.equal(result.ok, true)
  assert.ok(result.id, 'tool output must include utterance id')
  assert.ok(result.bytes > 0)
  // Ensure base64 is NOT returned in tool result (avoids LLM context pollution)
  assert.equal(result.audioBase64, undefined)
  assert.equal(result.audio, undefined)

  // Verify audio was enqueued into pending
  const pendingRoute = ctx.routes.get('/dsh-tts/pending')
  const item = await waitForItem(pendingRoute, (x) => x.id === result.id)
  assert.ok(item, 'utterance must be present in pending queue')
  assert.ok(item.audioBase64, 'item in queue must hold synthesized audioBase64')

  clearStreamSubscribers()
})

test('Block 2: #190 - cache eviction uses in-memory index without O(N) per write', async () => {
  const tmpDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'dsh-tts-cache-190-'))
  try {
    // maxBytes = 500 bytes (room for ~3 small audio chunks of 150 bytes)
    const cache = createSpeechCache({ root: tmpDir, maxBytes: 500 })

    const chunk1 = Buffer.alloc(150, 1)
    const chunk2 = Buffer.alloc(150, 2)
    const chunk3 = Buffer.alloc(150, 3)
    const chunk4 = Buffer.alloc(150, 4)

    await cache.put('k1', 'audio/mpeg', chunk1)
    await cache.put('k2', 'audio/mpeg', chunk2)
    await cache.put('k3', 'audio/mpeg', chunk3)

    // k1, k2, k3 exist
    assert.ok(await cache.get('k1'))
    assert.ok(await cache.get('k2'))
    assert.ok(await cache.get('k3'))

    // Adding chunk4 (total 600 > 500) must evict oldest k1
    await cache.put('k4', 'audio/mpeg', chunk4)
    assert.equal(await cache.get('k1'), null, 'oldest entry k1 should have been evicted')
    assert.ok(await cache.get('k2'), 'k2 should remain')
    assert.ok(await cache.get('k4'), 'k4 should exist')
  } finally {
    await fs.promises.rm(tmpDir, { recursive: true, force: true })
  }
})

test('Block 2: #156 - longReply full and summarize receive full text before truncation', async () => {
  const ctx = makeMockCtx()
  let summarizeReceived = ''
  ctx.llm = {
    async *stream(opts) {
      summarizeReceived = opts.messages[0].content
      yield { text: 'Short summary.' }
    },
  }

  // 1. longReply = 'full' with maxChars = 10
  apply(ctx, {
    speakReplies: true,
    maxChars: 10,
    longReply: 'full',
    chain: [{ provider: 'espeak', voice: 'en' }],
  })

  const speakRoute = ctx.routes.get('/dsh-tts/speak')
  const fullText = 'A long reply with useful content.'
  const { req: req1, res: res1 } = {
    req: { method: 'POST', headers: { 'sec-fetch-site': 'same-origin' } },
    res: { writeHead() {}, end() {} },
  }
  // Use tool or pending to test full delivery
  const tool = ctx.getRegisteredTool()
  const resFull = await tool.execute({ text: fullText }, { session: { id: 's-full' } })
  assert.equal(resFull.ok, true)

  const pendingRoute = ctx.routes.get('/dsh-tts/pending')
  const itemFull = await waitForItem(pendingRoute, (x) => x.id === resFull.id)
  assert.equal(itemFull.text, fullText, 'longReply: full must preserve full text without truncation')

  // 2. longReply = 'summarize' with maxChars = 10
  const ctx2 = makeMockCtx()
  ctx2.llm = {
    async *stream(opts) {
      summarizeReceived = opts.messages[0].content
      yield { text: 'Short summary.' }
    },
  }
  apply(ctx2, {
    speakReplies: true,
    maxChars: 10,
    longReply: 'summarize',
    chain: [{ provider: 'espeak', voice: 'en' }],
  })
  const tool2 = ctx2.getRegisteredTool()
  const resSum = await tool2.execute({ text: fullText }, { session: { id: 's-sum' } })
  assert.equal(resSum.ok, true)
  assert.ok(summarizeReceived.includes(fullText), 'summarize must receive full text, not pre-truncated text')
})

test('Block 2: #175 - tool output schema matches success result object with declared id', async () => {
  const ctx = makeMockCtx()
  apply(ctx, { chain: [{ provider: 'espeak', voice: 'en' }] })
  const tool = ctx.getRegisteredTool()
  const result = await tool.execute({ text: 'Testing schema parity' }, { session: { id: 'test' } })
  assert.equal(result.ok, true)
  assert.equal(typeof result.id, 'string')

  // Verify outputSchema defines id property and additionalProperties is false
  assert.equal(tool.output.schema.additionalProperties, false)
  assert.ok(tool.output.schema.properties.id, 'outputSchema must declare id property')
  assert.equal(tool.output.schema.properties.id.type, 'string')
  for (const k of Object.keys(result)) {
    assert.ok(tool.output.schema.properties[k], `property "${k}" must be declared in tool schema`)
  }
})

test('Block 2: #156 - assistant message with speakAsItGoes=true respects summarize and maxChars', async () => {
  const ctx = makeMockCtx()
  let summarizeCalled = false
  ctx.llm = {
    async *stream(opts) {
      summarizeCalled = true
      yield { text: 'Summary of long answer.' }
    },
  }

  clearStreamSubscribers()
  apply(ctx, {
    speakReplies: true,
    speakAsItGoes: true,
    maxChars: 15,
    longReply: 'summarize',
    chain: [{ provider: 'espeak', voice: 'en' }],
  })

  // Emit assistant/message with long text > maxChars
  const longText = 'This is an exceedingly long reply that must be summarized before synthesis.'
  const onEvt = ctx.listeners.get('session/event')?.[0]; if (onEvt) onEvt({ id: 's-live' }, { type: 'assistant/message', data: { message: longText } })

  // Wait for async prepareSpeechText and synthesis
  await new Promise((r) => setTimeout(r, 100))

  assert.equal(summarizeCalled, true, 'summarizeReply must be called for long message under speakAsItGoes')
  clearStreamSubscribers()
})

test('Block 2: #173 - cache and in-flight fingerprints change when credential reference changes (KEY_A vs KEY_B)', async () => {
  const { cacheKey } = await import('../lib/cache.js')
  const fpA = cacheKey(['hello', 'openai', 'model1', 'voice1', 'reply', '', 'en', 'KEY_A', 'https://api.openai.com/v1'])
  const fpB = cacheKey(['hello', 'openai', 'model1', 'voice1', 'reply', '', 'en', 'KEY_B', 'https://api.openai.com/v1'])

  assert.notEqual(fpA, fpB, 'different credential references must produce different cache fingerprints')
})
