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
      player.blocked = false
      playerChanged()
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
      blocked: false,
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
            if (player.audio) {
              try {
                player.audio.pause()
                player.audio.currentTime = 0
              } catch { /* already paused */ }
            }
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
            // Autoplay without a user gesture is blocked — retain queue and surface unlock UX (#160)
            if (playErr && (playErr.name === 'NotAllowedError' || playErr.name === 'SecurityError')) {
              player.blocked = true
              setAutoplayBlocked(true)
              player.queue.unshift(item)
              currentAudioResolve = null
              player.audio = null
              player.busy = false
              playerChanged()
              if (typeof window !== 'undefined') {
                const onUserGesture = () => {
                  window.removeEventListener('click', onUserGesture)
                  window.removeEventListener('keydown', onUserGesture)
                  window.removeEventListener('touchstart', onUserGesture)
                  unlockAudio()
                }
                window.addEventListener('click', onUserGesture, { once: true })
                window.addEventListener('keydown', onUserGesture, { once: true })
                window.addEventListener('touchstart', onUserGesture, { once: true })
              }
              return
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
      if (player.busy || player.blocked || player.paused) return
      player.busy = true
      playerChanged()
      try {
        while (player.queue.length && !player.blocked && !player.paused) {
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
        try {
          player.audio.pause()
          player.audio.currentTime = 0
        } catch { /* already paused */ }
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
      if (player.audio) {
        try {
          player.audio.pause()
          player.audio.currentTime = 0
        } catch { /* ignore pause error */ }
      }
      if (currentAudioResolve) {
        currentAudioResolve()
      } else {
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

    // Unified SSE Realtime Stream Connection (#158)
    let activeSse = null
    let activeSseAttempt = 0
    let activeSseTimer = null
    let sseDisposed = false

    function startSseStream() {
      if (typeof window === 'undefined' || typeof window.EventSource === 'undefined') return () => {}
      sseDisposed = false

      const onItem = (e) => {
        try {
          const item = JSON.parse(e.data)
          if (!item || !item.id) return
          if (player.enabled === false) return
          player.after = item.id
          if (seenIds.has(item.id)) return
          seenIds.add(item.id)
          if (seenIds.size > 500) {
            const first = seenIds.values().next().value
            seenIds.delete(first)
          }
          if (item.text) recent.add(item.text)
          player.queue.push(item)
          drainQueue()
        } catch { /* ignore malformed SSE */ }
      }

      const onChime = (e) => {
        try {
          const item = JSON.parse(e.data)
          if (!item) return
          if (player.enabled === false) return
          player.queue.push(item)
          drainQueue()
        } catch {}
      }

      const connect = () => {
        if (sseDisposed) return
        if (activeSse) {
          try { activeSse.close() } catch {}
          activeSse = null
        }
        try {
          const es = new EventSource('/dsh-tts/stream')
          activeSse = es
          es.onopen = () => { activeSseAttempt = 0 }
          es.addEventListener('utterance', onItem)
          es.addEventListener('chime', onChime)
          es.onerror = () => {
            if (activeSse === es) {
              try { es.close() } catch {}
              activeSse = null
            }
            if (sseDisposed) return
            activeSseAttempt++
            const delay = Math.min(10000, 500 * Math.pow(2, Math.min(activeSseAttempt, 5)))
            if (activeSseTimer) clearTimeout(activeSseTimer)
            activeSseTimer = setTimeout(connect, delay)
          }
        } catch { /* EventSource failed */ }
      }

      connect()

      return () => {
        sseDisposed = true
        if (activeSseTimer) clearTimeout(activeSseTimer)
        if (activeSse) {
          try { activeSse.close() } catch {}
          activeSse = null
        }
      }
    }

    async function pollPending() {
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
      } catch { /* host restarting */ }
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

    // Unified playback through the shared player controller (#159)
    function playAudioItem(item) {
      stopPlayback()
      player.queue.push(item)
      drainQueue()
    }

    function playStandalone(text) {
      if (!text) return
      stopPlayback()
      fetch('/dsh-tts/speak', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text }),
      })
        .then((r) => r.json())
        .then((d) => {
          if (!d || !d.ok || !d.audioBase64) return
          playAudioItem({
            id: `replay-${Date.now()}`,
            text,
            mime: d.mime || 'audio/mpeg',
            audioBase64: d.audioBase64,
          })
        })
        .catch(() => {})
    }

    function previewSpeech(provider, model, voice, text) {
      stopPlayback()
      return fetch('/dsh-tts/preview', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ provider, model, voice, text }),
      })
        .then((r) => r.json())
        .then((d) => {
          if (!d || !d.ok) throw new Error((d && d.error && d.error.message) || 'HTTP error')
          playAudioItem({
            id: `preview-${Date.now()}`,
            text,
            mime: d.mime || 'audio/mpeg',
            audioBase64: d.audioBase64,
          })
        })
    }

    player.playAudioItem = playAudioItem
    player.previewSpeech = previewSpeech
    player.startSseStream = startSseStream
    player.skipCurrent = skipCurrent

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
