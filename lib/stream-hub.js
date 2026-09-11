// SSE subscriber hub for /dsh-tts/stream.

const subscribers = new Set()
let heartbeatTimer = null

function detach(res) {
  try {
    if (res.__dtsOnClose) res.off('close', res.__dtsOnClose)
    if (res.__dtsOnError) res.off('error', res.__dtsOnError)
  } catch { /* listeners may already be gone */ }
  res.__dtsOnClose = null
  res.__dtsOnError = null
}

function safeWrite(res, payload) {
  try {
    res.write(payload)
    return true
  } catch {
    subscribers.delete(res)
    detach(res)
    return false
  }
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
    res.on('close', onClose)
    res.on('error', onClose)
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