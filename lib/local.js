import { spawn } from 'node:child_process'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

function spawnCollect(bin, args, { stdinText, timeoutMs } = {}) {
  return new Promise((resolve, reject) => {
    const proc = spawn(bin, args, { stdio: ['pipe', 'pipe', 'pipe'] })
    const out = []
    const err = []
    const timer = setTimeout(() => {
      try { proc.kill('SIGKILL') } catch { /* gone */ }
      reject(new Error(`${bin} timed out`))
    }, timeoutMs || 60000)
    proc.stdout.on('data', (c) => out.push(c))
    proc.stderr.on('data', (c) => err.push(c))
    proc.on('error', (e) => {
      clearTimeout(timer)
      reject(new Error(`${bin} unavailable: ${e.message}`))
    })
    proc.on('close', (code) => {
      clearTimeout(timer)
      const stdout = Buffer.concat(out)
      const stderr = Buffer.concat(err).toString('utf8').slice(0, 240)
      if (code !== 0) {
        reject(new Error(`${bin} exit ${code}: ${stderr}`))
        return
      }
      resolve(stdout)
    })
    if (stdinText != null) {
      proc.stdin.on('error', () => {})
      proc.stdin.end(Buffer.from(String(stdinText), 'utf8'))
    } else {
      proc.stdin.end()
    }
  })
}

export async function espeakSpeak(text, { bin, voice, timeoutMs }) {
  const bytes = await spawnCollect(bin || 'espeak-ng', [
    '-v', voice || 'ru',
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

export async function edgeSpeak(text, { bin, voice, timeoutMs }) {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'dsh-tts-edge-'))
  const outFile = path.join(dir, 'out.mp3')
  try {
    await spawnCollect(bin || 'edge-tts', [
      '--voice', voice || 'ru-RU-SvetlanaNeural',
      '--text', text,
      '--write-media', outFile,
    ], { timeoutMs })
    const bytes = await readFile(outFile)
    if (!bytes || bytes.length < 32) throw new Error('edge-tts produced empty audio')
    return { audio: bytes, mime: 'audio/mpeg' }
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
}


/**
 * MiniMax через их консольную утилиту.
 *
 * Прямого HTTP тут намеренно нет: у MiniMax свой протокол с отдельным
 * идентификатором группы и своей формой ответа, а официальная утилита уже
 * умеет и авторизацию, и выбор голоса. Она же хранит вход — плагину не нужно
 * знать ни ключа, ни устройства их API.
 *
 * Утилита ставится отдельно и один раз логинится; без неё провайдер честно
 * отказывает, и цепочка идёт дальше.
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
