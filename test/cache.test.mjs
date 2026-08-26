import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { cacheKey, createSpeechCache } from '../lib/cache.js'

function fresh(maxBytes) {
  const root = mkdtempSync(join(tmpdir(), 'dsh-tts-cache-'))
  const cache = createSpeechCache({ root, maxBytes })
  return { cache, cleanup: () => rmSync(root, { recursive: true, force: true }) }
}

test('put and get preserve bytes and mime', async () => {
  const { cache, cleanup } = fresh(10 * 1024 * 1024)
  try {
    const key = cacheKey(['text', 'edge', 'model', 'voice'])
    await cache.put(key, 'audio/wav', Buffer.from([1, 2, 3]))
    const hit = await cache.get(key)
    assert.ok(hit, 'hit expected')
    assert.equal(hit.mime, 'audio/wav')
    assert.deepEqual([...hit.audio], [1, 2, 3])
  } finally { cleanup() }
})

test('miss returns null instead of throwing', async () => {
  const { cache, cleanup } = fresh(1024 * 1024)
  try {
    assert.equal(await cache.get(cacheKey(['nope'])), null)
  } finally { cleanup() }
})

test('evicts least recently used over the limit', async () => {
  const kb = 1024
  const { cache, cleanup } = fresh(2 * kb + 10)
  const wait = (ms) => new Promise((r) => setTimeout(r, ms))
  try {
    const k1 = cacheKey(['one'])
    const k2 = cacheKey(['two'])
    const k3 = cacheKey(['three'])
    await cache.put(k1, 'audio/mpeg', Buffer.alloc(kb, 1))
    await wait(5)
    await cache.put(k2, 'audio/mpeg', Buffer.alloc(kb, 2))
    await wait(5)
    await cache.get(k1) // k1 свежее k2
    await wait(5)
    await cache.put(k3, 'audio/mpeg', Buffer.alloc(kb, 3))
    assert.equal(await cache.get(k2), null, 'k2 должен быть вытеснен первым')
    assert.ok(await cache.get(k1), 'k1 ещё жив')
    assert.ok(await cache.get(k3), 'k3 жив')
  } finally { cleanup() }
})

test('clear removes everything and reports the count', async () => {
  const { cache, cleanup } = fresh(1024 * 1024)
  try {
    await cache.put(cacheKey(['a']), 'audio/mpeg', Buffer.from([9]))
    await cache.put(cacheKey(['b']), 'audio/mpeg', Buffer.from([8]))
    const removed = await cache.clear()
    assert.equal(removed, 2)
    assert.equal(await cache.get(cacheKey(['a'])), null)
  } finally { cleanup() }
})
