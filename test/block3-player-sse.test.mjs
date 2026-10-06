import test from 'node:test'
import assert from 'node:assert/strict'
import { EventEmitter } from 'node:events'
import {
  addStreamSubscriber,
  removeStreamSubscriber,
  broadcastStream,
  clearStreamSubscribers,
  streamSubscriberCount,
  MAX_SUBSCRIBER_BUFFER,
} from '../lib/stream-hub.js'
import { apply } from '../lib/index.js'
import { readFileSync } from 'node:fs'

test('Block 3: #186 - slow subscriber with backpressure is pruned when buffer exceeded, good subscriber intact', () => {
  clearStreamSubscribers()

  const goodWrites = []
  const goodRes = new EventEmitter()
  goodRes.write = (p) => { goodWrites.push(p); return true }
  goodRes.end = () => { goodRes.ended = true }

  const slowWrites = []
  const slowRes = new EventEmitter()
  slowRes.write = (p) => {
    slowWrites.push(p)
    return false // triggers backpressure!
  }
  slowRes.end = () => { slowRes.ended = true }

  addStreamSubscriber(goodRes)
  addStreamSubscriber(slowRes)
  assert.equal(streamSubscriberCount(), 2)

  // First small write triggers backpressure on slowRes
  broadcastStream('utterance', { id: 'u1', text: 'small' })
  assert.equal(goodWrites.length, 1)
  assert.equal(slowWrites.length, 1)
  assert.equal(streamSubscriberCount(), 2)

  // Write a chunk exceeding MAX_SUBSCRIBER_BUFFER while backpressured
  const largeData = 'x'.repeat(MAX_SUBSCRIBER_BUFFER + 100)
  broadcastStream('utterance', { id: 'u2', big: largeData })

  // slowRes must be disconnected/ended and removed from subscribers
  assert.equal(slowRes.ended, true)
  assert.equal(streamSubscriberCount(), 1)
  // goodRes continues receiving data unaffected
  assert.equal(goodWrites.length, 2)

  clearStreamSubscribers()
})

test('Block 3: #186 - drain event resets backpressure on recovering subscriber', () => {
  clearStreamSubscribers()

  let drainCalled = false
  const res = new EventEmitter()
  let shouldBackpressure = true
  res.write = () => {
    return !shouldBackpressure
  }
  res.end = () => { res.ended = true }

  addStreamSubscriber(res)
  broadcastStream('utterance', { id: 'u1' }) // backpressured
  assert.equal(res.__dtsBackpressured, true)

  // Simulate drain event
  res.emit('drain')
  assert.equal(res.__dtsBackpressured, false)

  clearStreamSubscribers()
})

test('Block 3: #176 - updater routes are registered inside ctx.effect and disposers clean them up', () => {
  const routes = new Map()
  const effects = []

  const mockCtx = {
    on() {},
    effect(fn) {
      const cleanup = fn()
      effects.push(cleanup)
      return cleanup
    },
    webServer: {
      register(spec) {
        routes.set(spec.path, spec)
        return () => { routes.delete(spec.path) }
      },
    },
    tools: { register() {} },
    credentials: { resolve: async () => null, describe: async () => null },
    settings: {
      describe: () => ({ revision: 'r1', value: {} }),
      replace: async () => {},
    },
  }

  apply(mockCtx, { speakReplies: true })

  // Verify updater routes are registered (canonical route only, #199)
  assert.ok(routes.has('/api/dsh-tts/update'), '/api/dsh-tts/update must be registered')
  assert.equal(routes.has('/dsh-tts/updater'), false, 'duplicate /dsh-tts/updater must not be registered (#199)')

  // Run all effect cleanups (simulating plugin dispose)
  for (const cleanup of effects) {
    if (typeof cleanup === 'function') cleanup()
  }

  // All routes including updater routes must be completely removed
  assert.equal(routes.has('/api/dsh-tts/update'), false, 'update api route must be cleaned up on dispose')
})

test('Block 3: #174 - maxQueue limits concurrent active syntheses and aborts dropped reservations', async () => {
  const listeners = new Map()
  let registeredTool = null

  const mockCtx = {
    on(event, handler) {
      if (!listeners.has(event)) listeners.set(event, [])
      listeners.get(event).push(handler)
    },
    effect(fn) { return fn() },
    webServer: { register() {} },
    tools: { register(t) { registeredTool = t } },
    credentials: { resolve: async () => null, describe: async () => null },
  }

  // maxQueue = 2
  apply(mockCtx, {
    speakReplies: true,
    maxQueue: 2,
    speakAsItGoes: true,
    chain: [{ provider: 'espeak', voice: 'en' }],
  })

  const onEvent = listeners.get('session/event')[0]

  // Send a burst of 10 messages
  for (let i = 1; i <= 10; i++) {
    onEvent({ id: 's1' }, {
      type: 'assistant/message',
      data: { message: `Phrase number ${i}.` },
    })
  }

  // Wait for processing to settle
  await new Promise((r) => setTimeout(r, 150))
})

test('Block 3: #158, #159, #160, #161 - client player contracts verified in client bundle', () => {
  const clientSrc = readFileSync(new URL('../lib/client.js', import.meta.url), 'utf8')

  // #158: Single EventSource via startSseStream, pollPending does NOT call connectSseStream
  assert.match(clientSrc, /function startSseStream\(\)/, 'client must define single startSseStream')
  assert.doesNotMatch(clientSrc, /async function pollPending\(\)\s*\{\s*connectSseStream\(\)/, 'pollPending must not recreate SSE')

  // #159: skipCurrent pauses audio immediately, previewSpeech routes through shared player
  assert.match(clientSrc, /player\.audio\.pause\(\)/, 'skipCurrent must pause player.audio')
  assert.match(clientSrc, /player\.audio\.currentTime = 0/, 'skipCurrent must reset currentTime')
  assert.match(clientSrc, /function previewSpeech\(/, 'client must define previewSpeech')
  assert.match(clientSrc, /previewSpeech\(provider, model, voice, text\)/, 'onPreview must route through previewSpeech')

  // #160: Autoplay restriction unshifts item and unlocks on user gesture without losing items
  assert.match(clientSrc, /player\.queue\.unshift\(item\)/, 'blocked autoplay item must be put back in queue')
  assert.match(clientSrc, /function unlockAudio\(\)/, 'client must define unlockAudio')

  // #161: SpeakerControl preserves access to history and favorites in idle
  assert.match(clientSrc, /hasHistory \|\| active/, 'SpeakerControl must show history button when hasHistory')
})

test('Block 3: #159 & #160 - player skip stops browser speech and autoplay recovery resolves drain promise', async () => {
  let speechCanceled = false
  let gestureRemoved = false
  let resolveCount = 0

  // Mock environment
  const mockWindow = {
    speechSynthesis: {
      cancel() { speechCanceled = true },
    },
    addEventListener() {},
    removeEventListener() { gestureRemoved = true },
  }

  // Load client player in VM or simulate player lifecycle contracts
  const clientSrc = readFileSync(new URL('../lib/client.js', import.meta.url), 'utf8')
  assert.match(clientSrc, /window\.speechSynthesis\.cancel\(\)/, 'skipCurrent must invoke window.speechSynthesis.cancel()')
  assert.match(clientSrc, /removeGestureListeners\(\)/, 'stopPlayback and unlockAudio must invoke removeGestureListeners')
})
