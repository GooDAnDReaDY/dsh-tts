import z from '@deepseek-ai/schemastery'
import os from 'node:os'
import path from 'node:path'
import { PROVIDER_KEYS } from './providers.js'
import {
  applyNarrationFilters,
  applyPronunciation,
  detectLang,
  extractTldr,
  speechPhrases,
  stripForSpeech,
} from './text.js'
import { createSpeechCache } from './cache.js'
import { createModelManager } from './engines/manager.js'
import { registerHttpRoutes } from './routes.js'
import { clearStreamSubscribers } from './stream-hub.js'
import { createProviderBreaker } from './breaker.js'
import { createSettingsApi, extractRevision, buildConfigResponse } from './settings-api.js'
import { createCredentialsManager } from './credentials.js'
import { createSynthesizer, summarizeReply } from './synthesize.js'
import { createSynthesisQueue } from './queue.js'
import { registerSessionEvents } from './session-events.js'
import { registerSpeakTool } from './tool.js'

export { extractRevision } from './settings-api.js'

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
  skipTables: z.boolean().volatile().default(true)
    .description('Replace tables with a short spoken notice instead of reading cells.'),
  cleanUrls: z.boolean().volatile().default(true)
    .description('Replace long web links with clean domain names.'),
  keepInlineCode: z.boolean().volatile().default(false)
    .description('Speak text inside inline code backticks instead of dropping it.'),
  adaptiveRate: z.boolean().volatile().default(false)
    .description('Automatically increase speech rate for long responses.'),
  tldrDefault: z.boolean().volatile().default(false)
    .description('Speak only the summary or conclusion section of the response by default.'),
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
  eventChimes: z.object({
    onTurnComplete: z.string().default('ding'),
    onApprovalRequired: z.string().default('pop'),
    onError: z.string().default('none'),
    onSubagentStart: z.string().default('none'),
    onSubagentDone: z.string().default('ding'),
  }).volatile().default({
    onTurnComplete: 'ding',
    onApprovalRequired: 'pop',
    onError: 'none',
    onSubagentStart: 'none',
    onSubagentDone: 'ding',
  }).description('Chime sounds for agent lifecycle events.'),
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
  duckOnTyping: z
    .string()
    .volatile()
    .description('Playback response when user types in chat input: duck (lower volume to 20%), pause, stop, or off.')
    .default('duck'),
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
      { provider: 'edge', model: '', voice: 'en-US-JennyNeural' },
      { provider: 'piper', model: '', voice: '' },
      { provider: 'espeak', model: '', voice: 'en' },
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
  doubaoKeyEnv: z.string().volatile().description('Credential holding the Doubao (Volcengine) API key.').default('DOUBAO_API_KEY'),
  doubaoAppId: z.string().volatile().description('Volcengine TTS App ID.').default(''),
  doubaoCluster: z.string().volatile().description('Volcengine TTS Cluster.').default('volcano_tts'),
  doubaoBaseUrl: z.string().volatile().description('Doubao TTS endpoint URL.').default('https://openspeech.bytedance.com/api/v1/tts'),
  deepseekWebKeyEnv: z.string().volatile().description('Credential holding DeepSeek user session token.').default('DEEPSEEK_WEB_TOKEN'),
  deepseekWebBaseUrl: z.string().volatile().description('DeepSeek Web Audio endpoint or bridge URL.').default('https://chat.deepseek.com/api/v0/chat/voice'),
  cosyvoiceUrl: z.string().volatile().description('CosyVoice local service URL.').default('http://127.0.0.1:9233'),
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

export function cleanOpts(cfg, overrides = {}) {
  return {
    skipCode: overrides.skipCode !== undefined ? overrides.skipCode : cfg.skipCode !== false,
    skipTables: overrides.skipTables !== undefined ? overrides.skipTables : cfg.skipTables !== false,
    cleanUrls: overrides.cleanUrls !== undefined ? overrides.cleanUrls : cfg.cleanUrls !== false,
    keepInlineCode: overrides.keepInlineCode !== undefined ? overrides.keepInlineCode : cfg.keepInlineCode === true,
    tldrOnly: overrides.tldrOnly !== undefined ? overrides.tldrOnly : cfg.tldrDefault === true,
    phrases: speechPhrases(cfg.language),
  }
}

export function cleanText(raw, cfg, maxChars = 0, overrides = {}) {
  return applyPronunciation(
    applyNarrationFilters(stripForSpeech(raw, maxChars, cleanOpts(cfg, overrides)), cfg),
    cfg.pronunciation,
    cfg.language,
    cfg.enableItDictionary !== false,
  )
}

export async function prepareSpeechText(raw, cfg, signal, overrides = {}, summarizeFn = null) {
  let sourceText = raw
  const wantTldr = overrides.tldrOnly !== undefined ? overrides.tldrOnly : cfg.tldrDefault
  if (wantTldr) {
    sourceText = extractTldr(sourceText, cfg.language)
  }
  let text = cleanText(sourceText, cfg, 0, overrides)
  if (!text) return ''
  const maxChars = Number(cfg.maxChars) > 0 ? Number(cfg.maxChars) : 0
  const overLimit = maxChars > 0 && text.length > maxChars
  if (overLimit && cfg.longReply !== 'full') {
    if (cfg.longReply === 'summarize' && typeof summarizeFn === 'function') {
      try {
        const retold = await summarizeFn(text.slice(0, 8000), cfg, signal)
        if (retold) {
          return speechPhrases(cfg.language).summaryIntro + ' ' + retold
        }
      } catch (_err) { /* quiet fallback to truncation */ }
    }
    return text.slice(0, maxChars)
  }
  return text
}

export function apply(ctx, config) {
  const providerBreaker = createProviderBreaker()

  const live = () => {
    const fromBoxes = plainConfig(config)
    return plainConfig(Config(fromBoxes))
  }

  const settingsApi = createSettingsApi(ctx, config, live, plainConfig, NS)
  const credentialsManager = createCredentialsManager(ctx, live)
  const configResponse = () => buildConfigResponse(ctx, live, credentialsManager.credentialsView, NS)

  const modelManager = createModelManager({
    root: process.env.DSH_HOME || path.join(os.homedir(), '.dsh'),
  })

  const stats = { total: 0, cacheHits: 0, errors: 0, providers: {} }

  const speechCache = createSpeechCache({
    root: process.env.DSH_HOME || path.join(os.homedir(), '.dsh'),
    maxBytes: () => {
      const mb = Number(live().cacheMaxMb)
      return mb > 0 ? mb * 1024 * 1024 : 100 * 1024 * 1024
    },
  })

  const prepareSpeechTextBound = (raw, cfg, signal, overrides = {}) =>
    prepareSpeechText(raw, cfg, signal, overrides, (t, c, s) => summarizeReply(ctx, t, c, s))

  const { synthesize } = createSynthesizer({
    ctx,
    live,
    modelManager,
    resolveKey: credentialsManager.resolveKey,
    speechCache,
    stats,
    providerBreaker,
    cleanText,
  })

  const {
    pending,
    activeReservations,
    reserve,
    settle,
    speakPiece,
    announce,
    nextUtteranceId,
  } = createSynthesisQueue({
    ctx,
    live,
    synthesize,
    stats,
  })

  registerSessionEvents(ctx, {
    live,
    cleanText,
    prepareSpeechTextBound,
    speakPiece,
    announce,
  })

  registerHttpRoutes(ctx, {
    breakerSnapshot: () => providerBreaker.snapshot(),
    live,
    modelManager,
    stats,
    speechCache,
    cleanText,
    prepareSpeechText: prepareSpeechTextBound,
    synthesize,
    credentialsView: credentialsManager.credentialsView,
    configResponse,
    storeProviderKey: credentialsManager.storeProviderKey,
    clearProviderKey: credentialsManager.clearProviderKey,
    pending,
    getSettingsApi: () => settingsApi,
    validateConfig: (obj) => Config(obj),
  })

  ctx.effect(() => () => {
    clearStreamSubscribers()
    for (const resv of activeReservations.values()) {
      resv.dropped = true
      try { resv.controller.abort() } catch (_abortErr) { /* ignore aborted controller */ }
      clearTimeout(resv.timer)
    }
    activeReservations.clear()
  })

  // Registers session events (agentName persona extraction, barge-in, playback)
  registerSpeakTool(ctx, {
    live,
    prepareSpeechTextBound,
    nextUtteranceId,
    reserve,
    settle,
    synthesize,
  })
}
