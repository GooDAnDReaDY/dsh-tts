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


// Issue #12: настройки живут карточкой во вкладке «Настройки плагинов».
// Расхождение ключа с пространством настроек молчит в рантайме, поэтому
// проверяем точные значения регистрации, а не «что-то зарегистрировалось».
async function loadCardRegistration() {
  const captured = {}
  globalThis.window = { __ModuleLoader__: { load: (r) => { captured.r = r } } }
  await import('../lib/client.js?card-' + Math.random())
  delete globalThis.window
  return captured.r
}

const cardReact = {
  createElement: () => null,
  useState: (v) => [v, () => {}],
  useReducer: (_f, i) => [i, () => {}],
  useEffect: () => {},
}

function recordingCtx(declared) {
  const state = { registered: [], injected: [], effectLabels: [], cleanups: [] }
  state.ctx = {
    slots: {
      inject(name, run) {
        state.injected.push(name)
        if (!declared.includes(name)) return false
        run()
        return true
      },
      register(options, component) {
        state.registered.push({ name: options.name, key: options.key, locale: options.locale, id: options.id, component })
      },
    },
    effect(run, label) {
      state.effectLabels.push(label)
      const off = run()
      state.cleanups.push(off)
      return () => { if (typeof off === 'function') off() }
    },
    locale: { register: () => {}, bind: () => (key) => key },
  }
  return state
}

function applyWithIntervalStub(exported, ctx) {
  const realInterval = globalThis.setInterval
  globalThis.setInterval = () => 42
  try {
    exported.apply(ctx)
  } finally {
    globalThis.setInterval = realInterval
  }
}

test('settings register as a Plugins-tab card keyed by the namespace', async () => {
  const exported = (await loadCardRegistration()).factory(() => cardReact)
  const s = recordingCtx(['settings.plugin.item', 'conversation.input.dock'])
  applyWithIntervalStub(exported, s.ctx)
  const card = s.registered.find((r) => r.name === 'settings.plugin.item')
  assert.ok(card, 'карточка должна регистрироваться в settings.plugin.item')
  assert.equal(card.key, 'dsh-tts')
  assert.equal(card.locale, 'dsh-tts')
  assert.equal(typeof card.component, 'function')
  assert.equal(s.registered.some((r) => r.name === 'settings.section'), false,
    'строки в боковом списке быть не должно')
})

test('without settings.plugin.item the plugin falls back to the sidebar section', async () => {
  const exported = (await loadCardRegistration()).factory(() => cardReact)
  const s = recordingCtx(['settings.section', 'conversation.input.dock'])
  applyWithIntervalStub(exported, s.ctx)
  assert.equal(s.registered.some((r) => r.name === 'settings.plugin.item'), false)
  const section = s.registered.find((r) => r.name === 'settings.section')
  assert.ok(section, 'запасной путь: боковой раздел сохранён')
  assert.equal(section.id, '@goodandready/dsh-tts')
})

test('polling runs under an effect scope and owns its cleaner', async () => {
  const exported = (await loadCardRegistration()).factory(() => cardReact)
  const s = recordingCtx(['settings.plugin.item', 'conversation.input.dock'])
  applyWithIntervalStub(exported, s.ctx)
  const labels = s.effectLabels.map(String)
  assert.ok(labels.some((l) => l.indexOf('опрос готовых озвучек') !== -1),
    'опрос должен жить под ctx.effect')
})

// Задача #13: док чтения берёт подписи из словарей, а не из кода.
// Проверяем по исходнику: подпись слота рисует ядро, тултипы — компонент,
// и оба пути молчат при поломке — русская строка просто остаётся русской
// для англоязычного читателя, и никто об этом не узнает.
test('док чтения не держит подписи в коде', () => {
  const srcPath = path.join(path.dirname(fileURLToPath(import.meta.url)), '../lib/client.js')
  const src = readFileSync(srcPath, 'utf8')

  const dock = src.slice(src.indexOf('function SpeakerControl'), src.indexOf('function registerSettings'))
  for (const hardcoded of ['Чтение', 'Пауза', 'Продолжить чтение', 'Прекратить чтение']) {
    assert.equal(dock.includes(hardcoded), false, 'подпись осталась в коде: ' + hardcoded)
  }

  for (const key of ['dockLabel', 'dockPause', 'dockResume', 'dockStop']) {
    const inDictionaries = src.split(String.fromCharCode(39) + key + String.fromCharCode(39) + ':').length - 1
    assert.equal(inDictionaries, 2, 'ключ ' + key + ' должен быть в обоих словарях')
  }

  assert.match(src, /locale: NS,/, 'без locale в слоте перевод не дойдёт до компонента')
  assert.match(src, /label: \(\) => fallbackDockText\('dockLabel'\)/, 'подпись слота — через привязку')
})
