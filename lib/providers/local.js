import { edgeSpeak, espeakSpeak, minimaxSpeak, piperSpeak } from "../local.js"
import { KokoroEngine } from "../engines/kokoro.js"
import { F5Engine } from "../engines/f5.js"
import { DEFAULT_MODELS, DEFAULT_VOICES } from "./constants.js"

function pick(map, models, key) {
  const chosen = models && typeof models[key] === "string" ? models[key].trim() : ""
  return chosen || map[key]
}

export function makeLocalProviders(deps, req) {
  const { cfg, modelManager } = deps
  const { text, lang, models, voices } = req

  async function edge() {
    try {
      const voice = pick(DEFAULT_VOICES, voices, 'edge') || pick(DEFAULT_MODELS, models, 'edge')
      const out = await edgeSpeak(text, { bin: cfg.edgeBin, voice, timeoutMs: cfg.timeoutMs })
      return { ok: true, provider: 'edge', audio: out.audio, mime: out.mime }
    } catch (e) {
      return { ok: false, provider: 'edge', reason: String(e && e.message || e) }
    }
  }
  async function piper() {
    try {
      const model = pick(DEFAULT_MODELS, models, 'piper') || cfg.piperModel
      const out = await piperSpeak(text, { bin: cfg.piperBin, model, timeoutMs: cfg.timeoutMs })
      return { ok: true, provider: 'piper', audio: out.audio, mime: out.mime }
    } catch (e) {
      return { ok: false, provider: 'piper', reason: String(e && e.message || e) }
    }
  }
  async function espeak() {
    try {
      const voice = pick(DEFAULT_VOICES, voices, 'espeak') || lang || 'ru'
      const out = await espeakSpeak(text, { bin: cfg.espeakBin, voice, timeoutMs: cfg.timeoutMs })
      return { ok: true, provider: 'espeak', audio: out.audio, mime: out.mime }
    } catch (e) {
      return { ok: false, provider: 'espeak', reason: String(e && e.message || e) }
    }
  }
  async function kokoro() {
    try {
      const modelPath = deps.modelManager ? deps.modelManager.getModelPath('kokoro') : (cfg.kokoroModelPath || '')
      const engine = new KokoroEngine({ modelPath })
      if (!engine.isInstalled()) {
        return { ok: false, provider: 'kokoro', reason: 'Kokoro ONNX model not installed. Use Edge, Piper, or eSpeak for offline TTS.' }
      }
      if (!engine.isRuntimeAvailable()) {
        return {
          ok: false,
          provider: 'kokoro',
          reason: 'Kokoro ONNX runtime is not bundled. Weights alone do not produce speech. Use Edge, Piper, or eSpeak for offline TTS.',
        }
      }
      const voice = pick(DEFAULT_VOICES, voices, 'kokoro') || 'af_bella'
      const audio = await engine.synthesizeWav(text, voice)
      return { ok: audio && audio.length > 0, provider: 'kokoro', audio, mime: 'audio/wav' }
    } catch (e) {
      return { ok: false, provider: 'kokoro', reason: String(e && e.message || e) }
    }
  }
  async function f5() {
    try {
      const modelPath = deps.modelManager ? deps.modelManager.getModelPath('f5') : ''
      const engine = new F5Engine({ modelPath })
      const ok = await engine.ping()
      if (!ok) {
        return { ok: false, provider: 'f5', reason: 'F5 daemon unavailable. Use Edge, Piper, or eSpeak for offline TTS.' }
      }
      if (!engine.isRuntimeAvailable()) {
        return {
          ok: false,
          provider: 'f5',
          reason: 'F5-TTS synthesis is not bundled. Use Edge, Piper, or eSpeak for offline TTS.',
        }
      }
      const audio = await engine.synthesize(text)
      return { ok: !!(audio && audio.length), provider: 'f5', audio, mime: 'audio/wav' }
    } catch (e) {
      return { ok: false, provider: 'f5', reason: String(e && e.message || e) }
    }
  }
  async function minimax() {
    try {
      const out = await minimaxSpeak(text, {
        bin: cfg.minimaxBin,
        voice: pick(DEFAULT_VOICES, voices, 'minimax'),
        model: pick(DEFAULT_MODELS, models, 'minimax'),
        timeoutMs: cfg.timeoutMs,
      })
      return { ok: true, provider: 'minimax', audio: out.audio, mime: out.mime }
    } catch (e) {
      return { ok: false, provider: 'minimax', reason: String(e && e.message || e) }
    }
  }

  return { kokoro, f5, edge, piper, espeak, minimax }
}
