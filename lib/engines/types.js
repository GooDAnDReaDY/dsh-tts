import { execFile } from 'node:child_process'
import { promisify } from 'node:util'

const execFileAsync = promisify(execFile)

let gpuCache

export async function detectGPU() {
  if (typeof gpuCache === 'boolean') return gpuCache
  try {
    const { stdout } = await execFileAsync(
      'nvidia-smi',
      ['--query-gpu=name', '--format=csv,noheader'],
      { timeout: 2000 },
    )
    gpuCache = !!(stdout && stdout.trim())
  } catch {
    gpuCache = false
  }
  return gpuCache
}

export class EngineRegistry {
  constructor({ gpu = false, installed = [], manager = null } = {}) {
    this.gpu = !!gpu
    this.installed = Array.isArray(installed) ? installed : []
    this.manager = manager || null
  }

  static async create({ installed, manager } = {}) {
    const gpu = await detectGPU()
    return new EngineRegistry({ gpu, installed, manager })
  }

  isInstalled(engineId) {
    return this.installed.includes(engineId)
  }

  list() {
    const list = []
    // Kokoro weights may be present, but inference is not bundled.
    if (this.installed.includes('kokoro')) {
      list.push({
        id: 'kokoro',
        name: 'Kokoro-82M',
        type: 'local-cpu',
        runtimeAvailable: false,
        supports: (lang) => !lang || ['en', 'ru', 'ja', 'zh'].includes(String(lang).slice(0, 2).toLowerCase()),
      })
    }
    if (this.gpu && this.installed.includes('f5')) {
      list.push({
        id: 'f5',
        name: 'F5-TTS',
        type: 'local-gpu',
        runtimeAvailable: false,
        supports: () => true,
      })
    }
    return list
  }
}
