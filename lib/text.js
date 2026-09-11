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
  ru: { codeBlock: 'блок кода, {n} строк', table: 'таблица, {n} строк', summaryIntro: 'Пересказ ответа.' },
}

export function speechPhrases(language) {
  const lang = String(language || '').toLowerCase()
  return lang.startsWith('ru') ? SPEECH_PHRASES.ru : SPEECH_PHRASES.en
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

// Rough language heuristic: whichever script has more letters wins.
export function detectLang(text) {
  const s = String(text || '')
  const cyr = (s.match(/[\u0400-\u04FF]/g) || []).length
  const lat = (s.match(/[A-Za-z]/g) || []).length
  return cyr > lat ? 'ru' : 'en'
}

// Pronunciation rules apply top-down, once each over the whole text.
// Left side is plain text; /…/flags form is treated as a regular expression.
// whole=true requires a full word match (Unicode letter/digit boundaries).

function escapeRe(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

export const BUILTIN_IT_DICTIONARY = [
  { from: 'SQL', to: 'сиквел', whole: true, lang: 'ru' },
  { from: 'Nginx', to: 'энджинкс', whole: true, lang: 'ru' },
  { from: 'Kubernetes', to: 'кубернетис', whole: true, lang: 'ru' },
  { from: 'K8s', to: 'кубернетис', whole: true, lang: 'ru' },
  { from: 'PostgreSQL', to: 'постгрес', whole: true, lang: 'ru' },
  { from: 'Redis', to: 'рэдис', whole: true, lang: 'ru' },
  { from: 'Docker', to: 'докер', whole: true, lang: 'ru' },
  { from: 'API', to: 'апи', whole: true, lang: 'ru' },
  { from: 'JSON', to: 'джейсон', whole: true, lang: 'ru' },
  { from: 'YAML', to: 'ямл', whole: true, lang: 'ru' },
  { from: 'GUI', to: 'гуи', whole: true, lang: 'ru' },
  { from: 'CLI', to: 'си элай', whole: true, lang: 'ru' },
  { from: 'CI/CD', to: 'си ай си ди', whole: false, lang: 'ru' },
  { from: 'PR', to: 'пулл реквест', whole: true, lang: 'ru' },
  { from: 'Regex', to: 'регэкс', whole: true, lang: 'ru' },
  { from: 'OAuth', to: 'о-аус', whole: true, lang: 'ru' },
  { from: 'HTTP', to: 'эйч ти ти пи', whole: true, lang: 'ru' },
  { from: 'HTTPS', to: 'эйч ти ти пи эс', whole: true, lang: 'ru' },
  { from: 'URL', to: 'юрл', whole: true, lang: 'ru' },
  { from: 'SSH', to: 'эс эс эйч', whole: true, lang: 'ru' },
  { from: 'IP', to: 'ай пи', whole: true, lang: 'ru' },
  { from: 'DNS', to: 'ди эн эс', whole: true, lang: 'ru' },
  { from: 'CPU', to: 'си пи ю', whole: true, lang: 'ru' },
  { from: 'GPU', to: 'джи пи ю', whole: true, lang: 'ru' },
  { from: 'RAM', to: 'рам', whole: true, lang: 'ru' },
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

// Protect common abbreviations from false sentence splits
const PROTECTED_ABBREVIATIONS = [
  // Russian abbreviations
  'т.е.', 'т.д.', 'т.п.', 'т.к.', 'руб.', 'коп.', 'ул.', 'пер.', 'пр.', 'просп.',
  'д.', 'корп.', 'стр.', 'кв.', 'г.', 'гг.', 'в.', 'вв.', 'см.', 'ср.', 'напр.',
  'рис.', 'табл.', 'им.', 'акад.', 'проф.', 'доц.', 'млн.', 'млрд.', 'тыс.',
  // English abbreviations
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
  res = res.replace(/(?<=[vV]?\d+)\.(?=\d+)/g, '\u2024')
  return res
}

export function restoreAbbreviations(text) {
  return String(text || '').replace(/\u2024/g, '.')
}

/**
 * Split text into chunks on sentence boundaries.
 *
 * Нужно, чтобы чтение начиналось почти сразу: длинный ответ синтезируется
 * целиком долго, а первое предложение — быстро. Куски короче нижнего порога
 * прилипают к следующему: отдельная фраза «Да.» звучит рвано.
 *
 * @param text {string} уже очищенный текст
 * @param maxChars {number} верхняя граница куска
 * @returns {string[]}
 */
export function splitSentences(text, maxChars) {
  const limit = Number(maxChars) > 0 ? Number(maxChars) : 320
  const min = Math.min(60, Math.floor(limit / 3))
  const raw = String(text || '').trim()
  if (!raw) return []

  const source = protectAbbreviations(raw)
  const pieces = []
  let current = ''
  // Boundaries are period, question, exclamation, ellipsis, and newline.
  for (const part of source.split(/(?<=[.!?…])\s+|\n+/)) {
    const chunk = String(part || '').trim()
    if (!chunk) continue
    if (!current) { current = chunk } else if (current.length < min) { current += ' ' + chunk }
    else { pieces.push(current); current = chunk }
    // Oversized pieces are split on words: providers choke on walls of text.
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
