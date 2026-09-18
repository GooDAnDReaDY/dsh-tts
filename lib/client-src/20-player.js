    // Player.
    //
    // Each incoming chunk used to replace the previous one immediately; while reading
    // For full replies this was invisible; with speak-as-it-goes only the last
    // chunk would be heard. Now items queue: the next starts after the previous ends.
    const autoplay = { blocked: false, listeners: new Set() }

    function setAutoplayBlocked(next) {
      if (autoplay.blocked === next) return
      autoplay.blocked = next
      for (const l of [...autoplay.listeners]) {
        try { l() } catch { /* listener isolation */ }
      }
    }

    function unlockAudio() {
      try {
        const AC = window.AudioContext || window.webkitAudioContext
        if (AC) {
          const ctx = new AC()
          if (ctx.state === 'suspended') ctx.resume().catch(() => { /* audio context unlock failure ignored */ })
          setTimeout(() => { try { ctx.close() } catch { /* closed */ } }, 300)
        }
      } catch { /* no AudioContext */ }
      setAutoplayBlocked(false)
      drainQueue()
    }

    function useAutoplayGate() {
      const [, force] = React.useReducer((n) => n + 1, 0)
      React.useEffect(() => {
        autoplay.listeners.add(force)
        return () => { autoplay.listeners.delete(force) }
      }, [])
      return autoplay
    }

    const player = {
      audio: null,
      after: '',
      enabled: false,
      rate: 1,
      chime: 'ding',
      queue: [],
      bargeIn: true,
      busy: false,
      paused: false,
      listeners: new Set(),
      unlockAudio,
      useAutoplayGate,
      get autoplayBlocked() { return autoplay.blocked },
    }
    const seenIds = new Set()
    let currentAudioResolve = null
    function playerChanged() {
      for (const listener of [...player.listeners]) {
        try { listener() } catch (listenerFailure) { /* foreign listener failure is not ours */ }
      }
    }

    function usePlayer() {
      const [, force] = React.useReducer((n) => n + 1, 0)
      React.useEffect(() => {
        player.listeners.add(force)
        return () => { player.listeners.delete(force) }
      }, [])
      return player
    }

    // Short chime is synthesized in-browser: no file to download, store, or configure.
    function playChime(kind) {
      return new Promise((resolve) => {
        try {
          const AC = window.AudioContext || window.webkitAudioContext
          if (!AC) { resolve(); return }
          const audioCtx = new AC()
          const gain = audioCtx.createGain()
          gain.connect(audioCtx.destination)
          const tones = kind === 'beep' ? [880, 880] : [660, 990]
          let at = audioCtx.currentTime
          for (const freq of tones) {
            const osc = audioCtx.createOscillator()
            osc.frequency.value = freq
            osc.connect(gain)
            gain.gain.setValueAtTime(0.0001, at)
            gain.gain.exponentialRampToValueAtTime(0.25, at + 0.02)
            gain.gain.exponentialRampToValueAtTime(0.0001, at + 0.18)
            osc.start(at)
            osc.stop(at + 0.2)
            at += 0.22
          }
          setTimeout(() => { try { audioCtx.close() } catch (already) { /* already closed */ } resolve() }, 600)
        } catch { resolve() /* no AudioContext */ }
      })
    }

    // Provider failed — fall back to the browser voice. Worse quality, but silence
    // is worse: the user would not know the reply is ready.
    function speakInBrowser(text) {
      return new Promise((resolve) => {
        try {
          if (!window.speechSynthesis || !text) { resolve(); return }
          const utterance = new SpeechSynthesisUtterance(String(text))
          utterance.rate = Math.max(0.5, Math.min(2, player.rate || 1))
          utterance.onend = () => resolve()
          utterance.onerror = () => resolve()
          window.speechSynthesis.speak(utterance)
        } catch { resolve() /* no speechSynthesis */ }
      })
    }

    function prepareAudioItem(item) {
      if (!item || !item.audioBase64 || item.prepared) return item
      try {
        const bin = atob(item.audioBase64)
        const bytes = new Uint8Array(bin.length)
        for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
        const blob = new Blob([bytes], { type: item.mime || 'audio/mpeg' })
        const url = URL.createObjectURL(blob)
        const audio = new Audio(url)
        audio.preload = 'auto'
        item.prepared = { audio, url }
      } catch { /* decode error — item stays unprepared */ }
      return item
    }

    function prebufferNext() {
      for (const next of player.queue) {
        if (next && next.audioBase64 && !next.prepared) {
          prepareAudioItem(next)
          break
        }
      }
    }

    function playAudio(item) {
      return new Promise((resolve) => {
        try {
          prepareAudioItem(item)
          if (!item.prepared) return resolve()
          const { audio, url } = item.prepared
          audio.playbackRate = Math.max(0.5, Math.min(2, player.rate || 1))
          player.audio = audio
          if (item.text) player.lastText = item.text
          playerChanged()
          prebufferNext()
          let doneCalled = false
          const done = () => {
            if (doneCalled) return
            doneCalled = true
            currentAudioResolve = null
            try { URL.revokeObjectURL(url) } catch { /* URL already revoked */ }
            item.prepared = null
            player.audio = null
            playerChanged()
            resolve()
          }
          currentAudioResolve = done
          audio.onended = done
          audio.onerror = done
          audio.play().catch((playErr) => {
            // Autoplay without a user gesture is blocked — surface unlock UX, then stop this chunk.
            if (playErr && (playErr.name === 'NotAllowedError' || playErr.name === 'SecurityError')) {
              setAutoplayBlocked(true)
            }
            done()
          })
        } catch { /* cannot decode — skip chunk */
          currentAudioResolve = null
          resolve()
        }
      })
    }

    async function drainQueue() {
      if (player.busy) return
      player.busy = true
      playerChanged()
      try {
        while (player.queue.length) {
          if (player.paused) break
          const item = player.queue.shift()
          if (!item || item.kind === 'reserved') continue
          if (item.kind === 'chime') { await playChime(item.chime || player.chime); continue }
          if (item.audioBase64) await playAudio(item)
          else if (item.error && item.text) await speakInBrowser(item.text)
        }
      } finally {
        player.busy = false
        playerChanged()
      }
    }

    function stopPlayback() {
      for (const item of player.queue) {
        if (item && item.prepared && item.prepared.url) {
          try { URL.revokeObjectURL(item.prepared.url) } catch { /* already revoked */ }
          item.prepared = null
        }
      }
      player.queue.length = 0
      player.paused = false
      if (player.audio) {
        try { player.audio.pause() } catch { /* already paused */ }
      }
      if (currentAudioResolve) {
        currentAudioResolve()
      }
      player.audio = null
      try { if (window.speechSynthesis) window.speechSynthesis.cancel() } catch { /* no speechSynthesis */ }
      playerChanged()
    }

    function togglePause() {
      player.paused = !player.paused
      if (player.audio) {
        try { player.paused ? player.audio.pause() : player.audio.play() } catch (already) { /* ignore play/pause failure */ }
      }
      if (!player.paused) drainQueue()
      playerChanged()
    }

    function skipCurrent() {
      if (currentAudioResolve) {
        currentAudioResolve()
      } else if (player.audio) {
        try { player.audio.pause() } catch (already) { /* already stopped */ }
        player.audio = null
        playerChanged()
        if (player.queue.length) drainQueue()
      }
    }

    // User started talking — stop playback.
    //
    // The event may come from a voice-input plugin, but there is no hard dependency:
    // without that plugin the event simply never fires. We listen on window on purpose.
    function listenForVoice() {
      if (typeof window === 'undefined') return () => {}
      const onSpeaking = (event) => {
        const phase = event && event.detail && event.detail.phase
        if (phase !== 'start') return
        if (!player.bargeIn) return
        if (!player.audio && !player.queue.length && !player.busy) return
        stopPlayback()
      }
      window.addEventListener('dsh-voice:speaking', onSpeaking)
      return () => window.removeEventListener('dsh-voice:speaking', onSpeaking)
    }

        // SSE Realtime Stream Connection with Exponential Backoff & Jitter
    let sseAttempt = 0
    let sseTimer = null
    let sseSource = null

    function connectSseStream() {
      if (typeof window === 'undefined' || typeof window.EventSource === 'undefined') return
      if (sseSource) {
        try { sseSource.close() } catch (alreadyClosed) { /* intentional cleanup */ }
        sseSource = null
      }
      try {
        sseSource = new EventSource('/dsh-tts/stream')
        sseSource.onopen = () => {
          sseAttempt = 0
        }
        sseSource.addEventListener('utterance', (e) => {
          sseAttempt = 0
          try {
            const item = JSON.parse(e.data)
            if (item && item.id) {
              player.after = item.id
              if (!seenIds.has(item.id)) {
                seenIds.add(item.id)
                if (seenIds.size > 500) {
                  const first = seenIds.values().next().value
                  seenIds.delete(first)
                }
                if (item.text) recent.add(item.text)
                player.queue.push(item)
                drainQueue()
              }
            }
          } catch (parseErr) { /* ignore malformed SSE payload */ }
        })
        sseSource.addEventListener('chime', (e) => {
          sseAttempt = 0
          try {
            const item = JSON.parse(e.data)
            if (item) {
              player.queue.push(item)
              drainQueue()
            }
          } catch (parseErr) { /* ignore malformed chime payload */ }
        })
        sseSource.onerror = () => {
          if (sseSource) {
            try { sseSource.close() } catch (alreadyClosed) { /* intentional cleanup */ }
            sseSource = null
          }
          sseAttempt++
          const baseDelay = Math.min(10000, 500 * Math.pow(2, sseAttempt - 1))
          const jitter = baseDelay * (Math.random() * 0.6 - 0.3)
          const delay = Math.max(200, Math.floor(baseDelay + jitter))
          if (sseTimer) clearTimeout(sseTimer)
          sseTimer = setTimeout(() => {
            connectSseStream()
          }, delay)
        }
      } catch (esErr) { /* EventSource failed */ }
    }

async function pollPending() {
        connectSseStream()
      try {
        const st = await fetch('/dsh-tts/status', { cache: 'no-store' })
        if (!st.ok) return
        const meta = await st.json()
        player.enabled = !!(meta && meta.speakReplies)
        if (meta && typeof meta.rate === 'number') player.rate = meta.rate
        if (meta && meta.chime) player.chime = meta.chime
          if (meta && meta.roles) player.roles = meta.roles
        if (meta && typeof meta.bargeIn === 'boolean') player.bargeIn = meta.bargeIn
        if (!player.enabled) return
        const res = await fetch('/dsh-tts/pending?after=' + encodeURIComponent(player.after || ''), { cache: 'no-store' })
        if (!res.ok) return
        const data = await res.json()
        const items = data && Array.isArray(data.items) ? data.items : []
        for (const item of items) {
    // Queue slot reserved but synthesis still running — wait for the next poll
    // or phrase order would break.
          if (item.kind === 'reserved') break
          player.after = item.id
          if (seenIds.has(item.id)) continue
          seenIds.add(item.id)
          if (seenIds.size > 500) {
            const first = seenIds.values().next().value
            seenIds.delete(first)
          }
          if (item.text) recent.add(item.text)
          player.queue.push(item)
        }
        if (player.queue.length) drainQueue()
      } catch (hostRestarting) { /* host restarting */ }
    }

    // Recent utterances: last reply texts and favorites (localStorage).
    function recentStore() {
      const KEY = 'dsh-tts/recent'
      let st
      try {
        const raw = typeof localStorage !== 'undefined' ? localStorage.getItem(KEY) : null
        st = JSON.parse(raw) || { items: [], favs: [] }
      } catch (broken) { st = { items: [], favs: [] } }
      const persist = () => { try { if (typeof localStorage !== 'undefined') localStorage.setItem(KEY, JSON.stringify(st)) } catch (full) { /* private mode / quota */ } }
      return {
        add(text) {
          if (!text || text.length < 2) return
          st.items = [text, ...st.items.filter((x) => x !== text)].slice(0, 30)
          persist()
        },
        toggleFav(text) {
          st.favs = st.favs.includes(text)
            ? st.favs.filter((x) => x !== text)
            : [text, ...st.favs].slice(0, 20)
          persist()
        },
        list() { return { items: st.items, favs: st.favs } },
      }
    }
    const recent = recentStore()

    // One-shot playback outside the queue: replay from recents.
    function playStandalone(text) {
      fetch('/dsh-tts/speak', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text }),
      })
        .then((r) => r.json())
        .then((d) => {
          if (!d || !d.ok) return
          const audio = new Audio('data:' + (d.mime || 'audio/mpeg') + ';base64,' + d.audioBase64)
          audio.play().catch(() => { /* chime autoplay blocked or interrupted */ })
        })
        .catch(() => { /* chime fetch failed or not found */ })
    }

    function exportAudioClip(text) {
      let phrase = text || player.lastText
      if (!phrase) {
        const list = recent.list()
        if (list && list.items && list.items.length) phrase = list.items[0]
      }
      if (!phrase) return
      fetch('/dsh-tts/speak', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: phrase }),
      })
        .then((r) => r.json())
        .then((d) => {
          if (!d || !d.ok || !d.audioBase64) return
          const bin = atob(d.audioBase64)
          const bytes = new Uint8Array(bin.length)
          for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
          const mime = d.mime || 'audio/mpeg'
          const blob = new Blob([bytes], { type: mime })
          const url = URL.createObjectURL(blob)
          const a = document.createElement('a')
          a.href = url
          a.download = 'dsh-tts-' + Date.now() + (mime.indexOf('wav') !== -1 ? '.wav' : '.mp3')
          document.body.appendChild(a)
          a.click()
          document.body.removeChild(a)
          setTimeout(() => { try { URL.revokeObjectURL(url) } catch (alreadyRevoked) { /* already revoked */ } }, 2000)
        })
        .catch(() => {})
    }

    function credOf(map, provider) {
      return (map && map[provider]) || { configured: false, writable: true, ref: '' }
    }

