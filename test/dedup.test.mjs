import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'

test('lib/index.js contains inFlightSyntheses deduplication map', () => {
  const code = fs.readFileSync('lib/index.js', 'utf8')
  assert.ok(code.includes('inFlightSyntheses = new Map()'))
  assert.ok(code.includes('inFlightSyntheses.has(flightKey)'))
  assert.ok(code.includes('inFlightSyntheses.delete(flightKey)'))
})
