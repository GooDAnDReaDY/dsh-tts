import test from 'node:test'
import assert from 'node:assert/strict'
import {
  writeJson,
  readBody,
  isTrustedSettingsRequest
} from '../lib/http-util.js'

test('http-util exports writeJson, readBody, isTrustedSettingsRequest', () => {
  assert.equal(typeof writeJson, 'function')
  assert.equal(typeof readBody, 'function')
  assert.equal(typeof isTrustedSettingsRequest, 'function')
})

test('isTrustedSettingsRequest rejects requests without headers or origin context', () => {
  assert.equal(isTrustedSettingsRequest(null), false)
  assert.equal(isTrustedSettingsRequest({ headers: {} }), false)
  assert.equal(isTrustedSettingsRequest({ headers: { 'sec-fetch-site': 'cross-site' } }), false)
})

test('isTrustedSettingsRequest accepts same-origin, loopback, matching origin/host, and auth', () => {
  assert.equal(isTrustedSettingsRequest({ headers: { 'sec-fetch-site': 'same-origin' } }), true)
  assert.equal(isTrustedSettingsRequest({ headers: { 'sec-fetch-site': 'same-site' } }), true)
  assert.equal(isTrustedSettingsRequest({ headers: { 'authorization': 'Bearer secret-token' } }), true)
  assert.equal(isTrustedSettingsRequest({ headers: {}, socket: { remoteAddress: '127.0.0.1' } }), true)
  assert.equal(isTrustedSettingsRequest({ headers: {}, socket: { remoteAddress: '::1' } }), true)
  assert.equal(isTrustedSettingsRequest({ headers: { origin: 'http://localhost:3000', host: 'localhost:3000' } }), true)
})
