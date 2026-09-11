import { edgeSpeak, espeakSpeak, minimaxSpeak, piperSpeak } from './local.js'
import { KokoroEngine } from './engines/kokoro.js'
import { F5Engine } from './engines/f5.js'
import { PROVIDER_KEYS, OPENAI_COMPATIBLE, DEFAULT_MODELS, DEFAULT_VOICES } from './providers/constants.js'
export { PROVIDER_KEYS, OPENAI_COMPATIBLE, DEFAULT_MODELS, DEFAULT_VOICES }

function pick(map, models, key) {
  const chosen = models && typeof models[key] === 'string' ? models[key].trim() : ''
  return chosen || map[key]
}

function asBuffer(body) {
  if (Buffer.isBuffer(body)) return body
  return Buffer.from(body)
}

export function makeProviders(deps, req) {
  const { resolveKey, fetchImpl, cfg } = deps
  const { text, lang, signal: parentSignal, models, voices } = req
  const cloudTimeoutMs = Number(cfg.cloudTimeoutMs) > 0 ? Number(cfg.cloudTimeoutMs) : 10000

  function withCloudTimeout() {
    const controller = new AbortController()
    let timedOut = false
    const timer = setTimeout(() => {
      timedOut = true
      controller.abort(new Error(`Cloud TTS timeout after ${cloudTimeoutMs}ms`))
    }, cloudTimeoutMs)
    if (parentSignal) {
      if (parentSignal.aborted) controller.abort(parentSignal.reason)
      else parentSignal.addEventListener('abort', () => controller.abort(parentSignal.reason), { once: true })
    }
    return {
      signal: controller.signal,
      cleanup: () => clearTimeout(timer),
    }
  }

  async function openai() {
    const key = await resolveKey(cfg.openaiKeyEnv)
    if (!key) return { ok: false, provider: 'openai', reason: `no ${cfg.openaiKeyEnv}` }
    const { signal, cleanup } = withCloudTimeout()
    try {
      const res = await fetchImpl((cfg.openaiBaseUrl || 'https://api.openai.com/v1') + '/audio/speech', {
      method: 'POST',
      headers: { authorization: `Bearer ${key}`, 'content-type': 'application/json' },
      body: JSON.stringify({
        model: pick(DEFAULT_MODELS, models, 'openai'),
        input: text,
        voice: pick(DEFAULT_VOICES, voices, 'openai'),
        response_format: 'mp3',
      }),
      signal,
    })
    if (!res.ok) throw new Error(`OpenAI HTTP ${res.status}`)
    const audio = asBuffer(Buffer.from(await res.arrayBuffer()))
    return { ok: audio.length > 0, provider: 'openai', audio, mime: 'audio/mpeg', reason: audio.length ? '' : 'empty audio' }
    } finally {
      cleanup()
    }
  }

    // One implementation for all OpenAI-compatible providers: base URL and key
    // name come from the table; everything else is identical.
  function openaiCompatible(key) {
    const spec = OPENAI_COMPATIBLE[key]
    return async function speak() {
      const keyEnv = (cfg[key + 'KeyEnv'] || spec.keyEnv)
      const token = await resolveKey(keyEnv)
      if (!token) return { ok: false, provider: key, reason: `no ${keyEnv}` }
      const base = cfg[key + 'BaseUrl'] || spec.baseUrl
      if (!base) return { ok: false, provider: key, reason: 'no base url configured' }
      const { signal, cleanup } = withCloudTimeout()
      try {
        const res = await fetchImpl(base + '/audio/speech', {
        method: 'POST',
        headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
        body: JSON.stringify({
          model: pick(DEFAULT_MODELS, models, key),
          input: text,
          voice: pick(DEFAULT_VOICES, voices, key),
          response_format: 'mp3',
        }),
        signal,
      })
      if (!res.ok) throw new Error(`${key} HTTP ${res.status}`)
      const audio = asBuffer(Buffer.from(await res.arrayBuffer()))
      return { ok: audio.length > 0, provider: key, audio, mime: 'audio/mpeg', reason: audio.length ? '' : 'empty audio' }
      } finally {
        cleanup()
      }
    }
  }

    // Xiaomi MiMo. Synthesis goes through chat: text as a message, voice/format
    // as a separate field; audio returns base64 in the response.
  async function mimo() {
    const key = await resolveKey(cfg.mimoKeyEnv)
    if (!key) return { ok: false, provider: 'mimo', reason: `no ${cfg.mimoKeyEnv}` }
    const base = (cfg.mimoBaseUrl || 'https://api.xiaomimimo.com/v1').replace(/\/+$/, '')
    const format = cfg.mimoFormat === 'wav' ? 'wav' : 'mp3'
    const { signal, cleanup } = withCloudTimeout()
    try {
      const res = await fetchImpl(base + '/chat/completions', {
      method: 'POST',
      headers: { authorization: `Bearer ${key}`, 'content-type': 'application/json', accept: 'application/json' },
      body: JSON.stringify({
        model: pick(DEFAULT_MODELS, models, 'mimo'),
        messages: [{ role: 'assistant', content: text }],
        audio: { format, voice: pick(DEFAULT_VOICES, voices, 'mimo') },
        stream: false,
      }),
      signal,
    })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) {
      const detail = data && data.error && data.error.message
      throw new Error(`MiMo HTTP ${res.status}${detail ? ': ' + detail : ''}`)
    }
    const encoded = data && data.choices && data.choices[0]
      && data.choices[0].message && data.choices[0].message.audio
      && data.choices[0].message.audio.data
    if (typeof encoded !== 'string' || !encoded) {
      return { ok: false, provider: 'mimo', reason: 'response missing choices[0].message.audio.data' }
    }
    const audio = Buffer.from(encoded, 'base64')
    return {
      ok: audio.length > 0,
      provider: 'mimo',
      audio,
      mime: format === 'wav' ? 'audio/wav' : 'audio/mpeg',
      reason: audio.length ? '' : 'empty audio',
    }
    } finally {
      cleanup()
    }
  }

  // MiniMax uses their CLI on purpose; no custom protocol here.
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

  async function elevenlabs() {
    const key = await resolveKey(cfg.elevenlabsKeyEnv)
    if (!key) return { ok: false, provider: 'elevenlabs', reason: `no ${cfg.elevenlabsKeyEnv}` }
    const voice = pick(DEFAULT_VOICES, voices, 'elevenlabs')
    const { signal, cleanup } = withCloudTimeout()
    try {
      const res = await fetchImpl(`https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(voice)}`, {
      method: 'POST',
      headers: { 'xi-api-key': key, 'content-type': 'application/json', accept: 'audio/mpeg' },
      body: JSON.stringify({
        text,
        model_id: pick(DEFAULT_MODELS, models, 'elevenlabs'),
      }),
      signal,
    })
    if (!res.ok) throw new Error(`ElevenLabs HTTP ${res.status}`)
    const audio = asBuffer(Buffer.from(await res.arrayBuffer()))
    return { ok: audio.length > 0, provider: 'elevenlabs', audio, mime: 'audio/mpeg', reason: audio.length ? '' : 'empty audio' }
    } finally {
      cleanup()
    }
  }

  async function google() {
    const key = await resolveKey(cfg.googleKeyEnv)
    if (!key) return { ok: false, provider: 'google', reason: `no ${cfg.googleKeyEnv}` }
    const model = pick(DEFAULT_MODELS, models, 'google')
    const voiceName = pick(DEFAULT_VOICES, voices, 'google')
    const { signal, cleanup } = withCloudTimeout()
    try {
      const res = await fetchImpl(
      `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(key)}`,
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text }] }],
          generationConfig: {
            responseModalities: ['AUDIO'],
            speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName } } },
          },
        }),
        signal,
      },
    )
    if (!res.ok) throw new Error(`Google HTTP ${res.status}`)
    const data = await res.json()
    const b64 = data?.candidates?.[0]?.content?.parts?.find((p) => p.inlineData)?.inlineData?.data
    if (!b64) return { ok: false, provider: 'google', reason: 'no inline audio' }
    const audio = Buffer.from(b64, 'base64')
    return { ok: audio.length > 0, provider: 'google', audio, mime: 'audio/wav', reason: audio.length ? '' : 'empty audio' }
    } finally {
      cleanup()
    }
  }

  async function azure() {
    const key = await resolveKey(cfg.azureKeyEnv)
    if (!key) return { ok: false, provider: 'azure', reason: `no ${cfg.azureKeyEnv}` }
    const region = (cfg.azureRegion || '').trim()
    if (!region) return { ok: false, provider: 'azure', reason: 'azureRegion is empty' }
    const voice = pick(DEFAULT_VOICES, voices, 'azure')
    const roleCfg = req.role && cfg.roles && cfg.roles[req.role]
    const style = roleCfg && roleCfg.ssmlStyle
    const safeStyle = style ? String(style).replace(/["<>&]/g, '') : ''
    const inner = safeStyle
      ? `<mstts:express-as style="${safeStyle}">${escapeXml(text)}</mstts:express-as>`
      : escapeXml(text)
    const ssml = `<speak version="1.0" xml:lang="${lang || 'en-US'}">`
      + `<voice xml:lang="${lang || 'en-US'}" name="${voice}">`
      + `${inner}</voice></speak>`
    const { signal, cleanup } = withCloudTimeout()
    try {
      const res = await fetchImpl(`https://${region}.tts.speech.microsoft.com/cognitiveservices/v1`, {
      method: 'POST',
      headers: {
        'Ocp-Apim-Subscription-Key': key,
        'Content-Type': 'application/ssml+xml',
        'X-Microsoft-OutputFormat': 'audio-16khz-128kbitrate-mono-mp3',
      },
      body: ssml,
      signal,
    })
    if (!res.ok) throw new Error(`Azure HTTP ${res.status}`)
    const audio = asBuffer(Buffer.from(await res.arrayBuffer()))
    return { ok: audio.length > 0, provider: 'azure', audio, mime: 'audio/mpeg', reason: audio.length ? '' : 'empty audio' }
    } finally {
      cleanup()
    }
  }

  async function groq() {
    const key = await resolveKey(cfg.groqKeyEnv)
    if (!key) return { ok: false, provider: 'groq', reason: `no ${cfg.groqKeyEnv}` }
    const { signal, cleanup } = withCloudTimeout()
    try {
      const res = await fetchImpl('https://api.groq.com/openai/v1/audio/speech', {
      method: 'POST',
      headers: { authorization: `Bearer ${key}`, 'content-type': 'application/json' },
      body: JSON.stringify({
        model: pick(DEFAULT_MODELS, models, 'groq'),
        input: text,
        voice: pick(DEFAULT_VOICES, voices, 'groq'),
        response_format: 'mp3',
      }),
      signal,
    })
    if (!res.ok) throw new Error(`Groq HTTP ${res.status}`)
    const audio = asBuffer(Buffer.from(await res.arrayBuffer()))
    return { ok: audio.length > 0, provider: 'groq', audio, mime: 'audio/mpeg', reason: audio.length ? '' : 'empty audio' }
    } finally {
      cleanup()
    }
  }

  async function deepgram() {
    const key = await resolveKey(cfg.deepgramKeyEnv)
    if (!key) return { ok: false, provider: 'deepgram', reason: `no ${cfg.deepgramKeyEnv}` }
    const model = pick(DEFAULT_MODELS, models, 'deepgram')
    const { signal, cleanup } = withCloudTimeout()
    try {
      const res = await fetchImpl(`https://api.deepgram.com/v1/speak?model=${encodeURIComponent(model)}`, {
      method: 'POST',
      headers: { authorization: `Token ${key}`, 'content-type': 'application/json' },
      body: JSON.stringify({ text }),
      signal,
    })
    if (!res.ok) throw new Error(`Deepgram HTTP ${res.status}`)
    const audio = asBuffer(Buffer.from(await res.arrayBuffer()))
    return { ok: audio.length > 0, provider: 'deepgram', audio, mime: 'audio/mpeg', reason: audio.length ? '' : 'empty audio' }
    } finally {
      cleanup()
    }
  }

  async function openrouter() {
    const key = await resolveKey(cfg.openrouterKeyEnv)
    if (!key) return { ok: false, provider: 'openrouter', reason: `no ${cfg.openrouterKeyEnv}` }
    const { signal, cleanup } = withCloudTimeout()
    try {
      const res = await fetchImpl('https://openrouter.ai/api/v1/audio/speech', {
      method: 'POST',
      headers: { authorization: `Bearer ${key}`, 'content-type': 'application/json' },
      body: JSON.stringify({
        model: pick(DEFAULT_MODELS, models, 'openrouter'),
        input: text,
        voice: pick(DEFAULT_VOICES, voices, 'openrouter'),
        response_format: 'mp3',
      }),
      signal,
    })
    if (!res.ok) throw new Error(`OpenRouter HTTP ${res.status}`)
    const audio = asBuffer(Buffer.from(await res.arrayBuffer()))
    return { ok: audio.length > 0, provider: 'openrouter', audio, mime: 'audio/mpeg', reason: audio.length ? '' : 'empty audio' }
    } finally {
      cleanup()
    }
  }

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

  const compatible = {}
  for (const key of Object.keys(OPENAI_COMPATIBLE)) compatible[key] = openaiCompatible(key)

  return { kokoro, f5, openai, elevenlabs, google, azure, groq, deepgram, openrouter, mimo, ...compatible, edge, piper, espeak, minimax }
}

function escapeXml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}
