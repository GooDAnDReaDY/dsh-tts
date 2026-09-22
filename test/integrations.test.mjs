import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')

test('lib/routes.js registers integrations; index handles subagent roles', () => {
  const routes = readFileSync(path.join(root, 'lib/routes.js'), 'utf8')
  const index = readFileSync(path.join(root, 'lib/index.js'), 'utf8')
  assert.match(routes, /path:\s*['"]\/dsh-tts\/integrations['"]/, 'integrations route must be registered')
  assert.ok(!routes.includes("path.join(process.cwd(), '..'"), 'must not probe sibling filesystem paths')
  assert.match(routes, /hasRoute\(\'\/dsh-voice\/status\'\)/, 'must detect voice via runtime routes')
  assert.match(index, /agentName/, 'must extract agentName from session or event')
  assert.match(index, /voiceDuplexEnabled/, 'Config must include voiceDuplexEnabled')
  assert.match(index, /vadBargeIn/, 'Config must include vadBargeIn')
  assert.match(index, /messengerTtsEnabled/, 'Config must include messengerTtsEnabled')
})

test('lib/client.js contains VoiceDuplexEditor with install hint when uninstalled', () => {
  const src = readFileSync(path.join(root, 'lib/client.js'), 'utf8')
  assert.match(src, /function VoiceDuplexEditor/, 'VoiceDuplexEditor must be defined')
  assert.match(src, /dsh plugin --profile web add @goodandready\/dsh-voice/, 'must show install command')
  assert.match(src, /voiceNotInstalledTitle/, 'must have warning title')
  assert.match(src, /addSubagentRole/, 'must support adding subagent personas')
})

test('lib/client.js contains MessengerIntegrationEditor with install hint when uninstalled', () => {
  const src = readFileSync(path.join(root, 'lib/client.js'), 'utf8')
  assert.match(src, /function MessengerIntegrationEditor/, 'MessengerIntegrationEditor must be defined')
  assert.match(src, /dsh plugin --profile web add @goodandready\/dsh-messenger-gateway/, 'must show messenger install command')
  assert.match(src, /messengerTtsEnabled/, 'must have messengerTtsEnabled toggle')
})
