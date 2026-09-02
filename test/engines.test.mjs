import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { EngineRegistry } from '../lib/engines/types.js'
import { KokoroEngine } from '../lib/engines/kokoro.js'
import { F5Engine } from '../lib/engines/f5.js'
import { createModelManager } from '../lib/engines/manager.js'

test('registry lists kokoro always, f5 only with GPU', async () => {
  const r = new EngineRegistry({ gpu: false, installed: ['kokoro'] })
  assert.deepEqual(r.list().map((e) => e.id), ['kokoro'])
})

test('registry lists f5 when gpu is available and f5 is installed', async () => {
  const r = new EngineRegistry({ gpu: true, installed: ['kokoro', 'f5'] })
  assert.deepEqual(r.list().map((e) => e.id), ['kokoro', 'f5'])
})

test('kokoro synthesizes 1s of audio', async () => {
  const e = new KokoroEngine({ modelPath: 'test/fixtures/kokoro-tiny.onnx' })
  const chunks = []
  for await (const c of e.synthesize('hi', 'af_bella')) chunks.push(c)
  assert.ok(chunks[0].length > 0)
})

test('f5 daemon spawns', async () => {
  const e = new F5Engine({ daemonPath: 'scripts/f5_daemon.py' })
  assert.equal(await e.ping(), true)
})

test('ModelManager handles install, status, and delete with mocked fetch', async () => {
  const tmpRoot = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'dsh-tts-manager-test-'))
  try {
    const mockFetch = async () => ({
      ok: true,
      headers: new Map([['content-length', '1024']]),
      arrayBuffer: async () => Buffer.alloc(1024, 1),
    })

    const mm = createModelManager({ root: tmpRoot, fetchImpl: mockFetch })

    // Before install
    const initialStatus = await mm.getStatus('kokoro')
    assert.equal(initialStatus.installed, false)
    assert.equal(initialStatus.downloading, false)

    // Install
    const installed = await mm.installModel('kokoro', { fetchImpl: mockFetch })
    assert.equal(installed.installed, true)
    assert.equal(installed.progress, 100)
    assert.ok(installed.sizeBytes > 0)

    // List status
    const all = await mm.listStatus()
    assert.equal(all.kokoro.installed, true)
    assert.equal(all.f5.installed, false)

    // Delete
    const deleted = await mm.deleteModel('kokoro')
    assert.equal(deleted.installed, false)
    assert.equal(deleted.sizeBytes, 0)

    // Security check: path traversal in deleteModel must throw
    await assert.rejects(async () => {
      await mm.deleteModel('../../')
    }, /Unknown engine/)
  } finally {
    await fs.promises.rm(tmpRoot, { recursive: true, force: true }).catch(() => {})
  }
})

test('kokoro synthesizes valid WAV audio format', async () => {
  const e = new KokoroEngine({ modelPath: 'test/fixtures/kokoro-tiny.onnx' })
  const wav = await e.synthesizeWav('hello test', 'af_bella')
  assert.ok(Buffer.isBuffer(wav))
  assert.ok(wav.length > 44)
  assert.equal(wav.toString('utf8', 0, 4), 'RIFF')
  assert.equal(wav.toString('utf8', 8, 12), 'WAVE')
  assert.equal(wav.toString('utf8', 12, 16), 'fmt ')
  assert.equal(wav.readUInt32LE(24), 24000, 'sample rate must be 24000')
})
