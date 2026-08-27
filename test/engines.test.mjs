import { test } from 'node:test'
import assert from 'node:assert/strict'
import { EngineRegistry } from '../lib/engines/types.js'

test('registry lists kokoro always, f5 only with GPU', async () => {
  const r = new EngineRegistry({gpu:false, installed:['kokoro']})
  assert.deepEqual(r.list().map(e=>e.id), ['kokoro'])
})

import { KokoroEngine } from '../lib/engines/kokoro.js'
test('kokoro synthesizes 1s of audio', async () => {
  const e = new KokoroEngine({modelPath: 'test/fixtures/kokoro-tiny.onnx'})
  const chunks=[]; for await(const c of e.synthesize('hi','af_bella')) chunks.push(c)
  assert.ok(chunks[0].length>0)
})

import { F5Engine } from '../lib/engines/f5.js'
test('f5 daemon spawns', async () => {
  const e = new F5Engine({daemonPath:'scripts/f5_daemon.py'})
  assert.equal(await e.ping(), true)
})
