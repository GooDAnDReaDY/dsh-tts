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
}
