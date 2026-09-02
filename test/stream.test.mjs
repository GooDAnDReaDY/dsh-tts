import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

test('lib/index.js registers /dsh-tts/stream, /dsh-tts/models/status, and /dsh-tts/models/install', () => {
  const srcPath = path.join(path.dirname(fileURLToPath(import.meta.url)), '../lib/index.js')
  const src = readFileSync(srcPath, 'utf8')

  assert.match(src, /path:\s*['"]\/dsh-tts\/stream['"]/, 'SSE stream route must be registered')
  assert.match(src, /text\/event-stream/, 'SSE stream must use text/event-stream content type')
  assert.match(src, /path:\s*['"]\/dsh-tts\/models\/status['"]/, 'models status route must be registered')
  assert.match(src, /path:\s*['"]\/dsh-tts\/models\/install['"]/, 'models install route must be registered')
  assert.match(src, /path:\s*['"]\/dsh-tts\/models\/delete['"]/, 'models delete route must be registered')
  assert.match(src, /enableLocalEngines/, 'Config must include enableLocalEngines')
  assert.match(src, /streamingEnabled/, 'Config must include streamingEnabled')
})

test('lib/client.js connects to /dsh-tts/stream and supports LocalEnginesEditor', () => {
  const srcPath = path.join(path.dirname(fileURLToPath(import.meta.url)), '../lib/client.js')
  const src = readFileSync(srcPath, 'utf8')

  assert.match(src, /EventSource\(['"]\/dsh-tts\/stream['"]\)/, 'client must connect to SSE stream')
  assert.match(src, /LocalEnginesEditor/, 'client must contain LocalEnginesEditor component')
  assert.match(src, /localEnginesTitle/, 'client must translate local engines')
})
