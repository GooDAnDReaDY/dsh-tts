import { execSync } from 'node:child_process'

export function detectGPU() {
  try {
    const out = execSync('nvidia-smi --query-gpu=name --format=csv,noheader', {
      stdio: ['ignore', 'pipe', 'ignore'],
      timeout: 2000,
      encoding: 'utf8',
    })
    return !!(out && out.trim())
  } catch {
    return false
  }
}

export class EngineRegistry {
  constructor({ gpu, installed, manager } = {}) {
    this.gpu = typeof gpu === 'boolean' ? gpu : detectGPU()
    this.installed = Array.isArray(installed) ? installed : []
    this.manager = manager || null
  }

  isInstalled(engineId) {
    return this.installed.includes(engineId)
  }

  list() {
    const list = []
    // Kokoro works on CPU everywhere
    if (this.installed.includes('kokoro')) {
      list.push({
        id: 'kokoro',
        name: 'Kokoro-82M',
        type: 'local-cpu',
        supports: (lang) => !lang || ['en', 'ru', 'ja', 'zh'].includes(String(lang).slice(0, 2).toLowerCase()),
      })
    }
    // F5-TTS requires GPU
    if (this.gpu && this.installed.includes('f5')) {
      list.push({
        id: 'f5',
        name: 'F5-TTS',
        type: 'local-gpu',
        supports: () => true,
      })
    }
    return list
  }
}
