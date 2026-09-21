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
