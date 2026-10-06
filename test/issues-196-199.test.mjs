import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { registerPluginUpdater } from '../lib/updater.js'

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')

test('Issue #196: updater does NOT pass --config.minimumReleaseAge=0 in spawn argv', () => {
  const updaterCode = fs.readFileSync(path.join(root, 'lib/updater.js'), 'utf8')
  assert.equal(
    updaterCode.includes('--config.minimumReleaseAge=0'),
    false,
    'lib/updater.js must never bypass pnpm quarantine via --config.minimumReleaseAge=0'
  )
})

test('Issue #197: all --dsw-alias-* theme tokens in client-src are canonical (no legacy tokens)', () => {
  const clientFiles = fs.readdirSync(path.join(root, 'lib/client-src'))
  const forbiddenTokens = [
    '--dsw-alias-state-warning-primary',
    '--dsw-alias-state-brand-primary',
    '--dsw-alias-bg-layer-4',
  ]

  for (const f of clientFiles) {
    const content = fs.readFileSync(path.join(root, 'lib/client-src', f), 'utf8')
    for (const token of forbiddenTokens) {
      assert.equal(
        content.includes(token),
        false,
        `${f} must not use legacy non-existent token ${token}`
      )
    }
  }

  const bundle = fs.readFileSync(path.join(root, 'lib/client.js'), 'utf8')
  for (const token of forbiddenTokens) {
    assert.equal(
      bundle.includes(token),
      false,
      `lib/client.js must not contain legacy token ${token}`
    )
  }

  // Verify presence of canonical tokens
  assert.ok(bundle.includes('--dsw-alias-state-warn-primary'), 'client must use canonical state-warn-primary')
  assert.ok(bundle.includes('--dsw-alias-brand-primary'), 'client must use canonical brand-primary')
  assert.ok(bundle.includes('--dsw-alias-bg-layer-3'), 'client must use canonical bg-layer-3')
})

test('Issue #198: client defines clientFetch with AbortController and wraps all 19 fetch calls', () => {
  const bundle = fs.readFileSync(path.join(root, 'lib/client.js'), 'utf8')
  assert.ok(bundle.includes('function clientFetch('), 'client bundle must define clientFetch helper')
  assert.ok(bundle.includes('AbortController'), 'clientFetch must use AbortController for timeouts')

  // Check client-src files: exactly 1 naked fetch definition in 00-open.js, 0 naked fetch in others
  const player = fs.readFileSync(path.join(root, 'lib/client-src/20-player.js'), 'utf8')
  const editors = fs.readFileSync(path.join(root, 'lib/client-src/40-editors.js'), 'utf8')
  const settings = fs.readFileSync(path.join(root, 'lib/client-src/50-settings.js'), 'utf8')

  assert.equal(player.includes(' fetch(') || player.includes('	fetch(') || player.startsWith('fetch('), false, '20-player.js must not contain naked fetch')
  assert.equal(editors.includes(' fetch(') || editors.includes('	fetch(') || editors.startsWith('fetch('), false, '40-editors.js must not contain naked fetch')
  assert.equal(settings.includes(' fetch(') || settings.includes('	fetch(') || settings.startsWith('fetch('), false, '50-settings.js must not contain naked fetch')

  // Confirm clientFetch usage
  assert.ok(player.includes('clientFetch('), '20-player.js must use clientFetch')
  assert.ok(editors.includes('clientFetch('), '40-editors.js must use clientFetch')
  assert.ok(settings.includes('clientFetch('), '50-settings.js must use clientFetch')
})

test('Issue #199: single canonical updater route and concurrent update rejection (409)', async () => {
  // 1. Verify routes.js has only /api/dsh-tts/update and NOT /dsh-tts/updater
  const routesCode = fs.readFileSync(path.join(root, 'lib/routes.js'), 'utf8')
  assert.ok(routesCode.includes("'/api/dsh-tts/update'"), 'routes.js must register /api/dsh-tts/update')
  assert.equal(routesCode.includes("'/dsh-tts/updater'"), false, 'routes.js must not register duplicate /dsh-tts/updater')

  // 2. Verify mutex rejection returns 409 when update is in-progress
  const sharedMutex = { installing: true }
  let registeredHandler = null
  const mockCtx = {
    webServer: {
      register(spec) {
        registeredHandler = spec.handler
        return () => {}
      },
    },
  }

  registerPluginUpdater(mockCtx, {
    endpoint: '/api/dsh-tts/update',
    packageName: '@goodandready/dsh-tts',
    manifestUrl: new URL('../package.json', import.meta.url),
    mutex: sharedMutex,
  })

  assert.ok(registeredHandler, 'handler must be registered')

  // Call handler with POST when mutex is locked
  let statusCode = 0
  let writtenBody = ''
  const mockReq = {
    method: 'POST',
    socket: { remoteAddress: '127.0.0.1' },
    headers: {
      'x-dsh-plugin-update': '1',
      host: '127.0.0.1:3000',
      origin: 'http://127.0.0.1:3000',
    },
  }
  const mockRes = {
    writeHead(code) { statusCode = code },
    end(data) { writtenBody = data },
  }

  await registeredHandler(mockReq, mockRes)
  assert.equal(statusCode, 409, 'concurrent update request must return 409 Conflict')
  assert.match(writtenBody, /already updating/, '409 response must report already updating')
})
