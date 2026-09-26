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

export function isLoopback(address) {
  if (!address || typeof address !== 'string') return false
  return (
    address === '127.0.0.1' ||
    address === '::1' ||
    address === '::ffff:127.0.0.1' ||
    address.startsWith('127.') ||
    address === 'localhost'
  )
}

function parseCookies(cookieHeader) {
  if (!cookieHeader || typeof cookieHeader !== 'string') return {}
  const out = {}
  for (const part of cookieHeader.split(';')) {
    const idx = part.indexOf('=')
    if (idx > 0) {
      const k = part.slice(0, idx).trim()
      const v = part.slice(idx + 1).trim()
      out[k] = v
    }
  }
  return out
}

/**
 * Strict fail-closed check for administrative/settings requests.
 * Only accepts loopback with matching origin/host, same-origin context,
 * or valid DSH auth tokens. Arbitrary headers, unverified tokens, and same-site requests are rejected.
 */
export function isTrustedSettingsRequest(request) {
  if (!request || !request.headers) return false

  // Fail-closed: unconditionally reject cross-site and non-same-origin Sec-Fetch-Site (e.g. same-site, cross-site)
  const secFetch = request.headers['sec-fetch-site']
  if (secFetch && secFetch !== 'same-origin') {
    return false
  }

  // If origin is present, ensure it matches request host
  const origin = request.headers['origin']
  const host = request.headers['host']
  if (origin && host) {
    try {
      const originHost = new URL(origin).host
      if (originHost !== host) return false
    } catch {
      return false
    }
  }

  // Verify explicit authorization token against DSH environment tokens if defined
  const expectedToken = process.env.DSH_AUTH_TOKEN || process.env.DSH_TOKEN
  const rawAuth = request.headers['authorization'] || request.headers['x-dsh-auth']
  const cookieHeader = request.headers['cookie']

  if (expectedToken) {
    if (typeof rawAuth === 'string') {
      const token = rawAuth.startsWith('Bearer ') ? rawAuth.slice(7).trim() : rawAuth.trim()
      if (token && token === expectedToken) return true
    }
    if (typeof cookieHeader === 'string') {
      const cookies = parseCookies(cookieHeader)
      const token = cookies['token'] || cookies['dsh_token']
      if (token && token === expectedToken) return true
    }
  }

  // Remote IP loopback check
  const remoteAddr = request.socket?.remoteAddress || request.connection?.remoteAddress
  if (remoteAddr) {
    return isLoopback(remoteAddr)
  }

  // Internal/mock caller without socket: only allow if sec-fetch-site is explicitly same-origin or origin matches host
  if (secFetch === 'same-origin') {
    return true
  }

  if (origin && host) {
    try {
      return new URL(origin).host === host
    } catch {
      return false
    }
  }

  return false
}
