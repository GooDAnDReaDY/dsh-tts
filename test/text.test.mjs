import { test } from 'node:test'
import assert from 'node:assert/strict'
import { assistantText, speechPhrases, stripForSpeech, splitSentences } from '../lib/text.js'

test('joins text blocks and ignores others', () => {
  assert.equal(assistantText({ content: [{ type: 'text', text: 'Hi' }, { type: 'tool-call' }, { type: 'text', text: 'there' }] }), 'Hi\nthere')
})

test('strips fences and truncates', () => {
  const out = stripForSpeech('Hello `code`\n```\nsecret\n```\nworld', 20)
  assert.equal(out.includes('secret'), false)
  assert.ok(out.length <= 20)
})

test('handles string content', () => {
  assert.equal(stripForSpeech('Just text', 100), 'Just text')
})

// ------------------------------------------------------- нарезка по фразам

test('короткий текст остаётся одним куском', () => {
  assert.deepEqual(splitSentences('Готово.', 320), ['Готово.'])
})

test('режет по границам предложений, а не посреди слова', () => {
  const pieces = splitSentences('Первое предложение достаточной длины для отдельного куска. Второе предложение тоже вполне себе длинное. Третье.', 60)
  assert.ok(pieces.length >= 2)
  for (const piece of pieces) assert.ok(piece.length <= 60, 'кусок длиннее предела: ' + piece)
  assert.equal(pieces.join(' ').replace(/\s+/g, ' '),
    'Первое предложение достаточной длины для отдельного куска. Второе предложение тоже вполне себе длинное. Третье.')
})

test('огрызки прилипают к следующему, чтобы не звучать рвано', () => {
  const pieces = splitSentences('Да. Нет. Именно так и обстоит дело в данном случае.', 320)
  assert.equal(pieces.length, 1)
})

test('длинную фразу без точек всё равно режет по словам', () => {
  const long = 'слово '.repeat(80).trim()
  const pieces = splitSentences(long, 100)
  assert.ok(pieces.length > 1)
  for (const piece of pieces) {
    assert.ok(piece.length <= 100)
    assert.ok(!piece.startsWith(' ') && !piece.endsWith(' '))
  }
  assert.equal(pieces.join(' '), long)
})

test('пустой текст не даёт пустых кусков', () => {
  assert.deepEqual(splitSentences('   ', 320), [])
  assert.deepEqual(splitSentences('', 320), [])
})


// ------------------------------------------------------- issue #7: код вслух

test('fenced code becomes a short notice with the line count', () => {
  const out = stripForSpeech('Before\n```js\nlet a = 1\nlet b = 2\nlet c = 3\n```\nAfter', 200)
  assert.ok(out.includes('Before') && out.includes('After'), 'окружение сохранено: ' + out)
  assert.match(out, /code block, 3 lines/)
  assert.equal(out.includes('let a'), false)
})

test('markdown table becomes a short notice without the separator row', () => {
  const md = 'Итого:\n| A | B |\n|---|---|\n| 1 | 2 |\n| 3 | 4 |'
  const out = stripForSpeech(md, 200)
  assert.match(out, /table, 3 rows/)
  assert.equal(out.includes('|'), false)
  assert.ok(out.includes('Итого:'))
})

test('russian phrases come from the language setting', () => {
  const out = stripForSpeech('```ru\nпервая\nвторая\n```', 200, { phrases: speechPhrases('ru-RU') })
  assert.match(out, /блок кода, 2 строк/)
})

test('inline code still disappears silently', () => {
  const out = stripForSpeech('Run `npm i` now', 100)
  assert.equal(out, 'Run now')
})

test('skipCode false keeps code verbatim', () => {
  const out = stripForSpeech('Run `npm i` now', 100, { skipCode: false })
  assert.ok(out.includes('`npm i`'))
})
