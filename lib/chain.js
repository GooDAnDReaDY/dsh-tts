// Fallback walk over a TTS provider chain. Pure: no cordis, no network.

function normalizeError(err) {
  const cause = err?.cause?.message || err?.message || String(err)
  return cause.slice(0, 200)
}

/**
 * @param order {string[]}
 * @param providers {Record<string, () => Promise<{ok, provider?, audio?, mime?, reason?}>>}
 */
export async function runChain(order, providers) {
  const t0 = Date.now()
  const keys = (Array.isArray(order) ? order : []).filter((k) => typeof providers[k] === 'function')
  const errors = []
  for (const key of keys) {
    try {
      const out = await providers[key]()
      if (out && out.ok && out.audio && out.audio.length > 0) {
        return {
          provider: out.provider || key,
          audio: out.audio,
          mime: out.mime || 'audio/mpeg',
          tookMs: Date.now() - t0,
        }
      }
      errors.push(`${(out && out.provider) || key}: ${(out && out.reason) || 'unknown'}`)
    } catch (err) {
      errors.push(`${key}: ${normalizeError(err)}`)
    }
  }
  throw new Error(`all providers failed (${errors.join('; ')})`)
}
