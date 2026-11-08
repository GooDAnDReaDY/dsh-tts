import { test } from 'node:test'
import assert from 'node:assert/strict'
import { VOICE_PACKS } from '../lib/providers/constants.js'
import { wrapSsmlEmotion, detectRolePreset } from '../lib/text.js'
import { Config, plainConfig } from '../lib/index.js'

test('Issue #224: VOICE_PACKS catalog contains at least 5 rich presets', () => {
  assert.ok(Array.isArray(VOICE_PACKS), 'VOICE_PACKS must be an array')
  assert.ok(VOICE_PACKS.length >= 5, 'Should have at least 5 presets')
  const ids = VOICE_PACKS.map((p) => p.id)
  assert.ok(ids.includes('narrator'))
  assert.ok(ids.includes('buddy'))
  assert.ok(ids.includes('calm'))
  assert.ok(ids.includes('cyberpunk'))
  assert.ok(ids.includes('whisper'))
  for (const p of VOICE_PACKS) {
    assert.ok(p.name && p.provider && p.voice && p.previewText)
    assert.equal(typeof p.rate, 'number')
  }
})

test('Issue #225: Config schema includes eventChimes with default values', () => {
  const defaults = plainConfig(Config({}))
  assert.ok(defaults.eventChimes, 'defaults must include eventChimes')
  assert.equal(defaults.eventChimes.onTurnComplete, 'ding')
  assert.equal(defaults.eventChimes.onApprovalRequired, 'pop')
  assert.equal(defaults.eventChimes.onError, 'none')
  assert.equal(defaults.eventChimes.onSubagentDone, 'ding')
})

test('Issue #226: wrapSsmlEmotion wraps text in mstts express-as for valid styles', () => {
  const text = 'Great job on the release!'
  const ssml = wrapSsmlEmotion(text, 'cheerful', 'en-US-JennyNeural')
  assert.ok(ssml.includes('<mstts:express-as style="cheerful">'))
  assert.ok(ssml.includes('<voice name="en-US-JennyNeural">'))
  assert.ok(ssml.includes('Great job on the release!'))

  // Plain text fallback if no style
  assert.equal(wrapSsmlEmotion(text, '', 'en-US-JennyNeural'), text)
})

test('Issue #226: detectRolePreset resolves agent role mapping', () => {
  assert.equal(detectRolePreset({ subagent: 'code-review-agent' }), 'reviewer')
  assert.equal(detectRolePreset({ author: 'researcher-1' }), 'researcher')
  assert.equal(detectRolePreset({ name: 'brainstorming' }), 'brainstormer')
  assert.equal(detectRolePreset({}), 'reply')
})