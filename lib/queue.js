import { computeAdaptiveRate } from './text.js'
import { broadcastStream } from './stream-hub.js'

let utteranceSeq = 0

export function createSynthesisQueue({ ctx, live, synthesize, stats }) {
  const pending = []
  const activeReservations = new Map()
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

  function enqueue(item) {
    pending.push(item)
    const max = Math.max(0, typeof live().maxQueue === 'number' ? live().maxQueue : 32)
    if (max === 0) {
      for (const p of pending) {
        if (p && p.id && activeReservations.has(p.id)) {
          const resv = activeReservations.get(p.id)
          resv.dropped = true
          try { resv.controller.abort() } catch (_abortErr) { /* ignore aborted controller */ }
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
          try { resv.controller.abort() } catch (_abortErr) { /* ignore aborted controller */ }
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

  function reserve(id) {
    enqueue({ id, kind: 'reserved' })
  }

  function flushReadyStream() {
    if (!live().streamingEnabled) return
    for (const item of pending) {
      if (item.kind === 'reserved') {
        break
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
      return
    }
    pending[at] = item
    flushReadyStream()
  }

  function speakPiece(sid, text, cfg, kind, meta = {}) {
    if (!text) return
    const maxQ = Math.max(0, typeof cfg.maxQueue === 'number' ? cfg.maxQueue : 32)
    if (maxQ === 0) return

    const role = kind === 'notice' ? 'approval' : kind === 'error' ? 'error' : (kind && kind !== 'speech' ? kind : 'reply')
    const id = `u${++utteranceSeq}`
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), cfg.timeoutMs)
    activeReservations.set(id, { controller, timer, dropped: false })
    reserve(id)

    const effectiveRate = cfg.adaptiveRate ? computeAdaptiveRate(text.length, cfg.rate) : cfg.rate
    runThrottledSynthesis(id, controller.signal, () =>
      synthesize(text, cfg, controller.signal, role, { skipClean: true })
    )
      .then((out) => settle(id, {
        id,
        sessionId: sid,
        kind: (kind === 'notice' || kind === 'error') ? kind : 'speech',
        role,
        text,
        rate: effectiveRate,
        sentenceIndex: meta.sentenceIndex,
        totalSentences: meta.totalSentences,
        charStart: meta.charStart,
        charEnd: meta.charEnd,
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

  return {
    pending,
    activeReservations,
    runThrottledSynthesis,
    pumpSynthesisQueue,
    enqueue,
    reserve,
    flushReadyStream,
    settle,
    speakPiece,
    roleChime,
    announce,
    nextUtteranceId: () => `u${++utteranceSeq}`,
  }
}
