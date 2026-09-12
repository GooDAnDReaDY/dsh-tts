import { DEFAULT_MODELS, DEFAULT_VOICES, OPENAI_COMPATIBLE } from "./constants.js"

function pick(map, models, key) {
  const chosen = models && typeof models[key] === "string" ? models[key].trim() : ""
  return chosen || map[key]
}

function asBuffer(body) {
  if (Buffer.isBuffer(body)) return body
  return Buffer.from(body)
}

function escapeXml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

export function makeCloudProviders(deps, req, withCloudTimeout) {
  const { resolveKey, fetchImpl, cfg } = deps
  const { text, lang, models, voices, role } = req

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

  const compatible = {}
  for (const key of Object.keys(OPENAI_COMPATIBLE)) {
    compatible[key] = openaiCompatible(key)
  }

  return { openai, elevenlabs, google, azure, groq, deepgram, openrouter, mimo, ...compatible }
}
