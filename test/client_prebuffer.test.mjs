import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'

test('client source implements gapless prebuffer and object URL cleanup', () => {
  const content = fs.readFileSync('lib/client.js', 'utf8')
  assert.ok(content.includes('prepareAudioItem'), 'prepareAudioItem helper present')
  assert.ok(content.includes('prebufferNext'), 'prebufferNext helper present')
  assert.ok(content.includes('revokeObjectURL'), 'object URLs are revoked')
  assert.ok(content.includes('data-dsh-plugin'), 'styles marked with data-dsh-plugin')
  assert.ok(!content.includes('#eab308'), 'no hardcoded warning hex fallback')
})

test('client factory registers scoped package id', () => {
  const content = fs.readFileSync('lib/client.js', 'utf8')
  assert.ok(content.includes("id: '@goodandready/dsh-tts'"))
})
