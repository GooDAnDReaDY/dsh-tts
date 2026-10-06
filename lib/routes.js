import { MODEL_SPECS } from './engines/manager.js'
import { resolve } from 'node:path'
import { registerPluginUpdater } from './updater.js'
import { writeJson, readBody, isTrustedSettingsRequest } from './http-util.js'
import { addStreamSubscriber, removeStreamSubscriber, streamSubscriberCount } from './stream-hub.js'
import { pendingKeyWrites, stripSecretsFromConfig, needsApiKey } from './keys.js'
import { PROVIDER_KEYS } from './providers.js'

/**
 * Register all /dsh-tts HTTP routes.
 * @param {object} ctx cordis context
 * @param {object} api live bindings from apply()
 */
export function registerHttpRoutes(ctx, api) {
  const {
    live,
    modelManager,
    stats,
    speechCache,
    cleanText,
    prepareSpeechText,
    synthesize,
    credentialsView,
    configResponse,
    storeProviderKey,
    clearProviderKey,
    pending,
    getSettingsApi,
    validateConfig,
    breakerSnapshot,
  } = api
  ctx.effect(() => ctx.webServer.register({
    kind: 'exact',
    path: '/dsh-tts/status',
    handler: async (req, res) => {
      if (req.method !== 'GET') { writeJson(res, 405, { ok: false, error: { code: 'method', message: 'GET only' } }); return }
      if (!isTrustedSettingsRequest(req)) {
        writeJson(res, 403, { ok: false, error: { code: 'forbidden', message: 'same-origin only' } })
        return
      }
      const cfg = live()
      writeJson(res, 200, {
        ok: true,
        speakReplies: cfg.speakReplies,
        enableLocalEngines: cfg.enableLocalEngines,
        kokoroEnabled: cfg.kokoroEnabled,
        f5Enabled: cfg.f5Enabled,
        streamingEnabled: cfg.streamingEnabled,
        rate: cfg.rate,
        chime: cfg.chime,
        bargeIn: cfg.bargeIn && cfg.vadBargeIn !== false,
        voiceDuplexEnabled: cfg.voiceDuplexEnabled !== false,
        messengerTtsEnabled: cfg.messengerTtsEnabled !== false,
        language: cfg.language,
        chain: cfg.chain,
        roles: cfg.roles,
        providers: PROVIDER_KEYS,
        sseClients: streamSubscriberCount(),
        breaker: typeof breakerSnapshot === 'function' ? breakerSnapshot() : [],
      })
    },
  }), 'dsh-tts: /status route')

  ctx.effect(() => ctx.webServer.register({
    kind: 'exact',
    path: '/dsh-tts/stream',
    handler: async (req, res) => {
      if (req.method !== 'GET') { writeJson(res, 405, { ok: false, error: { code: 'method', message: 'GET only' } }); return }
      if (!isTrustedSettingsRequest(req)) { writeJson(res, 403, { ok: false, error: { code: 'forbidden', message: 'same-origin only' } }); return }
      try {
        res.writeHead(200, {
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-cache, no-transform',
          'Connection': 'keep-alive',
        })
        res.write(': connected\n\n')
        addStreamSubscriber(res)
        req.on('close', () => removeStreamSubscriber(res))
      } catch { /* SSE connection failed */ 
        removeStreamSubscriber(res)
      }
    },
  }), 'dsh-tts: /stream route')

  ctx.effect(() => ctx.webServer.register({
    kind: 'exact',
    path: '/dsh-tts/models/status',
    handler: async (req, res) => {
      if (req.method !== 'GET') { writeJson(res, 405, { ok: false, error: { code: 'method', message: 'GET only' } }); return }
      if (!isTrustedSettingsRequest(req)) { writeJson(res, 403, { ok: false, error: { code: 'forbidden', message: 'same-origin only' } }); return }
      try {
        const list = await modelManager.listStatus()
        writeJson(res, 200, { ok: true, models: list })
      } catch (err) {
        writeJson(res, 500, { ok: false, error: String(err && err.message || err) })
      }
    },
  }), 'dsh-tts: /models/status route')

  ctx.effect(() => ctx.webServer.register({
    kind: 'exact',
    path: '/dsh-tts/models/install',
    handler: async (req, res) => {
      if (req.method !== 'POST') { writeJson(res, 405, { ok: false, error: { code: 'method', message: 'POST only' } }); return }
      if (!isTrustedSettingsRequest(req)) {
        writeJson(res, 403, { ok: false, error: { code: 'forbidden', message: 'same-origin only' } })
        return
      }
      let body = {}
      try {
        const raw = await readBody(req, 16 * 1024)
        body = JSON.parse(raw.toString('utf8') || '{}')
      } catch (e) {
        writeJson(res, 400, { ok: false, error: { code: 'body', message: e.message } })
        return
      }
      const engine = String(body.engine || '').trim()
      if (!engine) {
        writeJson(res, 400, { ok: false, error: { code: 'param', message: 'missing engine parameter' } })
        return
      }
      if (!Object.hasOwn(MODEL_SPECS, engine)) {
        writeJson(res, 400, { ok: false, error: { code: 'param', message: 'unknown engine: ' + engine } })
        return
      }
      try {
        // Fire installation in background or await initial start
        modelManager.installModel(engine).catch(() => { /* background install error tracked in manager state */ })
        const current = await modelManager.getStatus(engine)
        writeJson(res, 200, {
          ok: true,
          model: current,
          note: 'Weights only. Neural inference runtime is not bundled; speech still requires Edge, Piper, or eSpeak.',
        })
      } catch (err) {
        writeJson(res, 500, { ok: false, error: String(err && err.message || err) })
      }
    },
  }), 'dsh-tts: /models/install route')

  ctx.effect(() => ctx.webServer.register({
    kind: 'exact',
    path: '/dsh-tts/models/delete',
    handler: async (req, res) => {
      if (req.method !== 'DELETE' && req.method !== 'POST') {
        writeJson(res, 405, { ok: false, error: { code: 'method', message: 'DELETE or POST only' } })
        return
      }
      if (!isTrustedSettingsRequest(req)) {
        writeJson(res, 403, { ok: false, error: { code: 'forbidden', message: 'same-origin only' } })
        return
      }
      let body = {}
      try {
        const raw = await readBody(req, 16 * 1024)
        body = JSON.parse(raw.toString('utf8') || '{}')
      } catch { /* missing body treated as empty */ body = {} }
      const engine = String(body.engine || '').trim()
      if (!engine) {
        writeJson(res, 400, { ok: false, error: { code: 'param', message: 'missing engine parameter' } })
        return
      }
      if (!Object.hasOwn(MODEL_SPECS, engine)) {
        writeJson(res, 400, { ok: false, error: { code: 'param', message: 'unknown engine: ' + engine } })
        return
      }
      try {
        const result = await modelManager.deleteModel(engine)
        writeJson(res, 200, { ok: true, model: result })
      } catch (err) {
        writeJson(res, 500, { ok: false, error: String(err && err.message || err) })
      }
    },
  }), 'dsh-tts: /models/delete route')

  ctx.effect(() => ctx.webServer.register({
    kind: 'exact',
    path: '/dsh-tts/integrations',
    handler: async (req, res) => {
      if (req.method !== 'GET') { writeJson(res, 405, { ok: false, error: { code: 'method', message: 'GET only' } }); return }
      if (!isTrustedSettingsRequest(req)) {
        writeJson(res, 403, { ok: false, error: { code: 'forbidden', message: 'same-origin only' } })
        return
      }
      function isPluginOrServicePresent(id) {
        if (!ctx) return false
        try {
          if (typeof ctx.get === 'function' && ctx.get(id)) return true
          if (ctx[id]) return true
        } catch (_err) { /* service check fallback */ }
        try {
          const reg = ctx.registry || ctx.root?.registry
          if (reg && typeof reg.entries === 'function') {
            for (const [k, v] of reg.entries()) {
              const name = String(v?.name || k?.name || '')
              if (name === id || name === `dsh-${id}` || name === `@goodandready/dsh-${id}`) return true
              if (id === 'messenger' && (name.includes('messenger') || name.includes('dsh-im'))) return true
            }
          }
        } catch (_err) { /* registry check fallback */ }
        try {
          if (ctx.webServer) {
            if (typeof ctx.webServer.hasRoute === 'function') {
              if (ctx.webServer.hasRoute(`/dsh-${id}/status`)) return true
            }
            if (Array.isArray(ctx.webServer.routes)) {
              if (ctx.webServer.routes.some((r) => r && r.path && r.path.includes(id))) return true
            }
          }
        } catch (_err) { /* webServer route check fallback */ }
        return false
      }

      const voiceInstalled = isPluginOrServicePresent('voice')
      const messengerInstalled = isPluginOrServicePresent('messenger')

      // Runtime routes are the only reliable signal. Do not probe ../ siblings
      // or node_modules layouts — they lie outside a normal npm install.
      writeJson(res, 200, {
        ok: true,
        voiceInstalled,
        messengerInstalled,
        note: 'State reflects active routes in the running harness.',
        integrations: {
          voice: {
            installed: voiceInstalled,
            package: '@goodandready/dsh-voice',
            hint: 'dsh plugin --profile web add @goodandready/dsh-voice',
          },
          messenger: {
            installed: messengerInstalled,
            package: '@goodandready/dsh-messenger-gateway',
            hint: 'dsh plugin --profile web add @goodandready/dsh-messenger-gateway',
          },
        },
      })
    },
  }), 'dsh-tts: /integrations route')

  ctx.effect(() => ctx.webServer.register({
    kind: 'exact',
    path: '/dsh-tts/cache',
    handler: async (req, res) => {
      if (req.method !== 'DELETE' && req.method !== 'POST') {
        writeJson(res, 405, { ok: false, error: { code: 'method', message: 'DELETE only' } })
        return
      }
      if (!isTrustedSettingsRequest(req)) {
        writeJson(res, 403, { ok: false, error: { code: 'forbidden', message: 'same-origin only' } })
        return
      }
      const removed = await speechCache.clear()
      writeJson(res, 200, { ok: true, removed, cleared: removed })
    },
  }), 'dsh-tts: /cache route')

  ctx.effect(() => ctx.webServer.register({
    kind: 'exact',
    path: '/dsh-tts/cache/clear',
    handler: async (req, res) => {
      if (req.method !== 'POST' && req.method !== 'DELETE') {
        writeJson(res, 405, { ok: false, error: { code: 'method', message: 'POST only' } })
        return
      }
      if (!isTrustedSettingsRequest(req)) {
        writeJson(res, 403, { ok: false, error: { code: 'forbidden', message: 'same-origin only' } })
        return
      }
      const removed = await speechCache.clear()
      writeJson(res, 200, { ok: true, removed, cleared: removed })
    },
  }), 'dsh-tts: /cache/clear route')

  ctx.effect(() => ctx.webServer.register({
    kind: 'exact',
    path: '/dsh-tts/preview',
    handler: async (req, res) => {
      if (req.method !== 'POST') {
        writeJson(res, 405, { ok: false, error: { code: 'method', message: 'POST only' } })
        return
      }
      if (!isTrustedSettingsRequest(req)) {
        writeJson(res, 403, { ok: false, error: { code: 'forbidden', message: 'same-origin only' } })
        return
      }
      let body = {}
      try {
        const raw = await readBody(req, 64 * 1024)
        body = JSON.parse(raw.toString('utf8') || '{}')
      } catch (e) {
        writeJson(res, 400, { ok: false, error: { code: 'body', message: e.message } })
        return
      }
      const cfg = live()
      const lang = String(cfg.language || '').toLowerCase()
      let phrase = 'Voice check.'
      if (lang.startsWith('zh')) phrase = '语音合成测试。'
      try {
        const probe = Object.assign({}, cfg, {
          chain: [{ provider: body.provider || '', model: body.model || '', voice: body.voice || '' }],
        })
        const out = await synthesize(String(body.text || phrase), probe, null, 'reply')
        writeJson(res, 200, { ok: true, mime: out.mime, audioBase64: Buffer.from(out.audio).toString('base64') })
      } catch (e) {
        writeJson(res, 502, { ok: false, error: { code: 'tts', message: String(e && e.message || e) } })
      }
    },
  }), 'dsh-tts: /preview route')

  ctx.effect(() => ctx.webServer.register({
    kind: 'exact',
    path: '/dsh-tts/stats',
    handler: async (req, res) => {
      if (req.method === 'GET') {
        if (!isTrustedSettingsRequest(req)) {
          writeJson(res, 403, { ok: false, error: { code: 'forbidden', message: 'same-origin only' } })
          return
        }
        writeJson(res, 200, { ok: true, total: stats.total, cacheHits: stats.cacheHits, errors: stats.errors, providers: stats.providers, breaker: typeof breakerSnapshot === 'function' ? breakerSnapshot() : [] })
        return
      }
      if (req.method !== 'DELETE') {
        writeJson(res, 405, { ok: false, error: { code: 'method', message: 'GET or DELETE' } })
        return
      }
      if (!isTrustedSettingsRequest(req)) {
        writeJson(res, 403, { ok: false, error: { code: 'forbidden', message: 'same-origin only' } })
        return
      }
      stats.total = 0
      stats.cacheHits = 0
      stats.errors = 0
      stats.providers = {}
      writeJson(res, 200, { ok: true })
    },
  }), 'dsh-tts: /stats route')

  ctx.effect(() => ctx.webServer.register({
    kind: 'exact',
    path: '/dsh-tts/config',
    handler: async (req, res) => {
      if (!isTrustedSettingsRequest(req)) {
        writeJson(res, 403, { ok: false, error: { code: 'forbidden', message: 'dsh-tts: settings writes are same-origin only' } })
        return
      }
      if (req.method === 'GET') {
        writeJson(res, 200, await configResponse())
        return
      }
      if (req.method !== 'PUT' && req.method !== 'POST') {
        writeJson(res, 405, { ok: false, error: { code: 'method', message: 'GET or PUT' } })
        return
      }
      const settingsApi = typeof getSettingsApi === 'function' ? getSettingsApi() : null
      if (!settingsApi) {
        writeJson(res, 503, { ok: false, error: { code: 'settings', message: 'settings not ready' } })
        return
      }
      let raw
      try { raw = await readBody(req, 256 * 1024) } catch (e) {
        writeJson(res, 400, { ok: false, error: { code: 'body', message: e.message } })
        return
      }
      let payload
      try { payload = JSON.parse(raw.toString('utf8') || '{}') } catch { /* invalid JSON treated as empty */
        writeJson(res, 400, { ok: false, error: { code: 'json', message: 'invalid json' } })
        return
      }
      const revision = payload?.revision ?? (typeof payload?.config === 'object' ? payload.config?.revision : undefined)
      if (payload && typeof payload.config === 'object') {
        payload = { ...payload.config, keys: payload.keys, revision: payload.revision ?? payload.config.revision }
      }
      const keys = pendingKeyWrites(payload && payload.keys)
      const stripped = stripSecretsFromConfig(payload)
      let parsed
      try { parsed = validateConfig(stripped) } catch (e) {
        writeJson(res, 400, { ok: false, error: { code: 'schema', message: String(e && e.message || e) } })
        return
      }
      try {
        for (const item of keys) {
          await storeProviderKey(item.provider, item.value)
        }
        await settingsApi.replace(parsed, revision)
        writeJson(res, 200, await configResponse())
      } catch (e) {
        const isConflict = e?.code === 'conflict' || e?.name === 'SettingsConflictError' || /conflict|revision/i.test(e?.message || '')
        const statusCode = isConflict ? 409 : 500
        const code = isConflict ? 'conflict' : 'save'
        writeJson(res, statusCode, { ok: false, error: { code, message: String(e && e.message || e) } })
      }
    },
  }), 'dsh-tts: /config route')

  ctx.effect(() => ctx.webServer.register({
    kind: 'exact',
    path: '/dsh-tts/credential',
    handler: async (req, res) => {
      if (req.method !== 'PUT' && req.method !== 'DELETE') {
        writeJson(res, 405, { ok: false, error: { code: 'method', message: 'PUT or DELETE only' } })
        return
      }
      if (!isTrustedSettingsRequest(req)) {
        writeJson(res, 403, { ok: false, error: { code: 'forbidden', message: 'dsh-tts: keys are same-origin only' } })
        return
      }
      let payload = {}
      if (req.method === 'PUT' || (req.headers['content-length'] && Number(req.headers['content-length']) > 0)) {
        let raw
        try { raw = await readBody(req, 16 * 1024) } catch (e) {
          writeJson(res, 400, { ok: false, error: { code: 'body', message: e.message } })
          return
        }
        try { payload = JSON.parse(raw.toString('utf8') || '{}') } catch { /* invalid JSON treated as empty */
          writeJson(res, 400, { ok: false, error: { code: 'json', message: 'invalid json' } })
          return
        }
      }
      const provider = typeof payload.provider === 'string' ? payload.provider.trim() : ''
      if (!needsApiKey(provider)) {
        writeJson(res, 400, { ok: false, error: { code: 'provider', message: 'unknown cloud provider' } })
        return
      }
      try {
        if (req.method === 'DELETE') {
          const ref = await clearProviderKey(provider)
          writeJson(res, 200, { ok: true, ref, credentials: await credentialsView() })
          return
        }
        const ref = await storeProviderKey(provider, payload.value)
        writeJson(res, 200, { ok: true, ref, credentials: await credentialsView() })
      } catch (e) {
        writeJson(res, 400, { ok: false, error: { code: 'credential', message: String(e && e.message || e) } })
      }
    },
  }), 'dsh-tts: /credential route')

  ctx.effect(() => ctx.webServer.register({
    kind: 'exact',
    path: '/dsh-tts/pending',
    handler: async (req, res) => {
      if (req.method !== 'GET') { writeJson(res, 405, { ok: false, error: { code: 'method', message: 'GET only' } }); return }
      if (!isTrustedSettingsRequest(req)) { writeJson(res, 403, { ok: false, error: { code: 'forbidden', message: 'same-origin only' } }); return }
      const url = new URL(req.url || '/', 'http://127.0.0.1')
      const after = url.searchParams.get('after') || ''
      let items = pending.slice()
      if (after) {
        const idx = items.findIndex((x) => x.id === after)
        items = idx >= 0 ? items.slice(idx + 1) : items
      }
      writeJson(res, 200, { ok: true, items })
    },
  }), 'dsh-tts: /pending route')

  ctx.effect(() => ctx.webServer.register({
    kind: 'exact',
    path: '/dsh-tts/speak',
    handler: async (req, res) => {
      if (req.method !== 'POST') { writeJson(res, 405, { ok: false, error: { code: 'method', message: 'POST only' } }); return }
      if (!isTrustedSettingsRequest(req)) { writeJson(res, 403, { ok: false, error: { code: 'forbidden', message: 'same-origin only' } }); return }
      let raw
      try { raw = await readBody(req, 256 * 1024) } catch (e) {
        writeJson(res, 400, { ok: false, error: { code: 'body', message: e.message } }); return
      }
      let payload
      try { payload = JSON.parse(raw.toString('utf8') || '{}') } catch { /* invalid JSON treated as empty */ /* invalid JSON treated as empty */ payload = {} }
      const rawText = String(payload.text || '')
      if (!rawText.trim()) { writeJson(res, 400, { ok: false, error: { code: 'no-text', message: 'no text' } }); return }
      const cfg = live()
      const isMessenger = payload.channel === 'messenger' || payload.source === 'messenger' || req.headers['x-dsh-channel'] === 'messenger'
      if (isMessenger && !cfg.messengerTtsEnabled) {
        writeJson(res, 403, { ok: false, error: { code: 'disabled', message: 'messenger tts is disabled' } })
        return
      }
      const controller = new AbortController()
      const timer = setTimeout(() => controller.abort(), cfg.timeoutMs)
      try {
        const text = typeof prepareSpeechText === 'function'
          ? await prepareSpeechText(rawText, cfg, controller.signal)
          : cleanText(rawText, cfg, 0)
        if (!text) { writeJson(res, 400, { ok: false, error: { code: 'no-text', message: 'no text' } }); return }
        const out = await synthesize(text, cfg, controller.signal, 'reply', { skipClean: true })
        writeJson(res, 200, {
          ok: true,
          provider: out.provider,
          mime: out.mime,
          audioBase64: Buffer.from(out.audio).toString('base64'),
          tookMs: out.tookMs,
        })
      } catch (e) {
        writeJson(res, 502, { ok: false, error: { code: 'chain', message: String(e && e.message || e) } })
      } finally {
        clearTimeout(timer)
      }
    },
  }), 'dsh-tts: /speak route')

  const updaterMutex = { installing: false }
  ctx.effect(() => registerPluginUpdater(ctx, {
    endpoint: '/api/dsh-tts/update',
    packageName: '@goodandready/dsh-tts',
    manifestUrl: new URL('../package.json', import.meta.url),
    mutex: updaterMutex,
  }), 'dsh-tts: updater route /api/dsh-tts/update')
}
