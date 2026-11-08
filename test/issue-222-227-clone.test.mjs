import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { PROVIDER_KEYS, DEFAULT_MODELS, DEFAULT_VOICES } from '../lib/providers/constants.js'
import { makeLocalProviders } from '../lib/providers/local.js'

test('Issue #222: PROVIDER_KEYS includes cosyvoice and has valid defaults', () => {
  assert.ok(PROVIDER_KEYS.includes('cosyvoice'), 'PROVIDER_KEYS must include cosyvoice')
  assert.equal(DEFAULT_MODELS.cosyvoice, 'CosyVoice2-0.5B')
  assert.equal(DEFAULT_VOICES.cosyvoice, 'alex')
})

test('Issue #222: CosyVoice provider synthesis and error handling', async () => {
  const fakeWav = Buffer.from('RIFF$---WAVEfmt ')
  let calledUrl = null
  let calledBody = null

  const mockFetch = async (url, opts) => {
    calledUrl = url
    calledBody = JSON.parse(opts.body)
    if (url.includes('9999')) {
      throw new Error('Connection refused')
    }
    return {
      ok: true,
      status: 200,
      arrayBuffer: async () => fakeWav.buffer.slice(fakeWav.byteOffset, fakeWav.byteOffset + fakeWav.byteLength),
    }
  }

  // 1. Success case
  const okDeps = {
    cfg: { cosyvoiceUrl: 'http://127.0.0.1:9233' },
    fetchImpl: mockFetch,
  }
  const provs = makeLocalProviders(okDeps, {
    text: 'Привет от CosyVoice',
    models: { cosyvoice: 'CosyVoice2-0.5B' },
    voices: { cosyvoice: 'alex' },
  })
  const res = await provs.cosyvoice()
  assert.equal(res.ok, true)
  assert.equal(res.provider, 'cosyvoice')
  assert.equal(res.mime, 'audio/wav')
  assert.deepEqual(res.audio, fakeWav)
  assert.ok(calledUrl.includes('9233'))
  assert.equal(calledBody.spk_id, 'alex')

  // 2. Unreachable service case (fail-closed, falls back gracefully)
  const failDeps = {
    cfg: { cosyvoiceUrl: 'http://127.0.0.1:9999' },
    fetchImpl: mockFetch,
  }
  const failProvs = makeLocalProviders(failDeps, { text: 'test' })
  const failRes = await failProvs.cosyvoice()
  assert.equal(failRes.ok, false)
  assert.equal(failRes.provider, 'cosyvoice')
  assert.match(failRes.reason, /Connection refused/)
})

test('Issue #227: Voice clone endpoint and validation', async () => {
  const tmpDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'dsh-tts-clone-test-'))
  try {
    const { handleVoiceClone } = await import('../lib/routes.js')
    assert.equal(typeof handleVoiceClone, 'function', 'handleVoiceClone should be exported for tests')

    const fakeAudio = Buffer.from('RIFFsampleaudioWAVE')
    const sampleB64 = fakeAudio.toString('base64')

    // 1. Invalid name validation
    const badName = await handleVoiceClone({
      name: '../bad_path',
      sample: sampleB64,
      engine: 'local',
      rootDir: tmpDir,
    })
    assert.equal(badName.ok, false)
    assert.match(badName.error, /Invalid voice name/)

    // 2. Empty/bad sample validation
    const badSample = await handleVoiceClone({
      name: 'my_voice',
      sample: 'not_base64_audio',
      engine: 'local',
      rootDir: tmpDir,
    })
    assert.equal(badSample.ok, false)
    assert.match(badSample.error, /sample/)

    // 3. Successful local clone
    const success = await handleVoiceClone({
      name: 'hero_voice',
      sample: sampleB64,
      engine: 'local',
      rootDir: tmpDir,
    })
    assert.equal(success.ok, true)
    assert.equal(success.voiceId, 'hero_voice')
    assert.ok(fs.existsSync(success.path), 'Cloned sample file must exist on disk')
    const saved = await fs.promises.readFile(success.path)
    assert.deepEqual(saved, fakeAudio)
  } finally {
    await fs.promises.rm(tmpDir, { recursive: true, force: true }).catch(() => {})
  }
})