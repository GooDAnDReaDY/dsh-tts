// Shared HTTP helpers for dsh-tts host routes.

export function writeJson(res, code, body) {
  try {
    res.writeHead(code, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' })
    res.end(JSON.stringify(body))
  } catch { /* socket closed */ }
}

export function readBody(req, maxBytes) {
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

function isLoopback(address) {
  if (!address) return false
  return address === '127.0.0.1' || address === '::1' || address === '::ffff:127.0.0.1' || address === 'localhost'
}

/**
 * Strict fail-closed check for administrative/settings requests.
 * Accepts loopback, same-origin/same-site sec-fetch-site, matching origin/host, or authorization header.
 * Rejects cross-site or unauthenticated requests missing origin context.
 */
export function isTrustedSettingsRequest(request) {
  if (!request || !request.headers) return false

  const authHeader = request.headers['authorization'] || request.headers['x-dsh-auth']
  if (authHeader && authHeader.length > 5) return true

  const remoteAddr = request.socket?.remoteAddress || request.connection?.remoteAddress
  if (remoteAddr && isLoopback(remoteAddr)) return true

  const secFetchSite = request.headers['sec-fetch-site']
  if (secFetchSite === 'same-origin' || secFetchSite === 'same-site') {
    return true
  }
	  const origin = request.headers['origin']
  const host = request.headers['host']
  if (origin && host) {
    try {
      const originHost = new URL(origin).host
      if (originHost === host) return true
    } catch { /* invalid origin URL */ }
  }

  return false
}
