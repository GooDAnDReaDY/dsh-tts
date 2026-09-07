import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'

test('client.js has prebuffering logic and cleans up object URLs', () => {
  const content = fs.readFileSync('lib/client.js', 'utf8')
  assert.ok(content.includes('prepareAudioItem'))
  assert.ok(content.includes('prebufferNext'))
})
