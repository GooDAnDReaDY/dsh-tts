import fs from 'node:fs'

/**
 * Local Kokoro engine wrapper.
 *
 * Real ONNX inference is intentionally not bundled in this package: shipping
 * onnxruntime + voice tensors would blow the DSH Store size budget and couple
 * the plugin to native binaries. Until a supported external runtime is wired,
 * synthesis must fail honestly — never emit a synthetic tone.
 */
export class KokoroEngine {
  constructor({ modelPath = '' } = {}) {
    this.modelPath = modelPath
    this.sampleRate = 24000
  }

  isInstalled() {
    return !!(this.modelPath && fs.existsSync(this.modelPath))
  }

  /** True only when a real inference backend can produce speech. */
  isRuntimeAvailable() {
    return false
  }

  async *synthesize() {
    throw new Error(
      'Kokoro ONNX runtime is not bundled in @goodandready/dsh-tts. ' +
      'Install weights does not enable speech. Use Edge, Piper, or eSpeak for offline TTS.',
    )
  }

  async synthesizeWav() {
    for await (const _ of this.synthesize()) {
      // unreachable: synthesize always throws
    }
    throw new Error('Kokoro synthesis unavailable')
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
