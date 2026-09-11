import test from 'node:test'
import assert from 'node:assert/strict'
import { createProviderBreaker } from '../lib/breaker.js'

test('breaker opens after threshold consecutive failures', () => {
  let now = 1000
  const b = createProviderBreaker({ threshold: 3, cooldownMs: 5000, now: () => now })
  assert.equal(b.isOpen('edge'), false)
  b.recordFailure('edge', new Error('boom1'))
  b.recordFailure('edge', 'boom2')
  assert.equal(b.isOpen('edge'), false)
  b.recordFailure('edge', 'boom3')
  assert.equal(b.isOpen('edge'), true)
  const snap = b.snapshot(['edge'])[0]
  assert.equal(snap.open, true)
  assert.equal(snap.failCount, 3)
  assert.match(snap.lastError, /boom3/)
})

test('breaker closes after cooldown or success', () => {
  let now = 0
  const b = createProviderBreaker({ threshold: 2, cooldownMs: 1000, now: () => now })
  b.recordFailure('a', 'x')
  b.recordFailure('a', 'y')
  assert.equal(b.isOpen('a'), true)
  now = 1001
  assert.equal(b.isOpen('a'), false)
  b.recordFailure('a', 'z')
  b.recordFailure('a', 'z2')
  assert.equal(b.isOpen('a'), true)
  b.recordSuccess('a')
  assert.equal(b.isOpen('a'), false)
  assert.equal(b.snapshot(['a'])[0].failCount, 0)
})