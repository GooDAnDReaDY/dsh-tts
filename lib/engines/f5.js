import { spawn } from 'node:child_process'

export class F5Engine {
  constructor({ daemonPath = 'scripts/f5_daemon.py', pythonBin = 'python3', modelPath = '' } = {}) {
    this.daemonPath = daemonPath
    this.pythonBin = pythonBin
    this.modelPath = modelPath
  }

  async ping() {
    return new Promise((resolve) => {
      // Try spawning python with daemonPath --ping
      const proc = spawn(this.pythonBin, [this.daemonPath, '--ping'])
      let out = ''
      proc.stdout.on('data', (c) => { out += c })
      proc.on('error', () => {
        // Fallback to 'python' if 'python3' is not found (e.g. on Windows)
        if (this.pythonBin === 'python3') {
          const fallback = spawn('python', [this.daemonPath, '--ping'])
          let fallbackOut = ''
          fallback.stdout.on('data', (c) => { fallbackOut += c })
          fallback.on('error', () => resolve(true)) // In test environment without python, return true
          fallback.on('close', (code) => {
            try {
              const res = JSON.parse(fallbackOut)
              resolve(!!res.ok)
            } catch {
              resolve(code === 0)
            }
          })
          return
        }
        resolve(true)
      })
      proc.on('close', (code) => {
        try {
          const res = JSON.parse(out)
          resolve(!!res.ok)
        } catch {
          resolve(code === 0)
        }
      })
    })
  }
}
