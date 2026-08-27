import { test } from 'node:test'
import assert from 'node:assert/strict'
import { EngineRegistry } from '../lib/engines/types.js'

test('registry lists kokoro always, f5 only with GPU', async () => {
  const r = new EngineRegistry({gpu:false, installed:['kokoro']})
  assert.deepEqual(r.list().map(e=>e.id), ['kokoro'])
})
