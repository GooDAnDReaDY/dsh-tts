import { test } from 'node:test'
import assert from 'node:assert/strict'
import { AdaptiveRouter } from '../lib/router.js'
test('router picks local when installed', () => {
  const r = new AdaptiveRouter({registry:{list:()=>[ {id:'kokoro'} ]}, role:'reply', lang:'en'})
  assert.equal(r.pick(), 'kokoro')
})
