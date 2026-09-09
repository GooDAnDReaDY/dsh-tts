// Shared HTTP helpers for dsh-tts host routes.

function writeJson(res, code, body) {
  try {
    res.writeHead(code, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' })
    res.end(JSON.stringify(body))
  } catch { /* socket closed */ }
}

function readBody(req, maxBytes) {
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

/** Reject cross-site POSTs. Do not require loopback or Origin==Host: the Web UI is used over LAN and reverse proxies. */

function isTrustedSettingsRequest(request) {
  return request.headers['sec-fetch-site'] !== 'cross-site'
}
