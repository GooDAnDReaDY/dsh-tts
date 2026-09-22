import { test } from 'node:test'
import assert from 'node:assert/strict'
import { applyNarrationFilters, applyPronunciation, assistantText, detectLang, SPEECH_PHRASES, speechPhrases, stripForSpeech, splitSentences } from '../lib/text.js'

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

// ------------------------------------------------------- nareska po frazam

test('short text stays a single chunk', () => {
  assert.deepEqual(splitSentences('Done.', 320), ['Done.'])
})

test('splits on sentence boundaries, not mid-word', () => {
  const pieces = splitSentences('First sentence of sufficient length for a separate chunk. Second sentence is also long enough. Third.', 60)
  assert.ok(pieces.length >= 2)
  for (const piece of pieces) assert.ok(piece.length <= 60, 'piece longer than max: ' + piece)
  assert.equal(pieces.join(' ').replace(/\s+/g, ' '),
    'First sentence of sufficient length for a separate chunk. Second sentence is also long enough. Third.')
})

test('fragments attach to the next piece so speech does not glitch', () => {
  const pieces = splitSentences('Yes. No. That is precisely how things stand in this case.', 320)
  assert.equal(pieces.length, 1)
})

test('long phrase without periods is still split on words', () => {
  const long = 'word '.repeat(80).trim()
  const pieces = splitSentences(long, 100)
  assert.ok(pieces.length > 1)
  for (const piece of pieces) {
    assert.ok(piece.length <= 100)
    assert.ok(!piece.startsWith(' ') && !piece.endsWith(' '))
  }
  assert.equal(pieces.join(' '), long)
})

test('empty text yields no empty chunks', () => {
  assert.deepEqual(splitSentences('   ', 320), [])
  assert.deepEqual(splitSentences('', 320), [])
})


// ------------------------------------------------------- issue #7: code in speech

test('fenced code becomes a short notice with the line count', () => {
  const out = stripForSpeech('Before\n```js\nlet a = 1\nlet b = 2\nlet c = 3\n```\nAfter', 200)
  assert.ok(out.includes('Before') && out.includes('After'), 'context preserved: ' + out)
  assert.match(out, /code block, 3 lines/)
  assert.equal(out.includes('let a'), false)
})

test('markdown table becomes a short notice without the separator row', () => {
  const md = 'Total:\n| A | B |\n|---|---|\n| 1 | 2 |\n| 3 | 4 |'
  const out = stripForSpeech(md, 200)
  assert.match(out, /table, 3 rows/)
  assert.equal(out.includes('|'), false)
  assert.ok(out.includes('Total:'))
})

test('non-built-in language falls back to English phrases', () => {
  const out = stripForSpeech('```de\neins\nzwei\n```', 200, { phrases: speechPhrases('de-DE') })
  assert.match(out, /code block, 2 lines/)
})

test('inline code still disappears silently', () => {
  const out = stripForSpeech('Run `npm i` now', 100)
  assert.equal(out, 'Run now')
})

test('skipCode false keeps code verbatim', () => {
  const out = stripForSpeech('Run `npm i` now', 100, { skipCode: false })
  assert.ok(out.includes('`npm i`'))
})


// ---------------------------------------------- issue #9: pronunciation dictionary

test('whole-word rule does not touch longer words', () => {
  const out = applyPronunciation('DSH and dshplugins', [
    { from: 'DSH', to: 'dee-ess-aitch', whole: true },
  ], 'en')
  assert.equal(out, 'dee-ess-aitch and dshplugins')
})

test('plain rules replace every occurrence, top-down', () => {
  const out = applyPronunciation('aXbXc', [
    { from: 'B', to: 'C' },
    { from: 'A', to: 'B' },
    { from: 'X', to: '-' },
  ], 'en')
  assert.equal(out, 'a-b-c')
})

test('regex form works in the left side', () => {
  const out = applyPronunciation('error at 12:30 and 99', [
    { from: '/\\d+/', to: '#' },
  ], 'en')
  assert.equal(out, 'error at #:# and #')
})

test('lang field filters the rule', () => {
  const out = applyPronunciation('DSH', [
    { from: 'DSH', to: 'dee-ess-aitch', lang: 'en' },
  ], 'fr')
  assert.equal(out, 'DSH')
})


// ------------------------------------------------ issue #10: long replies

test('maxChars 0 disables truncation', () => {
  const long = 'x'.repeat(5000)
  assert.equal(stripForSpeech(long, 0).length, 5000)
})

test('summary intro phrases exist for canonical languages', () => {
  assert.ok(SPEECH_PHRASES.en.summaryIntro)
  assert.ok(SPEECH_PHRASES.zh.summaryIntro)
})


// ------------------------------------------------------- narration & language

test('narration filters: quotes only', () => {
  const out = applyNarrationFilters('Action. "Speak this" and more.', { narrateQuotesOnly: true })
  assert.equal(out, '"Speak this"')
})

test('narration filters: quotes only returns empty when no quotes exist', () => {
  const out = applyNarrationFilters('Text without quotes.', { narrateQuotesOnly: true })
  assert.equal(out, '')
})

test('narration filters: skip asterisk actions', () => {
  const out = applyNarrationFilters('Hello * waves hand * and leaves.', { skipActions: true })
  assert.equal(out.includes('waves'), false)
  assert.ok(out.includes('Hello'))
})

test('narration filters: custom regex removal survives bad regex', () => {
  assert.equal(applyNarrationFilters('a SECRET b', { removeRegex: 'SECRET' }), 'a   b')
  assert.equal(applyNarrationFilters('ok', { removeRegex: '(' }), 'ok')
})

test('detectLang picks by letter majority', () => {
  assert.equal(detectLang('hello world'), 'en')
  assert.equal(detectLang('这是一个测试'), 'zh')
})

test('built-in IT dictionary in core is empty by default (delegated to language plugins)', () => {
  const input = 'Setup Nginx and K8s'
  const out = applyPronunciation(input, [], 'en', true)
  assert.equal(out, 'Setup Nginx and K8s')
})

test('custom user rules work in applyPronunciation', () => {
  const input = 'Check SQL'
  const out = applyPronunciation(input, [{ from: 'SQL', to: 'sequel', whole: true, lang: 'en' }], 'en', true)
  assert.equal(out, 'Check sequel')
})
