import { cacheKey } from './cache.js'
import { needsApiKey, keyEnvName } from './keys.js'
import { detectLang } from './text.js'
import { makeProviders, PROVIDER_KEYS, DEFAULT_MODELS, DEFAULT_VOICES } from './providers.js'
import { runChain } from './chain.js'

export const CACHE_MAX_TEXT = 200

export function synthesisFingerprint(text, provider, model, voice, role, ssmlStyle, cfg, lang) {
  const credRef = needsApiKey(provider) ? (keyEnvName(cfg, provider) || '') : ''
  const parts = [text, provider, model || '', voice || '', role || '', ssmlStyle || '', lang || '', credRef]
  if (provider === 'custom') parts.push(cfg.customBaseUrl || '')
  else if (provider === 'openai') parts.push(cfg.openaiBaseUrl || '')
  else if (provider === 'mimo') parts.push(cfg.mimoBaseUrl || '', cfg.mimoFormat || '')
  else if (provider === 'azure') parts.push(cfg.azureRegion || '')
  else if (provider === 'piper') parts.push(cfg.piperModel || '', cfg.piperBin || '')
  else if (provider === 'edge') parts.push(cfg.edgeBin || '')
  else if (provider === 'espeak') parts.push(cfg.espeakBin || '')
  return cacheKey(parts)
}

export function flightFingerprint(text, order, models, voices, role, ssmlStyle, cfg, lang) {
  const details = order.map((p) => {
    const credRef = needsApiKey(p) ? (keyEnvName(cfg, p) || '') : ''
    const extra = p === 'custom' ? (cfg.customBaseUrl || '') :
                  p === 'openai' ? (cfg.openaiBaseUrl || '') :
                  p === 'mimo' ? `${cfg.mimoBaseUrl || ''}:${cfg.mimoFormat || ''}` :
                  p === 'azure' ? (cfg.azureRegion || '') :
                  p === 'piper' ? `${cfg.piperModel || ''}:${cfg.piperBin || ''}` : ''
    return `${p}:${models[p] || ''}:${voices[p] || ''}:${credRef}:${extra}`
  }).join(';')
  return cacheKey([text, details, role, ssmlStyle, lang])
}

// Fast-model summary. Any failure returns an empty string and the caller
// silently falls back to truncation.
export async function summarizeReply(ctx, text, cfg, signal) {
  const sentences = Number(cfg.summarySentences) > 0 ? Number(cfg.summarySentences) : 3
  const llm = ctx.llm
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

export function createSynthesizer({ ctx, live, modelManager, resolveKey, speechCache, stats, providerBreaker, cleanText }) {
  const inFlightSyntheses = new Map()

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
          speechCache.put(fp, out.mime, out.audio).catch((err) => {
            ctx.logger?.warn?.(`[dsh-tts] cache write failed: ${err?.message || err}`)
          })
        }
        return out
      } finally {
        inFlightSyntheses.delete(flightKey)
      }
    })()

    inFlightSyntheses.set(flightKey, synthPromise)
    return synthPromise
  }

  return {
    synthesize,
    inFlightSyntheses,
  }
}
