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

export function stripForSpeech(raw, maxChars) {
  let text = String(raw || '')
  text = text.replace(/```[\s\S]*?```/g, ' ')
  text = text.replace(/`[^`]+`/g, ' ')
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
