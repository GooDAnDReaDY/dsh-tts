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
export const inject = ['tools', 'credentials', 'llm', 'webServer']

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

// Unwrap Volatile boxes before any caller reads a value. A volatile field holds a
// box rather than its value, and the Loader mutates those boxes in place.
export function plainConfig(value) {
  if (value === null || typeof value !== 'object') return value
  if (Array.isArray(value)) return value.map(plainConfig)
  if (typeof value.get === 'function') return plainConfig(value.get())
  return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, plainConfig(v)]))
}

export const Config = z.object({
  speakReplies: z.boolean().volatile().default(false)
    .description('When on, speak each finished agent reply in the Web UI.'),
  enableLocalEngines: z.boolean().volatile().default(false)
    .description('Enable offline local TTS engines (Kokoro / F5).'),
  kokoroEnabled: z.boolean().volatile().default(false)
    .description('Use local Kokoro-82M on CPU when installed.'),
  f5Enabled: z.boolean().volatile().default(false)
    .description('Use local F5-TTS on GPU when installed.'),
  streamingEnabled: z.boolean().volatile().default(true)
    .description('Stream audio in real-time using AudioWorklet and SSE for sub-300ms latency.'),
  skipCode: z.boolean().volatile().default(true)
    .description('Replace fenced code blocks with a short spoken notice instead of reading them aloud.'),
  cache: z.boolean().volatile().default(true)
    .description('Reuse synthesized audio for repeated phrases instead of paying and waiting again.'),
  cacheMaxMb: z.number().volatile().default(100)
    .description('Disk limit for the synthesis cache; least recently used items are evicted first.'),
  narrateQuotesOnly: z.boolean().volatile().default(false)
    .description('Speak only quoted fragments.'),
  skipActions: z.boolean().volatile().default(false)
    .description('Drop *asterisk action* blocks instead of reading them.'),
  removeRegex: z.string().volatile().default('')
    .description('Custom global regex whose matches are removed before synthesis.'),
  autoDetect: z.boolean().volatile().default(false)
    .description('Guess ru/en per spoken piece instead of using the language setting.'),
  customBaseUrl: z.string().volatile().default('')
    .description('Origin of an OpenAI-compatible /audio/speech endpoint; empty skips it.'),
  customKeyEnv: z.string().volatile().default('CUSTOM_TTS_API_KEY'),
  pronunciation: z.array(z.object({
    from: z.string().default(''),
    to: z.string().default(''),
    whole: z.boolean().default(false),
    lang: z.string().default(''),
  })).volatile().default([])
    .description('Say this instead of that. Applied top-down; /regex/ form allowed in from.'),
  enableItDictionary: z.boolean().volatile().default(true)
    .description('Auto-correct common IT terminology pronunciation (SQL, Nginx, K8s, etc.).'),
  longReply: z.string().volatile().default('truncate')
    .description('What to do when a reply exceeds the length limit.'),
  summaryModel: z.string().volatile().default('')
    .description('provider/model for the spoken retelling; empty uses the conversation default.'),
  summarySentences: z.number().volatile().default(3)
    .description('Sentences in the spoken retelling.'),
  roles: z.dict(RoleOverride).volatile().default({
    reply: { provider: '', model: '', voice: '', chime: '', ssmlStyle: '' },
    approval: { provider: '', model: '', voice: '', chime: '', ssmlStyle: '' },
    error: { provider: '', model: '', voice: '', chime: '', ssmlStyle: '' },
  })
    .description('Per-role and subagent overrides; empty fields inherit the main chain.'),
  voiceDuplexEnabled: z.boolean().volatile().default(false)
    .description('Full-duplex voice conversation with dsh-voice.'),
  vadBargeIn: z.boolean().volatile().default(true)
    .description('Mute speech synthesis immediately when voice activity is detected.'),
  messengerTtsEnabled: z.boolean().volatile().default(false)
    .description('Send synthesized voice notes to messengers via @goodandready/dsh-messenger-gateway.'),
  autoDetectSubagent: z.boolean().volatile().default(true)
    .description('Auto-detect subagent roles in multi-agent sessions and route to dedicated voice profiles.'),
  language: z.string().volatile().default('en'),
  speakAsItGoes: z
    .boolean()
    .volatile()
    .description('Speak each reply as it lands instead of waiting for the whole turn to finish. '
      + 'Long answers start sounding almost at once because they are synthesized sentence by sentence.')
    .default(true),
  sentenceChars: z
    .number()
    .step(1)
    .min(10)
    .volatile()
    .description('Upper bound of one spoken piece when speaking as it goes.')
    .default(320),
  rate: z
    .number()
    .min(0.1)
    .max(5)
    .volatile()
    .description('Playback speed, 0.5 to 2. Synthesis is untouched; the browser plays faster or slower.')
    .default(1),
  bargeIn: z
    .boolean()
    .volatile()
    .description('Fall silent the moment the microphone opens. Listening to a reply and talking over it '
      + 'at the same time does not work, and the reply would be recorded along with the voice.')
    .default(true),
  announceApproval: z
    .boolean()
    .volatile()
    .description('Say out loud when the agent stops and waits for an approval, and play a short chime. '
      + 'Useful when you walk away from a long run.')
    .default(true),
  approvalText: z
    .string()
    .volatile()
    .description('What to say when an approval is asked for. The tool name is appended.')
    .default('Approval required'),
  questionText: z
    .string()
    .volatile()
    .description('What to say when the agent asks a question. Empty disables it.')
    .default('Agent asked a question'),
  chime: z
    .string()
    .volatile()
    .description('Short sound before an announcement: ding, beep or none.')
    .default('ding'),
  maxChars: z.number().step(1).min(0).volatile().default(4000)
    .description('Longer replies are truncated before synthesis.'),
  chain: z.array(ChainEntry).volatile()
    .default([
      { provider: 'edge', model: '', voice: 'ru-RU-SvetlanaNeural' },
      { provider: 'piper', model: '', voice: '' },
      { provider: 'espeak', model: '', voice: 'ru' },
    ])
    .description('Fallback chain. Order is the order of attempts. A provider without a key is skipped.'),
  openaiKeyEnv: z.string().volatile().default('OPENAI_API_KEY'),
  openaiBaseUrl: z.string().volatile().default('https://api.openai.com/v1'),
  elevenlabsKeyEnv: z.string().volatile().default('ELEVENLABS_API_KEY'),
  googleKeyEnv: z.string().volatile().default('GEMINI_API_KEY'),
  azureKeyEnv: z.string().volatile().default('AZURE_SPEECH_KEY'),
  azureRegion: z.string().volatile().default('')
    .description('Azure Speech region, e.g. eastus. Required for the azure provider.'),
  mimoKeyEnv: z.string().volatile().description('Credential holding the Xiaomi MiMo key.').default('MIMO_API_KEY'),
  mimoBaseUrl: z.string().volatile().description('MiMo API root. Synthesis goes through its chat endpoint.').default('https://api.xiaomimimo.com/v1'),
  mimoFormat: z.string().volatile().description('MiMo output format: mp3 or wav.').default('mp3'),
  minimaxBin: z.string().volatile()
    .description('MiniMax CLI, looked up in PATH unless absolute. Install and log in separately; '
      + 'without it the provider declines and the chain moves on.')
    .default('mmx'),
  siliconflowKeyEnv: z.string().volatile().description('Credential holding the SiliconFlow key.').default('SILICONFLOW_API_KEY'),
  deepinfraKeyEnv: z.string().volatile().description('Credential holding the DeepInfra key.').default('DEEPINFRA_API_KEY'),
  fireworksKeyEnv: z.string().volatile().description('Credential holding the Fireworks key.').default('FIREWORKS_API_KEY'),
  groqKeyEnv: z.string().volatile().default('GROQ_API_KEY'),
  deepgramKeyEnv: z.string().volatile().default('DEEPGRAM_API_KEY'),
  openrouterKeyEnv: z.string().volatile().default('OPENROUTER_API_KEY'),
  edgeBin: z.string().volatile().default('edge-tts')
    .description('edge-tts CLI. Looked up in PATH unless an absolute path is given.'),
  piperBin: z.string().volatile().default('piper'),
  piperModel: z.string().volatile().default('')
    .description('Path to a Piper ONNX model. The piper provider is skipped while this is empty.'),
  espeakBin: z.string().volatile().default('espeak-ng'),
  timeoutMs: z.number().step(1).min(1000).volatile().default(60000),
  maxQueue: z.number().step(1).min(0).volatile().default(8),
})

let utteranceSeq = 0

export function apply(ctx, config) {
  const providerBreaker = createProviderBreaker()

  let savedConfig = null
  const live = () => {
    const fromBoxes = plainConfig(config)
    const merged = savedConfig ? { ...fromBoxes, ...savedConfig } : fromBoxes
    return plainConfig(Config(merged))
  }

  const settingsApi = {
    get: () => live(),
    replace: async (next, expectedRevision) => {
      const plain = plainConfig(next)
      const prevSaved = savedConfig
      const svc = ctx?.get?.('settings') ?? ctx?.settings ?? ctx?.get?.('settingsForms') ?? ctx?.settingsForms
      if (!svc) {
        throw new Error('Settings service is unavailable')
      }
      let rev = expectedRevision
      if (rev === undefined && typeof svc.describe === 'function') {
        try {
          const desc = await svc.describe(NS)
          if (desc && typeof desc.revision === 'number') {
            rev = desc.revision
          } else if (desc && Array.isArray(desc.namespaces)) {
            const entry = desc.namespaces.find((n) => n.ns === NS)
            if (entry && typeof entry.revision === 'number') rev = entry.revision
          }
        } catch {
          // ignore describe error
        }
      }
      try {
        if (typeof svc.replace === 'function') {
          await svc.replace(NS, plain, rev)
        } else if (typeof svc.update === 'function') {
          await svc.update(NS, plain, rev)
        } else {
          throw new Error('Settings service does not support replace or update')
        }
        savedConfig = plain
      } catch (err) {
        savedConfig = prevSaved
        throw err
      }
      return plain
    },
  }

  // settings.register was removed before 0.1.7-rc.2. The host hands the profile entry
  // config to apply() directly; live() below re-resolves it through the schema and
  // unwraps, so the Loader's in-place box updates are picked up without a service.

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
  function cleanText(raw, cfg, maxChars = 0) {
    return applyPronunciation(
      applyNarrationFilters(stripForSpeech(raw, maxChars, cleanOpts(cfg)), cfg),
      cfg.pronunciation,
      cfg.language,
      cfg.enableItDictionary !== false,
    )
  }

  // Canonical text preparation (#156, #157): clean once without premature truncation,
  // then apply longReply strategy (full / summarize / truncate).
  async function prepareSpeechText(raw, cfg, signal) {
    let text = cleanText(raw, cfg, 0)
    if (!text) return ''
    const maxChars = Number(cfg.maxChars) > 0 ? Number(cfg.maxChars) : 0
    const overLimit = maxChars > 0 && text.length > maxChars
    if (overLimit && cfg.longReply !== 'full') {
      if (cfg.longReply === 'summarize') {
        try {
          const retold = await summarizeReply(text.slice(0, 8000), cfg, signal)
          if (retold) {
            return speechPhrases(cfg.language).summaryIntro + ' ' + retold
          }
        } catch { /* quiet fallback to truncation */ }
      }
      return text.slice(0, maxChars)
    }
    return text
  }

  function synthesisFingerprint(text, provider, model, voice, role, ssmlStyle, cfg, lang) {
    const parts = [text, provider, model || '', voice || '', role || '', ssmlStyle || '', lang || '']
    if (provider === 'custom') parts.push(cfg.customBaseUrl || '')
    else if (provider === 'openai') parts.push(cfg.openaiBaseUrl || '')
    else if (provider === 'mimo') parts.push(cfg.mimoBaseUrl || '', cfg.mimoFormat || '')
    else if (provider === 'azure') parts.push(cfg.azureRegion || '')
    else if (provider === 'piper') parts.push(cfg.piperModel || '', cfg.piperBin || '')
    else if (provider === 'edge') parts.push(cfg.edgeBin || '')
    else if (provider === 'espeak') parts.push(cfg.espeakBin || '')
    return cacheKey(parts)
  }

  function flightFingerprint(text, order, models, voices, role, ssmlStyle, cfg, lang) {
    const details = order.map((p) => {
      const extra = p === 'custom' ? (cfg.customBaseUrl || '') :
                    p === 'openai' ? (cfg.openaiBaseUrl || '') :
                    p === 'mimo' ? `${cfg.mimoBaseUrl || ''}:${cfg.mimoFormat || ''}` :
                    p === 'azure' ? (cfg.azureRegion || '') :
                    p === 'piper' ? `${cfg.piperModel || ''}:${cfg.piperBin || ''}` : ''
      return `${p}:${models[p] || ''}:${voices[p] || ''}:${extra}`
    }).join(';')
    return cacheKey([text, details, role, ssmlStyle, lang])
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

  async function synthesize(rawText, cfg, signal, role = 'reply', { skipClean = false } = {}) {
    let text = skipClean ? String(rawText || '') : cleanText(rawText, cfg, 0)
    if (!text) throw new Error('nothing to speak')
    const effectiveLang = cfg.autoDetect ? detectLang(text) : cfg.language
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
        const fp = synthesisFingerprint(text, provider, models[provider], voices[provider], role, ov.ssmlStyle, cfg, effectiveLang)
        const hit = await speechCache.get(fp)
        if (hit) {
          stats.total++
          stats.cacheHits++
          const ps = stats.providers[provider] || (stats.providers[provider] = { n: 0, e: 0, ms: 0 })
          ps.n++
          return { provider, mime: hit.mime, audio: hit.audio, tookMs: 0, cached: true }
        }
      }
    }
    const flightKey = flightFingerprint(text, order, models, voices, role, ov.ssmlStyle, cfg, effectiveLang)
    if (inFlightSyntheses.has(flightKey)) {
      return inFlightSyntheses.get(flightKey)
    }

    const synthPromise = (async () => {
      try {
        const baseProviders = makeProviders(
          { resolveKey, fetchImpl: fetch, cfg, modelManager },
          { text, lang: effectiveLang, signal, models, voices, role },
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
          const fp = synthesisFingerprint(text, p, models[p], voices[p], role, ov.ssmlStyle, cfg, effectiveLang)
          speechCache.put(fp, out.mime, out.audio).catch(() => {})
        }
        return out
      } finally {
        inFlightSyntheses.delete(flightKey)
      }
    })()

    inFlightSyntheses.set(flightKey, synthPromise)
    return synthPromise
  }

  // Active reservations map and concurrency throttler (#174)
  const activeReservations = new Map() // id -> { controller, timer, dropped }
  let activeSyntheses = 0
  const synthesisQueue = []

  function getEffectiveConcurrency(cfg) {
    const maxQ = typeof cfg.maxQueue === 'number' && cfg.maxQueue > 0 ? cfg.maxQueue : 8
    return Math.max(1, Math.min(maxQ, 4))
  }

  function runThrottledSynthesis(id, signal, fn) {
    if (signal && signal.aborted) {
      return Promise.reject(new Error('aborted'))
    }
    return new Promise((resolve, reject) => {
      let isQueued = true
      const onAbort = () => {
        if (isQueued) {
          const idx = synthesisQueue.findIndex((item) => item.id === id)
          if (idx >= 0) synthesisQueue.splice(idx, 1)
          reject(new Error('aborted'))
        }
      }
      if (signal) {
        signal.addEventListener('abort', onAbort, { once: true })
      }

      const execute = async () => {
        isQueued = false
        if (signal) signal.removeEventListener('abort', onAbort)
        if (signal && signal.aborted) {
          reject(new Error('aborted'))
          pumpSynthesisQueue()
          return
        }
        const resv = activeReservations.get(id)
        if (resv && resv.dropped) {
          reject(new Error('dropped from queue'))
          pumpSynthesisQueue()
          return
        }
        activeSyntheses++
        try {
          const result = await fn()
          resolve(result)
        } catch (err) {
          reject(err)
        } finally {
          activeSyntheses--
          pumpSynthesisQueue()
        }
      }

      const maxLimit = getEffectiveConcurrency(live())
      if (activeSyntheses < maxLimit) {
        execute()
      } else {
        synthesisQueue.push({ id, run: execute })
      }
    })
  }

  function pumpSynthesisQueue() {
    const maxLimit = getEffectiveConcurrency(live())
    while (activeSyntheses < maxLimit && synthesisQueue.length > 0) {
      const next = synthesisQueue.shift()
      if (next) next.run()
    }
  }

  // Synthesize one phrase with queue reservation. The id is issued immediately,
  // not when the provider answers, so short phrases cannot overtake long ones.
  function speakPiece(sid, text, cfg, kind) {
    if (!text) return
    const maxQ = Math.max(0, typeof cfg.maxQueue === 'number' ? cfg.maxQueue : 32)
    if (maxQ === 0) return

    const role = kind === 'notice' ? 'approval' : kind === 'error' ? 'error' : (kind && kind !== 'speech' ? kind : 'reply')
    const id = `u${++utteranceSeq}`
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), cfg.timeoutMs)
    activeReservations.set(id, { controller, timer, dropped: false })
    reserve(id)

    runThrottledSynthesis(id, controller.signal, () =>
      synthesize(text, cfg, controller.signal, role, { skipClean: true })
    )
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
        const resv = activeReservations.get(id)
        if (resv && resv.dropped) {
          activeReservations.delete(id)
          return
        }
        stats.errors++
        settle(id, { id, sessionId: sid, kind: 'error', text, error: String(err && err.message || err) })
      })
      .finally(() => {
        clearTimeout(timer)
        activeReservations.delete(id)
      })
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
    const max = Math.max(0, typeof live().maxQueue === 'number' ? live().maxQueue : 32)
    if (max === 0) {
      for (const p of pending) {
        if (p && p.id && activeReservations.has(p.id)) {
          const resv = activeReservations.get(p.id)
          resv.dropped = true
          try { resv.controller.abort() } catch {}
          clearTimeout(resv.timer)
          activeReservations.delete(p.id)
        }
      }
      pending.length = 0
      return
    }
    while (pending.length > max && pending.length > 0) {
      const dropIndex = pending.findIndex((x) => x.kind !== 'reserved')
      const dropped = dropIndex >= 0 ? pending.splice(dropIndex, 1)[0] : pending.shift()
      if (dropped && dropped.id && activeReservations.has(dropped.id)) {
        const resv = activeReservations.get(dropped.id)
        if (resv) {
          resv.dropped = true
          try { resv.controller.abort() } catch {}
          clearTimeout(resv.timer)
          activeReservations.delete(dropped.id)
        }
      }
    }
    if (live().streamingEnabled && item.kind === 'chime') {
      item._streamEmitted = true
      broadcastStream('chime', item)
    }
  }

  // Reserve the queue slot before synthesis so phrase order matches
  // speech order, not arrival race.
  function reserve(id) {
    enqueue({ id, kind: 'reserved' })
  }

  function flushReadyStream() {
    if (!live().streamingEnabled) return
    for (const item of pending) {
      if (item.kind === 'reserved') {
        break // Stop at the first unsettled reservation to preserve sequence order
      }
      if (!item._streamEmitted) {
        item._streamEmitted = true
        if (item.audioBase64) {
          broadcastStream('utterance', item)
        }
      }
    }
  }

  function settle(id, item) {
    activeReservations.delete(id)
    const at = pending.findIndex((row) => row.id === id)
    if (at === -1) {
      // Dropped reservation: do NOT re-enqueue (#174)
      return
    }
    pending[at] = item
    flushReadyStream()
  }

  ctx.effect(() => ctx.on('session/event', (session, event) => {
    const cfg = live()
    if (!cfg.speakReplies) return
    const sid = session && session.id
    if (!sid) return
    const isMessenger = session && (session.kind === 'im' || session.kind === 'messenger' || session.channel === 'messenger' || session.type === 'im')
    if (isMessenger && cfg.messengerTtsEnabled === false) return
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
      const allowSubagent = cfg.autoDetectSubagent !== false
      const activeRole = (allowSubagent && agentName && cfg.roles && cfg.roles[agentName] && (cfg.roles[agentName].provider || cfg.roles[agentName].voice)) ? agentName : 'reply'

      // Speak as it goes: each incoming chunk is spoken immediately
      // in sentence pieces; waiting for turn end means silence while the agent works.
      
      if (cfg.speakAsItGoes) {
        const ready = cleanText(text, cfg, 0)
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
    const activeRole = (cur && cur.role) || 'reply'
    prepareSpeechText(raw, cfg).then((text) => {
      if (!text) return
      const pieces = splitSentences(text, cfg.sentenceChars)
      for (const piece of pieces) {
        speakPiece(sid, piece, cfg, activeRole)
      }
    }).catch(() => {})
  }), 'dsh-tts: speak finished replies')


  registerHttpRoutes(ctx, {
    breakerSnapshot: () => providerBreaker.snapshot(),

    live,
    modelManager,
    stats,
    speechCache,
    cleanText,
    prepareSpeechText,
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
        const rawText = String(args.text || '').trim()
        if (!rawText) return { ok: false, error: 'empty text' }
        const sid = exec?.session?.id || 'tool'
        const id = `u${++utteranceSeq}`
        reserve(id)
        try {
          const text = await prepareSpeechText(rawText, cfg, exec.signal)
          if (!text) {
            settle(id, { id, sessionId: sid, kind: 'error', text: rawText, error: 'nothing to speak' })
            return { ok: false, error: 'nothing to speak' }
          }
          const out = await synthesize(text, cfg, exec.signal, 'reply', { skipClean: true })
          const item = {
            id,
            sessionId: sid,
            kind: 'speech',
            role: 'reply',
            text,
            provider: out.provider,
            mime: out.mime,
            audioBase64: Buffer.from(out.audio).toString('base64'),
            tookMs: out.tookMs,
          }
          settle(id, item)
          return {
            ok: true,
            id,
            provider: out.provider,
            mime: out.mime,
            bytes: out.audio.length,
            tookMs: out.tookMs,
          }
        } catch (e) {
          settle(id, { id, sessionId: sid, kind: 'error', text: rawText, error: String(e && e.message || e) })
          return { ok: false, error: String(e && e.message || e) }
        }
      },
    }),
  )
}
