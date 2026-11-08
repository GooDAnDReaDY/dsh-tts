import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  stripForSpeech,
  extractTldr,
  computeAdaptiveRate,
  cleanAnsiAndLogs,
  cleanUrls
} from '../lib/text.js'

test('Issue #217: cleanAnsiAndLogs strips ANSI color escapes and terminal control chars', () => {
  const raw = '\u001b[32m✔ SUCCESS\u001b[0m \u001b[1mAll tests passing\u001b[0m\r\n'
  const cleaned = cleanAnsiAndLogs(raw)
  assert.equal(cleaned.includes('\u001b'), false)
  assert.equal(cleaned.trim(), '✔ SUCCESS All tests passing')
})

test('Issue #217: cleanAnsiAndLogs condenses git diff noise', () => {
  const diff = `Here is the diff:
diff --git a/file.js b/file.js
index 8a6246a..2d4c41f 100644
--- a/file.js
+++ b/file.js
@@ -10,3 +10,3 @@
-old line
+new line
That is all.`
  const cleaned = cleanAnsiAndLogs(diff)
  assert.equal(cleaned.includes('diff --git'), false)
  assert.equal(cleaned.includes('@@ -10,3 +10,3 @@'), false)
  assert.ok(cleaned.includes('Here is the diff:'))
  assert.ok(cleaned.includes('That is all.'))
})

test('Issue #217: cleanUrls replaces long URLs with clean domain names when cleanUrls=true', () => {
  const text = 'Check the release at https://github.com/goodandready/dsh-tts/releases/tag/v0.4.37?foo=bar and docs at http://example.org/path/index.html'
  const cleaned = cleanUrls(text)
  assert.equal(cleaned.includes('https://github.com/goodandready/dsh-tts/releases'), false)
  assert.ok(cleaned.includes('github.com'))
  assert.ok(cleaned.includes('example.org'))
})

test('Issue #217: stripForSpeech handles skipTables=true and skipTables=false', () => {
  const md = `Intro text
| Col A | Col B |
|---|---|
| Val 1 | Val 2 |
| Val 3 | Val 4 |
| Val 5 | Val 6 |
Outro text`

  const skipped = stripForSpeech(md, 0, { skipTables: true })
  assert.ok(skipped.includes('table, 3 rows') || skipped.includes('table'))
  assert.equal(skipped.includes('Col A'), false)

  const kept = stripForSpeech(md, 0, { skipTables: false })
  assert.ok(kept.includes('Col A'))
  assert.ok(kept.includes('Val 1'))
})

test('Issue #217: stripForSpeech preserves inline code when keepInlineCode=true', () => {
  const raw = 'Please run `npm install` and check `package.json` now.'
  const defaultStripped = stripForSpeech(raw, 0)
  assert.equal(defaultStripped, 'Please run and check now.')

  const kept = stripForSpeech(raw, 0, { keepInlineCode: true })
  assert.equal(kept, 'Please run npm install and check package.json now.')
})

test('Issue #218: extractTldr extracts explicit markdown summary sections', () => {
  const fullText = `# Project Update
Here are 50 paragraphs of detailed implementation steps and architecture notes.
Bla bla bla.

### Резюме
Все 11 задач успешно запланированы, архитектура согласована. Проект готов к деплою.

Additional comments.`

  const tldr = extractTldr(fullText, 'ru')
  assert.ok(tldr.includes('Все 11 задач успешно запланированы'))
  assert.equal(tldr.includes('50 paragraphs of detailed implementation'), false)
})

test('Issue #218: extractTldr extracts bold conclusion headers', () => {
  const fullText = `Some long preamble details about bug analysis.
**Conclusion:** The root cause was an unauthenticated proxy bridge cookie injection. Fix has been verified.`

  const tldr = extractTldr(fullText, 'en')
  assert.ok(tldr.includes('The root cause was an unauthenticated proxy bridge'))
  assert.equal(tldr.includes('Some long preamble'), false)
})

test('Issue #218: extractTldr falls back to lead sentence and concluding paragraph when no header is present', () => {
  const text = `The quick brown fox jumps over the lazy dog. Here is a lot of middle text that goes into many small details.

Finally, the dog woke up and ran away happily into the forest.`

  const tldr = extractTldr(text, 'en')
  assert.ok(tldr.includes('The quick brown fox jumps over the lazy dog'))
  assert.ok(tldr.includes('Finally, the dog woke up and ran away happily into the forest.'))
  assert.equal(tldr.includes('lot of middle text'), false)
})

test('Issue #218: computeAdaptiveRate scales rate according to text length', () => {
  // Short text (< 300 chars) -> unchanged
  assert.equal(computeAdaptiveRate(150, 1.0), 1.0)
  assert.equal(computeAdaptiveRate(150, 1.2), 1.2)

  // Medium text (300..1000 chars) -> 1.15x
  assert.equal(computeAdaptiveRate(500, 1.0), 1.15)
  assert.equal(computeAdaptiveRate(500, 1.2), 1.38)

  // Long text (> 1000 chars) -> 1.25x
  assert.equal(computeAdaptiveRate(1500, 1.0), 1.25)
  assert.equal(computeAdaptiveRate(1500, 1.2), 1.5)
})


test('Issue #217 & #218: Config schema defines volatile options with correct defaults', async () => {
  const { Config, plainConfig } = await import('../lib/index.js')
  const cfg = plainConfig(Config({}))
  assert.equal(cfg.skipTables, true)
  assert.equal(cfg.cleanUrls, true)
  assert.equal(cfg.keepInlineCode, false)
  assert.equal(cfg.adaptiveRate, false)
  assert.equal(cfg.tldrDefault, false)
})

test('Issue #218: prepareSpeechText applies tldrDefault and tldrOnly overrides', async () => {
  const { prepareSpeechText, Config, plainConfig } = await import('../lib/index.js')
  const doc = `# Release Plan
Here are dozens of detailed discussion lines.
Lots of background noise.

### Summary
Release v0.4.38 is ready for testing.`

  // Default tldrDefault: false -> keeps full text
  const defaultCfg = plainConfig(Config({}))
  const fullResult = await prepareSpeechText(doc, defaultCfg)
  assert.ok(fullResult.includes('dozens of detailed discussion lines'))

  // With tldrDefault: true -> extracts summary
  const tldrCfg = plainConfig(Config({ tldrDefault: true }))
  const tldrResult = await prepareSpeechText(doc, tldrCfg)
  assert.ok(tldrResult.includes('Release v0.4.38 is ready for testing'))
  assert.equal(tldrResult.includes('dozens of detailed discussion lines'), false)

  // With tldrOnly override true on defaultCfg -> extracts summary
  const overrideResult = await prepareSpeechText(doc, defaultCfg, undefined, { tldrOnly: true })
  assert.ok(overrideResult.includes('Release v0.4.38 is ready for testing'))
  assert.equal(overrideResult.includes('dozens of detailed discussion lines'), false)
})

test('Issue #217: prepareSpeechText cleans URLs and tables according to config and overrides', async () => {
  const { prepareSpeechText, Config, plainConfig } = await import('../lib/index.js')
  const raw = `Visit https://example.com/docs/api/v1/endpoints?query=123 for details.
| Key | Val |
|---|---|
| a | 1 |
| b | 2 |
Done.`

  // Default: skipTables=true, cleanUrls=true
  const cfg = plainConfig(Config({}))
  const out = await prepareSpeechText(raw, cfg)
  assert.ok(out.includes('example.com'))
  assert.equal(out.includes('https://example.com/docs/api/v1/endpoints'), false)
  assert.ok(out.includes('table, 2 rows') || out.includes('table'))
  assert.equal(out.includes('| a | 1 |'), false)

  // Override: cleanUrls=false, skipTables=false
  const rawOut = await prepareSpeechText(raw, cfg, undefined, { cleanUrls: false, skipTables: false })
  assert.ok(rawOut.includes('https://example.com/docs/api/v1/endpoints?query=123'))
  assert.ok(rawOut.includes('1') && rawOut.includes('2'))
})
