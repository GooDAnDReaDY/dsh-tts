import { test } from 'node:test'
import assert from 'node:assert/strict'
import { PROVIDER_KEYS, DEFAULT_MODELS, DEFAULT_VOICES } from '../lib/providers/constants.js'
import { CLOUD_PROVIDERS, KEY_ENV_FIELD, DEFAULT_KEY_ENV } from '../lib/keys.js'
import { makeCloudProviders } from '../lib/providers/cloud.js'

test('Issue #221 & #223: PROVIDER_KEYS and keys.js include doubao and deepseek-web', () => {
  assert.ok(PROVIDER_KEYS.includes('doubao'), 'PROVIDER_KEYS must include doubao')
  assert.ok(PROVIDER_KEYS.includes('deepseek-web'), 'PROVIDER_KEYS must include deepseek-web')
  assert.ok(CLOUD_PROVIDERS.includes('doubao'), 'CLOUD_PROVIDERS must include doubao')
  assert.ok(CLOUD_PROVIDERS.includes('deepseek-web'), 'CLOUD_PROVIDERS must include deepseek-web')
  assert.equal(KEY_ENV_FIELD.doubao, 'doubaoKeyEnv')
  assert.equal(KEY_ENV_FIELD['deepseek-web'], 'deepseekWebKeyEnv')
  assert.equal(DEFAULT_KEY_ENV.doubao, 'DOUBAO_API_KEY')
  assert.equal(DEFAULT_KEY_ENV['deepseek-web'], 'DEEPSEEK_WEB_TOKEN')
  assert.ok(DEFAULT_MODELS.doubao)
  assert.ok(DEFAULT_VOICES.doubao)
  assert.ok(DEFAULT_MODELS['deepseek-web'])
  assert.ok(DEFAULT_VOICES['deepseek-web'])
})

test('Issue #221: Doubao provider synthesis flow and error handling', async () => {
  const fakeAudio = Buffer.from('RIFF....WAVEfmt ')
  let lastCall = null

  const mockFetch = async (url, opts) => {
    lastCall = { url, opts }
    const body = JSON.parse(opts.body)
    if (body.app.appid === 'bad_app') {
      return {
        ok: false,
        status: 400,
        json: async () => ({ code: 1001, message: 'Invalid appid' }),
      }
    }
    return {
      ok: true,
      status: 200,
      json: async () => ({
        code: 3000,
        message: 'Success',
        data: fakeAudio.toString('base64'),
      }),
    }
  }

  // 1. Missing key
  const noKeyDeps = {
    resolveKey: async () => null,
    fetchImpl: mockFetch,
    cfg: { doubaoKeyEnv: 'DOUBAO_API_KEY', doubaoAppId: 'app123' },
  }
  const noKeyProv = makeCloudProviders(noKeyDeps, { text: 'Hello' }, () => ({ signal: null, cleanup: () => {} }))
  const r1 = await noKeyProv.doubao()
  assert.equal(r1.ok, false)
  assert.match(r1.reason, /no DOUBAO_API_KEY/)

  // 2. Missing appId
  const noAppDeps = {
    resolveKey: async () => 'secret_token',
    fetchImpl: mockFetch,
    cfg: { doubaoKeyEnv: 'DOUBAO_API_KEY', doubaoAppId: '' },
  }
  const noAppProv = makeCloudProviders(noAppDeps, { text: 'Hello' }, () => ({ signal: null, cleanup: () => {} }))
  const r2 = await noAppProv.doubao()
  assert.equal(r2.ok, false)
  assert.match(r2.reason, /no doubaoAppId/)

  // 3. Successful synthesis
  const successDeps = {
    resolveKey: async () => 'volc_secret_token',
    fetchImpl: mockFetch,
    cfg: {
      doubaoKeyEnv: 'DOUBAO_API_KEY',
      doubaoAppId: 'app_999',
      doubaoCluster: 'volcano_tts',
      doubaoBaseUrl: 'https://openspeech.bytedance.com/api/v1/tts',
    },
  }
  const successProv = makeCloudProviders(successDeps, { text: 'Hello world', voices: { doubao: 'BV001_streaming' } }, () => ({ signal: null, cleanup: () => {} }))
  const r3 = await successProv.doubao()
  assert.equal(r3.ok, true)
  assert.equal(r3.provider, 'doubao')
  assert.equal(r3.mime, 'audio/mpeg')
  assert.deepEqual(r3.audio, fakeAudio)
  assert.equal(lastCall.opts.headers.authorization, 'Bearer; volc_secret_token')

  // 4. API Error
  const failDeps = {
    resolveKey: async () => 'volc_secret_token',
    fetchImpl: mockFetch,
    cfg: {
      doubaoKeyEnv: 'DOUBAO_API_KEY',
      doubaoAppId: 'bad_app',
    },
  }
  const failProv = makeCloudProviders(failDeps, { text: 'test' }, () => ({ signal: null, cleanup: () => {} }))
  await assert.rejects(async () => await failProv.doubao(), /Doubao/)
})

test('Issue #223: DeepSeek Web Audio Bridge synthesis flow and fallback', async () => {
  const fakeAudio = Buffer.from('FAKE_DEEPSEEK_VOICE_STREAM')
  let lastCall = null

  const mockFetch = async (url, opts) => {
    lastCall = { url, opts }
    if (opts.headers.authorization === 'Bearer invalid_token') {
      return {
        ok: false,
        status: 401,
        text: async () => 'Unauthorized session token',
      }
    }
    return {
      ok: true,
      status: 200,
      headers: {
        get: (h) => (h.toLowerCase() === 'content-type' ? 'audio/mpeg' : null),
      },
      arrayBuffer: async () => fakeAudio.buffer.slice(fakeAudio.byteOffset, fakeAudio.byteOffset + fakeAudio.byteLength),
    }
  }

  // 1. Missing session token
  const noTokenDeps = {
    resolveKey: async () => null,
    fetchImpl: mockFetch,
    cfg: { deepseekWebKeyEnv: 'DEEPSEEK_WEB_TOKEN' },
  }
  const noTokenProv = makeCloudProviders(noTokenDeps, { text: 'Hello' }, () => ({ signal: null, cleanup: () => {} }))
  const r1 = await noTokenProv['deepseek-web']()
  assert.equal(r1.ok, false)
  assert.match(r1.reason, /no DEEPSEEK_WEB_TOKEN/)

  // 2. Successful synthesis
  const successDeps = {
    resolveKey: async () => 'user_session_token_xyz',
    fetchImpl: mockFetch,
    cfg: {
      deepseekWebKeyEnv: 'DEEPSEEK_WEB_TOKEN',
      deepseekWebBaseUrl: 'https://chat.deepseek.com/api/v0/chat/voice',
    },
  }
  const successProv = makeCloudProviders(successDeps, { text: 'DeepSeek Voice synthesis', voices: {} }, () => ({ signal: null, cleanup: () => {} }))
  const r2 = await successProv['deepseek-web']()
  assert.equal(r2.ok, true)
  assert.equal(r2.provider, 'deepseek-web')
  assert.equal(r2.mime, 'audio/mpeg')
  assert.deepEqual(r2.audio, fakeAudio)
  assert.equal(lastCall.opts.headers.authorization, 'Bearer user_session_token_xyz')

  // 3. Fallback on invalid/expired session
  const failDeps = {
    resolveKey: async () => 'invalid_token',
    fetchImpl: mockFetch,
    cfg: { deepseekWebKeyEnv: 'DEEPSEEK_WEB_TOKEN' },
  }
  const failProv = makeCloudProviders(failDeps, { text: 'test' }, () => ({ signal: null, cleanup: () => {} }))
  await assert.rejects(async () => await failProv['deepseek-web'](), /DeepSeek Web HTTP 401/)
})