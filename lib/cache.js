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

  let generation = 0
  const pendingWrites = new Set()

  function trackWrite(p) {
    pendingWrites.add(p)
    p.finally(() => pendingWrites.delete(p)).catch(() => {})
    return p
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

  // In-memory index of disk cache entries to avoid O(N) readdir/stat/readFile per write (#190)
  const diskEntries = new Map() // key -> { size, at }
  let diskTotalBytes = 0
  let indexLoaded = false

  async function ensureIndex() {
    await ensure()
    if (indexLoaded) return
    diskEntries.clear()
    diskTotalBytes = 0
    let files = []
    try {
      files = await fs.promises.readdir(dir)
    } catch {
      files = []
    }
    for (const name of files) {
      if (!name.endsWith(AUDIO_EXT)) continue
      const key = name.slice(0, -AUDIO_EXT.length)
      const full = path.join(dir, name)
      try {
        const st = await fs.promises.stat(full)
        let at = st.mtimeMs
        try {
          const meta = JSON.parse(await fs.promises.readFile(path.join(dir, key + '.json'), 'utf8'))
          if (meta && typeof meta.at === 'number') at = meta.at
        } catch { /* no meta */ }
        diskEntries.set(key, { size: st.size, at })
        diskTotalBytes += st.size
      } catch { /* skip unreadable */ }
    }
    indexLoaded = true
  }

  async function evict() {
    await ensureIndex()
    const limit = typeof maxBytes === 'function' ? maxBytes() : Number(maxBytes)
    if (!(limit > 0) || diskTotalBytes <= limit) return

    // Sort in-memory entries by timestamp ascending (oldest first)
    const sorted = Array.from(diskEntries.entries()).sort((a, b) => {
      const atA = l1Map.get(a[0])?.at ?? a[1].at
      const atB = l1Map.get(b[0])?.at ?? b[1].at
      return atA - atB
    })

    for (const [key, meta] of sorted) {
      if (diskTotalBytes <= limit) break
      await fs.promises.rm(path.join(dir, key + AUDIO_EXT), { force: true }).catch(() => {})
      await fs.promises.rm(path.join(dir, key + '.json'), { force: true }).catch(() => {})
      diskEntries.delete(key)
      diskTotalBytes -= meta.size
      l1Map.delete(key)
    }
  }

  return {
    async put(key, mime, audio) {
      await ensureIndex()
      const buf = Buffer.isBuffer(audio) ? audio : Buffer.from(audio)
      putL1(key, mime, buf)
      const now = Date.now()
      const currentGen = generation
      const writePromise = (async () => {
        if (currentGen !== generation) return
        await fs.promises.writeFile(path.join(dir, key + AUDIO_EXT), buf)
        await fs.promises.writeFile(path.join(dir, key + '.json'), JSON.stringify({ mime, at: now }))
        if (currentGen !== generation) {
          await fs.promises.rm(path.join(dir, key + AUDIO_EXT), { force: true }).catch(() => {})
          await fs.promises.rm(path.join(dir, key + '.json'), { force: true }).catch(() => {})
        }
      })()
      trackWrite(writePromise)
      await writePromise
      if (currentGen !== generation) return

      const prev = diskEntries.get(key)
      if (prev) diskTotalBytes -= prev.size
      diskEntries.set(key, { size: buf.length, at: now })
      diskTotalBytes += buf.length
      const limit = typeof maxBytes === 'function' ? maxBytes() : Number(maxBytes)
      if (limit > 0 && diskTotalBytes > limit) {
        await evict()
      }
    },

    async get(key) {
      const currentGen = generation
      // 1. L1 RAM Hit
      if (l1Map.has(key)) {
        const hit = l1Map.get(key)
        const now = Date.now()
        l1Map.delete(key) // refresh LRU order
        l1Map.set(key, { ...hit, at: now })
        const d = diskEntries.get(key)
        if (d) d.at = now
        if (currentGen === generation) {
          const writePromise = (async () => {
            if (currentGen !== generation) return
            await fs.promises.writeFile(path.join(dir, key + '.json'), JSON.stringify({ mime: hit.mime, at: now }))
            if (currentGen !== generation) {
              await fs.promises.rm(path.join(dir, key + '.json'), { force: true }).catch(() => {})
            }
          })().catch(() => {})
          trackWrite(writePromise)
        }
        return { mime: hit.mime || 'audio/mpeg', audio: hit.audio }
      }

      // 2. L2 Disk Hit
      await ensureIndex()
      try {
        const meta = JSON.parse(await fs.promises.readFile(path.join(dir, key + '.json'), 'utf8'))
        const audio = await fs.promises.readFile(path.join(dir, key + AUDIO_EXT))
        if (currentGen === generation) {
          putL1(key, meta.mime, audio)
          const now = Date.now()
          const d = diskEntries.get(key)
          if (d) d.at = now
          const writePromise = (async () => {
            if (currentGen !== generation) return
            await fs.promises.writeFile(path.join(dir, key + '.json'), JSON.stringify({ mime: meta.mime, at: now }))
            if (currentGen !== generation) {
              await fs.promises.rm(path.join(dir, key + '.json'), { force: true }).catch(() => {})
            }
          })().catch(() => {})
          trackWrite(writePromise)
        }
        return { mime: meta.mime || 'audio/mpeg', audio }
      } catch (miss) {
        return null
      }
    },

    async clear() {
      generation++
      l1Map.clear()
      if (pendingWrites.size > 0) {
        await Promise.allSettled(Array.from(pendingWrites))
      }
      await ensureIndex()
      const count = diskEntries.size
      let files = []
      try {
        files = await fs.promises.readdir(dir)
      } catch {
        files = []
      }
      for (const name of files) {
        if (name.endsWith(AUDIO_EXT) || name.endsWith('.json')) {
          await fs.promises.rm(path.join(dir, name), { force: true }).catch(() => {})
        }
      }
      diskEntries.clear()
      diskTotalBytes = 0
      return count
    },
  }
}
