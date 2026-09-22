import test from 'node:test'
import assert from 'node:assert/strict'
import { makeProviders } from '../lib/providers.js'

test('per-provider timeout protects cloud fetch from hanging indefinitely', async () => {
  let aborted = false
  const fakeFetch = (url, opts) => {
    return new Promise((resolve, reject) => {
      opts.signal?.addEventListener('abort', () => {
        aborted = true
        const err = new Error('aborted')
        err.name = 'AbortError'
        reject(err)
      })
    })
  }

  const providers = makeProviders(
    {
      resolveKey: async () => 'test-key',
      fetchImpl: fakeFetch,
      cfg: { cloudTimeoutMs: 50 },
    },
    {
      text: 'hello world',
      lang: 'en',
      models: {},
      voices: {},
    }
  )

  await assert.rejects(async () => {
    await providers.openai()
  }, /abort|HTTP|timeout/)
  assert.equal(aborted, true)
})
