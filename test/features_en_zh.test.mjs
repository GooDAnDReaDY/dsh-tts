import { test } from 'node:test'
import assert from 'node:assert/strict'
import { detectLang, speechPhrases, SPEECH_PHRASES, splitSentences, protectAbbreviations } from '../lib/text.js'
import { readFileSync, readdirSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

test('detectLang detects Chinese CJK characters accurately', () => {
  assert.equal(detectLang('这是一个中文语音合成测试'), 'zh')
  assert.equal(detectLang('DSH 智能语音朗读插件：支持多引擎自动朗读。'), 'zh')
  assert.equal(detectLang('Hello world, how are you?'), 'en')
})

test('speechPhrases returns canonical EN and ZH templates and falls back for others', () => {
  assert.deepEqual(Object.keys(SPEECH_PHRASES), ['en', 'zh'])

  const zh = speechPhrases('zh-CN')
  assert.match(zh.codeBlock, /代码块/)
  assert.match(zh.table, /表格/)
  assert.match(zh.summaryIntro, /摘要/)

  const en = speechPhrases('en-US')
  assert.match(en.codeBlock, /code block/)

  const ru = speechPhrases('ru-RU')
  assert.equal(ru, SPEECH_PHRASES.en)
})

test('lib/text.js has no Russian UI strings in SPEECH_PHRASES', () => {
  assert.equal(SPEECH_PHRASES.ru, undefined, 'ru dictionary must not be in core SPEECH_PHRASES')
})

test('smart tokenizer protects file extensions and list numbering', () => {
  const text = '1. Edit package.json and index.js first. 2. Then run npm test on goodandready.app.'
  const protectedText = protectAbbreviations(text)
  assert.ok(protectedText.includes('package\u2024json'))
  assert.ok(protectedText.includes('index\u2024js'))
  assert.ok(protectedText.includes('goodandready\u2024app'))
  assert.ok(protectedText.includes('1\u2024'))

  const chunks = splitSentences(text, 300)
  assert.ok(chunks.length >= 1)
  const joined = chunks.join(' ')
  assert.ok(joined.includes('package.json'))
  assert.ok(joined.includes('index.js'))
  assert.ok(joined.includes('goodandready.app'))
})

test('splitSentences handles Chinese full-width punctuation', () => {
  const text = '第一句话。第二句话！第三句话？'
  const chunks = splitSentences(text, 50)
  assert.ok(chunks.length >= 2, 'Chinese text should split on fullwidth punctuation')
  assert.ok(chunks[0].includes('第一句话'))
})

test('client bundle exposes exportAudioClip and dual en/zh dictionaries', () => {
  const srcPath = path.join(path.dirname(fileURLToPath(import.meta.url)), '../lib/client.js')
  const src = readFileSync(srcPath, 'utf8')
  assert.ok(src.includes('exportAudioClip'), 'client.js must include exportAudioClip')
  assert.ok(src.includes('addLocale(\x27zh\x27, zh)'), 'client.js must register zh dictionary')
  assert.ok(src.includes('addLocale(\x27en\x27, en)'), 'client.js must register en dictionary')
  assert.ok(src.includes('autoDetectSubagent'), 'client.js must include autoDetectSubagent')
})

test('core lib source files contain ZERO Cyrillic literals, ZERO masked escapes, and ZERO ru dictionary rules (#121)', () => {
  const libDir = path.join(path.dirname(fileURLToPath(import.meta.url)), '../lib')
  function scanDir(dir) {
    let files = []
    for (const item of readdirSync(dir, { withFileTypes: true })) {
      const fullPath = path.join(dir, item.name)
      if (item.isDirectory()) {
        files = files.concat(scanDir(fullPath))
      } else if (item.isFile() && item.name.endsWith('.js')) {
        files.push(fullPath)
      }
    }
    return files
  }

  const jsFiles = scanDir(libDir)
  const cyrillicRegex = /[\u0400-\u04FF]/
  const maskedEscapeRegex = /\\u04[0-9a-fA-F]{2}/
  const langRuRegex = /lang:\s*'ru'/

  for (const file of jsFiles) {
    const content = readFileSync(file, 'utf8')
    assert.equal(cyrillicRegex.test(content), false, `File ${file} contains Cyrillic characters`)
    assert.equal(maskedEscapeRegex.test(content), false, `File ${file} contains masked Cyrillic escape \\u04XX`)
    assert.equal(langRuRegex.test(content), false, `File ${file} contains lang: 'ru' dictionary rule`)
  }
})
