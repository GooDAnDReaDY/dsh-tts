import { test } from 'node:test'
import assert from 'node:assert/strict'
import { assistantText, stripForSpeech, splitSentences } from '../lib/text.js'

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
