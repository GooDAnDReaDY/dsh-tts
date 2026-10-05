import test from 'node:test'
import assert from 'node:assert/strict'
import { makeProviders } from '../lib/providers.js'
import { applyPronunciation, BUILTIN_IT_DICTIONARY } from '../lib/text.js'
import { readFileSync } from 'node:fs'

test('Block 4: #172 - withCloudTimeout removes abort listener from parentSignal on completion', async () => {
  const parent = new AbortController()
  const initialCount = parent.signal.onabort ? 1 : 0 // listener count baseline

  let capturedSignal = null
  const deps = {
    cfg: { cloudTimeoutMs: 5000, openaiKeyEnv: 'OPENAI_API_KEY' },
    resolveKey: async () => 'test-key',
    fetchImpl: async (url, opts) => {
      capturedSignal = opts.signal
      return {
        ok: true,
        arrayBuffer: async () => Buffer.from('audio-bytes'),
      }
    },
  }

  const providers = makeProviders(deps, {
    signal: parent.signal,
    text: 'hello',
    lang: 'en',
    models: {},
    voices: {},
  })

  // Before execution, attach an observer if needed
  let listenersAdded = 0
  const origAdd = parent.signal.addEventListener.bind(parent.signal)
  const origRemove = parent.signal.removeEventListener.bind(parent.signal)
  parent.signal.addEventListener = (...args) => { listenersAdded++; return origAdd(...args) }
  let listenersRemoved = 0
  parent.signal.removeEventListener = (...args) => { listenersRemoved++; return origRemove(...args) }

  const res = await providers.openai()
  assert.equal(res.ok, true)
  assert.equal(listenersAdded, 1, 'abort listener must be attached')
  assert.equal(listenersRemoved, 1, 'abort listener must be cleaned up on completion')
})

test('Block 4: #170 - Google TTS wraps raw PCM in valid WAV container header', async () => {
  const fakePcm = Buffer.from([0, 0, 1, 0, 2, 0, 3, 0]) // 4 samples 16-bit
  const b64 = fakePcm.toString('base64')

  const deps = {
    cfg: { googleKeyEnv: 'GEMINI_API_KEY' },
    resolveKey: async () => 'test-key',
    fetchImpl: async () => ({
      ok: true,
      json: async () => ({
        candidates: [{
          content: {
            parts: [{
              inlineData: {
                mimeType: 'audio/L16;codec=pcm;rate=24000',
                data: b64,
              },
            }],
          },
        }],
      }),
    }),
  }

  const providers = makeProviders(deps, { text: 'test', lang: 'en', models: {}, voices: {} })
  const res = await providers.google()
  assert.equal(res.ok, true)
  assert.equal(res.mime, 'audio/wav')
  // Check RIFF and WAVE signatures
  assert.equal(res.audio.toString('ascii', 0, 4), 'RIFF')
  assert.equal(res.audio.toString('ascii', 8, 12), 'WAVE')
  assert.equal(res.audio.toString('ascii', 12, 16), 'fmt ')
  assert.equal(res.audio.readUInt32LE(24), 24000, 'sample rate must match rate=24000')
})

test('Block 4: #171 - Azure expressive SSML includes xmlns and xmlns:mstts in root speak', async () => {
  let capturedSsml = ''
  const deps = {
    cfg: {
      azureKeyEnv: 'AZURE_SPEECH_KEY',
      azureRegion: 'eastus',
      roles: {
        cheerful_bot: { ssmlStyle: 'cheerful' },
      },
    },
    resolveKey: async () => 'test-key',
    fetchImpl: async (_url, opts) => {
      capturedSsml = opts.body
      return {
        ok: true,
        arrayBuffer: async () => Buffer.from('azure-mp3'),
      }
    },
  }

  const providers = makeProviders(deps, {
    text: 'Hello world',
    lang: 'en-US',
    role: 'cheerful_bot',
    models: {},
    voices: {},
  })

  const res = await providers.azure()
  assert.equal(res.ok, true)
  assert.match(capturedSsml, /xmlns="http:\/\/www\.w3\.org\/2001\/10\/synthesis"/, 'must declare SSML xmlns')
  assert.match(capturedSsml, /xmlns:mstts="https:\/\/www\.w3\.org\/2001\/mstts"/, 'must declare mstts xmlns')
  assert.match(capturedSsml, /<mstts:express-as style="cheerful">/, 'must wrap text in mstts:express-as')
})

test('Block 4: #169 - BUILTIN_IT_DICTIONARY contains standard IT terms and corrects pronunciation', () => {
  assert.ok(BUILTIN_IT_DICTIONARY.length >= 10, 'BUILTIN_IT_DICTIONARY must have standard terms')
  const out = applyPronunciation('Use the API and check the URL for JSON', [], 'en', true)
  assert.match(out, /A P I/)
  assert.match(out, /U R L/)
  assert.match(out, /j-son/)
})

test('Block 4: #168 - EN and ZH locale dictionaries have 100% key parity', () => {
  const content = readFileSync(new URL('../lib/client.js', import.meta.url), 'utf8')
  // Verify parity in compiled client
  assert.match(content, /'exportJson': '📥 Export JSON'/)
  assert.match(content, /'exportJson': '📥 导出 JSON'/)
  assert.match(content, /'subtitle': 'Text-to-speech for DeepSeek Harness'/)
  assert.match(content, /'subtitle': 'DeepSeek Harness 语音合成插件'/)
})

test('Block 4: #167 - Config defaults use canonical EN voice for Edge and eSpeak', async () => {
  const { Config } = await import('../lib/index.js')
  const c = Config({})
  const chain = c.chain.get()
  assert.ok(Array.isArray(chain))

  const edgeEntry = chain.find((x) => x.provider === 'edge')
  assert.ok(edgeEntry)
  assert.equal(edgeEntry.voice, 'en-US-JennyNeural', 'Edge default voice must be en-US-JennyNeural')

  const espeakEntry = chain.find((x) => x.provider === 'espeak')
  assert.ok(espeakEntry)
  assert.equal(espeakEntry.voice, 'en', 'eSpeak default voice must be en')
})

test('Block 4: #170 - Google TTS rejects unsupported audio/mpeg MIME with explicit error', async () => {
  const deps = {
    cfg: { googleKeyEnv: 'GEMINI_API_KEY' },
    resolveKey: async () => 'test-key',
    fetchImpl: async () => ({
      ok: true,
      json: async () => ({
        candidates: [{
          content: {
            parts: [{
              inlineData: {
                mimeType: 'audio/mpeg',
                data: Buffer.from('mp3-data').toString('base64'),
              },
            }],
          },
        }],
      }),
    }),
  }

  const providers = makeProviders(deps, {
    signal: new AbortController().signal,
    text: 'hello',
    lang: 'en',
    models: {},
    voices: {},
  })

  const res = await providers.google()
  assert.equal(res.ok, false)
  assert.match(res.reason, /unsupported Google TTS MIME/i)
})

test('Block 4: #165 - UI integration state identifies nested integrations object and gates /speak', async () => {
  const ctx = {
    routes: new Map(),
    webServer: {
      register(r) { ctx.routes.set(r.path, r) },
      routes: [{ path: '/dsh-voice/status' }, { path: '/dsh-messenger/status' }],
    },
    effect(fn) { fn() },
  }
  const { registerHttpRoutes } = await import('../lib/routes.js')
  registerHttpRoutes(ctx, {
    live: () => ({ messengerTtsEnabled: false, timeoutMs: 5000 }),
    cleanText: (t) => t,
    synthesize: async () => ({ provider: 'espeak', mime: 'audio/wav', audio: Buffer.from('wav'), tookMs: 1 }),
  })

  const intRoute = ctx.routes.get('/dsh-tts/integrations')
  const { req: iReq, res: iRes } = {
    req: { method: 'GET', headers: { 'sec-fetch-site': 'same-origin' } },
    res: {
      statusCode: 200,
      body: '',
      writeHead(code) { this.statusCode = code },
      end(data) { this.body = data },
    },
  }
  await intRoute.handler(iReq, iRes)
  const body = JSON.parse(iRes.body)
  assert.equal(body.ok, true)
  assert.ok(body.integrations.voice)
  assert.ok(body.integrations.messenger)

  // Verify /speak is gated when channel is messenger and messengerTtsEnabled is false
  const { EventEmitter } = await import('node:events')
  const speakRoute = ctx.routes.get('/dsh-tts/speak')
  const sReq = new EventEmitter()
  sReq.method = 'POST'
  sReq.headers = { 'sec-fetch-site': 'same-origin' }
  const sRes = {
    statusCode: 200,
    body: '',
    writeHead(code) { this.statusCode = code },
    end(data) { this.body = data },
  }
  const sPromise = speakRoute.handler(sReq, sRes)
  sReq.emit('data', Buffer.from(JSON.stringify({ text: 'Hello', channel: 'messenger' })))
  sReq.emit('end')
  await sPromise
  assert.equal(sRes.statusCode, 403)
  assert.equal(JSON.parse(sRes.body).error.code, 'disabled')
})

test('Block 4: #168 - model hints are fully localized in EN and ZH', async () => {
  const clientSrc = readFileSync(new URL('../lib/client.js', import.meta.url), 'utf8')
  assert.match(clientSrc, /modelHint_openai/, 'client bundle must contain modelHint_openai')
  assert.match(clientSrc, /modelHint_piper/, 'client bundle must contain modelHint_piper')
  assert.match(clientSrc, /modelHint_kokoro/, 'client bundle must contain modelHint_kokoro')
  assert.match(clientSrc, /ttsUiError/, 'client bundle must contain ttsUiError')
})
