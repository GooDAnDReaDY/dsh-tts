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

export const BUILTIN_IT_DICTIONARY = []

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

export function stripForSpeech(raw, maxChars, opts) {
  const options = opts || {}
  const skipCode = options.skipCode !== false
  const phrases = options.phrases || SPEECH_PHRASES.en
  let text = String(raw || '')
    // Scrubbing must run before sentence splitting or half a fenced block ends
    // up in the first chunk and is spoken.
  if (skipCode) {
    text = text.replace(/```[\s\S]*?```/g, (block) => {
      const inner = block.replace(/^```[^\n]*\n?/, '').replace(/\n?```\s*$/, '')
      const lines = inner ? inner.split('\n').length : 1
      return ' ' + fill(phrases.codeBlock, lines) + ' '
    })
    text = text.replace(/`[^`\n]+`/g, ' ')
  }
    // Markdown tables: consecutive lines starting with |; the |---| separator
    // row is not counted as a data row.
  text = text.replace(/(?:^[ \t]*\|.*\|[ \t]*$\n?)+/gm, (run) => {
    const rows = run.trim().split('\n')
      .filter((line) => !/^\s*\|[\s:|-]+\|\s*$/.test(line)).length
    return fill(phrases.table, Math.max(1, rows)) + '\n'
  })
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
  return blocksToText(message.content)
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
export function splitSentences(text, maxChars) {
  const limit = Number(maxChars) > 0 ? Number(maxChars) : 320
  const raw = String(text || '').trim()
  if (!raw) return []

  const isCjk = /[\u4E00-\u9FFF]/.test(raw)
  // CJK characters carry much more meaning per character than Latin/Cyrillic words.
  const min = isCjk ? Math.min(10, Math.floor(limit / 5)) : Math.min(60, Math.floor(limit / 3))

  const source = protectAbbreviations(raw)
  const pieces = []
  let current = ''
  // Boundaries are period, question, exclamation, ellipsis, Chinese full-width punctuation, and newline.
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
    // Oversized pieces are split on words or characters: providers choke on walls of text.
    while (current.length > limit) {
      let cut = current.lastIndexOf(' ', limit)
      if (cut < min) cut = limit
      pieces.push(current.slice(0, cut).trim())
      current = current.slice(cut).trim()
    }
  }
  if (current) pieces.push(current)
  return pieces.filter(Boolean).map(restoreAbbreviations)
}
