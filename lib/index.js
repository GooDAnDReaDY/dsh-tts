import z from '@deepseek-ai/schemastery'
import { defineTool } from '@deepseek-ai/dsh-tools'
import { credentialRef } from '@deepseek-ai/dsh-credentials'
import { runChain } from './chain.js'
import { makeProviders, PROVIDER_KEYS, DEFAULT_MODELS, DEFAULT_VOICES } from './providers.js'
import { applyNarrationFilters, applyPronunciation, assistantText, detectLang, speechPhrases, splitSentences, stripForSpeech } from './text.js'
import { cacheKey, createSpeechCache } from './cache.js'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { createModelManager } from './engines/manager.js'
import { EngineRegistry } from './engines/types.js'
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
export const inject = ['tools', 'credentials', 'llm', 'webServer', 'settings']

const NS = 'dsh-tts'

const ChainEntry = z.object({
  provider: z.string().default('espeak')
    .description(`Provider key. One of: ${PROVIDER_KEYS.join(', ')}.`),
  model: z.string().default('')
    .description('Model override. Empty means the provider default.'),
  voice: z.string().default('')
    .description('Voice override. Empty means the provider default.'),
})

const RoleOverride = z.object({
  provider: z.string().default(''),
  model: z.string().default(''),
  voice: z.string().default(''),
  chime: z.string().default(''),
  ssmlStyle: z.string().default(''),
})

export const Config = z.object({
  speakReplies: z.boolean().default(false)
    .description('When on, speak each finished agent reply in the Web UI.'),
  enableLocalEngines: z.boolean().default(false)
    .description('Enable offline local TTS engines (Kokoro / F5).'),
  kokoroEnabled: z.boolean().default(false)
    .description('Use local Kokoro-82M on CPU when installed.'),
  f5Enabled: z.boolean().default(false)
    .description('Use local F5-TTS on GPU when installed.'),
  streamingEnabled: z.boolean().default(true)
    .description('Stream audio in real-time using AudioWorklet and SSE for sub-300ms latency.'),
  skipCode: z.boolean().default(true)
    .description('Replace fenced code blocks with a short spoken notice instead of reading them aloud.'),
  cache: z.boolean().default(true)
    .description('Reuse synthesized audio for repeated phrases instead of paying and waiting again.'),
  cacheMaxMb: z.number().default(100)
    .description('Disk limit for the synthesis cache; least recently used items are evicted first.'),
  narrateQuotesOnly: z.boolean().default(false)
    .description('Speak only quoted fragments.'),
  skipActions: z.boolean().default(false)
    .description('Drop *asterisk action* blocks instead of reading them.'),
  removeRegex: z.string().default('')
    .description('Custom global regex whose matches are removed before synthesis.'),
  autoDetect: z.boolean().default(false)
    .description('Guess ru/en per spoken piece instead of using the language setting.'),
  customBaseUrl: z.string().default('')
    .description('Origin of an OpenAI-compatible /audio/speech endpoint; empty skips it.'),
  customKeyEnv: z.string().default('CUSTOM_TTS_API_KEY'),
  pronunciation: z.array(z.object({
    from: z.string().default(''),
    to: z.string().default(''),
    whole: z.boolean().default(false),
    lang: z.string().default(''),
  })).default([])
    .description('Say this instead of that. Applied top-down; /regex/ form allowed in from.'),
  enableItDictionary: z.boolean().default(true)
    .description('Auto-correct common IT terminology pronunciation (SQL, Nginx, K8s, etc.).'),
  longReply: z.string().default('truncate')
    .description('What to do when a reply exceeds the length limit.'),
  summaryModel: z.string().default('')
    .description('provider/model for the spoken retelling; empty uses the conversation default.'),
  summarySentences: z.number().default(3)
    .description('Sentences in the spoken retelling.'),
  roles: z.dict(RoleOverride).default({
    reply: { provider: '', model: '', voice: '', chime: '', ssmlStyle: '' },
    approval: { provider: '', model: '', voice: '', chime: '', ssmlStyle: '' },
    error: { provider: '', model: '', voice: '', chime: '', ssmlStyle: '' },
  })
    .description('Per-role and subagent overrides; empty fields inherit the main chain.'),
  voiceDuplexEnabled: z.boolean().default(false)
    .description('Full-duplex voice conversation with dsh-voice.'),
  vadBargeIn: z.boolean().default(true)
    .description('Mute speech synthesis immediately when voice activity is detected.'),
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
  const streamSubscribers = new Set()

  const modelManager = createModelManager({
    root: process.env.DSH_HOME || path.join(os.homedir(), '.dsh'),
  })

  function broadcastStream(event, data) {
    const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`
    for (const res of streamSubscribers) {
      try { res.write(payload) } catch { streamSubscribers.delete(res) }
    }
  }

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

  const llm = ctx.llm

  // Счётчики синтеза: в памяти, обнуляются рестартом и DELETE /stats.
  const stats = { total: 0, cacheHits: 0, errors: 0, providers: {} }

  // Кэш синтеза живёт рядом с прочими данными харнесса.
  const speechCache = createSpeechCache({
    root: process.env.DSH_HOME || path.join(os.homedir(), '.dsh'),
    maxBytes: () => {
      const mb = Number(live().cacheMaxMb)
      return mb > 0 ? mb * 1024 * 1024 : 100 * 1024 * 1024
    },
  })
  // Порог осмысленности: уникальные длинные куски (чтение по ходу) в кэш
  // не кладём — иначе он забьётся мусором, который никогда не повторится.
  const CACHE_MAX_TEXT = 200

  // Настройки чистки текста считаем на каждый вызов: конфиг живой.
  function cleanOpts(cfg) {
    return { skipCode: cfg.skipCode !== false, phrases: speechPhrases(cfg.language) }
  }
  function cleanText(raw, cfg) {
    return applyPronunciation(
      applyNarrationFilters(stripForSpeech(raw, cfg.maxChars, cleanOpts(cfg)), cfg),
      cfg.pronunciation,
      cfg.language,
      cfg.enableItDictionary !== false,
    )
  }

  // Пересказ быстрой моделью. Любая неудача — пустая строка, вызывающая
  // сторона тихо откатывается к обрезке.
  async function summarizeReply(text, cfg, signal) {
    const sentences = Number(cfg.summarySentences) > 0 ? Number(cfg.summarySentences) : 3
    if (!llm || typeof llm.stream !== 'function') return ''
    const opts = {
      messages: [{ role: 'user', content: 'Перескажи текст в ' + sentences + ' предложениях на его языке. Только пересказ, без вступлений:\n\n' + text }],
      signal,
    }
    const m = String(cfg.summaryModel || '')
    if (m) {
      const slash = m.indexOf('/')
      if (slash > 0) { opts.provider = m.slice(0, slash); opts.model = m.slice(slash + 1) }
      else opts.model = m
    }
    const parts = []
    for await (const chunk of llm.stream(opts)) {
      const piece = chunk && (chunk.text || (chunk.delta && chunk.delta.text)) || ''
      if (piece) parts.push(piece)
    }
    return parts.join('').trim()
  }

  async function synthesize(rawText, cfg, signal, role = 'reply') {
    let text = cleanText(rawText, cfg)
    if (!text) throw new Error('nothing to speak')
    const maxChars = Number(cfg.maxChars) > 0 ? Number(cfg.maxChars) : 0
    const overLimit = maxChars > 0 && text.length > maxChars
    if (overLimit && cfg.longReply !== 'full') {
      let cut = text.slice(0, maxChars)
      if (cfg.longReply === 'summarize') {
        try {
          const retold = await summarizeReply(text.slice(0, 8000), cfg, signal)
          if (retold) cut = speechPhrases(cfg.language).summaryIntro + ' ' + retold
        } catch (llmDown) { /* тихий откат к обрезке */ }
      }
      text = cut
    }
    const models = {}
    const voices = {}
    const order = []
    for (const entry of Array.isArray(cfg.chain) ? cfg.chain : []) {
      if (!PROVIDER_KEYS.includes(entry.provider)) continue
      order.push(entry.provider)
      models[entry.provider] = entry.model || DEFAULT_MODELS[entry.provider]
      voices[entry.provider] = entry.voice || DEFAULT_VOICES[entry.provider]
    }
    // Ролевые переопределения: пустые поля наследуют основную цепочку.
    const ov = (cfg.roles && cfg.roles[role]) || {}
    if (ov.provider && PROVIDER_KEYS.includes(ov.provider)) order.unshift(ov.provider)
    if (order.length) {
      if (ov.model) models[order[0]] = ov.model
      if (ov.voice) voices[order[0]] = ov.voice
    }
    // Скорость воспроизведения в ключ не входит: ею управляет браузер,
    // на синтез она не влияет.
    const cacheAllowed = cfg.cache !== false && text.length <= CACHE_MAX_TEXT
    if (cacheAllowed) {
      for (const provider of order) {
        const hit = await speechCache.get(cacheKey([text, provider, models[provider], voices[provider], role, ov.ssmlStyle]))
        if (hit) {
          stats.total++
          stats.cacheHits++
          const ps = stats.providers[provider] || (stats.providers[provider] = { n: 0, e: 0, ms: 0 })
          ps.n++
          return { provider, mime: hit.mime, audio: hit.audio, tookMs: 0, cached: true }
        }
      }
    }
    const providers = makeProviders(
      { resolveKey, fetchImpl: fetch, cfg },
      { text, lang: cfg.autoDetect ? detectLang(text) : cfg.language, signal, models, voices, role },
    )
    const out = await runChain(order, providers)
    stats.total++
    const ps = stats.providers[out.provider] || (stats.providers[out.provider] = { n: 0, e: 0, ms: 0 })
    ps.n++
    ps.ms += out.tookMs || 0
    if (cacheAllowed) {
      const p = out.provider
      speechCache.put(cacheKey([text, p, models[p], voices[p], role, ov.ssmlStyle]), out.mime, out.audio).catch(() => {})
    }
    return out
  }

  // Синтез одной фразы с постановкой в очередь. Порядок сохраняется: номер
  // выдаётся сразу, а не когда ответит провайдер, — иначе короткие фразы
  // обгоняли бы длинные.
  function speakPiece(sid, text, cfg, kind) {
    if (!text) return
    const role = kind === 'notice' ? 'approval' : kind === 'error' ? 'error' : (kind && kind !== 'speech' ? kind : 'reply')
    const id = `u${++utteranceSeq}`
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), cfg.timeoutMs)
    reserve(id)
    synthesize(text, cfg, controller.signal, role)
      .then((out) => settle(id, {
        id,
        sessionId: sid,
        kind: (kind === 'notice' || kind === 'error') ? kind : 'speech',
        role,
        text,
        provider: out.provider,
        mime: out.mime,
        audioBase64: Buffer.from(out.audio).toString('base64'),
        tookMs: out.tookMs,
      }))
      .catch((err) => {
        stats.errors++
        settle(id, { id, sessionId: sid, kind: 'error', text, error: String(err && err.message || err) })
      })
      .finally(() => clearTimeout(timer))
  }

  // Объявление: сначала короткий сигнал, затем фраза. Сигнал — не файл, его
  // рисует сам браузер, поэтому ничего не качается и не хранится.
  function roleChime(cfg, role) {
    const ov = (cfg.roles && cfg.roles[role]) || {}
    return ov.chime || cfg.chime
  }

  function announce(sid, text, cfg) {
    const chime = roleChime(cfg, 'approval')
    if (chime && chime !== 'none') {
      enqueue({ id: `u${++utteranceSeq}`, sessionId: sid, kind: 'chime', chime })
    }
    speakPiece(sid, text, cfg, 'notice')
  }

  function enqueue(item) {
    pending.push(item)
    const max = live().maxQueue || 8
    while (pending.length > max) pending.shift()
    if (live().streamingEnabled && item.kind === 'chime') {
      broadcastStream('chime', item)
    }
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
    if (live().streamingEnabled && item.audioBase64) {
      broadcastStream('utterance', item)
    }
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
      const agentName = (event.data && (event.data.agent || (event.data.message && event.data.message.agent) || (event.data.message && event.data.message.author && event.data.message.author.name))) || (session && session.agent) || ''
      const activeRole = (agentName && cfg.roles && cfg.roles[agentName] && cfg.roles[agentName].provider) ? agentName : 'reply'

      // Читаем по ходу: каждый пришедший кусок ответа озвучивается сразу,
      // предложениями, и очередь проигрывается по порядку. Ждать конца хода
      // значит молчать всё время, пока агент работает.
      if (cfg.speakAsItGoes) {
        const ready = cleanText(text, cfg)
        for (const piece of splitSentences(ready, cfg.sentenceChars)) speakPiece(sid, piece, cfg, activeRole)
        return
      }
      const cur = collectors.get(sid) || { parts: [], role: activeRole }
      cur.parts.push(text)
      cur.role = activeRole
      collectors.set(sid, cur)
      return
    }
    if (event.type !== 'turn/end') return
    // При чтении по ходу к концу хода уже всё сказано.
    if (cfg.speakAsItGoes) { collectors.delete(sid); return }
    const cur = collectors.get(sid)
    collectors.delete(sid)
    const raw = cur && Array.isArray(cur.parts) ? cur.parts.join('\n') : ''
    const text = cleanText(raw, cfg)
    if (!text) return
    const id = `u${++utteranceSeq}`
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), cfg.timeoutMs)
    synthesize(text, cfg, controller.signal, (cur && cur.role) || 'reply')
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
        enableLocalEngines: cfg.enableLocalEngines,
        kokoroEnabled: cfg.kokoroEnabled,
        f5Enabled: cfg.f5Enabled,
        streamingEnabled: cfg.streamingEnabled,
        rate: cfg.rate,
        chime: cfg.chime,
        bargeIn: cfg.bargeIn,
        language: cfg.language,
        chain: cfg.chain,
        roles: cfg.roles,
        providers: PROVIDER_KEYS,
      })
    },
  }), 'dsh-tts: /status route')

  ctx.effect(() => ctx.webServer.register({
    kind: 'exact',
    path: '/dsh-tts/stream',
    handler: async (req, res) => {
      if (req.method !== 'GET') { writeJson(res, 405, { ok: false, error: { code: 'method', message: 'GET only' } }); return }
      try {
        res.writeHead(200, {
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-cache, no-transform',
          'Connection': 'keep-alive',
        })
        res.write(': connected\n\n')
        streamSubscribers.add(res)
        req.on('close', () => streamSubscribers.delete(res))
      } catch {
        streamSubscribers.delete(res)
      }
    },
  }), 'dsh-tts: /stream route')

  ctx.effect(() => ctx.webServer.register({
    kind: 'exact',
    path: '/dsh-tts/models/status',
    handler: async (req, res) => {
      if (req.method !== 'GET') { writeJson(res, 405, { ok: false, error: { code: 'method', message: 'GET only' } }); return }
      try {
        const list = await modelManager.listStatus()
        writeJson(res, 200, { ok: true, models: list })
      } catch (err) {
        writeJson(res, 500, { ok: false, error: String(err && err.message || err) })
      }
    },
  }), 'dsh-tts: /models/status route')

  ctx.effect(() => ctx.webServer.register({
    kind: 'exact',
    path: '/dsh-tts/models/install',
    handler: async (req, res) => {
      if (req.method !== 'POST') { writeJson(res, 405, { ok: false, error: { code: 'method', message: 'POST only' } }); return }
      if (!isTrustedSettingsRequest(req)) {
        writeJson(res, 403, { ok: false, error: { code: 'forbidden', message: 'same-origin only' } })
        return
      }
      let body = {}
      try {
        const raw = await readBody(req, 16 * 1024)
        body = JSON.parse(raw.toString('utf8') || '{}')
      } catch (e) {
        writeJson(res, 400, { ok: false, error: { code: 'body', message: e.message } })
        return
      }
      const engine = String(body.engine || '').trim()
      if (!engine) {
        writeJson(res, 400, { ok: false, error: { code: 'param', message: 'missing engine parameter' } })
        return
      }
      try {
        // Fire installation in background or await initial start
        modelManager.installModel(engine).catch(() => {})
        const current = await modelManager.getStatus(engine)
        writeJson(res, 200, { ok: true, model: current })
      } catch (err) {
        writeJson(res, 500, { ok: false, error: String(err && err.message || err) })
      }
    },
  }), 'dsh-tts: /models/install route')

  ctx.effect(() => ctx.webServer.register({
    kind: 'exact',
    path: '/dsh-tts/models/delete',
    handler: async (req, res) => {
      if (req.method !== 'DELETE' && req.method !== 'POST') {
        writeJson(res, 405, { ok: false, error: { code: 'method', message: 'DELETE or POST only' } })
        return
      }
      if (!isTrustedSettingsRequest(req)) {
        writeJson(res, 403, { ok: false, error: { code: 'forbidden', message: 'same-origin only' } })
        return
      }
      let body = {}
      try {
        const raw = await readBody(req, 16 * 1024)
        body = JSON.parse(raw.toString('utf8') || '{}')
      } catch { body = {} }
      const engine = String(body.engine || '').trim()
      if (!engine) {
        writeJson(res, 400, { ok: false, error: { code: 'param', message: 'missing engine parameter' } })
        return
      }
      try {
        const result = await modelManager.deleteModel(engine)
        writeJson(res, 200, { ok: true, model: result })
      } catch (err) {
        writeJson(res, 500, { ok: false, error: String(err && err.message || err) })
      }
    },
  }), 'dsh-tts: /models/delete route')

  ctx.effect(() => ctx.webServer.register({
    kind: 'exact',
    path: '/dsh-tts/integrations',
    handler: async (req, res) => {
      if (req.method !== 'GET') { writeJson(res, 405, { ok: false, error: { code: 'method', message: 'GET only' } }); return }
      let voiceInstalled = false
      let messengerInstalled = false

      try {
        if (typeof ctx.webServer?.hasRoute === 'function') {
          voiceInstalled = ctx.webServer.hasRoute('/dsh-voice/status')
          messengerInstalled = ctx.webServer.hasRoute('/dsh-messenger-gateway/status')
        }
      } catch {}

      if (!voiceInstalled) {
        try {
          const rootDev = path.join(process.cwd(), '..', 'dsh-voice')
          const rootExt = path.resolve('B:/Project/DEV/dhsplugins/dsh-voice')
          if (fs.existsSync(rootDev) || fs.existsSync(rootExt)) {
            voiceInstalled = true
          }
        } catch {}
      }

      if (!messengerInstalled) {
        try {
          const rootDev = path.join(process.cwd(), '..', 'dsh-messenger-gateway')
          const rootExt = path.resolve('B:/Project/DEV/dhsplugins/dsh-messenger-gateway')
          if (fs.existsSync(rootDev) || fs.existsSync(rootExt)) {
            messengerInstalled = true
          }
        } catch {}
      }

      writeJson(res, 200, {
        ok: true,
        voice: {
          installed: voiceInstalled,
          package: '@goodandready/dsh-voice',
          hint: 'dsh plugin --profile web add @goodandready/dsh-voice',
        },
        messenger: {
          installed: messengerInstalled,
          package: '@goodandready/dsh-messenger-gateway',
          hint: 'dsh plugin --profile web add @goodandready/dsh-messenger-gateway',
        },
      })
    },
  }), 'dsh-tts: /integrations route')

  ctx.effect(() => ctx.webServer.register({
    kind: 'exact',
    path: '/dsh-tts/cache',
    handler: async (req, res) => {
      if (req.method !== 'DELETE') {
        writeJson(res, 405, { ok: false, error: { code: 'method', message: 'DELETE only' } })
        return
      }
      if (!isTrustedSettingsRequest(req)) {
        writeJson(res, 403, { ok: false, error: { code: 'forbidden', message: 'same-origin only' } })
        return
      }
      const removed = await speechCache.clear()
      writeJson(res, 200, { ok: true, removed })
    },
  }), 'dsh-tts: /cache route')

  ctx.effect(() => ctx.webServer.register({
    kind: 'exact',
    path: '/dsh-tts/preview',
    handler: async (req, res) => {
      if (req.method !== 'POST') {
        writeJson(res, 405, { ok: false, error: { code: 'method', message: 'POST only' } })
        return
      }
      if (!isTrustedSettingsRequest(req)) {
        writeJson(res, 403, { ok: false, error: { code: 'forbidden', message: 'same-origin only' } })
        return
      }
      let body = {}
      try {
        const chunks = []
        for await (const c of req) chunks.push(c)
        body = JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}')
      } catch (e) {
        writeJson(res, 400, { ok: false, error: { code: 'body', message: e.message } })
        return
      }
      const cfg = live()
      const phrase = String(cfg.language || '').toLowerCase().startsWith('ru') ? 'Проверка голоса.' : 'Voice check.'
      try {
        const probe = Object.assign({}, cfg, {
          chain: [{ provider: body.provider || '', model: body.model || '', voice: body.voice || '' }],
        })
        const out = await synthesize(String(body.text || phrase), probe, null, 'reply')
        writeJson(res, 200, { ok: true, mime: out.mime, audioBase64: Buffer.from(out.audio).toString('base64') })
      } catch (e) {
        writeJson(res, 502, { ok: false, error: { code: 'tts', message: String(e && e.message || e) } })
      }
    },
  }), 'dsh-tts: /preview route')

  ctx.effect(() => ctx.webServer.register({
    kind: 'exact',
    path: '/dsh-tts/stats',
    handler: async (req, res) => {
      if (req.method === 'GET') {
        writeJson(res, 200, { ok: true, total: stats.total, cacheHits: stats.cacheHits, errors: stats.errors, providers: stats.providers })
        return
      }
      if (req.method !== 'DELETE') {
        writeJson(res, 405, { ok: false, error: { code: 'method', message: 'GET or DELETE' } })
        return
      }
      if (!isTrustedSettingsRequest(req)) {
        writeJson(res, 403, { ok: false, error: { code: 'forbidden', message: 'same-origin only' } })
        return
      }
      stats.total = 0
      stats.cacheHits = 0
      stats.errors = 0
      stats.providers = {}
      writeJson(res, 200, { ok: true })
    },
  }), 'dsh-tts: /stats route')

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
      const text = cleanText(payload.text, live())
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
