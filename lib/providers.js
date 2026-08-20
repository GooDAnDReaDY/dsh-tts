import { edgeSpeak, espeakSpeak, piperSpeak } from './local.js'

export const PROVIDER_KEYS = [
  'openai', 'elevenlabs', 'google', 'azure', 'groq', 'deepgram', 'openrouter',
  'siliconflow', 'deepinfra', 'fireworks',
  'edge', 'piper', 'espeak',
]

// Провайдеры, говорящие на языке OpenAI: тот же путь /audio/speech, отличаются
// только адресом, моделью и именем ключа. Каждый адрес проверен запросом без
// ключа — все отвечают 401, то есть путь существует и ждёт ключ.
export const OPENAI_COMPATIBLE = {
  siliconflow: { baseUrl: 'https://api.siliconflow.cn/v1', keyEnv: 'SILICONFLOW_API_KEY' },
  deepinfra: { baseUrl: 'https://api.deepinfra.com/v1/openai', keyEnv: 'DEEPINFRA_API_KEY' },
  fireworks: { baseUrl: 'https://api.fireworks.ai/inference/v1', keyEnv: 'FIREWORKS_API_KEY' },
}

export const DEFAULT_MODELS = {
  siliconflow: 'FunAudioLLM/CosyVoice2-0.5B',
  deepinfra: 'hexgrad/Kokoro-82M',
  fireworks: 'kokoro',
  openai: 'gpt-4o-mini-tts',
  elevenlabs: 'eleven_multilingual_v2',
  google: 'gemini-2.5-flash-preview-tts',
  azure: 'en-US-JennyNeural',
  groq: 'playai-tts',
  deepgram: 'aura-asteria-en',
  openrouter: 'openai/gpt-4o-mini-tts-2025-12-15',
  edge: 'ru-RU-SvetlanaNeural',
  piper: '',
  espeak: 'ru',
}

export const DEFAULT_VOICES = {
  siliconflow: 'FunAudioLLM/CosyVoice2-0.5B:alex',
  deepinfra: 'af_bella',
  fireworks: 'af_bella',
  openai: 'alloy',
  elevenlabs: '21m00Tcm4TlvDq8ikWAM',
  google: 'Kore',
  azure: 'en-US-JennyNeural',
  groq: 'Fritz-PlayAI',
  deepgram: '',
  openrouter: 'alloy',
  edge: 'ru-RU-SvetlanaNeural',
  piper: '',
  espeak: 'ru',
}

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
  const { text, lang, signal, models, voices } = req

  async function openai() {
    const key = await resolveKey(cfg.openaiKeyEnv)
    if (!key) return { ok: false, provider: 'openai', reason: `no ${cfg.openaiKeyEnv}` }
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
  }

  // Одна реализация на всех, кто говорит на языке OpenAI: адрес и имя ключа
  // берутся из таблицы, остальное совпадает буква в букву.
  function openaiCompatible(key) {
    const spec = OPENAI_COMPATIBLE[key]
    return async function speak() {
      const keyEnv = (cfg[key + 'KeyEnv'] || spec.keyEnv)
      const token = await resolveKey(keyEnv)
      if (!token) return { ok: false, provider: key, reason: `no ${keyEnv}` }
      const base = cfg[key + 'BaseUrl'] || spec.baseUrl
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
    }
  }

  async function elevenlabs() {
    const key = await resolveKey(cfg.elevenlabsKeyEnv)
    if (!key) return { ok: false, provider: 'elevenlabs', reason: `no ${cfg.elevenlabsKeyEnv}` }
    const voice = pick(DEFAULT_VOICES, voices, 'elevenlabs')
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
  }

  async function google() {
    const key = await resolveKey(cfg.googleKeyEnv)
    if (!key) return { ok: false, provider: 'google', reason: `no ${cfg.googleKeyEnv}` }
    const model = pick(DEFAULT_MODELS, models, 'google')
    const voiceName = pick(DEFAULT_VOICES, voices, 'google')
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
  }

  async function azure() {
    const key = await resolveKey(cfg.azureKeyEnv)
    if (!key) return { ok: false, provider: 'azure', reason: `no ${cfg.azureKeyEnv}` }
    const region = (cfg.azureRegion || '').trim()
    if (!region) return { ok: false, provider: 'azure', reason: 'azureRegion is empty' }
    const voice = pick(DEFAULT_VOICES, voices, 'azure')
    const ssml = `<speak version="1.0" xml:lang="${lang || 'en-US'}">`
      + `<voice xml:lang="${lang || 'en-US'}" name="${voice}">`
      + `${escapeXml(text)}</voice></speak>`
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
  }

  async function groq() {
    const key = await resolveKey(cfg.groqKeyEnv)
    if (!key) return { ok: false, provider: 'groq', reason: `no ${cfg.groqKeyEnv}` }
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
  }

  async function deepgram() {
    const key = await resolveKey(cfg.deepgramKeyEnv)
    if (!key) return { ok: false, provider: 'deepgram', reason: `no ${cfg.deepgramKeyEnv}` }
    const model = pick(DEFAULT_MODELS, models, 'deepgram')
    const res = await fetchImpl(`https://api.deepgram.com/v1/speak?model=${encodeURIComponent(model)}`, {
      method: 'POST',
      headers: { authorization: `Token ${key}`, 'content-type': 'application/json' },
      body: JSON.stringify({ text }),
      signal,
    })
    if (!res.ok) throw new Error(`Deepgram HTTP ${res.status}`)
    const audio = asBuffer(Buffer.from(await res.arrayBuffer()))
    return { ok: audio.length > 0, provider: 'deepgram', audio, mime: 'audio/mpeg', reason: audio.length ? '' : 'empty audio' }
  }

  async function openrouter() {
    const key = await resolveKey(cfg.openrouterKeyEnv)
    if (!key) return { ok: false, provider: 'openrouter', reason: `no ${cfg.openrouterKeyEnv}` }
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

  const compatible = {}
  for (const key of Object.keys(OPENAI_COMPATIBLE)) compatible[key] = openaiCompatible(key)

  return { openai, elevenlabs, google, azure, groq, deepgram, openrouter, ...compatible, edge, piper, espeak }
}

function escapeXml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}
