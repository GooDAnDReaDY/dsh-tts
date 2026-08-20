import { test } from 'node:test'
import assert from 'node:assert/strict'
import { assistantText, stripForSpeech } from '../lib/text.js'

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
