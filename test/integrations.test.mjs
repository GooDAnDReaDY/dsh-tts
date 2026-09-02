import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

test('lib/index.js registers /dsh-tts/integrations and handles subagent roles', () => {
  const srcPath = path.join(path.dirname(fileURLToPath(import.meta.url)), '../lib/index.js')
  const src = readFileSync(srcPath, 'utf8')

  assert.match(src, /path:\s*['"]\/dsh-tts\/integrations['"]/, 'integrations route must be registered')
  assert.match(src, /@goodandready\/dsh-voice/, 'must mention dsh-voice package')
  assert.match(src, /agentName/, 'must extract agentName from session or event')
  assert.match(src, /voiceDuplexEnabled/, 'Config must include voiceDuplexEnabled')
  assert.match(src, /vadBargeIn/, 'Config must include vadBargeIn')
})

test('lib/client.js contains VoiceDuplexEditor with disabled toggle and warning hint when uninstalled', () => {
  const srcPath = path.join(path.dirname(fileURLToPath(import.meta.url)), '../lib/client.js')
  const src = readFileSync(srcPath, 'utf8')

  assert.match(src, /function VoiceDuplexEditor/, 'VoiceDuplexEditor must be defined')
  assert.match(src, /dsh plugin --profile web add @goodandready\/dsh-voice/, 'must show install command')
  assert.match(src, /voiceNotInstalledTitle/, 'must have warning title')
  assert.match(src, /voiceDuplexTitle/, 'must have voiceDuplex title')
  assert.match(src, /addSubagentRole/, 'must support adding subagent personas')
  assert.match(src, /newSubagentRole/, 'must support typing subagent name')
})
