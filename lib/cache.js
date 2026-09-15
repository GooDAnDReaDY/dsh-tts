// Disk speech cache: key is a hash of (text, provider, model, voice),
// value is the provider response as-is (bytes + MIME). LRU eviction;
// cacheMaxMb is live config so the limit is passed as a function.
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

  // L1 In-Memory RAM Cache (max 50 entries or 10MB total buffer size)
  const l1Map = new Map()
  const L1_MAX_ITEMS = 50
  const L1_MAX_BYTES = 10 * 1024 * 1024

  function putL1(key, mime, audio) {
    const buf = Buffer.isBuffer(audio) ? audio : Buffer.from(audio)
    l1Map.delete(key) // reset insertion order
    l1Map.set(key, { mime, audio: buf, at: Date.now(), size: buf.length })

    let totalSize = 0
    for (const item of l1Map.values()) totalSize += item.size

    while (l1Map.size > L1_MAX_ITEMS || totalSize > L1_MAX_BYTES) {
      const oldestKey = l1Map.keys().next().value
      if (!oldestKey) break
      const oldest = l1Map.get(oldestKey)
      if (oldest) totalSize -= oldest.size
      l1Map.delete(oldestKey)
    }
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
      } catch (noMeta) { /* legacy entry without meta — evict as first */ }
      out.push({ full, meta: name.slice(0, -AUDIO_EXT.length) + '.json', size: st.size, at })
    }
    return out
  }

  async function evict() {
    const limit = typeof maxBytes === 'function' ? maxBytes() : Number(maxBytes)
    if (!(limit > 0)) return
    const rawEntries = await listEntries()
    const entries = rawEntries.map((e) => {
      const k = path.basename(e.full, AUDIO_EXT)
      const l1 = l1Map.get(k)
      return { ...e, key: k, at: (l1 && typeof l1.at === 'number') ? l1.at : e.at }
    }).sort((a, b) => a.at - b.at)

    let total = entries.reduce((acc, e) => acc + e.size, 0)
    for (const e of entries) {
      if (total <= limit) break
      await fs.promises.rm(e.full, { force: true })
      await fs.promises.rm(path.join(dir, e.meta), { force: true }).catch(() => {})
      l1Map.delete(e.key)
      total -= e.size
    }
  }

  return {
    async put(key, mime, audio) {
      await ensure()
      const buf = Buffer.isBuffer(audio) ? audio : Buffer.from(audio)
      putL1(key, mime, buf)
      await fs.promises.writeFile(path.join(dir, key + AUDIO_EXT), buf)
      await fs.promises.writeFile(path.join(dir, key + '.json'), JSON.stringify({ mime, at: Date.now() }))
      await evict()
    },

    async get(key) {
      // 1. L1 RAM Hit
      if (l1Map.has(key)) {
        const hit = l1Map.get(key)
        const now = Date.now()
        l1Map.delete(key) // refresh LRU order
        l1Map.set(key, { ...hit, at: now })
        fs.promises.writeFile(path.join(dir, key + '.json'), JSON.stringify({ mime: hit.mime, at: now })).catch(() => {})
        return { mime: hit.mime || 'audio/mpeg', audio: hit.audio }
      }

      // 2. L2 Disk Hit
      try {
        const meta = JSON.parse(await fs.promises.readFile(path.join(dir, key + '.json'), 'utf8'))
        const audio = await fs.promises.readFile(path.join(dir, key + AUDIO_EXT))
        putL1(key, meta.mime, audio)
        // Touch LRU asynchronously so reads are never blocked.
        fs.promises.writeFile(path.join(dir, key + '.json'), JSON.stringify({ mime: meta.mime, at: Date.now() })).catch(() => {})
        return { mime: meta.mime || 'audio/mpeg', audio }
      } catch (miss) {
        return null
      }
    },

    async clear() {
      l1Map.clear()
      const entries = await listEntries()
      for (const e of entries) {
        await fs.promises.rm(e.full, { force: true })
        await fs.promises.rm(path.join(dir, e.meta), { force: true }).catch(() => {})
      }
      return entries.length
    },
  }
}
