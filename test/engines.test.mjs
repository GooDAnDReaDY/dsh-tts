function makeValidModelFetch(delay = 0, onCall = null) {
  return async (url) => {
    if (onCall) onCall(url)
    if (delay > 0) await new Promise((r) => setTimeout(r, delay))
    const urlStr = String(url || '')
    if (urlStr.endsWith('.json') || urlStr.includes('voices')) {
      const data = Buffer.from(JSON.stringify({ default: 'en' }).padEnd(1024, ' '))
      return {
        ok: true,
        headers: new Map([['content-length', String(data.length)]]),
        arrayBuffer: async () => data,
        body: {
          getReader() {
            let sent = false
            return {
              async read() {
                if (sent) return { done: true }
                sent = true
                return { done: false, value: data }
              }
            }
          }
        }
      }
    }
    const data = Buffer.alloc(1024)
    data[0] = 0x08
    for (let i = 1; i < 1024; i++) data[i] = i % 256
    return {
      ok: true,
      headers: new Map([['content-length', '1024']]),
      arrayBuffer: async () => data,
      body: {
        getReader() {
          let chunksRemaining = 50
          return {
            async read() {
              if (chunksRemaining <= 0) return { done: true }
              chunksRemaining--
              const chunk = Buffer.alloc(100)
              if (chunksRemaining === 49) chunk[0] = 0x08
              for (let i = (chunksRemaining === 49 ? 1 : 0); i < 100; i++) chunk[i] = (chunksRemaining * 100 + i) % 256
              return { done: false, value: chunk }
            }
          }
        }
      }
    }
  }
}

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
    const mockFetch = makeValidModelFetch(0)
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


test('ModelManager redacts absolute host paths from getStatus and listStatus', async () => {
  const tmpRoot = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'dsh-tts-manager-path-test-'))
  try {
    const mm = createModelManager({ root: tmpRoot })
    const status = await mm.getStatus('kokoro')
    assert.equal(status.path, undefined, 'status must not expose host path')
    const list = await mm.listStatus()
    for (const item of Object.values(list)) {
      assert.equal(item.path, undefined, 'listStatus must not expose host path')
    }
  } finally {
    await fs.promises.rm(tmpRoot, { recursive: true, force: true }).catch(() => {})
  }
})

test('ModelManager tracks sanitized errors on install failure and clears on recovery', async () => {
  const tmpRoot = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'dsh-tts-manager-err-test-'))
  try {
    let shouldFail = true
    const validFetch = makeValidModelFetch(0)
    const mockFetch = async (url, opts) => {
      if (shouldFail) {
        throw new Error(`Failed to fetch from ${url}`)
      }
      return validFetch(url, opts)
    }
    const mm = createModelManager({ root: tmpRoot, fetchImpl: mockFetch })

    // 1. Initial state: not installed, not failed
    const st1 = await mm.getStatus('kokoro')
    assert.equal(st1.installed, false)
    assert.equal(st1.failed, false)
    assert.equal(st1.error, null)

    // 2. Failed install
    await assert.rejects(async () => {
      await mm.installModel('kokoro', { fetchImpl: mockFetch })
    }, /Failed to fetch/)

    const stFailed = await mm.getStatus('kokoro')
    assert.equal(stFailed.installed, false)
    assert.equal(stFailed.failed, true)
    assert.ok(stFailed.error, 'must report error message')
    assert.doesNotMatch(stFailed.error, /https?:\/\//, 'raw URL must be sanitized')

    // 3. Recovery via successful install
    shouldFail = false
    const stRecovered = await mm.installModel('kokoro', { fetchImpl: mockFetch })
    assert.equal(stRecovered.installed, true)
    assert.equal(stRecovered.failed, false)
    assert.equal(stRecovered.error, null)

    // 4. Delete clears installed and error
    const stDeleted = await mm.deleteModel('kokoro')
    assert.equal(stDeleted.installed, false)
    assert.equal(stDeleted.failed, false)
    assert.equal(stDeleted.error, null)
  } finally {
    await fs.promises.rm(tmpRoot, { recursive: true, force: true }).catch(() => {})
  }
})
