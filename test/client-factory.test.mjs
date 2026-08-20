import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createContext, runInNewContext } from 'node:vm'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

test('client factory returns apply after CommonJS shim', () => {
  const srcPath = path.join(path.dirname(fileURLToPath(import.meta.url)), '../lib/client.js')
  const src = readFileSync(srcPath, 'utf8')
  assert.match(src, /var exports = module\.exports/)
  assert.match(src, /type: 'password'/)
  assert.match(src, /dsh-tts\/credential/)
  assert.match(src, /leave blank to keep/)
  let captured
  const window = {
    __ModuleLoader__: {
      load(entry) { captured = entry },
    },
  }
  runInNewContext(src, createContext({ window, document: { querySelector() { return null }, createElement() { return { setAttribute() {}, dataset: {} } }, head: { appendChild() {} } } }))
  assert.equal(captured.id, '@goodandready/dsh-tts')
  const fakeReact = {
    createElement() { return null },
    useState(v) { return [v, () => {}] },
    useEffect() {},
  }
  const exported = captured.factory((name) => {
    if (name === 'react') return fakeReact
    throw new Error('unexpected require ' + name)
  })
  assert.equal(typeof exported.apply, 'function')
  assert.ok(Array.isArray(exported.inject))
})
