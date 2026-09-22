import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import vm from 'node:vm'

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

test('client registers surfaces behaviorally in sandboxed browser runtime', () => {
  const src = fs.readFileSync('lib/client.js', 'utf8')
  let captured
  const window = {
    __ModuleLoader__: { load(e) { captured = e } },
    AudioContext: class { resume() { return Promise.resolve() } close() {} },
    webkitAudioContext: class { resume() { return Promise.resolve() } close() {} },
    localStorage: { getItem() { return null }, setItem() {} },
    addEventListener() {},
    removeEventListener() {},
    document: {
      querySelector() { return null },
      createElement() { return { setAttribute() {}, dataset: {} } },
      head: { appendChild() {} },
    },
  }
  window.window = window
  vm.runInNewContext(src, vm.createContext({
    window,
    document: window.document,
    setTimeout() {},
    clearTimeout() {},
    setInterval() {},
    clearInterval() {},
  }))

  assert.equal(captured.id, '@goodandready/dsh-tts')
  const fakeReact = {
    createElement(type, props, ...children) { return { type, props, children } },
    useState(v) { return [typeof v === 'function' ? v() : v, () => {}] },
    useEffect() {},
    useCallback(fn) { return fn },
    useMemo(fn) { return fn() },
    useReducer(r, init) { return [init, () => {}] },
    useSyncExternalStore(sub, get) { return get() },
  }
  const plugin = captured.factory((mod) => (mod === 'react' ? fakeReact : {}))
  const registered = {}
  const mockCtx = {
    slots: {
      inject(name, fn) { fn() },
      register(desc, comp) { registered[desc.name] = { desc, comp } },
    },
    locale: {
      bind() { return (key) => key },
      define() {},
    },
    settings: {
      card(desc, comp) { registered['settings.card'] = { desc, comp } },
    },
    configForms: { get() { return { subscribe() {}, getSnapshot() { return { status: 'ready', value: {} } } } },
    },
    webServer: { hasRoute() { return true } },
    effect(fn) { return fn() },
  }

  plugin.apply(mockCtx)
  assert.ok(registered['settings.plugin.item'], 'settings plugin item registered')
  assert.ok(registered['conversation.input.dock'], 'dock speaker control registered')
})
