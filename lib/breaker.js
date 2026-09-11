// Soft circuit breaker for provider fallback (runtime state only).
// Tracks consecutive failures per chain id and skips a provider during cooldown.

const DEFAULT_THRESHOLD = 3
const DEFAULT_COOLDOWN_MS = 60000

export function createProviderBreaker(options = {}) {
  const threshold = options.threshold || DEFAULT_THRESHOLD
  const cooldownMs = options.cooldownMs || DEFAULT_COOLDOWN_MS
  const now = options.now || (() => Date.now())
  const state = new Map()

  function slot(id) {
    let s = state.get(id)
    if (!s) {
      s = { failCount: 0, okCount: 0, lastError: '', lastFailAt: 0, openUntil: 0 }
      state.set(id, s)
    }
    return s
  }

  function isOpen(id) {
    const s = slot(id)
    return s.openUntil > now()
  }

  function recordFailure(id, error) {
    const s = slot(id)
    s.failCount += 1
    s.lastError = String((error && error.message) || error || 'failure').slice(0, 240)
    s.lastFailAt = now()
    if (s.failCount >= threshold) {
      s.openUntil = now() + cooldownMs
    }
  }

  function recordSuccess(id) {
    const s = slot(id)
    s.okCount += 1
    s.failCount = 0
    s.openUntil = 0
  }

  function snapshot(ids) {
    const list = Array.isArray(ids) ? ids : [...state.keys()]
    return list.map((id) => {
      const s = slot(id)
      return {
        id,
        failCount: s.failCount,
        okCount: s.okCount,
        lastError: s.lastError,
        open: isOpen(id),
        openUntil: s.openUntil || 0,
      }
    })
  }

  function reset() {
    state.clear()
  }

  return { isOpen, recordFailure, recordSuccess, snapshot, reset, threshold, cooldownMs }
}