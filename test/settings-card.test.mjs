import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')
const client = readFileSync(path.join(root, 'lib/client.js'), 'utf8')
const index = readFileSync(path.join(root, 'lib/index.js'), 'utf8')

function schemaFields() {
  const m = index.match(/export const Config = z\.object\(\{([\s\S]*?)\n\}\)/)
  assert.ok(m, 'Config z.object must exist')
  return [...m[1].matchAll(/^\s{2}([A-Za-z0-9_]+):/gm)].map((x) => x[1])
}

function cardFields() {
  const used = new Set()
  for (const re of [
    /boolField\(\s*['"]([A-Za-z0-9_]+)['"]/g,
    /numberField\(\s*['"]([A-Za-z0-9_]+)['"]/g,
    /textField\(\s*['"]([A-Za-z0-9_]+)['"]/g,
    /props\.boolField\(\s*['"]([A-Za-z0-9_]+)['"]/g,
  ]) {
    let m
    while ((m = re.exec(client))) used.add(m[1])
  }
  // complex editors own these keys
  for (const k of ['chain', 'roles', 'pronunciation', 'longReply', 'speakReplies']) used.add(k)
  return used
}

test('settings.section is fallback-only when plugin.item registers', () => {
  assert.match(client, /if \(tryPluginItem\(\)\) return/, 'must return after successful plugin.item registration')
  assert.match(client, /name: 'settings\.plugin\.item'/, 'primary slot must be settings.plugin.item')
  assert.match(client, /key: NS/, 'plugin.item key must equal settings namespace')
})

test('card covers all user-facing schema fields except documented KeyEnv slots', () => {
  const schema = schemaFields()
  const card = cardFields()
  const keyEnv = schema.filter((k) => /KeyEnv$/.test(k))
  // Kokoro/F5 install UX intentionally removed: inference runtime is not bundled (#98).
  const intentionalHide = new Set(['enableLocalEngines', 'kokoroEnabled', 'f5Enabled'])
  const missing = schema.filter((k) => !card.has(k))
  const unexpected = missing.filter((k) => !/KeyEnv$/.test(k) && !intentionalHide.has(k))
  assert.deepEqual(
    unexpected,
    [],
    `schema fields missing from card (KeyEnv/intentional hide allowed): ${unexpected.join(', ')}`,
  )
  for (const k of intentionalHide) {
    assert.equal(card.has(k), false, k + ' must not be rendered while runtime is not bundled')
  }
  assert.ok(keyEnv.length >= 10, 'expected credential-name KeyEnv fields in schema')
  // Advanced block must expose the previously missing limits/endpoints
  for (const k of ['maxChars', 'sentenceChars', 'timeoutMs', 'maxQueue', 'openaiBaseUrl', 'mimoBaseUrl', 'mimoFormat', 'minimaxBin']) {
    assert.ok(card.has(k), `card must expose ${k}`)
  }
})

test('longReply summary controls are not duplicated in the general block', () => {
  const count = (client.match(/textField\('summaryModel'/g) || []).length
  assert.equal(count, 1, `summaryModel should appear once, found ${count}`)
})
