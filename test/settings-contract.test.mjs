import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const read = (p) => readFileSync(join(root, p), 'utf8')
const client = read('lib/client.js')
const host = read('lib/index.js')
const { Config, plainConfig } = await import('../lib/index.js')

const ENTRY_ID = 'dsh-tts'
const PKG = '@goodandready/dsh-tts'

// Strip comments before asserting on code, so prose describing a removed call
// cannot read as the call itself.
const code = (s) => s.replace(/^\s*\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '')

// DSH builds a namespace's settings form from the volatile fields of its profile
// entry schema, and volatileForm() returns undefined when there are none.
function volatileKeys(schema = Config) {
  if (schema.meta?.volatile) return []
  if (schema.type !== 'object') return []
  return Object.entries(schema.dict ?? {}).flatMap(([key, child]) => {
    const nested = volatileKeys(child)
    return nested.length === 0 && child.meta?.volatile ? [key] : nested
  })
}

// A value the schema accepts for this field, derived from its own default. Probing
// with a guessed type fails validation before the unwrap is reached, which would
// say nothing about the unwrap.
function probeFor(key) {
  const d = plainConfig(Config({}))[key]
  if (typeof d === 'boolean') return { input: !d, expect: !d }
  if (typeof d === 'number') return { input: d + 7, expect: d + 7 }
  if (typeof d === 'string') return { input: d + '-probe', expect: d + '-probe' }
  if (Array.isArray(d)) { const v = ['probe-entry']; return { input: v, expect: v } }
  // No default to probe from: fall back to the field's own resolved value.
  return { input: undefined, expect: undefined }
}

test('schema serves a settings form, so the card can mount at all', () => {
  assert.ok(volatileKeys().length > 0, 'Config needs at least one .volatile() field')
})

test('the namespace is the profile entry id, not the package name', () => {
  const entryId = read('cordis.patch.yml').match(/^\s*- id:\s*([\w-]+)/m)[1]
  assert.equal(entryId, ENTRY_ID, 'the id in cordis.patch.yml is the namespace')
  assert.ok(code(host).includes("'" + entryId + "'"), 'host must key on the entry id')
  assert.ok(code(client).includes("'" + entryId + "'"), 'client must key on the entry id')
  assert.equal(JSON.parse(read('package.json')).name, PKG)
})

test('volatile boxes unwrap to the plain values the host reads', () => {
  const keys = volatileKeys()
  let checked = 0
  for (const key of keys) {
    const { input, expect } = probeFor(key)
    if (input === undefined) continue
    // A union or otherwise constrained field may reject the probed value outright.
    // That is a statement about the schema, not about the unwrap, so fall back to
    // asserting box-ness with the field's own default rather than a false equality.
    let raw, want
    try {
      raw = Config({ [key]: input })
      want = expect
    } catch {
      raw = Config({})
      want = plainConfig(raw)[key]
    }
    assert.equal(typeof raw[key].get, 'function', key + ' must hold a Volatile box')
    const plain = plainConfig(raw)
    // An array unwraps to an array, which is still an object, so the shape check is
    // limited to scalars where "still a box" is unambiguous.
    if (Array.isArray(want)) {
      // An unwrapped array is still an object, so compare by value, not by type.
      assert.ok(Array.isArray(plain[key]), key + ' must unwrap to an array')
      assert.deepEqual(plain[key], want, key + ' must unwrap to the array it was given')
    } else {
      if (typeof want !== 'object' || want === null) {
        assert.notEqual(typeof plain[key], 'object', key + ' must not stay a box')
      }
      assert.equal(plain[key], want, key + ' must unwrap to the value it was given')
    }
    checked++
  }
  assert.ok(checked > 0, 'at least one field must be checked end to end')
})

test('the host never calls the removed settings.register', () => {
  assert.doesNotMatch(code(host), /settings\s*\.\s*register\s*\(/,
    'settings.register exists in neither 0.1.7-rc.2 nor 0.2.0')
})

test('the card is on a live Plugins row seat', () => {
  const c = code(client)
  // Seats may be registered as `name: '...'` literals or as a [name, key] list, so look
  // for the bare name. settings.plugin.item is retired, but several plugins keep it as a
  // deliberate fallback for hosts older than the row seat and their own tests require
  // it, so its presence is not a defect; the live seat is what matters.
  assert.ok(/'plugins\.row\.config'/.test(c) || /'plugins\.bundle\.config'/.test(c),
    'the card must register on plugins.row.config or plugins.bundle.config')
})

test('the card reads the form through the contract both releases share', () => {
  const c = code(client)
  if (/configForms/.test(c)) {
    assert.ok(c.includes('getSnapshot'), 'ConfigForm read path')
    assert.doesNotMatch(c, /scope\.get\(\)/, 'ConfigForm has no get() in either release')
    assert.doesNotMatch(c, /scope\.watch\(/, 'ConfigForm has no watch() in either release')
  }
})

test('peer ranges accept the 0.1.7 and 0.2.0 DSH package lines', async () => {
  const pkg = JSON.parse(read('package.json'))
  const semver = await import('semver')
  for (const [name, range] of Object.entries(pkg.peerDependencies || {})) {
    if (name === '@deepseek-ai/cordis') {
      assert.ok(semver.satisfies('4.0.4', range), name + ' must accept the shipped cordis')
      continue
    }
    if (name === '@deepseek-ai/schemastery') {
      assert.ok(semver.satisfies('3.18.4', range), 'schemastery must accept the .volatile() line')
      assert.ok(!semver.satisfies('3.18.1', range), '3.18.1 lacks .volatile() and must be rejected')
      continue
    }
    assert.ok(semver.satisfies('0.2.0-rc.1', range), name + ' ' + range + ' must accept 0.2.0-rc.1')
    assert.ok(semver.satisfies('0.1.7-rc.2', range), name + ' ' + range + ' must accept 0.1.7-rc.2')
  }
})
