// Shared HTTP helpers for dsh-tts host routes.

import crypto from 'node:crypto'

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

export function cookieNameForAuthority(authority) {
  if (!authority || typeof authority !== 'string') return ''
  const hash = crypto.createHash('sha256').update(authority.trim()).digest('base64url')
  return 'dsh-auth-' + hash
}

export function isLoopbackCookieName(name, host = '') {
  if (!name || typeof name !== 'string' || !name.startsWith('dsh-auth-')) return false
  const authorities = [
    host,
    '127.0.0.1:3000',
    '127.0.0.1:3080',
    '127.0.0.1:3082',
    '127.0.0.1',
    'localhost:3000',
    'localhost:3080',
    'localhost:3082',
    'localhost',
    '[::1]:3000',
    '[::1]',
  ]
  for (const auth of authorities) {
    if (auth && isLoopback(auth.split(':')[0])) {
      if (cookieNameForAuthority(auth) === name) return true
    }
  }
  return false
}

export function hasClientCredentials(request) {
  if (!request || !request.headers) return false
  const cookie = request.headers['cookie']
  if (cookie && typeof cookie === 'string') {
    if (
      cookie.includes('dsh_token=') ||
      cookie.includes('dsh_lan_pin=') ||
      cookie.includes('dsh_auth_session=')
    ) {
      return true
    }
    const parts = cookie.split(';')
    for (const part of parts) {
      const trimmed = part.trim()
      const eqIdx = trimmed.indexOf('=')
      if (eqIdx === -1) continue
      const name = trimmed.slice(0, eqIdx).trim()
      if (name.startsWith('dsh-auth-')) {
        if (!isLoopbackCookieName(name, request.headers['host'])) {
          return true
        }
      }
    }
  }

  const rawAuth = request.headers['authorization'] || request.headers['x-dsh-auth']
  if (rawAuth && typeof rawAuth === 'string') {
    const token = rawAuth.startsWith('Bearer ') ? rawAuth.slice(7).trim() : rawAuth.trim()
    const expectedToken = process.env.DSH_AUTH_TOKEN || process.env.DSH_TOKEN
    if (expectedToken && token === expectedToken) return true
    if (!expectedToken && token) return true
  }

  return false
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
 * 3. Reverse-proxy & LAN inspection: if request is forwarded with non-loopback X-Forwarded-For,
 *    verify that the client itself supplied authentic credentials (not just injected loopback proxy cookie).
 * 4. Write route guard (Origin / Referer matching Host for remote/forwarded clients).
 * 5. DSH connection service authentication (connection.requestRejection(request)).
 * 6. Fallback authentication when connection service is absent (env token, loopback, etc.).
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
      if (originHost.toLowerCase() !== host.toLowerCase()) return 403
    } catch (_err) {
      return 403
    }
  }

  // 3. Reverse-proxy / forwarded client verification (#214)
  const xff = request.headers['x-forwarded-for']
  let isForwardedRemote = false
  if (xff && typeof xff === 'string') {
    const firstIp = xff.split(',')[0].trim()
    if (firstIp && !isLoopback(firstIp)) {
      isForwardedRemote = true
      if (!hasClientCredentials(request)) {
        return 401
      }
    }
  }

  const remoteAddr = getClientIp(request)
  const isRemote = isForwardedRemote || Boolean(remoteAddr && (isLanAddress(remoteAddr) || !isLoopback(remoteAddr))) || Boolean(options.isRemote)

  // 4. On write/sensitive routes, require matching Origin or Referer for remote clients (#214)
  if (options.requireAuth && isRemote) {
    const rawAuth = request.headers['authorization'] || request.headers['x-dsh-auth']
    const hasBearer = Boolean(
      (typeof rawAuth === 'string' && rawAuth.startsWith('Bearer ')) ||
      (typeof rawAuth === 'string' && rawAuth.trim().length > 0)
    )
    if (!hasBearer) {
      const referer = request.headers['referer']
      let matchHost = false
      if (origin && host) {
        try {
          matchHost = new URL(origin).host.toLowerCase() === host.toLowerCase()
        } catch (_err) {}
      } else if (referer && host) {
        try {
          matchHost = new URL(referer).host.toLowerCase() === host.toLowerCase()
        } catch (_err) {}
      }
      if (!matchHost) {
        return 403
      }
    }
  }

  // 5. Genuine loopback / in-process callers without proxy are admitted
  if (remoteAddr && isLoopback(remoteAddr) && !isForwardedRemote && !options.isRemote) {
    return undefined
  }

  // 6. If DSH connection service is available, invoke requestRejection(req)
  const conn = options.connection
  if (conn && typeof conn.requestRejection === 'function') {
    const rejection = conn.requestRejection(request)
    if (rejection !== undefined && rejection !== null && rejection !== false) {
      return typeof rejection === 'number' ? rejection : 401
    }
    return undefined
  }

  // 7. Verify explicit authorization token against DSH environment tokens if defined
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

  // 8. Remote IP check when connection service is absent
  if (remoteAddr) {
    if (isLoopback(remoteAddr) && !isForwardedRemote) {
      return undefined
    }
    // Remote client (LAN or WAN) without connection auth or token:
    // Fail-closed. For write / sensitive endpoints requireAuth returns 401, otherwise 403.
    return options.requireAuth ? 401 : 403
  }

  // 9. Internal/mock caller without socket:
  if (options.requireAuth && options.isRemote) {
    return 401
  }
  if (secFetch === 'same-origin' && !isForwardedRemote) {
    return undefined
  }
  if (origin && host && !isForwardedRemote) {
    try {
      if (new URL(origin).host.toLowerCase() === host.toLowerCase()) return undefined
    } catch (_err) {}
    return 403
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

