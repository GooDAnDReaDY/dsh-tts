// Turn assistant message content into speakable plain text.

export function blocksToText(content) {
  if (typeof content === 'string') return content
  if (!Array.isArray(content)) return ''
  const parts = []
  for (const block of content) {
    if (!block || typeof block !== 'object') continue
    if (block.type === 'text' && typeof block.text === 'string') parts.push(block.text)
  }
  return parts.join('\n')
}

// Short spoken notices replace dropped markup. Wording follows
// the configured speech language; {n} is filled with a line/row count.
export const SPEECH_PHRASES = {
  en: { codeBlock: 'code block, {n} lines', table: 'table, {n} rows', summaryIntro: 'Summary of the reply.' },
  zh: { codeBlock: '代码块，共 {n} 行', table: '表格，共 {n} 行', summaryIntro: '回复摘要。' },
}

export function speechPhrases(language) {
  const lang = String(language || '').toLowerCase()
  if (lang.startsWith('zh')) return SPEECH_PHRASES.zh
  return SPEECH_PHRASES.en
}

// Narration filters run on top of general scrubbing, before pronunciation.
// Order: custom regex -> *action* blocks -> quotes-only mode.
export function applyNarrationFilters(text, cfg) {
  let out = String(text || '')
  if (cfg && cfg.removeRegex) {
    try {
      out = out.replace(new RegExp(cfg.removeRegex, 'g'), ' ')
    } catch (badUserRegex) { /* bad user regex must not break speech */ }
  }
  if (cfg && cfg.skipActions) out = out.replace(/(^|\s)\*[^*\n]+\*/g, '$1')
  if (cfg && cfg.narrateQuotesOnly) {
    const quotes = [...out.matchAll(/«[^»]*»|"[^"]*"/g)].map((m) => m[0]).join(' ')
    out = quotes
  }
  return out
}

// Rough language heuristic using Unicode Script properties.
export function detectLang(text) {
  const s = String(text || '')
  const cjk = (s.match(/\p{Script=Han}/gu) || []).length
  const cyr = (s.match(/\p{Script=Cyrillic}/gu) || []).length
  const lat = (s.match(/\p{Script=Latin}/gu) || []).length
  if (cjk >= cyr && cjk >= lat && cjk > 0) return 'zh'
  return cyr > lat ? 'ru' : 'en'
}

// Pronunciation rules apply top-down, once each over the whole text.
// Left side is plain text; /…/flags form is treated as a regular expression.
// whole=true requires a full word match (Unicode letter/digit boundaries).

function escapeRe(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

export const BUILTIN_IT_DICTIONARY = [
  { from: 'API', to: 'A P I', whole: true, lang: '' },
  { from: 'CLI', to: 'C L I', whole: true, lang: '' },
  { from: 'CPU', to: 'C P U', whole: true, lang: '' },
  { from: 'GPU', to: 'G P U', whole: true, lang: '' },
  { from: 'RAM', to: 'ram', whole: true, lang: '' },
  { from: 'SQL', to: 'sequel', whole: true, lang: '' },
  { from: 'UI', to: 'U I', whole: true, lang: '' },
  { from: 'URL', to: 'U R L', whole: true, lang: '' },
  { from: 'UUID', to: 'U U I D', whole: true, lang: '' },
  { from: 'JSON', to: 'j-son', whole: true, lang: '' },
  { from: 'YAML', to: 'yam-el', whole: true, lang: '' },
  { from: 'HTML', to: 'H T M L', whole: true, lang: '' },
  { from: 'CSS', to: 'C S S', whole: true, lang: '' },
  { from: 'SSH', to: 'S S H', whole: true, lang: '' },
  { from: 'DNS', to: 'D N S', whole: true, lang: '' },
  { from: 'IP', to: 'I P', whole: true, lang: '' },
]

export function applyPronunciation(text, rules, language, enableBuiltinIt = false) {
  let out = String(text || '')
  const lang = String(language || '').toLowerCase()
  const customList = Array.isArray(rules) ? rules : []
  const list = enableBuiltinIt ? [...customList, ...BUILTIN_IT_DICTIONARY] : customList
  for (const rule of list) {
    if (!rule || typeof rule.from !== 'string' || !rule.from) continue
    if (rule.lang && !lang.startsWith(String(rule.lang).toLowerCase())) continue
    const to = typeof rule.to === 'string' ? rule.to : ''
    try {
      const rx = /^\/(.+)\/([a-z]*)$/s.exec(rule.from)
      let re
      if (rx) re = new RegExp(rx[1], rx[2].includes('g') ? rx[2] : rx[2] + 'g')
      else if (rule.whole) re = new RegExp('(?<![\\p{L}\\p{N}])' + escapeRe(rule.from) + '(?![\\p{L}\\p{N}])', 'gu')
      else re = new RegExp(escapeRe(rule.from), 'g')
      out = out.replace(re, to)
    } catch (badRule) { /* bad rule must not break speech */ }
  }
  return out
}

function fill(template, n) {
  return String(template).replace('{n}', String(n))
}

export function cleanAnsiAndLogs(text) {
  let s = String(text || '')
  s = s.replace(/\u001b\[[0-9;]*[a-zA-Z]|\x1b\].*?\x07/g, '')
  s = s.replace(/(?:^|\n)diff --git[^\n]*\n(?:(?:index|---|\+\+\+|@@|\+|-)[^\n]*\n?)+/g, '\n')
  s = s.replace(/^(?:---|\+\+\+|@@\s*-[0-9,]+\s*\+[0-9,]+\s*@@)[^\n]*\n?/gm, '')
  s = s.replace(/^\s+at (?:async )?[a-zA-Z0-9_$.<>]+\s+\([^)]+\)\s*$/gm, '')
  return s
}

export function cleanUrls(text) {
  let s = String(text || '')
  return s.replace(/https?:\/\/([a-zA-Z0-9.-]+)(?::\d+)?(?:\/[^\s)]*)?/g, '$1')
}

export function computeAdaptiveRate(textLength, baseRate = 1.0) {
  const len = Number(textLength) || 0
  const base = Number(baseRate) > 0 ? Number(baseRate) : 1.0
  if (len < 300) return Math.round(base * 100) / 100
  if (len <= 1000) return Math.round((base * 1.15) * 100) / 100
  return Math.round((base * 1.25) * 100) / 100
}

export function extractTldr(rawText, language) {
  const text = String(rawText || '').trim()
  if (!text) return ''

  const summaryHeadingRx = /(?:^|\n)#{1,4}\s*(?:Summary|Conclusion|TL;?DR|Takeaway|总结|结论|摘要|结语)[^\n]*\n+([\s\S]*?)(?=\n#{1,4}\s|\n\n---\n|$)/i
  const match = summaryHeadingRx.exec(text)
  if (match && match[1].trim()) {
    return match[1].trim()
  }

  const boldHeadingRx = /(?:^|\n)\*\*(?:Summary|Conclusion|TL;?DR|Takeaway|总结|结论|摘要|结语):\*\*\s*([\s\S]*?)(?=\n\n|$)/i
  const boldMatch = boldHeadingRx.exec(text)
  if (boldMatch && boldMatch[1].trim()) {
    return boldMatch[1].trim()
  }

  const halfLen = Math.floor(text.length * 0.4)
  const tailText = text.slice(halfLen)
  const tailHeaderRx = /\n#{1,4}\s+[^\n]+\n+([\s\S]*?)(?=\n#{1,4}\s|\n\n---\n|$)/
  const tailMatch = tailHeaderRx.exec(tailText)
  if (tailMatch && tailMatch[1].trim()) {
    return tailMatch[1].trim()
  }

  const paragraphs = text.split(/\n\s*\n+/).map((p) => p.trim()).filter(Boolean)
  if (paragraphs.length <= 1) return text
  const firstSentence = paragraphs[0].split(/(?<=[.!?…\u3002\uFF01\uFF1F])\s*/)[0] || paragraphs[0]
  const lastParagraph = paragraphs[paragraphs.length - 1]
  return `${firstSentence}\n\n${lastParagraph}`
}

export function stripForSpeech(raw, maxChars, opts) {
  const options = opts || {}
  const skipCode = options.skipCode !== false
  const skipTables = options.skipTables !== false
  const cleanUrl = options.cleanUrls !== false
  const keepInlineCode = options.keepInlineCode === true
  const phrases = options.phrases || SPEECH_PHRASES.en
  let text = String(raw || '')

  if (options.tldrOnly) {
    text = extractTldr(text, options.language)
  }

  text = cleanAnsiAndLogs(text)
  if (cleanUrl) {
    text = cleanUrls(text)
  }

  // Scrubbing must run before sentence splitting or half a fenced block ends
  // up in the first chunk and is spoken.
  if (skipCode) {
    text = text.replace(/```[\s\S]*?```/g, (block) => {
      const inner = block.replace(/^```[^\n]*\n?/, '').replace(/\n?```\s*$/, '')
      const lines = inner ? inner.split('\n').length : 1
      return ' ' + fill(phrases.codeBlock, lines) + ' '
    })
    if (keepInlineCode) {
      text = text.replace(/`([^`\n]+)`/g, '$1')
    } else {
      text = text.replace(/`[^`\n]+`/g, ' ')
    }
  }

  // Markdown tables: consecutive lines starting with |; the |---| separator
  // row is not counted as a data row.
  if (skipTables) {
    text = text.replace(/(?:^[ \t]*\|.*\|[ \t]*$\n?)+/gm, (run) => {
      const rows = run.trim().split('\n')
        .filter((line) => !/^\s*\|[\s:|-]+\|\s*$/.test(line)).length
      return fill(phrases.table, Math.max(1, rows)) + '\n'
    })
  } else {
    text = text.replace(/(?:^[ \t]*\|.*\|[ \t]*$\n?)+/gm, (run) => {
      return run.replace(/\|/g, ' ') + '\n'
    })
  }

  text = text.replace(/!\[[^\]]*\]\([^)]+\)/g, ' ')
  text = text.replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
  text = text.replace(/[#*_>]+/g, ' ')
  text = text.replace(/MEDIA:[^\s]+/g, ' ')
  text = text.replace(/\s+/g, ' ').trim()
  // maxChars === 0 disables truncation; unset means the 4000 default.
  const requested = Number(maxChars)
  if (requested > 0 && text.length > requested) text = text.slice(0, requested)
  return text
}

export function assistantText(message) {
  if (!message) return ''
  if (typeof message === 'string') return message
  if (typeof message === 'object') {
    if (message.content !== undefined) return blocksToText(message.content)
    if (typeof message.text === 'string') return message.text
    if (typeof message.message === 'string') return message.message
  }
  return ''
}

// Protect common English abbreviations from false sentence splits
const PROTECTED_ABBREVIATIONS = [
  'e.g.', 'i.e.', 'vs.', 'etc.', 'dr.', 'mr.', 'mrs.', 'ms.', 'prof.',
  'approx.', 'dept.', 'est.', 'min.', 'max.', 'no.', 'vol.', 'p.m.', 'a.m.'
]

export function protectAbbreviations(text) {
  let res = String(text || '')
  for (const abbr of PROTECTED_ABBREVIATIONS) {
    const escaped = abbr.replace(/\./g, '\\.')
    const rx = new RegExp('(?<=^|[\\s"«(])' + escaped + '(?=[\\s"»)\\]]|$)', 'gi')
    res = res.replace(rx, (m) => m.replace(/\./g, '\u2024'))
  }
  // Decimal numbers and versions: e.g. 3.14, v0.4.6, 192.168.0.1
  res = res.replace(/(?<=[vV]?\d+)\.(?=\d+)/g, '\u2024')
  // List numbering at line/word starts: 1. item, 2. item
  res = res.replace(/(?<=^|[\s\n])(\d+)\.(?=\s+[A-Za-z\u4E00-\u9FFF])/g, '$1\u2024')
  // Common file extensions: e.g. package.json, index.js, script.py
  res = res.replace(/(?<=[a-zA-Z0-9_-])\.(?:js|mjs|cjs|ts|tsx|jsx|json|ya?ml|md|py|sh|tgz|tar|gz|zip|html?|css|rs|go|c|cpp|h|txt)(?=[ \t\n"«'\)\]\},;\.\?!]|$)/gi, (m) => m.replace(/\./g, '\u2024'))
  // Hostnames and domains: e.g. goodandready.app, github.com
  res = res.replace(/(?<=[a-zA-Z0-9])\.(?:com|org|net|io|dev|app|ru|cn|local)(?=[ \t\n/:"«'\)\]\},;\.\?!]|$)/gi, (m) => m.replace(/\./g, '\u2024'))
  return res
}

export function restoreAbbreviations(text) {
  return String(text || '').replace(/\u2024/g, '.')
}

/**
 * Split text into chunks on sentence boundaries.
 *
 * Enables low latency playback: synthesizing a whole long reply takes seconds,
 * whereas the first sentence is ready almost immediately. Chunks shorter than
 * the min threshold attach to the next one so speech sounds fluid.
 *
 * @param text {string} pre-cleaned text
 * @param maxChars {number} upper bound for one chunk
 * @returns {string[]}
 */
export function splitSentencesWithOffsets(text, maxChars) {
  const limit = Number(maxChars) > 0 ? Number(maxChars) : 320
  const raw = String(text || '').trim()
  if (!raw) return []

  const isCjk = /[\u4E00-\u9FFF]/.test(raw)
  const min = isCjk ? Math.min(10, Math.floor(limit / 5)) : Math.min(60, Math.floor(limit / 3))

  const source = protectAbbreviations(raw)
  const pieces = []
  let current = ''
  for (const part of source.split(/(?<=[.!?…\u3002\uFF01\uFF1F])\s*|\n+/)) {
    const chunk = String(part || '').trim()
    if (!chunk) continue
    if (!current) {
      current = chunk
    } else if (current.length < min) {
      current += (isCjk ? '' : ' ') + chunk
    } else {
      pieces.push(current)
      current = chunk
    }
    while (current.length > limit) {
      let cut = current.lastIndexOf(' ', limit)
      if (cut < min) cut = limit
      pieces.push(current.slice(0, cut).trim())
      current = current.slice(cut).trim()
    }
  }
  if (current) pieces.push(current)

  const rawPieces = pieces.filter(Boolean).map(restoreAbbreviations)
  const total = rawPieces.length
  const results = []
  let searchIdx = 0

  for (let i = 0; i < total; i++) {
    const pText = rawPieces[i]
    let start = text.indexOf(pText, searchIdx)
    if (start === -1) {
      start = text.indexOf(pText)
      if (start === -1) start = searchIdx
    }
    const end = start + pText.length
    searchIdx = end
    results.push({
      text: pText,
      charStart: start,
      charEnd: end,
      sentenceIndex: i,
      totalSentences: total,
    })
  }

  return results
}

export function splitSentences(text, maxChars) {
  return splitSentencesWithOffsets(text, maxChars).map((p) => p.text)
}

