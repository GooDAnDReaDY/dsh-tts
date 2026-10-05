// SSE subscriber hub for /dsh-tts/stream.

const subscribers = new Set()
let heartbeatTimer = null

// Max buffer size for a slow subscriber before disconnecting (512 KB)
export const MAX_SUBSCRIBER_BUFFER = 512 * 1024

function detach(res) {
  try {
    if (res.__dtsOnClose && typeof res.off === 'function') res.off('close', res.__dtsOnClose)
    if (res.__dtsOnError && typeof res.off === 'function') res.off('error', res.__dtsOnError)
    if (res.__dtsOnDrain && typeof res.off === 'function') res.off('drain', res.__dtsOnDrain)
  } catch { /* listeners may already be gone */ }
  res.__dtsOnClose = null
  res.__dtsOnError = null
  res.__dtsOnDrain = null
  res.__dtsBackpressured = false
  res.__dtsBufferedBytes = 0
}

function safeWrite(res, payload) {
  // If subscriber is already backpressured, check buffered limit
  if (res.__dtsBackpressured) {
    const currentBuffered = typeof res.writableLength === 'number'
      ? res.writableLength
      : (res.__dtsBufferedBytes || 0)
    const payloadBytes = Buffer.byteLength(payload)
    if (currentBuffered + payloadBytes > MAX_SUBSCRIBER_BUFFER) {
      // Disconnect slow subscriber exceeding memory buffer limit (#186)
      subscribers.delete(res)
      detach(res)
      try { res.end() } catch {}
      return false
    }
  }

  let writeOk = true
  try {
    writeOk = res.write(payload)
  } catch {
    subscribers.delete(res)
    detach(res)
    return false
  }

  if (writeOk === false) {
    res.__dtsBackpressured = true
    res.__dtsBufferedBytes = (res.__dtsBufferedBytes || 0) + Buffer.byteLength(payload)
    if (!res.__dtsOnDrain) {
      const onDrain = () => {
        res.__dtsBackpressured = false
        res.__dtsBufferedBytes = 0
      }
      res.__dtsOnDrain = onDrain
      try {
        if (typeof res.on === 'function') res.on('drain', onDrain)
      } catch { /* non-eventemitter mock */ }
    }
  } else if (res.__dtsBackpressured && (!res.writableLength || res.writableLength === 0)) {
    res.__dtsBackpressured = false
    res.__dtsBufferedBytes = 0
  }

  return writeOk
}

function ensureHeartbeat() {
  if (heartbeatTimer || typeof setInterval !== 'function') return
  heartbeatTimer = setInterval(() => {
    if (!subscribers.size) {
      clearInterval(heartbeatTimer)
      heartbeatTimer = null
      return
    }
    for (const res of [...subscribers]) {
      safeWrite(res, ': ping\n\n')
    }
  }, 15000)
  if (heartbeatTimer.unref) heartbeatTimer.unref()
}

export function addStreamSubscriber(res) {
  subscribers.add(res)
  const onClose = () => {
    subscribers.delete(res)
    detach(res)
  }
  res.__dtsOnClose = onClose
  res.__dtsOnError = onClose
  try {
    if (typeof res.on === 'function') {
      res.on('close', onClose)
      res.on('error', onClose)
    }
  } catch { /* non-node response object in tests */ }
  ensureHeartbeat()
}

export function removeStreamSubscriber(res) {
  subscribers.delete(res)
  detach(res)
}

export function broadcastStream(type, item) {
  const payload = 'event: ' + type + '\ndata: ' + JSON.stringify(item) + '\n\n'
  for (const res of [...subscribers]) {
    safeWrite(res, payload)
  }
}

export function streamSubscriberCount() {
  return subscribers.size
}

export function clearStreamSubscribers() {
  for (const res of [...subscribers]) {
    try {
      res.end()
    } catch { /* already closed */ }
  }
  subscribers.clear()
  if (heartbeatTimer) {
    clearInterval(heartbeatTimer)
    heartbeatTimer = null
  }
}
