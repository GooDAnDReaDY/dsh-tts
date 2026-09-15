import z from '@deepseek-ai/schemastery'
import { defineTool } from '@deepseek-ai/dsh-tools'
import { credentialRef } from '@deepseek-ai/dsh-credentials'
import { runChain } from './chain.js'
import { makeProviders, PROVIDER_KEYS, DEFAULT_MODELS, DEFAULT_VOICES } from './providers.js'
import { applyNarrationFilters, applyPronunciation, assistantText, detectLang, speechPhrases, splitSentences, stripForSpeech } from './text.js'
import { cacheKey, createSpeechCache } from './cache.js'
import os from 'node:os'
import path from 'node:path'
import { createModelManager } from './engines/manager.js'
import { registerHttpRoutes } from './routes.js'
import { broadcastStream, clearStreamSubscribers } from './stream-hub.js'
import { writeJson } from './http-util.js'
import { createProviderBreaker } from './breaker.js'
import {
  CLOUD_PROVIDERS,
  assertCredentialRef,
  keyEnvName,
  needsApiKey,
  pendingKeyWrites,
  publicConfig,
  stripSecretsFromConfig,
} from './keys.js'

// Scoped identity matching package.json and cordis.patch.yml
export const name = '@goodandready/dsh-tts'
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
  messengerTtsEnabled: z.boolean().default(false)
    .description('Send synthesized voice notes to messengers via @goodandready/dsh-messenger-gateway.'),
  autoDetectSubagent: z.boolean().default(true)
    .description('Auto-detect subagent roles in multi-agent sessions and route to dedicated voice profiles.'),
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
    .default('Approval required'),
  questionText: z
    .string()
    .description('What to say when the agent asks a question. Empty disables it.')
    .default('Agent asked a question'),
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

let utteranceSeq = 0

export function apply(ctx, config) {
  const providerBreaker = createProviderBreaker()

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

  const modelManager = createModelManager({
    root: process.env.DSH_HOME || path.join(os.homedir(), '.dsh'),
  })

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

  // In-memory synthesis counters; reset on restart or DELETE /stats.
  const stats = { total: 0, cacheHits: 0, errors: 0, providers: {} }

  // In-flight synthesis deduplication (cache-stampede protection)
  const inFlightSyntheses = new Map()

  // Synthesis cache lives next to other harness data.
  const speechCache = createSpeechCache({
    root: process.env.DSH_HOME || path.join(os.homedir(), '.dsh'),
    maxBytes: () => {
      const mb = Number(live().cacheMaxMb)
      return mb > 0 ? mb * 1024 * 1024 : 100 * 1024 * 1024
    },
  })
  // Cache only short repeatable phrases; long unique streaming chunks skip the cache.
  // Otherwise the cache fills with garbage that never repeats.
  const CACHE_MAX_TEXT = 200

  // Text-cleaning options are read per call because config is live.
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

  // Fast-model summary. Any failure returns an empty string and the caller
  // silently falls back to truncation.
  async function summarizeReply(text, cfg, signal) {
    const sentences = Number(cfg.summarySentences) > 0 ? Number(cfg.summarySentences) : 3
    if (!llm || typeof llm.stream !== 'function') return ''
    const opts = {
      messages: [{ role: 'user', content: 'Summarize the text in ' + sentences + ' sentences in the same language as the text. Summary only, no preamble:\n\n' + text }],
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
        } catch (llmDown) { /* quiet fallback to truncation */ }
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
    // Role overrides: empty fields inherit the main chain.
    const ov = (cfg.roles && cfg.roles[role]) || {}
    if (ov.provider && PROVIDER_KEYS.includes(ov.provider)) order.unshift(ov.provider)
    if (order.length) {
      if (ov.model) models[order[0]] = ov.model
      if (ov.voice) voices[order[0]] = ov.voice
    }
    // Playback rate is browser-side only and is not part of the cache key.
    // It does not affect synthesis.
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
    const flightKey = cacheKey([text, order.join(','), JSON.stringify(models), JSON.stringify(voices), role, ov.ssmlStyle])
    if (inFlightSyntheses.has(flightKey)) {
      return inFlightSyntheses.get(flightKey)
    }

    const synthPromise = (async () => {
      try {
        const baseProviders = makeProviders(
          { resolveKey, fetchImpl: fetch, cfg, modelManager },
          { text, lang: cfg.autoDetect ? detectLang(text) : cfg.language, signal, models, voices, role },
        )
        const providers = {}
        for (const key of Object.keys(baseProviders)) {
          const fn = baseProviders[key]
          providers[key] = async () => {
            if (providerBreaker.isOpen(key)) {
              return { ok: false, provider: key, reason: 'circuit open (cooldown)' }
            }
            try {
              const out = await fn()
              if (out && out.ok) providerBreaker.recordSuccess(key)
              else providerBreaker.recordFailure(key, out && out.reason)
              return out
            } catch (err) {
              providerBreaker.recordFailure(key, err)
              throw err
            }
          }
        }
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
      } finally {
        inFlightSyntheses.delete(flightKey)
      }
    })()

    inFlightSyntheses.set(flightKey, synthPromise)
    return synthPromise
  }

  // Synthesize one phrase with queue reservation. The id is issued immediately,
  // not when the provider answers, so short phrases cannot overtake long ones.
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

  // Announcement: short chime then phrase. The chime is drawn by the browser,
  // so nothing is downloaded or stored.
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
    const max = live().maxQueue || 32
    while (pending.length > max) {
      const dropIndex = pending.findIndex((x) => x.kind !== 'reserved')
      if (dropIndex >= 0) {
        pending.splice(dropIndex, 1)
      } else {
        pending.shift()
      }
    }
    if (live().streamingEnabled && item.kind === 'chime') {
      broadcastStream('chime', item)
    }
  }

  // Reserve the queue slot before synthesis so phrase order matches
  // speech order, not arrival race.
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
    // The agent is waiting for human approval — worth speaking aloud
    // so the user notices without watching the screen.
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
      const agentName = (event.data && (
        event.data.subagent ||
        event.data.agent ||
        (event.data.message && (event.data.message.subagent || event.data.message.agent || event.data.message.sender || (event.data.message.author && event.data.message.author.name)))
      )) || (session && (session.subagent || session.agent)) || ''
      const activeRole = (agentName && cfg.roles && cfg.roles[agentName] && (cfg.roles[agentName].provider || cfg.roles[agentName].voice)) ? agentName : 'reply'

      // Speak as it goes: each incoming chunk is spoken immediately
      // in sentence pieces; waiting for turn end means silence while the agent works.
      
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
    // With speak-as-it-goes everything was already spoken by turn end.
    if (cfg.speakAsItGoes) { collectors.delete(sid); return }
    const cur = collectors.get(sid)
    collectors.delete(sid)
    const raw = cur && Array.isArray(cur.parts) ? cur.parts.join('\n') : ''
    const text = cleanText(raw, cfg)
    if (!text) return
    const pieces = splitSentences(text, cfg.sentenceChars)
    const activeRole = (cur && cur.role) || 'reply'
    for (const piece of pieces) {
      speakPiece(sid, piece, cfg, activeRole)
    }
  }), 'dsh-tts: speak finished replies')


  registerHttpRoutes(ctx, {
    breakerSnapshot: () => providerBreaker.snapshot(),

    live,
    modelManager,
    stats,
    speechCache,
    cleanText,
    synthesize,
    credentialsView,
    configResponse,
    storeProviderKey,
    clearProviderKey,
    pending,
    getSettingsApi: () => settingsApi,
    validateConfig: (obj) => Config(obj),
  })

  ctx.effect(() => () => {
    clearStreamSubscribers()
  }, 'dsh-tts: cleanup stream subscribers')

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
