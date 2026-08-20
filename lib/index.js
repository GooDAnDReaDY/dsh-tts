import z from '@deepseek-ai/schemastery'
import { defineTool } from '@deepseek-ai/dsh-tools'
import { credentialRef } from '@deepseek-ai/dsh-credentials'
import { runChain } from './chain.js'
import { makeProviders, PROVIDER_KEYS, DEFAULT_MODELS, DEFAULT_VOICES } from './providers.js'
import { assistantText, stripForSpeech } from './text.js'

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

  function enqueue(item) {
    pending.push(item)
    const max = live().maxQueue || 8
    while (pending.length > max) pending.shift()
  }

  ctx.effect(() => ctx.on('session/event', (session, event) => {
    const cfg = live()
    if (!cfg.speakReplies) return
    const sid = session && session.id
    if (!sid) return
    if (event.type === 'assistant/message') {
      const text = assistantText(event.data && event.data.message)
      if (!text) return
      const cur = collectors.get(sid) || { parts: [] }
      cur.parts.push(text)
      collectors.set(sid, cur)
      return
    }
    if (event.type !== 'turn/end') return
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
        writeJson(res, 200, { ok: true, config: live() })
        return
      }
      if (req.method !== 'PUT' && req.method !== 'POST') {
        writeJson(res, 405, { ok: false, error: { code: 'method', message: 'GET or PUT' } })
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
      if (payload && typeof payload.config === 'object') payload = payload.config
      let parsed
      try { parsed = Config(payload) } catch (e) {
        writeJson(res, 400, { ok: false, error: { code: 'schema', message: String(e && e.message || e) } })
        return
      }
      try {
        await settingsApi.replace(parsed)
        writeJson(res, 200, { ok: true, config: live() })
      } catch (e) {
        writeJson(res, 500, { ok: false, error: { code: 'save', message: String(e && e.message || e) } })
      }
    },
  }), 'dsh-tts: /config route')

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
