import z from '@deepseek-ai/schemastery'
import { defineTool } from '@deepseek-ai/dsh-tools'
import { credentialRef } from '@deepseek-ai/dsh-credentials'
import { runChain } from './chain.js'
import { makeProviders, PROVIDER_KEYS, DEFAULT_MODELS, DEFAULT_VOICES } from './providers.js'
import { assistantText, stripForSpeech, splitSentences } from './text.js'
import {
  CLOUD_PROVIDERS,
  assertCredentialRef,
  keyEnvName,
  needsApiKey,
  pendingKeyWrites,
  publicConfig,
  stripSecretsFromConfig,
} from './keys.js'

export const name = 'dsh-tts'
export const inject = ['tools', 'credentials', 'webServer', 'settings']

const NS = 'dsh-tts'

const ChainEntry = z.object({
  provider: z.string().default('espeak')
    .description(`Provider key. One of: ${PROVIDER_KEYS.join(', ')}.`),
  model: z.string().default('')
    .description('Model override. Empty means the provider default.'),
  voice: z.string().default('')
    .description('Voice override. Empty means the provider default.'),
})

export const Config = z.object({
  speakReplies: z.boolean().default(false)
    .description('When on, speak each finished agent reply in the Web UI.'),
  language: z.string().default('ru'),
  speakAsItGoes: z
    .boolean()
    .description('Speak each reply as it lands instead of waiting for the whole turn to finish. '
      + 'Long answers start sounding almost at once because they are synthesized sentence by sentence.')
    .default(true),
  sentenceChars: z
    .number()
    .description('Upper bound of one spoken piece when speaking as it goes.')
    .default(320),
  rate: z
    .number()
    .description('Playback speed, 0.5 to 2. Synthesis is untouched; the browser plays faster or slower.')
    .default(1),
  bargeIn: z
    .boolean()
    .description('Fall silent the moment the microphone opens. Listening to a reply and talking over it '
      + 'at the same time does not work, and the reply would be recorded along with the voice.')
    .default(true),
  announceApproval: z
    .boolean()
    .description('Say out loud when the agent stops and waits for an approval, and play a short chime. '
      + 'Useful when you walk away from a long run.')
    .default(true),
  approvalText: z
    .string()
    .description('What to say when an approval is asked for. The tool name is appended.')
    .default('Требуется подтверждение'),
  questionText: z
    .string()
    .description('What to say when the agent asks a question. Empty disables it.')
    .default('Агент задал вопрос'),
  chime: z
    .string()
    .description('Short sound before an announcement: ding, beep or none.')
    .default('ding'),
  maxChars: z.number().default(4000)
    .description('Longer replies are truncated before synthesis.'),
  chain: z.array(ChainEntry)
    .default([
      { provider: 'edge', model: '', voice: 'ru-RU-SvetlanaNeural' },
      { provider: 'piper', model: '', voice: '' },
      { provider: 'espeak', model: '', voice: 'ru' },
    ])
    .description('Fallback chain. Order is the order of attempts. A provider without a key is skipped.'),
  openaiKeyEnv: z.string().default('OPENAI_API_KEY'),
  openaiBaseUrl: z.string().default('https://api.openai.com/v1'),
  elevenlabsKeyEnv: z.string().default('ELEVENLABS_API_KEY'),
  googleKeyEnv: z.string().default('GEMINI_API_KEY'),
  azureKeyEnv: z.string().default('AZURE_SPEECH_KEY'),
  azureRegion: z.string().default('')
    .description('Azure Speech region, e.g. eastus. Required for the azure provider.'),
  mimoKeyEnv: z.string().description('Credential holding the Xiaomi MiMo key.').default('MIMO_API_KEY'),
  mimoBaseUrl: z.string().description('MiMo API root. Synthesis goes through its chat endpoint.').default('https://api.xiaomimimo.com/v1'),
  mimoFormat: z.string().description('MiMo output format: mp3 or wav.').default('mp3'),
  minimaxBin: z.string()
    .description('MiniMax CLI, looked up in PATH unless absolute. Install and log in separately; '
      + 'without it the provider declines and the chain moves on.')
    .default('mmx'),
  siliconflowKeyEnv: z.string().description('Credential holding the SiliconFlow key.').default('SILICONFLOW_API_KEY'),
  deepinfraKeyEnv: z.string().description('Credential holding the DeepInfra key.').default('DEEPINFRA_API_KEY'),
  fireworksKeyEnv: z.string().description('Credential holding the Fireworks key.').default('FIREWORKS_API_KEY'),
  groqKeyEnv: z.string().default('GROQ_API_KEY'),
  deepgramKeyEnv: z.string().default('DEEPGRAM_API_KEY'),
  openrouterKeyEnv: z.string().default('OPENROUTER_API_KEY'),
  edgeBin: z.string().default('edge-tts')
    .description('edge-tts CLI. Looked up in PATH unless an absolute path is given.'),
  piperBin: z.string().default('piper'),
  piperModel: z.string().default('')
    .description('Path to a Piper ONNX model. The piper provider is skipped while this is empty.'),
  espeakBin: z.string().default('espeak-ng'),
  timeoutMs: z.number().default(60000),
  maxQueue: z.number().default(8),
})

function writeJson(res, code, body) {
  try {
    res.writeHead(code, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' })
    res.end(JSON.stringify(body))
  } catch { /* socket closed */ }
}

function readBody(req, maxBytes) {
  return new Promise((resolve, reject) => {
    const chunks = []
    let size = 0
    req.on('data', (c) => {
      size += c.length
      if (size > maxBytes) { reject(new Error('body too large')); req.destroy(); return }
      chunks.push(c)
    })
    req.on('end', () => resolve(Buffer.concat(chunks)))
    req.on('error', reject)
  })
}

/** Reject cross-site POSTs. Do not require loopback or Origin==Host: the Web UI is used over LAN and reverse proxies. */
function isTrustedSettingsRequest(request) {
  return request.headers['sec-fetch-site'] !== 'cross-site'
}

let utteranceSeq = 0

export function apply(ctx, config) {
  let getConfig = () => config
  const live = () => Config(structuredClone(getConfig() ?? {})) ?? config

  let settingsApi
  ctx.inject(['settings'], (sctx) => {
    const scope = sctx.settings.register(NS, Config, { base: config })
    settingsApi = scope
    getConfig = () => scope.get() ?? config
    sctx.effect(() => () => {
      settingsApi = undefined
      getConfig = () => config
    })
  })

  const pending = []
  const collectors = new Map()

  async function resolveKey(ref) {
    try {
      const resolved = await ctx.credentials.resolve(credentialRef(ref))
      if (resolved && resolved.value) return resolved.value
    } catch { /* fall through to env */ }
    return process.env[ref] || ''
  }

  async function describeProvider(provider) {
    const ref = keyEnvName(live(), provider)
    const base = { provider, ref, configured: false, writable: true }
    if (!ref) return base
    try {
      if (typeof ctx.credentials.describe === 'function') {
        const d = await ctx.credentials.describe(credentialRef(ref))
        return {
          provider,
          ref,
          configured: !!(d && d.configured),
          writable: d && d.writable === false ? false : true,
        }
      }
      const resolved = await ctx.credentials.resolve(credentialRef(ref))
      return { provider, ref, configured: !!(resolved && resolved.value), writable: true }
    } catch {
      return base
    }
  }

  async function credentialsView() {
    const out = {}
    for (const provider of CLOUD_PROVIDERS) {
      out[provider] = await describeProvider(provider)
    }
    return out
  }

  async function storeProviderKey(provider, value) {
    if (!needsApiKey(provider)) {
      throw new Error(`${provider} does not take an API key`)
    }
    const trimmed = String(value || '').trim()
    if (!trimmed) {
      throw new Error('an empty key cannot be stored')
    }
    if (typeof ctx.credentials.set !== 'function') {
      throw new Error('no credentials service is mounted')
    }
    const ref = assertCredentialRef(keyEnvName(live(), provider))
    await ctx.credentials.set(credentialRef(ref), trimmed)
    return ref
  }

  async function clearProviderKey(provider) {
    if (!needsApiKey(provider)) {
      throw new Error(`${provider} does not take an API key`)
    }
    if (typeof ctx.credentials.unset !== 'function') {
      throw new Error('no credentials service is mounted')
    }
    const ref = assertCredentialRef(keyEnvName(live(), provider))
    await ctx.credentials.unset(credentialRef(ref))
    return ref
  }

  async function configResponse() {
    return {
      ok: true,
      config: publicConfig(live()),
      credentials: await credentialsView(),
    }
  }

  async function synthesize(rawText, cfg, signal) {
    const text = stripForSpeech(rawText, cfg.maxChars)
    if (!text) throw new Error('nothing to speak')
    const models = {}
    const voices = {}
    const order = []
    for (const entry of Array.isArray(cfg.chain) ? cfg.chain : []) {
      if (!PROVIDER_KEYS.includes(entry.provider)) continue
      order.push(entry.provider)
      models[entry.provider] = entry.model || DEFAULT_MODELS[entry.provider]
      voices[entry.provider] = entry.voice || DEFAULT_VOICES[entry.provider]
    }
    const providers = makeProviders(
      { resolveKey, fetchImpl: fetch, cfg },
      { text, lang: cfg.language, signal, models, voices },
    )
    return runChain(order, providers)
  }

  // Синтез одной фразы с постановкой в очередь. Порядок сохраняется: номер
  // выдаётся сразу, а не когда ответит провайдер, — иначе короткие фразы
  // обгоняли бы длинные.
  function speakPiece(sid, text, cfg, kind) {
    if (!text) return
    const id = `u${++utteranceSeq}`
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), cfg.timeoutMs)
    reserve(id)
    synthesize(text, cfg, controller.signal)
      .then((out) => settle(id, {
        id,
        sessionId: sid,
        kind: kind || 'speech',
        provider: out.provider,
        mime: out.mime,
        audioBase64: Buffer.from(out.audio).toString('base64'),
        tookMs: out.tookMs,
      }))
      .catch((err) => settle(id, { id, sessionId: sid, kind: kind || 'speech', text, error: String(err && err.message || err) }))
      .finally(() => clearTimeout(timer))
  }

  // Объявление: сначала короткий сигнал, затем фраза. Сигнал — не файл, его
  // рисует сам браузер, поэтому ничего не качается и не хранится.
  function announce(sid, text, cfg) {
    if (cfg.chime && cfg.chime !== 'none') {
      enqueue({ id: `u${++utteranceSeq}`, sessionId: sid, kind: 'chime', chime: cfg.chime })
    }
    speakPiece(sid, text, cfg, 'notice')
  }

  function enqueue(item) {
    pending.push(item)
    const max = live().maxQueue || 8
    while (pending.length > max) pending.shift()
  }

  // Место в очереди занимается до синтеза, чтобы порядок фраз совпадал с
  // порядком речи, а не с тем, кто быстрее ответил.
  function reserve(id) {
    enqueue({ id, kind: 'reserved' })
  }

  function settle(id, item) {
    const at = pending.findIndex((row) => row.id === id)
    if (at === -1) { enqueue(item); return }
    pending[at] = item
  }

  ctx.effect(() => ctx.on('session/event', (session, event) => {
    const cfg = live()
    if (!cfg.speakReplies) return
    const sid = session && session.id
    if (!sid) return
    // Агент упёрся в подтверждение и ждёт человека. Об этом стоит сказать
    // вслух: иначе про остановку узнаёшь, когда вернёшься к экрану.
    if (event.type === 'approval/asked') {
      if (!cfg.announceApproval) return
      const tool = event.data && event.data.toolName
      announce(sid, cfg.approvalText + (tool ? ': ' + tool : ''), cfg)
      return
    }
    if (event.type === 'question/requested') {
      if (!cfg.announceApproval || !cfg.questionText) return
      announce(sid, cfg.questionText, cfg)
      return
    }

    if (event.type === 'assistant/message') {
      const text = assistantText(event.data && event.data.message)
      if (!text) return
      // Читаем по ходу: каждый пришедший кусок ответа озвучивается сразу,
      // предложениями, и очередь проигрывается по порядку. Ждать конца хода
      // значит молчать всё время, пока агент работает.
      if (cfg.speakAsItGoes) {
        const ready = stripForSpeech(text, cfg.maxChars)
        for (const piece of splitSentences(ready, cfg.sentenceChars)) speakPiece(sid, piece, cfg)
        return
      }
      const cur = collectors.get(sid) || { parts: [] }
      cur.parts.push(text)
      collectors.set(sid, cur)
      return
    }
    if (event.type !== 'turn/end') return
    // При чтении по ходу к концу хода уже всё сказано.
    if (cfg.speakAsItGoes) { collectors.delete(sid); return }
    const cur = collectors.get(sid)
    collectors.delete(sid)
    const raw = cur && Array.isArray(cur.parts) ? cur.parts.join('\n') : ''
    const text = stripForSpeech(raw, cfg.maxChars)
    if (!text) return
    const id = `u${++utteranceSeq}`
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), cfg.timeoutMs)
    synthesize(text, cfg, controller.signal)
      .then((out) => {
        enqueue({
          id,
          sessionId: sid,
          provider: out.provider,
          mime: out.mime,
          audioBase64: Buffer.from(out.audio).toString('base64'),
          tookMs: out.tookMs,
        })
      })
      .catch((err) => {
        enqueue({
          id,
          sessionId: sid,
          error: String(err && err.message || err),
        })
      })
      .finally(() => clearTimeout(timer))
  }), 'dsh-tts: speak finished replies')

  ctx.effect(() => ctx.webServer.register({
    kind: 'exact',
    path: '/dsh-tts/status',
    handler: async (req, res) => {
      if (req.method !== 'GET') { writeJson(res, 405, { ok: false, error: { code: 'method', message: 'GET only' } }); return }
      const cfg = live()
      writeJson(res, 200, {
        ok: true,
        speakReplies: cfg.speakReplies,
        rate: cfg.rate,
        chime: cfg.chime,
        bargeIn: cfg.bargeIn,
        language: cfg.language,
        chain: cfg.chain,
        providers: PROVIDER_KEYS,
      })
    },
  }), 'dsh-tts: /status route')

  ctx.effect(() => ctx.webServer.register({
    kind: 'exact',
    path: '/dsh-tts/config',
    handler: async (req, res) => {
      if (req.method === 'GET') {
        writeJson(res, 200, await configResponse())
        return
      }
      if (req.method !== 'PUT' && req.method !== 'POST') {
        writeJson(res, 405, { ok: false, error: { code: 'method', message: 'GET or PUT' } })
        return
      }
      if (!isTrustedSettingsRequest(req)) {
        writeJson(res, 403, { ok: false, error: { code: 'forbidden', message: 'dsh-tts: settings writes are same-origin only' } })
        return
      }
      if (!settingsApi) {
        writeJson(res, 503, { ok: false, error: { code: 'settings', message: 'settings not ready' } })
        return
      }
      let raw
      try { raw = await readBody(req, 256 * 1024) } catch (e) {
        writeJson(res, 400, { ok: false, error: { code: 'body', message: e.message } })
        return
      }
      let payload
      try { payload = JSON.parse(raw.toString('utf8') || '{}') } catch {
        writeJson(res, 400, { ok: false, error: { code: 'json', message: 'invalid json' } })
        return
      }
      if (payload && typeof payload.config === 'object') {
        payload = { ...payload.config, keys: payload.keys }
      }
      const keys = pendingKeyWrites(payload && payload.keys)
      const stripped = stripSecretsFromConfig(payload)
      let parsed
      try { parsed = Config(stripped) } catch (e) {
        writeJson(res, 400, { ok: false, error: { code: 'schema', message: String(e && e.message || e) } })
        return
      }
      try {
        for (const item of keys) {
          await storeProviderKey(item.provider, item.value)
        }
        await settingsApi.replace(parsed)
        writeJson(res, 200, await configResponse())
      } catch (e) {
        writeJson(res, 500, { ok: false, error: { code: 'save', message: String(e && e.message || e) } })
      }
    },
  }), 'dsh-tts: /config route')

  ctx.effect(() => ctx.webServer.register({
    kind: 'exact',
    path: '/dsh-tts/credential',
    handler: async (req, res) => {
      if (req.method !== 'PUT' && req.method !== 'DELETE') {
        writeJson(res, 405, { ok: false, error: { code: 'method', message: 'PUT or DELETE only' } })
        return
      }
      if (!isTrustedSettingsRequest(req)) {
        writeJson(res, 403, { ok: false, error: { code: 'forbidden', message: 'dsh-tts: keys are same-origin only' } })
        return
      }
      let payload = {}
      if (req.method === 'PUT' || (req.headers['content-length'] && Number(req.headers['content-length']) > 0)) {
        let raw
        try { raw = await readBody(req, 16 * 1024) } catch (e) {
          writeJson(res, 400, { ok: false, error: { code: 'body', message: e.message } })
          return
        }
        try { payload = JSON.parse(raw.toString('utf8') || '{}') } catch {
          writeJson(res, 400, { ok: false, error: { code: 'json', message: 'invalid json' } })
          return
        }
      }
      const provider = typeof payload.provider === 'string' ? payload.provider.trim() : ''
      if (!needsApiKey(provider)) {
        writeJson(res, 400, { ok: false, error: { code: 'provider', message: 'unknown cloud provider' } })
        return
      }
      try {
        if (req.method === 'DELETE') {
          const ref = await clearProviderKey(provider)
          writeJson(res, 200, { ok: true, ref, credentials: await credentialsView() })
          return
        }
        const ref = await storeProviderKey(provider, payload.value)
        writeJson(res, 200, { ok: true, ref, credentials: await credentialsView() })
      } catch (e) {
        writeJson(res, 400, { ok: false, error: { code: 'credential', message: String(e && e.message || e) } })
      }
    },
  }), 'dsh-tts: /credential route')

  ctx.effect(() => ctx.webServer.register({
    kind: 'exact',
    path: '/dsh-tts/pending',
    handler: async (req, res) => {
      if (req.method !== 'GET') { writeJson(res, 405, { ok: false, error: { code: 'method', message: 'GET only' } }); return }
      const url = new URL(req.url || '/', 'http://127.0.0.1')
      const after = url.searchParams.get('after') || ''
      let items = pending.slice()
      if (after) {
        const idx = items.findIndex((x) => x.id === after)
        items = idx >= 0 ? items.slice(idx + 1) : items
      }
      writeJson(res, 200, { ok: true, items })
    },
  }), 'dsh-tts: /pending route')

  ctx.effect(() => ctx.webServer.register({
    kind: 'exact',
    path: '/dsh-tts/speak',
    handler: async (req, res) => {
      if (req.method !== 'POST') { writeJson(res, 405, { ok: false, error: { code: 'method', message: 'POST only' } }); return }
      let raw
      try { raw = await readBody(req, 256 * 1024) } catch (e) {
        writeJson(res, 400, { ok: false, error: { code: 'body', message: e.message } }); return
      }
      let payload
      try { payload = JSON.parse(raw.toString('utf8') || '{}') } catch { payload = {} }
      const text = stripForSpeech(payload.text, live().maxChars)
      if (!text) { writeJson(res, 400, { ok: false, error: { code: 'no-text', message: 'no text' } }); return }
      const cfg = live()
      const controller = new AbortController()
      const timer = setTimeout(() => controller.abort(), cfg.timeoutMs)
      try {
        const out = await synthesize(text, cfg, controller.signal)
        writeJson(res, 200, {
          ok: true,
          provider: out.provider,
          mime: out.mime,
          audioBase64: Buffer.from(out.audio).toString('base64'),
          tookMs: out.tookMs,
        })
      } catch (e) {
        writeJson(res, 502, { ok: false, error: { code: 'chain', message: String(e && e.message || e) } })
      } finally {
        clearTimeout(timer)
      }
    },
  }), 'dsh-tts: /speak route')

  ctx.tools.register(
    defineTool({
      name: 'speak_text',
      description:
        'Synthesize speech from text using the dsh-tts provider fallback chain. '
        + 'Returns audio as base64 plus the provider that succeeded. '
        + 'Use when the user asks to hear text; do not dump the audio into the model context.',
      parameters: {
        text: { type: 'string', required: true, description: 'Text to speak.' },
      },
      output: {
        schema: {
          type: 'object',
          additionalProperties: false,
          properties: {
            ok: { type: 'boolean' },
            provider: { type: 'string' },
            mime: { type: 'string' },
            bytes: { type: 'number' },
            tookMs: { type: 'number' },
            error: { type: 'string' },
          },
        },
        render: (_args, value) => [{
          type: 'text',
          text: value && value.ok
            ? `Spoken with ${value.provider} (${value.mime}, ${value.bytes || 0} bytes).`
            : `TTS failed: ${value && value.error ? value.error : 'unknown'}`,
        }],
      },
      execute: async (args, exec) => {
        const cfg = live()
        try {
          const out = await synthesize(String(args.text || ''), cfg, exec.signal)
          return {
            ok: true,
            provider: out.provider,
            mime: out.mime,
            bytes: out.audio.length,
            tookMs: out.tookMs,
          }
        } catch (e) {
          return { ok: false, error: String(e && e.message || e) }
        }
      },
    }),
  )
}
