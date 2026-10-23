import test from 'node:test'
import assert from 'node:assert/strict'
import { EventEmitter } from 'node:events'
import fs from 'node:fs/promises'
import { edgeSpeak } from '../lib/local.js'
import { makeLocalProviders } from '../lib/providers/local.js'

function createMockSpawn(steps) {
  let callCount = 0
  const history = []
  const fn = function mockSpawn(bin, args, options) {
    const attempt = callCount++
    history.push({ bin, args, options, attempt })
    const proc = new EventEmitter()
    proc.stdout = new EventEmitter()
    proc.stderr = new EventEmitter()
    proc.stdin = new EventEmitter()
    proc.stdin.end = () => {}
    proc.kill = (sig) => { proc.killedWith = sig }

    const step = steps[attempt] || steps[steps.length - 1]
    queueMicrotask(async () => {
      if (step.error) {
        proc.emit('error', step.error)
        return
      }
      if (step.stderr) {
        proc.stderr.emit('data', Buffer.from(step.stderr))
      }
      if (step.stdout) {
        proc.stdout.emit('data', Buffer.from(step.stdout))
      }
      if (step.writeMedia) {
        const idx = args.indexOf('--write-media')
        if (idx >= 0 && args[idx + 1]) {
          try {
            await fs.writeFile(args[idx + 1], step.writeMedia)
          } catch (_e) { /* ignore */ }
        }
      }
      proc.emit('close', step.exitCode ?? 0)
    })

    return proc
  }
  return { fn, history, getCallCount: () => callCount }
}

test('Issue #212: edgeSpeak retries on transient NoAudioReceived and succeeds on subsequent attempt', async () => {
  const dummyAudio = Buffer.alloc(128, 0x42)
  const mock = createMockSpawn([
    {
      exitCode: 1,
      stderr: 'edge_tts.exceptions.NoAudioReceived: No audio was received. Please verify that your parameters are correct.',
    },
    {
      exitCode: 0,
      writeMedia: dummyAudio,
    },
  ])

  const out = await edgeSpeak('Hello world', {
    bin: 'mock-edge',
    voice: 'en-US-JennyNeural',
    timeoutMs: 1000,
    retries: 3,
    retryDelayMs: 10,
    spawnImpl: mock.fn,
  })

  assert.equal(mock.getCallCount(), 2, 'Must have retried once after initial failure')
  assert.ok(out && out.audio, 'Must return audio on second attempt')
  assert.equal(out.audio.length, 128)
  assert.equal(out.mime, 'audio/mpeg')
})

test('Issue #212: edgeSpeak retries when output file is empty (<32 bytes)', async () => {
  const dummyAudio = Buffer.alloc(128, 0x42)
  const mock = createMockSpawn([
    {
      exitCode: 0,
      writeMedia: Buffer.alloc(10), // empty/partial audio
    },
    {
      exitCode: 0,
      writeMedia: dummyAudio,
    },
  ])

  const out = await edgeSpeak('Hello world', {
    bin: 'mock-edge',
    voice: 'en-US-JennyNeural',
    timeoutMs: 1000,
    retries: 3,
    retryDelayMs: 10,
    spawnImpl: mock.fn,
  })

  assert.equal(mock.getCallCount(), 2)
  assert.equal(out.audio.length, 128)
})

test('Issue #212: edgeSpeak fails fast without retrying when binary is missing (ENOENT)', async () => {
  const enoentErr = new Error('spawn mock-missing ENOENT')
  enoentErr.code = 'ENOENT'
  const mock = createMockSpawn([
    { error: enoentErr },
  ])

  await assert.rejects(
    async () => {
      await edgeSpeak('Test', {
        bin: 'mock-missing',
        retries: 3,
        retryDelayMs: 10,
        spawnImpl: mock.fn,
      })
    },
    (err) => {
      assert.match(err.message, /ENOENT/)
      return true
    }
  )

  assert.equal(mock.getCallCount(), 1, 'Missing binary must not trigger retries')
})

test('Issue #212: edgeSpeak fails after exhausting all retries', async () => {
  const mock = createMockSpawn([
    { exitCode: 1, stderr: 'NoAudioReceived error attempt 1' },
    { exitCode: 1, stderr: 'NoAudioReceived error attempt 2' },
    { exitCode: 1, stderr: 'NoAudioReceived error attempt 3' },
  ])

  await assert.rejects(
    async () => {
      await edgeSpeak('Test', {
        bin: 'mock-edge',
        retries: 3,
        retryDelayMs: 10,
        spawnImpl: mock.fn,
      })
    },
    (err) => {
      assert.match(err.message, /exit 1/)
      return true
    }
  )

  assert.equal(mock.getCallCount(), 3, 'Must have attempted exactly 3 times before failing')
})

test('Issue #212: edgeSpeak respects AbortSignal during retry backoff', async () => {
  const controller = new AbortController()
  const mock = createMockSpawn([
    { exitCode: 1, stderr: 'NoAudioReceived' },
  ])

  const p = edgeSpeak('Test', {
    bin: 'mock-edge',
    retries: 3,
    retryDelayMs: 500,
    signal: controller.signal,
    spawnImpl: mock.fn,
  })

  // Abort while waiting for next attempt
  setTimeout(() => controller.abort(new Error('user aborted')), 50)

  await assert.rejects(
    p,
    (err) => {
      assert.match(err.message, /aborted/)
      return true
    }
  )
})

test('Issue #212: makeLocalProviders edge provider passes retries and signal from req', async () => {
  const dummyAudio = Buffer.alloc(128, 0x42)
  const mock = createMockSpawn([
    { exitCode: 1, stderr: 'NoAudioReceived' },
    { exitCode: 0, writeMedia: dummyAudio },
  ])

  const deps = {
    cfg: { edgeBin: 'mock-edge', timeoutMs: 2000, edgeRetries: 3 },
    modelManager: null,
  }
  const req = {
    text: 'Test phrase',
    lang: 'en',
    models: {},
    voices: {},
    signal: new AbortController().signal,
    edgeSpawnImpl: mock.fn, // injectable for testing
  }

  const providers = makeLocalProviders(deps, req)
  // When edge is called, it should recover on attempt 2
  const res = await providers.edge({ spawnImpl: mock.fn, retryDelayMs: 10 })
  assert.equal(res.ok, true)
  assert.equal(res.provider, 'edge')
  assert.equal(res.audio.length, 128)
  assert.equal(mock.getCallCount(), 2)
})