import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { EngineRegistry, detectGPU } from '../lib/engines/types.js'
import { KokoroEngine } from '../lib/engines/kokoro.js'
import { F5Engine } from '../lib/engines/f5.js'
import { createModelManager } from '../lib/engines/manager.js'

test('registry lists kokoro when installed, f5 only with GPU', () => {
  const cpuOnly = new EngineRegistry({ gpu: false, installed: ['kokoro'] })
  assert.deepEqual(cpuOnly.list().map((e) => e.id), ['kokoro'])
  const withGpu = new EngineRegistry({ gpu: true, installed: ['kokoro', 'f5'] })
  assert.deepEqual(withGpu.list().map((e) => e.id), ['kokoro', 'f5'])
})

test('kokoro does not synthesize a synthetic tone when weights exist', async () => {
  const tmp = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'dsh-tts-kokoro-'))
  const modelPath = path.join(tmp, 'kokoro-v0_19.onnx')
  await fs.promises.writeFile(modelPath, Buffer.from('not-a-real-onnx'))
  try {
    const e = new KokoroEngine({ modelPath })
    assert.equal(e.isInstalled(), true)
    assert.equal(e.isRuntimeAvailable(), false)
    await assert.rejects(async () => {
      for await (const _ of e.synthesize('hi', 'af_bella')) {
      }
    }, /not bundled/i)
  } finally {
    await fs.promises.rm(tmp, { recursive: true, force: true })
  }
})

test('f5 ping is false when python/daemon cannot run', async () => {
  const e = new F5Engine({ daemonPath: '/nonexistent/f5_daemon.py', pythonBin: 'python3' })
  assert.equal(await e.ping(), false)
})

test('f5 ping is true when the bundled daemon script can run', async () => {
  const e = new F5Engine({ daemonPath: 'scripts/f5_daemon.py' })
  assert.equal(await e.ping(), true)
  assert.equal(e.isRuntimeAvailable(), false)
  await assert.rejects(() => e.synthesize('hi'), /not bundled/i)
})

test('detectGPU resolves a boolean without throwing', async () => {
  const gpu = await detectGPU()
  assert.equal(typeof gpu, 'boolean')
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
    const initialStatus = await mm.getStatus('kokoro')
    assert.equal(initialStatus.installed, false)
    const installed = await mm.installModel('kokoro', { fetchImpl: mockFetch })
    assert.equal(installed.installed, true)
    const all = await mm.listStatus()
    assert.equal(all.kokoro.installed, true)
    assert.equal(all.f5.installed, false)
    const deleted = await mm.deleteModel('kokoro')
    assert.equal(deleted.installed, false)
    await assert.rejects(async () => {
      await mm.deleteModel('../../')
    }, /Unknown engine/)
  } finally {
    await fs.promises.rm(tmpRoot, { recursive: true, force: true }).catch(() => {})
  }
})
