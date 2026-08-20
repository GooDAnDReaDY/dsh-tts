import { test } from 'node:test'
import assert from 'node:assert/strict'
import { runChain } from '../lib/chain.js'

test('returns first successful provider', async () => {
  const out = await runChain(['a', 'b'], {
    a: async () => ({ ok: true, provider: 'a', audio: Buffer.from('hi'), mime: 'audio/wav' }),
    b: async () => ({ ok: true, provider: 'b', audio: Buffer.from('no'), mime: 'audio/wav' }),
  })
  assert.equal(out.provider, 'a')
  assert.equal(out.mime, 'audio/wav')
  assert.ok(out.audio.length > 0)
})

test('skips missing keys and uses the next provider', async () => {
  const out = await runChain(['a', 'b'], {
    a: async () => ({ ok: false, provider: 'a', reason: 'no key' }),
    b: async () => ({ ok: true, provider: 'b', audio: Buffer.from('ok'), mime: 'audio/mpeg' }),
  })
  assert.equal(out.provider, 'b')
})

test('throws when every provider fails', async () => {
  await assert.rejects(
    () => runChain(['a'], { a: async () => ({ ok: false, reason: 'down' }) }),
    /all providers failed/,
  )
})
