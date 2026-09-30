import test from 'node:test'
import assert from 'node:assert/strict'
import { makeProviders } from '../lib/providers.js'

test('per-provider timeout protects cloud fetch from hanging indefinitely', async () => {
  let aborted = false
  const fakeFetch = (url, opts) => {
    return new Promise((resolve, reject) => {
      if (opts.signal?.aborted) {
        aborted = true
        const err = new Error('aborted')
        err.name = 'AbortError'
        return reject(err)
      }
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

test('withCloudTimeout forwards parentSignal cancellation and attaches abort listener cleanly (#145)', async () => {
  const controller = new AbortController()
  let fetchAborted = false
  const fakeFetch = (url, opts) => {
    return new Promise((resolve, reject) => {
      if (opts.signal?.aborted) {
        fetchAborted = true
        const err = new Error('aborted')
        err.name = 'AbortError'
        return reject(err)
      }
      opts.signal?.addEventListener('abort', () => {
        fetchAborted = true
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
      cfg: { cloudTimeoutMs: 200 },
    },
    {
      text: 'hello world',
      lang: 'en',
      signal: controller.signal,
      models: {},
      voices: {},
    }
  )

  const callPromise = providers.openai()
  setTimeout(() => controller.abort(new Error('user cancelled')), 10)

  await assert.rejects(callPromise, /aborted|user cancelled/)
  assert.equal(fetchAborted, true)
})

test('withCloudTimeout aborts immediately when parentSignal is already aborted (#145)', async () => {
  const controller = new AbortController()
  controller.abort(new Error('pre-aborted'))

  const providers = makeProviders(
    {
      resolveKey: async () => 'test-key',
      fetchImpl: (url, opts) => {
        if (opts.signal?.aborted) {
          const err = new Error('pre-aborted')
          err.name = 'AbortError'
          return Promise.reject(err)
        }
        return Promise.resolve({ ok: true })
      },
      cfg: { cloudTimeoutMs: 200 },
    },
    {
      text: 'hello world',
      lang: 'en',
      signal: controller.signal,
      models: {},
      voices: {},
    }
  )

  await assert.rejects(async () => {
    await providers.openai()
  }, /pre-aborted|abort/)
})
