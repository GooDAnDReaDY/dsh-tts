import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { splitSentences, splitSentencesWithOffsets } from '../lib/text.js'
import { Config, plainConfig } from '../lib/index.js'

const root = join(fileURLToPath(import.meta.url), '../..')
const client = readFileSync(join(root, 'lib/client.js'), 'utf8')

test('Issue #219: splitSentencesWithOffsets computes accurate sentence boundaries and indices', () => {
  const text = 'First sentence of sufficient length for a separate chunk. Second sentence is also quite long enough! Third sentence finishes the turn nicely.'
  const pieces = splitSentencesWithOffsets(text, 60)

  assert.ok(Array.isArray(pieces))
  assert.equal(pieces.length, 3)

  // Verify first sentence
  assert.equal(pieces[0].text, 'First sentence of sufficient length for a separate chunk.')
  assert.equal(pieces[0].sentenceIndex, 0)
  assert.equal(pieces[0].totalSentences, 3)
  assert.equal(pieces[0].charStart, 0)
  assert.equal(pieces[0].charEnd, 57)
  assert.equal(text.slice(pieces[0].charStart, pieces[0].charEnd), pieces[0].text)

  // Verify second sentence
  assert.equal(pieces[1].text, 'Second sentence is also quite long enough!')
  assert.equal(pieces[1].sentenceIndex, 1)
  assert.equal(pieces[1].totalSentences, 3)
  assert.ok(pieces[1].charStart >= pieces[0].charEnd)
  assert.equal(text.slice(pieces[1].charStart, pieces[1].charEnd), pieces[1].text)

  // Verify third sentence
  assert.equal(pieces[2].text, 'Third sentence finishes the turn nicely.')
  assert.equal(pieces[2].sentenceIndex, 2)
  assert.equal(pieces[2].totalSentences, 3)
  assert.equal(text.slice(pieces[2].charStart, pieces[2].charEnd), pieces[2].text)

  // Verify backward compatibility with splitSentences
  const legacyPieces = splitSentences(text, 60)
  assert.deepEqual(legacyPieces, pieces.map((p) => p.text))
})

test('Issue #219: splitSentencesWithOffsets handles Chinese full-width punctuation', () => {
  const zh = '这是非常详细的第一句话。这是非常详细的第二句话！这是非常详细的最后一句话？'
  const pieces = splitSentencesWithOffsets(zh, 50)

  assert.equal(pieces.length, 3)
  assert.equal(pieces[0].sentenceIndex, 0)
  assert.equal(pieces[0].totalSentences, 3)
  assert.equal(pieces[0].text, '这是非常详细的第一句话。')
  assert.equal(zh.slice(pieces[0].charStart, pieces[0].charEnd), '这是非常详细的第一句话。')

  assert.equal(pieces[1].sentenceIndex, 1)
  assert.equal(pieces[1].text, '这是非常详细的第二句话！')
  assert.equal(zh.slice(pieces[1].charStart, pieces[1].charEnd), '这是非常详细的第二句话！')

  assert.equal(pieces[2].sentenceIndex, 2)
  assert.equal(pieces[2].text, '这是非常详细的最后一句话？')
  assert.equal(zh.slice(pieces[2].charStart, pieces[2].charEnd), '这是非常详细的最后一句话？')
})

test('Issue #220: Config schema includes duckOnTyping with default "duck"', () => {
  const cfg = plainConfig(Config({}))
  assert.equal(cfg.duckOnTyping, 'duck')

  const custom = plainConfig(Config({ duckOnTyping: 'pause' }))
  assert.equal(custom.duckOnTyping, 'pause')
})

test('Issue #219 & #220: Client bundle includes Wake-Lock, ducking and karaoke markup', () => {
  // Mobile Wake-Lock
  assert.ok(client.includes('wakeLock'), 'lib/client.js must include navigator.wakeLock handling')

  // Duck on typing
  assert.ok(client.includes('duckOnTyping'), 'lib/client.js must include duckOnTyping setting and handling')

  // Live sentence highlight / karaoke
  assert.ok(client.includes('dts-karaoke-active') || client.includes('karaoke'),
    'lib/client.js must define karaoke or sentence highlight styling')
})

