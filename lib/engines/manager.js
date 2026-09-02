import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'

export const MODEL_SPECS = {
  kokoro: {
    id: 'kokoro',
    name: 'Kokoro-82M (CPU)',
    approxMb: 350,
    requiresGpu: false,
    files: [
      {
        name: 'kokoro-v0_19.onnx',
        url: 'https://huggingface.co/hexgrad/Kokoro-82M/resolve/main/kokoro-v0_19.onnx',
      },
      {
        name: 'voices.json',
        url: 'https://huggingface.co/hexgrad/Kokoro-82M/resolve/main/voices.json',
      },
    ],
  },
  f5: {
    id: 'f5',
    name: 'F5-TTS (GPU)',
    approxMb: 2100,
    requiresGpu: true,
    files: [
      {
        name: 'model_1200000.safetensors',
        url: 'https://huggingface.co/SWivid/F5-TTS/resolve/main/F5TTS_Base/model_1200000.safetensors',
      },
    ],
  },
}

export function createModelManager({ root = process.env.DSH_HOME || path.join(os.homedir(), '.dsh'), fetchImpl = fetch } = {}) {
  const baseDir = path.join(String(root), 'data', 'dsh-tts', 'models')
  const activeDownloads = new Map()

  function getModelPath(engineId) {
    return path.join(baseDir, engineId)
  }

  async function checkFileExists(filePath) {
    try {
      const st = await fs.promises.stat(filePath)
      return st.isFile() && st.size > 0
    } catch {
      return false
    }
  }

  async function getDirSize(dirPath) {
    try {
      let total = 0
      const entries = await fs.promises.readdir(dirPath, { withFileTypes: true })
      for (const entry of entries) {
        const full = path.join(dirPath, entry.name)
        if (entry.isFile()) {
          const st = await fs.promises.stat(full)
          total += st.size
        }
      }
      return total
    } catch {
      return 0
    }
  }

  async function getStatus(engineId) {
    const spec = MODEL_SPECS[engineId]
    if (!spec) {
      return { id: engineId, installed: false, error: 'unknown engine' }
    }

    const dir = getModelPath(engineId)
    const active = activeDownloads.get(engineId)

    if (active) {
      return {
        id: engineId,
        name: spec.name,
        approxMb: spec.approxMb,
        requiresGpu: spec.requiresGpu,
        installed: false,
        downloading: true,
        progress: active.progress || 0,
        downloadedBytes: active.downloadedBytes || 0,
        totalBytes: active.totalBytes || 0,
        path: dir,
      }
    }

    let allFilesExist = true
    for (const f of spec.files) {
      const p = path.join(dir, f.name)
      if (!(await checkFileExists(p))) {
        allFilesExist = false
        break
      }
    }

    const sizeBytes = allFilesExist ? await getDirSize(dir) : 0

    return {
      id: engineId,
      name: spec.name,
      approxMb: spec.approxMb,
      requiresGpu: spec.requiresGpu,
      installed: allFilesExist,
      downloading: false,
      progress: allFilesExist ? 100 : 0,
      sizeBytes,
      path: dir,
    }
  }

  async function listStatus() {
    const out = {}
    for (const id of Object.keys(MODEL_SPECS)) {
      out[id] = await getStatus(id)
    }
    return out
  }

  async function installModel(engineId, options = {}) {
    const spec = MODEL_SPECS[engineId]
    if (!spec) throw new Error(`Unknown engine: ${engineId}`)

    if (activeDownloads.has(engineId)) {
      throw new Error(`Download already in progress for ${engineId}`)
    }

    const customFetch = options.fetchImpl || fetchImpl
    const dir = getModelPath(engineId)
    await fs.promises.mkdir(dir, { recursive: true })

    const controller = new AbortController()
    const downloadState = {
      progress: 0,
      downloadedBytes: 0,
      totalBytes: spec.approxMb * 1024 * 1024,
      controller,
    }
    activeDownloads.set(engineId, downloadState)

    try {
      for (const f of spec.files) {
        if (options.signal?.aborted || controller.signal.aborted) {
          throw new Error('Download aborted')
        }

        const targetFile = path.join(dir, f.name)
        const tmpFile = path.join(dir, `${f.name}.tmp`)

        const res = await customFetch(f.url, { signal: controller.signal })
        if (!res.ok) {
          throw new Error(`Failed to download ${f.name}: HTTP ${res.status}`)
        }

        const contentLength = Number(res.headers?.get?.('content-length') || 0)
        if (contentLength > 0) {
          downloadState.totalBytes = contentLength
        }

        if (res.body && typeof res.body.getReader === 'function') {
          const reader = res.body.getReader()
          const chunks = []
          let loaded = 0

          while (true) {
            const { done, value } = await reader.read()
            if (done) break
            chunks.push(value)
            loaded += value.length
            downloadState.downloadedBytes = loaded
            downloadState.progress = Math.min(100, Math.round((loaded / (downloadState.totalBytes || 1)) * 100))
            if (typeof options.onProgress === 'function') {
              options.onProgress(downloadState)
            }
          }
          await fs.promises.writeFile(tmpFile, Buffer.concat(chunks))
        } else if (res.arrayBuffer) {
          const buf = Buffer.from(await res.arrayBuffer())
          downloadState.downloadedBytes = buf.length
          downloadState.progress = 100
          await fs.promises.writeFile(tmpFile, buf)
        } else if (typeof res.text === 'function') {
          const txt = await res.text()
          await fs.promises.writeFile(tmpFile, Buffer.from(txt, 'utf8'))
        }

        await fs.promises.rename(tmpFile, targetFile)
      }

      activeDownloads.delete(engineId)
      return await getStatus(engineId)
    } catch (err) {
      // Clean up tmp files
      for (const f of spec.files) {
        const tmpFile = path.join(dir, `${f.name}.tmp`)
        await fs.promises.rm(tmpFile, { force: true }).catch(() => {})
      }
      throw err
    } finally {
      activeDownloads.delete(engineId)
    }
  }

  async function cancelDownload(engineId) {
    const active = activeDownloads.get(engineId)
    if (active && active.controller) {
      active.controller.abort()
      activeDownloads.delete(engineId)
      return true
    }
    return false
  }

  async function deleteModel(engineId) {
    await cancelDownload(engineId)
    const dir = getModelPath(engineId)
    await fs.promises.rm(dir, { recursive: true, force: true }).catch(() => {})
    return await getStatus(engineId)
  }

  return {
    getModelPath,
    getStatus,
    listStatus,
    installModel,
    cancelDownload,
    deleteModel,
  }
}
