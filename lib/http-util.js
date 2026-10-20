// Shared HTTP helpers for dsh-tts host routes.

export function writeJson(res, code, body) {
  try {
    res.writeHead(code, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' })
    res.end(JSON.stringify(body))
  } catch (_err) { /* socket closed */ }
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
  const clean = address.toLowerCase().replace(/^\[|\]$/g, '')
  return (
    clean === '127.0.0.1' ||
    clean === '::1' ||
    clean === '::ffff:127.0.0.1' ||
    clean.startsWith('127.') ||
    clean === 'localhost'
  )
}

export function isLanAddress(address) {
  if (!address || typeof address !== 'string') return false
  const clean = address.toLowerCase().replace(/^\[|\]$/g, '')
  const ipv4 = clean.startsWith('::ffff:') ? clean.slice(7) : clean
  return (
    ipv4.startsWith('192.168.') ||
    ipv4.startsWith('10.') ||
    /^172\.(1[6-9]|2[0-9]|3[0-1])\./.test(ipv4)
  )
}

export function getClientIp(request) {
  if (!request) return ''
  const remote = request.socket?.remoteAddress || request.connection?.remoteAddress
  if (remote) {
    return remote.startsWith('::ffff:') ? remote.slice(7) : remote
  }
  return ''
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
 * Returns undefined if the request is permitted, or an HTTP error status code (401, 403) if rejected.
 *
 * Evaluation order:
 * 1. Base validation (fail-closed on missing headers or cross-site Sec-Fetch-Site).
 * 2. Origin vs Host verification.
 * 3. DSH connection service authentication (connection.requestRejection(request)).
 * 4. Fallback authentication when connection service is absent (env token, loopback, etc.).
 *
 * @param {object} request Node HTTP request
 * @param {object} [options]
 * @param {object} [options.connection] DSH connection service
 * @param {boolean} [options.requireAuth] require authenticated operator (fail-closed for remote)
 * @param {boolean} [options.isRemote] mark in-memory/mock request as remote
 * @returns {number|undefined} undefined if allowed, 401 or 403 if rejected
 */
export function getRejectionStatus(request, options = {}) {
  if (!request || !request.headers) return 403

  // 1. Fail-closed: unconditionally reject cross-site and non-same-origin Sec-Fetch-Site (e.g. same-site, cross-site)
  const secFetch = request.headers['sec-fetch-site']
  if (secFetch && secFetch !== 'same-origin' && secFetch !== 'none') {
    return 403
  }

  // 2. If origin is present, ensure it matches request host
  const origin = request.headers['origin']
  const host = request.headers['host']
  if (origin && host) {
    try {
      const originHost = new URL(origin).host
      if (originHost !== host) return 403
    } catch (_err) {
      return 403
    }
  }

  // 3. If DSH connection service is available, invoke requestRejection(req)
  const conn = options.connection
  if (conn && typeof conn.requestRejection === 'function') {
    const rejection = conn.requestRejection(request)
    if (rejection !== undefined && rejection !== null && rejection !== false) {
      return typeof rejection === 'number' ? rejection : 401
    }
    // Admitted by DSH connection service
    return undefined
  }

  // 4. Verify explicit authorization token against DSH environment tokens if defined
  const expectedToken = process.env.DSH_AUTH_TOKEN || process.env.DSH_TOKEN
  const rawAuth = request.headers['authorization'] || request.headers['x-dsh-auth']
  const cookieHeader = request.headers['cookie']

  if (expectedToken) {
    let token = ''
    if (typeof rawAuth === 'string') {
      token = rawAuth.startsWith('Bearer ') ? rawAuth.slice(7).trim() : rawAuth.trim()
    }
    if (!token && typeof cookieHeader === 'string') {
      const cookies = parseCookies(cookieHeader)
      token = cookies['token'] || cookies['dsh_token'] || ''
    }
    if (token && token === expectedToken) {
      return undefined
    }
    return 401
  }

  // 5. Remote IP check
  const remoteAddr = getClientIp(request)
  if (remoteAddr) {
    if (isLoopback(remoteAddr)) {
      return undefined
    }
    // Remote client (LAN or WAN) without connection auth or token:
    // Fail-closed. For write / sensitive endpoints requireAuth returns 401, otherwise 403.
    return options.requireAuth ? 401 : 403
  }

  // 6. Internal/mock caller without socket:
  if (options.requireAuth && options.isRemote) {
    return 401
  }
  if (secFetch === 'same-origin') {
    return undefined
  }
  if (origin && host) {
    try {
      if (new URL(origin).host === host) return undefined
    } catch (_err) {
      return 403
    }
  }

  return 403
}

/**
 * Strict fail-closed check for administrative/settings requests.
 * Backward-compatible boolean wrapper around getRejectionStatus.
 */
export function isTrustedSettingsRequest(request, options = {}) {
  return getRejectionStatus(request, options) === undefined
}