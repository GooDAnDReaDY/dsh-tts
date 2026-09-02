import fs from 'node:fs'

export class KokoroEngine {
  constructor({ modelPath = '' } = {}) {
    this.modelPath = modelPath
    this.sampleRate = 24000
  }

  isInstalled() {
    return !!(this.modelPath && fs.existsSync(this.modelPath))
  }

  /**
   * Synthesizes audio stream yielding Float32Array PCM chunks (24kHz).
   * @param {string} text
   * @param {string} voice
   * @returns {AsyncGenerator<Float32Array>}
   */
  async *synthesize(text, voice = 'af_bella') {
    if (!text || !text.trim()) return

    // Generates 1s chunk of PCM frames (24000 samples for test/stub)
    const samples = Math.max(2400, Math.min(24000, text.length * 800))
    const chunk = new Float32Array(samples)
    for (let i = 0; i < samples; i++) {
      // Soft synthetic sine wave envelope so it does not pop
      chunk[i] = Math.sin((i * 440 * 2 * Math.PI) / this.sampleRate) * 0.2 * (1 - i / samples)
    }
    yield chunk
  }

  async synthesizeWav(text, voice = 'af_bella') {
    const chunks = []
    for await (const chunk of this.synthesize(text, voice)) {
      chunks.push(chunk)
    }
    let totalLen = 0
    for (const c of chunks) totalLen += c.length
    const merged = new Float32Array(totalLen)
    let offset = 0
    for (const c of chunks) {
      merged.set(c, offset)
      offset += c.length
    }
    return pcmFloat32ToWav(merged, this.sampleRate)
  }
}

export function pcmFloat32ToWav(samples, sampleRate = 24000) {
  const numSamples = samples.length
  const buffer = Buffer.alloc(44 + numSamples * 2)
  buffer.write('RIFF', 0)
  buffer.writeUInt32LE(36 + numSamples * 2, 4)
  buffer.write('WAVE', 8)
  buffer.write('fmt ', 12)
  buffer.writeUInt32LE(16, 16)
  buffer.writeUInt16LE(1, 20)
  buffer.writeUInt16LE(1, 22)
  buffer.writeUInt32LE(sampleRate, 24)
  buffer.writeUInt32LE(sampleRate * 2, 28)
  buffer.writeUInt16LE(2, 32)
  buffer.writeUInt16LE(16, 34)
  buffer.write('data', 36)
  buffer.writeUInt32LE(numSamples * 2, 40)
  for (let i = 0; i < numSamples; i++) {
    const s = Math.max(-1, Math.min(1, samples[i]))
    buffer.writeInt16LE(s < 0 ? s * 0x8000 : s * 0x7fff, 44 + i * 2)
  }
  return buffer
}
