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
  assert.equal(isTrustedSettingsRequest({ headers: { 'sec-fetch-site': 'same-site' } }), false)
})

test('isTrustedSettingsRequest rejects arbitrary auth when DSH_AUTH_TOKEN is not matched', () => {
  delete process.env.DSH_AUTH_TOKEN
  delete process.env.DSH_TOKEN
  assert.equal(isTrustedSettingsRequest({ headers: { 'authorization': 'Bearer arbitrary-token' } }), false)
})

test('isTrustedSettingsRequest validates token against DSH_AUTH_TOKEN env', () => {
  process.env.DSH_AUTH_TOKEN = 'secret-token-123'
  try {
    assert.equal(isTrustedSettingsRequest({ headers: { 'authorization': 'Bearer secret-token-123' } }), true)
    assert.equal(isTrustedSettingsRequest({ headers: { 'x-dsh-auth': 'secret-token-123' } }), true)
    assert.equal(isTrustedSettingsRequest({ headers: { 'cookie': 'token=secret-token-123' } }), true)
    assert.equal(isTrustedSettingsRequest({ headers: { 'authorization': 'Bearer wrong-token' } }), false)
  } finally {
    delete process.env.DSH_AUTH_TOKEN
  }
})

test('isTrustedSettingsRequest validates loopback and matching origin/host', () => {
  assert.equal(isTrustedSettingsRequest({ headers: {}, socket: { remoteAddress: '127.0.0.1' } }), true)
  assert.equal(isTrustedSettingsRequest({ headers: {}, socket: { remoteAddress: '::1' } }), true)
  assert.equal(isTrustedSettingsRequest({ headers: {}, socket: { remoteAddress: '192.168.1.100' } }), false)
  assert.equal(isTrustedSettingsRequest({ headers: { origin: 'http://localhost:3000', host: 'localhost:3000' } }), true)
  assert.equal(isTrustedSettingsRequest({ headers: { origin: 'http://evil.com', host: 'localhost:3000' } }), false)
  assert.equal(isTrustedSettingsRequest({ headers: { 'sec-fetch-site': 'same-origin' } }), true)
})
