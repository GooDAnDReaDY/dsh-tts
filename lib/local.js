import { spawn } from 'node:child_process'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

function spawnCollect(bin, args, { stdinText, timeoutMs, signal, spawnImpl = spawn } = {}) {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(signal.reason instanceof Error ? signal.reason : new Error('aborted'))
      return
    }
    const proc = spawnImpl === spawn
      ? spawn(bin, args, { stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true })
      : spawnImpl(bin, args, { stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true })
    const out = []
    const err = []
    const timer = setTimeout(() => {
      try { proc.kill('SIGKILL') } catch (_err) { /* process already exited */ }
      reject(new Error(`${bin} timed out`))
    }, timeoutMs || 60000)

    let onAbort = null
    if (signal) {
      onAbort = () => {
        clearTimeout(timer)
        try { proc.kill('SIGKILL') } catch (_err) { /* process already exited */ }
        reject(signal.reason instanceof Error ? signal.reason : new Error('aborted'))
      }
      signal.addEventListener('abort', onAbort, { once: true })
    }

    const cleanup = () => {
      clearTimeout(timer)
      if (signal && onAbort) {
        try { signal.removeEventListener('abort', onAbort) } catch (_err) { /* abort listener already removed */ }
      }
    }

    proc.stdout?.on('data', (c) => out.push(c))
    proc.stderr?.on('data', (c) => err.push(c))
    proc.on('error', (e) => {
      cleanup()
      reject(new Error(`${bin} unavailable: ${e.message}`))
    })
    proc.on('close', (code) => {
      cleanup()
      const stdout = Buffer.concat(out)
      const stderr = Buffer.concat(err).toString('utf8').slice(0, 240)
      if (code !== 0) {
        reject(new Error(`${bin} exit ${code}: ${stderr}`))
        return
      }
      resolve(stdout)
    })
    if (stdinText != null) {
      proc.stdin?.on('error', () => {})
      proc.stdin?.end(Buffer.from(String(stdinText), 'utf8'))
    } else {
      proc.stdin?.end?.()
    }
  })
}

export async function espeakSpeak(text, { bin, voice, timeoutMs }) {
  const bytes = await spawnCollect(bin || 'espeak-ng', [
    '-v', voice || 'en',
    '--stdout',
    '-s', '165',
  ], { stdinText: text, timeoutMs })
  if (!bytes || bytes.length < 64) throw new Error('espeak produced empty audio')
  return { audio: bytes, mime: 'audio/wav' }
}

export async function piperSpeak(text, { bin, model, timeoutMs }) {
  if (!model) throw new Error('piper model path is empty')
  const dir = await mkdtemp(path.join(os.tmpdir(), 'dsh-tts-piper-'))
  const outFile = path.join(dir, 'out.wav')
  try {
    await spawnCollect(bin || 'piper', [
      '--model', model,
      '--output_file', outFile,
    ], { stdinText: text, timeoutMs })
    const bytes = await readFile(outFile)
    if (!bytes || bytes.length < 64) throw new Error('piper produced empty audio')
    return { audio: bytes, mime: 'audio/wav' }
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
}

export async function edgeSpeak(text, options = {}) {
  const {
    bin,
    voice,
    timeoutMs,
    retries = 3,
    retryDelayMs = 350,
    signal,
    spawnImpl = spawn,
  } = options

  const maxAttempts = Math.max(1, Number(retries) || 1)
  const dir = await mkdtemp(path.join(os.tmpdir(), 'dsh-tts-edge-'))
  const outFile = path.join(dir, 'out.mp3')
  let lastError = null

  try {
    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
      if (signal?.aborted) {
        throw signal.reason instanceof Error ? signal.reason : new Error('aborted')
      }
      try {
        await rm(outFile, { force: true })
      } catch (_err) { /* ignore cleanup error */ }

      try {
        await spawnCollect(bin || 'edge-tts', [
          '--voice', voice || 'ru-RU-SvetlanaNeural',
          '--text', text,
          '--write-media', outFile,
        ], { timeoutMs, signal, spawnImpl })

        let bytes = null
        try {
          bytes = await readFile(outFile)
        } catch (_readErr) {
          throw new Error('edge-tts produced no output file')
        }

        if (!bytes || bytes.length < 32) {
          throw new Error('edge-tts produced empty audio')
        }

        return { audio: bytes, mime: 'audio/mpeg' }
      } catch (err) {
        lastError = err
        if (signal?.aborted) throw err

        const errMsg = String((err && err.message) || err)
        if (/ENOENT|not found/i.test(errMsg)) {
          throw err
        }

        if (attempt < maxAttempts) {
          const delay = typeof retryDelayMs === 'number' ? retryDelayMs * attempt : 350
          if (delay > 0) {
            await new Promise((resolve, reject) => {
              const timer = setTimeout(resolve, delay)
              if (signal) {
                const onAbort = () => {
                  clearTimeout(timer)
                  reject(signal.reason instanceof Error ? signal.reason : new Error('aborted'))
                }
                signal.addEventListener('abort', onAbort, { once: true })
              }
            })
          }
        }
      }
    }
    throw lastError || new Error('edge-tts failed after retries')
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
}

/**
 * MiniMax via their official CLI utility.
 *
 * There is intentionally no direct HTTP here: MiniMax uses its own protocol with a
 * separate group id and response shape, while the official CLI already handles auth
 * and voice selection. It also stores the login — the plugin never sees the key.
 *
 * The utility is installed separately and logs in once; without it the provider fails honestly and the chain moves on.
 */
export async function minimaxSpeak(text, { bin, voice, model, timeoutMs }) {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'dsh-tts-minimax-'))
  const outFile = path.join(dir, 'out.mp3')
  try {
    const args = ['speech', 'synthesize', '--text', text, '--out', outFile, '--quiet', '--non-interactive']
    if (voice) args.push('--voice', voice)
    if (model) args.push('--model', model)
    await spawnCollect(bin || 'mmx', args, { timeoutMs })
    const bytes = await readFile(outFile)
    if (!bytes || bytes.length < 64) throw new Error('minimax produced empty audio')
    return { audio: bytes, mime: 'audio/mpeg' }
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
}