import { spawn } from 'node:child_process'

function collectPing(pythonBin, daemonPath) {
  return new Promise((resolve) => {
    const proc = spawn(pythonBin, [daemonPath, '--ping'])
    let out = ''
    let settled = false
    const done = (ok) => {
      if (settled) return
      settled = true
      resolve(ok)
    }
    proc.stdout.on('data', (c) => { out += c })
    proc.on('error', () => done(false))
    proc.on('close', (code) => {
      if (code !== 0) {
        done(false)
        return
      }
      try {
        const res = JSON.parse(out)
        done(!!res.ok)
      } catch {
        done(false)
      }
    })
  })
}

export class F5Engine {
  constructor({ daemonPath = 'scripts/f5_daemon.py', pythonBin = 'python3', modelPath = '' } = {}) {
    this.daemonPath = daemonPath
    this.pythonBin = pythonBin
    this.modelPath = modelPath
  }

  /** Resolve true only after a successful daemon handshake. */
  async ping() {
    const primary = await collectPing(this.pythonBin, this.daemonPath)
    if (primary) return true
    if (this.pythonBin === 'python3') {
      return collectPing('python', this.daemonPath)
    }
    return false
  }

  isRuntimeAvailable() {
    return false
  }

  async synthesize() {
    throw new Error(
      'F5-TTS runtime is not bundled in @goodandready/dsh-tts. ' +
      'Use Edge, Piper, or eSpeak for offline TTS.',
    )
  }
}
