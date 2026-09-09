import test from 'node:test'
import assert from 'node:assert/strict'
import { writeJson, readBody, isTrustedSettingsRequest } from '../lib/http-util.js'

test('http-util exports writeJson, readBody, isTrustedSettingsRequest', () => {
  assert.equal(typeof writeJson, 'function')
  assert.equal(typeof readBody, 'function')
  assert.equal(typeof isTrustedSettingsRequest, 'function')
})

test('isTrustedSettingsRequest allows missing origin and rejects cross-site', () => {
  assert.equal(isTrustedSettingsRequest({ headers: {} }), true)
  assert.equal(isTrustedSettingsRequest({ headers: { 'sec-fetch-site': 'same-origin' } }), true)
  assert.equal(isTrustedSettingsRequest({ headers: { 'sec-fetch-site': 'cross-site' } }), false)
})
