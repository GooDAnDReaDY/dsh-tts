// SSE subscriber hub for /dsh-tts/stream.

const subscribers = new Set()

export function addStreamSubscriber(res) {
  subscribers.add(res)
}

export function removeStreamSubscriber(res) {
  subscribers.delete(res)
}

export function broadcastStream(type, item) {
  const payload = `event: ${type}\ndata: ${JSON.stringify(item)}\n\n`
  for (const res of subscribers) {
    try {
      res.write(payload)
    } catch {
      subscribers.delete(res)
    }
  }
}

export function clearStreamSubscribers() {
  for (const res of subscribers) {
    try {
      res.end()
    } catch { /* already closed */ }
  }
  subscribers.clear()
}
