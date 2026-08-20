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
