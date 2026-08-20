import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  DEFAULT_KEY_ENV,
  keyEnvName,
  needsApiKey,
  pendingKeyWrites,
  publicConfig,
  stripSecretsFromConfig,
} from '../lib/keys.js'

test('cloud providers need a key; local ones do not', () => {
  assert.equal(needsApiKey('deepgram'), true)
  assert.equal(needsApiKey('openai'), true)
  assert.equal(needsApiKey('edge'), false)
  assert.equal(needsApiKey('piper'), false)
  assert.equal(needsApiKey('espeak'), false)
})

test('key env names are placeholders, not values', () => {
  assert.equal(keyEnvName({}, 'deepgram'), 'DEEPGRAM_API_KEY')
  assert.equal(keyEnvName({ deepgramKeyEnv: 'MY_PROVIDER_API_KEY' }, 'deepgram'), 'MY_PROVIDER_API_KEY')
  assert.equal(DEFAULT_KEY_ENV.openai, 'OPENAI_API_KEY')
})

test('stripSecretsFromConfig never keeps the pasted key', () => {
  const stripped = stripSecretsFromConfig({
    speakReplies: true,
    openaiKeyEnv: 'OPENAI_API_KEY',
    openaiKey: 'sk-should-not-persist',
    keys: { deepgram: 'secret-value' },
    credentials: { deepgram: { configured: true } },
    chain: [{ provider: 'deepgram', model: '', voice: '' }],
  })
  assert.equal(stripped.speakReplies, true)
  assert.equal(stripped.openaiKeyEnv, 'OPENAI_API_KEY')
  assert.equal('openaiKey' in stripped, false)
  assert.equal('keys' in stripped, false)
  assert.equal('credentials' in stripped, false)
  assert.deepEqual(stripped.chain, [{ provider: 'deepgram', model: '', voice: '' }])
})

test('pendingKeyWrites skips blanks and local providers', () => {
  const writes = pendingKeyWrites({
    deepgram: '  token-1  ',
    openai: '',
    edge: 'should-ignore',
    piper: 'should-ignore',
  })
  assert.deepEqual(writes, [{ provider: 'deepgram', value: 'token-1' }])
})

test('publicConfig does not echo secrets', () => {
  const view = publicConfig({ language: 'ru', keys: { openai: 'sk-live' }, apiKey: 'x' })
  const blob = JSON.stringify(view)
  assert.equal(blob.includes('sk-live'), false)
  assert.equal(blob.includes('"x"'), false)
  assert.equal(view.language, 'ru')
})
