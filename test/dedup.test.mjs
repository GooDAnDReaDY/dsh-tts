import test from 'node:test'
import assert from 'node:assert/strict'
import { runChain } from '../lib/chain.js'

function makeInFlight() {
  const map = new Map()
  return {
    async run(flightKey, producer) {
      if (map.has(flightKey)) return map.get(flightKey)
      const p = producer().finally(() => map.delete(flightKey))
      map.set(flightKey, p)
      return p
    },
  }
}

test('concurrent syntheses with the same flight key share one producer call', async () => {
  const inflight = makeInFlight()
  let calls = 0
  const producer = async () => {
    calls += 1
    await new Promise((r) => setTimeout(r, 20))
    return { ok: true, provider: 'test', audio: Buffer.from('x'), mime: 'audio/wav' }
  }
  const [a, b] = await Promise.all([
    inflight.run('same', producer),
    inflight.run('same', producer),
  ])
  assert.equal(calls, 1)
  assert.equal(a.provider, 'test')
  assert.equal(b.provider, 'test')
})

test('different flight keys do not share a producer call', async () => {
  const inflight = makeInFlight()
  let calls = 0
  const producer = async () => {
    calls += 1
    return { ok: true, provider: 'test' }
  }
  await Promise.all([
    inflight.run('a', producer),
    inflight.run('b', producer),
  ])
  assert.equal(calls, 2)
})

test('chain still walks providers', async () => {
  const providers = {
    a: async () => ({ ok: false, provider: 'a', reason: 'no' }),
    b: async () => ({ ok: true, provider: 'b', audio: Buffer.from('ok'), mime: 'audio/wav' }),
  }
  const out = await runChain(['a', 'b'], providers)
  assert.equal(out.provider, 'b')
})
