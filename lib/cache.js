// Кэш синтеза на диске: ключ — хеш (текст, провайдер, модель, голос),
// значение — ответ провайдера как есть (байты + MIME). Вытеснение самых
// давних по времени последнего обращения; ограничение задаётся настройкой
// cacheMaxMb и может меняться на живую, поэтому приходит функцией.
import { createHash } from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'

export function cacheKey(parts) {
  return createHash('sha1').update(JSON.stringify(parts)).digest('hex')
}

const AUDIO_EXT = '.audio'

export function createSpeechCache({ root, maxBytes }) {
  const dir = path.join(String(root), 'data', 'dsh-tts', 'cache')
  let ready = null
  const ensure = () => {
    if (!ready) ready = fs.promises.mkdir(dir, { recursive: true })
    return ready
  }

  async function listEntries() {
    await ensure()
    const out = []
    for (const name of await fs.promises.readdir(dir)) {
      if (!name.endsWith(AUDIO_EXT)) continue
      const full = path.join(dir, name)
      let st
      try {
        st = await fs.promises.stat(full)
      } catch {
        continue
      }
      let at = st.mtimeMs
      try {
        const meta = JSON.parse(await fs.promises.readFile(path.join(dir, name.slice(0, -AUDIO_EXT.length) + '.json'), 'utf8'))
        if (meta && typeof meta.at === 'number') at = meta.at
      } catch (noMeta) { /* старьё без меты — вытесним первым */ }
      out.push({ full, meta: name.slice(0, -AUDIO_EXT.length) + '.json', size: st.size, at })
    }
    return out
  }

  async function evict() {
    const limit = typeof maxBytes === 'function' ? maxBytes() : Number(maxBytes)
    if (!(limit > 0)) return
    const entries = (await listEntries()).sort((a, b) => a.at - b.at)
    let total = entries.reduce((acc, e) => acc + e.size, 0)
    for (const e of entries) {
      if (total <= limit) break
      await fs.promises.rm(e.full, { force: true })
      await fs.promises.rm(path.join(dir, e.meta), { force: true }).catch(() => {})
      total -= e.size
    }
  }

  return {
    async put(key, mime, audio) {
      await ensure()
      const buf = Buffer.isBuffer(audio) ? audio : Buffer.from(audio)
      await fs.promises.writeFile(path.join(dir, key + AUDIO_EXT), buf)
      await fs.promises.writeFile(path.join(dir, key + '.json'), JSON.stringify({ mime, at: Date.now() }))
      await evict()
    },

    async get(key) {
      try {
        const meta = JSON.parse(await fs.promises.readFile(path.join(dir, key + '.json'), 'utf8'))
        const audio = await fs.promises.readFile(path.join(dir, key + AUDIO_EXT))
        // Последнее обращение двигаем асинхронно: чтение тормозить нельзя.
        fs.promises.writeFile(path.join(dir, key + '.json'), JSON.stringify({ mime: meta.mime, at: Date.now() })).catch(() => {})
        return { mime: meta.mime || 'audio/mpeg', audio }
      } catch (miss) {
        return null
      }
    },

    async clear() {
      const entries = await listEntries()
      for (const e of entries) {
        await fs.promises.rm(e.full, { force: true })
        await fs.promises.rm(path.join(dir, e.meta), { force: true }).catch(() => {})
      }
      return entries.length
    },
  }
}
