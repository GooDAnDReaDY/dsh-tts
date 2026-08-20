import { test } from 'node:test'
import assert from 'node:assert/strict'
import { makeProviders } from '../lib/providers.js'

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
