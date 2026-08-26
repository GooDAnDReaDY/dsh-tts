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

// Короткие пометки вместо выброшенной разметки. Формулировки выбираются по
// языку озвучки из настроек; подстановки {n} заполняются числом строк.
export const SPEECH_PHRASES = {
  en: { codeBlock: 'code block, {n} lines', table: 'table, {n} rows' },
  ru: { codeBlock: 'блок кода, {n} строк', table: 'таблица, {n} строк' },
}

export function speechPhrases(language) {
  const lang = String(language || '').toLowerCase()
  return lang.startsWith('ru') ? SPEECH_PHRASES.ru : SPEECH_PHRASES.en
}

function fill(template, n) {
  return String(template).replace('{n}', String(n))
}

export function stripForSpeech(raw, maxChars, opts) {
  const options = opts || {}
  const skipCode = options.skipCode !== false
  const phrases = options.phrases || SPEECH_PHRASES.en
  let text = String(raw || '')
  // Чистка обязана идти до нарезки на предложения, иначе половина блока
  // уедет в первый кусок и будет озвучена.
  if (skipCode) {
    text = text.replace(/```[\s\S]*?```/g, (block) => {
      const inner = block.replace(/^```[^\n]*\n?/, '').replace(/\n?```\s*$/, '')
      const lines = inner ? inner.split('\n').length : 1
      return ' ' + fill(phrases.codeBlock, lines) + ' '
    })
    text = text.replace(/`[^`\n]+`/g, ' ')
  }
  // Таблицы Markdown: подряд идущие строки, начинающиеся с |; разделительная
  // шапка |---| в счёт строк не идёт.
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
  const limit = Number(maxChars) > 0 ? Number(maxChars) : 4000
  if (text.length > limit) text = text.slice(0, limit)
  return text
}

export function assistantText(message) {
  if (!message) return ''
  return blocksToText(message.content)
}

/**
 * Режет текст на куски по границам предложений.
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
  const source = String(text || '').trim()
  if (!source) return []

  const pieces = []
  let current = ''
  // Границей считаем точку, вопрос, восклицание, многоточие и перевод строки.
  for (const part of source.split(/(?<=[.!?…])\s+|\n+/)) {
    const chunk = String(part || '').trim()
    if (!chunk) continue
    if (!current) { current = chunk } else if (current.length < min) { current += ' ' + chunk }
    else { pieces.push(current); current = chunk }
    // Кусок длиннее предела режем по словам: провайдеры не любят простыни.
    while (current.length > limit) {
      let cut = current.lastIndexOf(' ', limit)
      if (cut < min) cut = limit
      pieces.push(current.slice(0, cut).trim())
      current = current.slice(cut).trim()
    }
  }
  if (current) pieces.push(current)
  return pieces.filter(Boolean)
}
