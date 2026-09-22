import fs from 'node:fs'
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { makeProviders, PROVIDER_KEYS } from '../lib/providers.js'

function cfg() {
  return {
    openaiKeyEnv: 'OPENAI_API_KEY',
    elevenlabsKeyEnv: 'ELEVENLABS_API_KEY',
    googleKeyEnv: 'GEMINI_API_KEY',
    azureKeyEnv: 'AZURE_SPEECH_KEY',
    azureRegion: '',
    groqKeyEnv: 'GROQ_API_KEY',
    deepgramKeyEnv: 'DEEPGRAM_API_KEY',
    openrouterKeyEnv: 'OPENROUTER_API_KEY',
    edgeBin: 'edge-tts-missing',
    piperBin: 'piper-missing',
    piperModel: '',
    espeakBin: 'espeak-ng-missing',
    timeoutMs: 2000,
  }
}

test('cloud providers skip when the credential is empty', async () => {
  const providers = makeProviders(
    { resolveKey: async () => '', fetchImpl: async () => { throw new Error('network should not run') }, cfg: cfg() },
    { text: 'hello', lang: 'ru', signal: undefined, models: {}, voices: {} },
  )
  for (const key of ['openai', 'elevenlabs', 'google', 'azure', 'groq', 'deepgram', 'openrouter']) {
    const out = await providers[key]()
    assert.equal(out.ok, false, key)
    assert.match(out.reason, /no |empty/)
  }
})

test('openai posts /audio/speech when a key is present', async () => {
  const calls = []
  const providers = makeProviders(
    {
      resolveKey: async () => 'sk-test',
      fetchImpl: async (url, opts) => {
        calls.push({ url, opts })
        return { ok: true, arrayBuffer: async () => new Uint8Array([1, 2, 3]).buffer }
      },
      cfg: cfg(),
    },
    { text: 'hello', lang: 'en', models: {}, voices: {} },
  )
  const out = await providers.openai()
  assert.equal(out.ok, true)
  assert.equal(out.provider, 'openai')
  assert.ok(String(calls[0].url).includes('/audio/speech'))
})

// ------------------------------------------------------------------- MiMo

function mimoDeps(fetchImpl, over = {}) {
  return {
    resolveKey: async () => (over.key !== undefined ? over.key : 'secret'),
    fetchImpl,
    cfg: {
      mimoKeyEnv: 'MIMO_API_KEY',
      mimoBaseUrl: over.baseUrl !== undefined ? over.baseUrl : 'https://api.xiaomimimo.com/v1',
      mimoFormat: over.format || 'mp3',
      timeoutMs: 60000,
    },
  }
}

const mimoJob = { text: 'привет', lang: 'ru', signal: undefined, models: {}, voices: {} }

test('MiMo synthesizes via chat endpoint and extracts audio from the response', async () => {
  let seen = {}
  const fetchImpl = async (url, init) => {
    seen = { url: String(url), body: JSON.parse(init.body), auth: init.headers.authorization }
    return { ok: true, json: async () => ({ choices: [{ message: { audio: { data: Buffer.from('звук').toString('base64') } } }] }) }
  }
  const out = await makeProviders(mimoDeps(fetchImpl), mimoJob).mimo()
  assert.equal(out.ok, true)
  assert.equal(out.mime, 'audio/mpeg')
  assert.equal(Buffer.from(out.audio).toString(), 'звук')
  assert.equal(seen.url, 'https://api.xiaomimimo.com/v1/chat/completions')
  assert.equal(seen.auth, 'Bearer secret')
  // Текст едет сообщением, а голос и формат — отдельным полем: так устроен их API.
  assert.equal(seen.body.messages[0].content, 'привет')
  assert.equal(seen.body.audio.format, 'mp3')
  assert.ok(seen.body.audio.voice)
  assert.equal(seen.body.stream, false)
})

test('MiMo wav mode returns wav', async () => {
  const fetchImpl = async () => ({ ok: true, json: async () => ({ choices: [{ message: { audio: { data: Buffer.from('w').toString('base64') } } }] }) })
  const out = await makeProviders(mimoDeps(fetchImpl, { format: 'wav' }), mimoJob).mimo()
  assert.equal(out.mime, 'audio/wav')
})

test('MiMo without a key fails softly instead of throwing', async () => {
  const out = await makeProviders(mimoDeps(async () => ({}), { key: '' }), mimoJob).mimo()
  assert.equal(out.ok, false)
  assert.match(out.reason, /MIMO_API_KEY/)
})

test('MiMo response without audio is not treated as success', async () => {
  const fetchImpl = async () => ({ ok: true, json: async () => ({ choices: [{ message: {} }] }) })
  const out = await makeProviders(mimoDeps(fetchImpl), mimoJob).mimo()
  assert.equal(out.ok, false)
  assert.match(out.reason, /audio\.data/)
})

test('MiMo error surfaces the service message', async () => {
  const fetchImpl = async () => ({ ok: false, status: 401, json: async () => ({ error: { message: 'Invalid API Key' } }) })
  await assert.rejects(makeProviders(mimoDeps(fetchImpl), mimoJob).mimo(), /MiMo HTTP 401: Invalid API Key/)
})

test('MiniMax without CLI fails clearly without breaking the chain', async () => {
  const deps = {
    resolveKey: async () => '',
    fetchImpl: async () => { throw new Error('сеть тут ни при чём') },
    cfg: { minimaxBin: '/несуществующий/mmx', timeoutMs: 5000 },
  }
  const out = await makeProviders(deps, mimoJob).minimax()
  assert.equal(out.ok, false)
  assert.ok(out.reason)
})

test('both providers are listed in PROVIDER_KEYS', () => {
  assert.ok(PROVIDER_KEYS.includes('mimo'))
  assert.ok(PROVIDER_KEYS.includes('minimax'))
  assert.ok(PROVIDER_KEYS.includes('kokoro'))
  assert.ok(PROVIDER_KEYS.includes('f5'))
})

test('makeProviders includes kokoro and f5 with honest status when uninstalled', async () => {
  const deps = {
    resolveKey: async () => '',
    fetchImpl: async () => ({ ok: true }),
    cfg: cfg(),
  }
  const providers = makeProviders(deps, { text: 'test speech', lang: 'ru', models: {}, voices: {} })
  assert.equal(typeof providers.kokoro, 'function')
  assert.equal(typeof providers.f5, 'function')
  const kOut = await providers.kokoro()
  assert.equal(kOut.ok, false)
  assert.equal(kOut.provider, 'kokoro')
  assert.match(kOut.reason, /Kokoro ONNX model not installed/)

  // Weights present still must not synthesize: runtime is not bundled.
  const tmpModel = 'test/fixtures_tmp_kokoro.onnx'
  fs.writeFileSync(tmpModel, 'fake onnx data')
  try {
    const installedDeps = {
      ...deps,
      cfg: { ...cfg(), kokoroModelPath: tmpModel },
    }
    const installedProviders = makeProviders(installedDeps, { text: 'test speech', lang: 'ru', models: {}, voices: {} })
    const kInstalled = await installedProviders.kokoro()
    assert.equal(kInstalled.ok, false)
    assert.equal(kInstalled.provider, 'kokoro')
    assert.match(kInstalled.reason, /runtime is not bundled/i)
  } finally {
    fs.unlinkSync(tmpModel)
  }

  const fOut = await providers.f5()
  assert.equal(fOut.ok, false)
  assert.equal(fOut.provider, 'f5')
  assert.ok(fOut.reason)
})
