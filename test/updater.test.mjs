import test from 'node:test'
import assert from 'node:assert/strict'
import { isNewerVersion, isTrustedUpdateRequest, registerPluginUpdater } from '../lib/updater.js'

test('updater: isNewerVersion correctly compares semver strings', () => {
  assert.equal(isNewerVersion('0.4.10', '0.4.11'), true)
  assert.equal(isNewerVersion('0.4.10', '0.5.0'), true)
  assert.equal(isNewerVersion('0.4.10', '1.0.0'), true)
  assert.equal(isNewerVersion('0.4.10', '0.4.10'), false)
  assert.equal(isNewerVersion('0.4.11', '0.4.10'), false)
  assert.equal(isNewerVersion('0.4.10', '0.4.9'), false)
  assert.equal(isNewerVersion('0.4.10', ''), false)
  assert.equal(isNewerVersion('', '0.4.11'), false)
  assert.equal(isNewerVersion('invalid', '0.4.11'), false)
})

test('updater: isTrustedUpdateRequest validates headers and remote address', () => {
  const validLoopback = {
    socket: { remoteAddress: '127.0.0.1' },
    headers: {
      'x-dsh-plugin-update': '1',
      host: '127.0.0.1:3000',
      origin: 'http://127.0.0.1:3000',
    },
  }
  assert.equal(isTrustedUpdateRequest(validLoopback), true)

  const validLan = {
    socket: { remoteAddress: '192.168.1.100' },
    headers: {
      'x-dsh-plugin-update': '1',
      host: '192.168.1.100:3000',
      origin: 'http://192.168.1.100:3000',
    },
  }
  assert.equal(isTrustedUpdateRequest(validLan), true)

  // Missing update header
  assert.equal(isTrustedUpdateRequest({
    ...validLoopback,
    headers: { host: '127.0.0.1:3000', origin: 'http://127.0.0.1:3000' },
  }), false)

  // Untrusted public IP
  assert.equal(isTrustedUpdateRequest({
    socket: { remoteAddress: '8.8.8.8' },
    headers: {
      'x-dsh-plugin-update': '1',
      host: '8.8.8.8:3000',
      origin: 'http://8.8.8.8:3000',
    },
  }), false)

  // Origin mismatch
  assert.equal(isTrustedUpdateRequest({
    ...validLoopback,
    headers: {
      'x-dsh-plugin-update': '1',
      host: '127.0.0.1:3000',
      origin: 'http://evil.com',
    },
  }), false)
})

test('updater: registerPluginUpdater binds route to ctx.webServer', async () => {
  const registered = []
  const mockCtx = {
    webServer: {
      register(spec) {
        registered.push(spec)
        return () => {}
      },
    },
  }

  const cleanup = registerPluginUpdater(mockCtx, {
    endpoint: '/dsh-tts/updater',
    packageName: '@goodandready/dsh-tts',
    manifestUrl: new URL('../package.json', import.meta.url),
  })

  assert.equal(registered.length, 1)
  assert.equal(registered[0].kind, 'exact')
  assert.equal(registered[0].path, '/dsh-tts/updater')
  assert.equal(typeof registered[0].handler, 'function')
  assert.equal(typeof cleanup, 'function')
})
