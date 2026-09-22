// Guard for the Plugins page row seat (#127).
//
// The old card slot `settings.plugin.item` is not rendered by the current core
// (DSH 0.1.6-alpha.2): it survives only in a doc comment in
// dsh-client-ui-settings-models/lib/types/client/slot-contract.d.ts. Settings
// therefore have to be registered into `plugins.row.config`, keyed
// '<package name>#<row id>' exactly as `rowConfigKey(bundle, rowId)` builds it,
// with the older seats kept as fallbacks.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')
const client = readFileSync(path.join(root, 'lib/client.js'), 'utf8')
const pkg = JSON.parse(readFileSync(path.join(root, 'package.json'), 'utf8'))

test('row seat key is built as <package name>#<row id> from cordis.patch.yml', () => {
  assert.match(client, /const PKG = '@goodandready\/dsh-tts'/)
  assert.match(client, /const ROW_ID = 'dsh-tts'/)
  assert.match(client, /const ROW_CONFIG_KEY = PKG \+ '#' \+ ROW_ID/)
})

test('the row id matches the id declared in cordis.patch.yml', () => {
  const patch = readFileSync(path.join(root, 'cordis.patch.yml'), 'utf8')
  const ids = [...patch.matchAll(/^\s*-\s*id:\s*(\S+)\s*$/gm)].map((m) => m[1])
  assert.deepEqual(ids, ['dsh-tts'], 'cordis.patch.yml row id changed — ROW_ID must follow it')
  assert.match(client, /const ROW_ID = 'dsh-tts'/)
})

test('the row seat is registered with the computed key, the namespace locale and a context injector', () => {
  assert.match(
    client,
    /name: 'plugins\.row\.config',\s*key: ROW_CONFIG_KEY,\s*locale: NS,\s*inject: \(\) => \(\{ ctx: ctx \}\),/,
  )
})

test('the previous seats stay as fallbacks and no settings.section comes back', () => {
  assert.match(client, /name: 'settings\.plugin\.item'/)
  assert.equal(client.includes("name: 'settings.section'"), false)
})

test('the row-seat component is view-aware: summary one-liner and a bare page form', () => {
  // summary view renders a single line, page view renders the form bare
  assert.match(client, /function TtsRowConfig\(props\)/)
  assert.match(client, /props\.view === 'summary'/)
  assert.match(client, /className: 'dts-page'/)
  // the page view must not wrap the form in our own card chrome
  const start = client.indexOf('function TtsRowConfig')
  const body = client.slice(start, client.indexOf('function registerSettings'))
  assert.equal(body.includes("'dts-card'"), false, 'row-seat page must not render the card shell')
  assert.equal(body.includes('dts-head'), false, 'row-seat page must not render the accordion head')
})

test('the settings namespace still equals the package identity', () => {
  assert.match(client, /const NS = 'dsh-tts'/)
  assert.equal(pkg.name, '@goodandready/dsh-tts')
})
