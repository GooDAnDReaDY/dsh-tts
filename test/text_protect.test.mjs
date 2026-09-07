import test from 'node:test'
import assert from 'node:assert/strict'
import { splitSentences } from '../lib/text.js'

test('protects common Russian abbreviations from premature splitting', () => {
  const text = "Мы используем различные технологии разработки веб-приложений и микросервисов, т.е. Node.js, Docker, Nginx и т.д. Все отлично работает."
  const chunks = splitSentences(text, 120)
  assert.ok(!chunks.some(c => c.trim().endsWith('т.е.') || c.trim().endsWith('т.е')))
  assert.ok(!chunks.some(c => c.trim().endsWith('т.д.') && !c.includes('Все отлично')))
})

test('protects common English abbreviations from premature splitting', () => {
  const text = "You can choose different tools, e.g. Docker, Podman, i.e. container engines vs. bare metal etc. Everything is configured."
  const chunks = splitSentences(text, 120)
  assert.ok(!chunks.some(c => c.trim().endsWith('e.g.') || c.trim().endsWith('e.g')))
  assert.ok(!chunks.some(c => c.trim().endsWith('i.e.') || c.trim().endsWith('i.e')))
})

test('protects versions, IP addresses and decimals from premature sentence splitting', () => {
  const text = "Выпущена версия v0.3.22 для сервера 192.168.1.111 с приростом скорости в 3.14 раза. Проверьте статус службы."
  const chunks = splitSentences(text, 320)
  assert.equal(chunks.length, 2)
  assert.match(chunks[0], /v0\.3\.22/)
  assert.match(chunks[0], /192\.168\.1\.111/)
  assert.match(chunks[0], /3\.14/)
  assert.match(chunks[1], /Проверьте статус/)
})
