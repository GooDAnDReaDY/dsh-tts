window.__ModuleLoader__.load({
  id: '@goodandready/dsh-tts',
  factory: (require) => {
    var module = { exports: {} }
    var exports = module.exports
    const React = require('react')

    // Chevron comes from core UI primitives; local SVG is a fallback for
    // builds without the package. Icon always points down; open state rotates.
    let ChevronIcon = null
    try {
      const primitives = require('@deepseek-ai/dsh-client-ui-primitives')
      ChevronIcon = primitives && primitives.IconChevronDownOutline14
    } catch (noPrimitives) {
      ChevronIcon = null
    }
    const NS = 'dsh-tts'
    // Plugins page row seat: key = '<package name>#<row id>', row id as cordis.patch.yml declares it.
    const PKG = '@goodandready/dsh-tts'
    const ROW_ID = 'dsh-tts'
    const ROW_CONFIG_KEY = PKG + '#' + ROW_ID
    const PROVIDERS = [
      'openai', 'elevenlabs', 'google', 'azure', 'groq', 'deepgram', 'openrouter',
      'siliconflow', 'deepinfra', 'fireworks', 'mimo', 'custom',
      'edge', 'piper', 'espeak', 'minimax',
    ]
    const CLOUD = {
      openai: 1, elevenlabs: 1, google: 1, azure: 1, groq: 1, deepgram: 1, openrouter: 1,
      siliconflow: 1, deepinfra: 1, fireworks: 1, mimo: 1, custom: 1,
    }
    // Hints stay generic: concrete provider model IDs rot quickly.
    const MODEL_HINT = {
      openai: 'provider default',
      elevenlabs: 'provider default',
      google: 'provider default',
      azure: 'region voice name',
      groq: 'provider default',
      deepgram: 'provider default (English-only voices)',
      openrouter: 'provider/model id',
      siliconflow: 'model id (e.g. FunAudioLLM/CosyVoice2-0.5B)',
      deepinfra: 'model id (e.g. hexgrad/Kokoro-82M)',
      fireworks: 'model id (e.g. kokoro)',
      mimo: 'model id (e.g. mimo-v2.5-tts)',
      custom: 'custom model',
      minimax: 'model id',
      edge: 'BCP-47 voice, e.g. en-US-AriaNeural',
      piper: 'path to .onnx',
      espeak: 'language code, e.g. en',
      kokoro: 'not bundled — offline neural runtime unavailable',
      f5: 'not bundled — offline neural runtime unavailable',
    }


    function clientFetch(url, options) {
      const opts = options || {}
      const timeoutMs = Number(opts.timeoutMs) > 0 ? Number(opts.timeoutMs) : 15000
      const controller = new AbortController()
      let timer = null
      let parentCleanup = null

      const cleanup = () => {
        if (timer) {
          clearTimeout(timer)
          timer = null
        }
        if (parentCleanup) {
          parentCleanup()
          parentCleanup = null
        }
      }

      timer = setTimeout(() => {
        try { controller.abort() } catch { /* already aborted */ }
      }, timeoutMs)
      if (timer && typeof timer.unref === 'function') timer.unref()

      if (opts.signal) {
        if (opts.signal.aborted) {
          controller.abort()
        } else {
          const onAbort = () => {
            try { controller.abort() } catch { /* already aborted */ }
          }
          opts.signal.addEventListener('abort', onAbort, { once: true })
          parentCleanup = () => {
            try { opts.signal.removeEventListener('abort', onAbort) } catch { /* listener already removed */ }
          }
        }
      }

      const fetchOpts = Object.assign({}, opts, { signal: controller.signal })
      delete fetchOpts.timeoutMs

      return fetch(url, fetchOpts).then((res) => {
        if (!res.body || res.bodyUsed) {
          cleanup()
          return res
        }
        const wrap = (orig) => {
          if (typeof orig !== 'function') return orig
          return function (...args) {
            return orig.apply(res, args).finally(cleanup)
          }
        }
        res.json = wrap(res.json)
        res.text = wrap(res.text)
        res.blob = wrap(res.blob)
        res.arrayBuffer = wrap(res.arrayBuffer)
        return res
      }, (err) => {
        cleanup()
        throw err
      })
    }

    function getModelHint(provider, t) {
      if (typeof t === 'function') {
        const loc = t('modelHint_' + provider)
        if (loc && !loc.startsWith('modelHint_')) return loc
      }
      return MODEL_HINT[provider] || ''
    }

    function createErrorBoundary() {
      if (!React || typeof React.Component !== 'function') {
        return function NoopBoundary(props) { return (props && props.children) || null }
      }
      return class ErrorBoundary extends React.Component {
        constructor(props) {
          super(props)
          this.state = { hasError: false, error: null }
        }
        static getDerivedStateFromError(error) {
          return { hasError: true, error }
        }
        componentDidCatch(error, errorInfo) {
          console.error('[dsh-tts] React Error:', error, errorInfo)
        }
        render() {
          if (this.state.hasError) {
            return React.createElement(
              'div',
              {
                className: 'dts-alert dts-alert-err',
                style: { margin: '12px 0', padding: '14px', borderRadius: '8px' },
              },
              React.createElement('div', { style: { fontWeight: 600, marginBottom: '6px' } }, (typeof fallbackDockText === 'function' ? fallbackDockText('ttsUiError') : '⚠️ TTS UI Error:')),
              React.createElement('div', { style: { fontSize: '12px', wordBreak: 'break-all' } }, String((this.state.error && this.state.error.message) || this.state.error)),
              React.createElement(
                'button',
                {
                  type: 'button',
                  className: 'dts-btn',
                  style: { marginTop: '10px', fontSize: '12px', padding: '4px 10px' },
                  onClick: () => this.setState({ hasError: false, error: null }),
                },
                (typeof fallbackDockText === 'function' ? fallbackDockText('retry') : 'Retry'),
              ),
            )
          }
          return (this.props && this.props.children) || null
        }
      }
    }
    const ErrorBoundary = createErrorBoundary()
    const SNAPSHOT_READY = Object.freeze({ status: 'ready', value: {} })
    const SNAPSHOT_LOADING = Object.freeze({ status: 'loading', value: {} })

    const SET_CSS =
      '.dts-wrap{display:flex;flex-direction:column;gap:18px;padding:4px 0 24px;max-width:900px}' +
      '.dts-header{display:flex;flex-direction:column;gap:8px;padding-bottom:14px;border-bottom:1px solid var(--dsw-alias-border-l2)}' +
      '.dts-page{padding:0}' +
      '.dts-page-title{font-size:20px;font-weight:700;color:var(--dsw-alias-label-primary);display:flex;align-items:center;gap:10px}' +
      '.dts-page-sub{font-size:13px;color:var(--dsw-alias-label-secondary);line-height:1.5}' +
      '.dts-block{border:1px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-layer-3);border-radius:12px;padding:16px 18px;display:flex;flex-direction:column;gap:12px}' +
      '.dts-h{font-size:15px;font-weight:600;color:var(--dsw-alias-label-primary);display:flex;align-items:center;justify-content:space-between}' +
      '.dts-sub{font-size:12px;color:var(--dsw-alias-label-secondary);line-height:1.4}' +
      '.dts-card{border:1px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-layer-3);border-radius:12px;list-style:none}' +
      '.dts-head{appearance:none;width:100%;font:inherit;color:inherit;text-align:left;cursor:pointer;background:0 0;border:0;border-radius:12px;display:flex;align-items:center;gap:12px;padding:14px 16px}' +
      '.dts-headText{flex-direction:column;flex:1;gap:4px;min-width:0;display:flex}' +
      '.dts-title{color:var(--dsw-alias-label-primary);font-size:15px;font-weight:600;line-height:1.4}' +
      '.dts-chev{margin-left:auto;color:var(--dsw-alias-label-secondary);flex:none;transition:transform .16s}' +
      '.dts-chevOpen{transform:rotate(180deg)}' +
      '.dts-body{border-top:1px solid var(--dsw-alias-border-l2);margin:0 16px;padding:12px 0}' +
      '.dts-field{display:flex;flex-direction:column;gap:6px;padding:6px 0;font-size:13px;color:var(--dsw-alias-label-primary)}' +
      '.dts-input{height:34px;border:1px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-layer-2);color:var(--dsw-alias-label-primary);border-radius:8px;padding:0 10px;font-size:13px;box-sizing:border-box}' +
      '.dts-input:focus{outline:none;border-color:var(--dsw-alias-brand-primary, #6366f1)}' +
      '.dts-foot{border-top:1px solid var(--dsw-alias-border-l2);display:flex;justify-content:flex-end;align-items:center;gap:10px;padding:14px 0 4px}' +
      '.dts-save{appearance:none;font:inherit;cursor:pointer;border:1px solid transparent;border-radius:8px;padding:6px 16px;font-size:13px;font-weight:500;background:var(--dsw-alias-label-primary);color:var(--dsw-alias-bg-layer-3);transition:all .15s ease}' +
      '.dts-save:hover:not(:disabled){opacity:0.88}' +
      '.dts-btn{appearance:none;font:inherit;cursor:pointer;border:1px solid var(--dsw-alias-border-l2);border-radius:8px;padding:6px 12px;font-size:13px;background:var(--dsw-alias-bg-layer-2);color:var(--dsw-alias-label-primary);font-weight:500;display:inline-flex;align-items:center;justify-content:center;gap:6px;transition:all .15s ease}' +
      '.dts-btn:hover:not(:disabled){background:var(--dsw-alias-bg-layer-3, var(--dsw-alias-bg-layer-2));border-color:var(--dsw-alias-label-dimmed, var(--dsw-alias-border-l2))}' +
      '.dts-btn-danger{color:var(--dsw-alias-state-error-primary);border-color:color-mix(in srgb, var(--dsw-alias-state-error-primary) 30%, transparent)}' +
      '.dts-btn-danger:hover:not(:disabled){background:color-mix(in srgb, var(--dsw-alias-state-error-primary) 12%, transparent);border-color:color-mix(in srgb, var(--dsw-alias-state-error-primary) 50%, transparent)}' +
      '.dts-entry{display:flex;flex-direction:column;gap:8px;padding:12px;border:1px solid var(--dsw-alias-border-l2);border-radius:8px;background:var(--dsw-alias-bg-layer-2)}' +
      '.dts-row{display:flex;gap:8px;align-items:center;flex-wrap:wrap}' +
      '.dts-row .dts-model{flex:1;min-width:120px}' +
      '.dts-row .dts-key{flex:1;min-width:180px}' +
      '.dts-mini{border:1px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-layer-2);color:var(--dsw-alias-label-primary);border-radius:6px;width:28px;height:28px;cursor:pointer;flex:none;display:inline-flex;align-items:center;justify-content:center;font-size:13px;transition:all .15s ease}' +
      '.dts-mini:hover:not(:disabled){background:var(--dsw-alias-bg-layer-3, var(--dsw-alias-bg-layer-2))}' +
      '.dts-ok{font-size:12px;color:var(--dsw-alias-state-success-primary);font-weight:500}' +
      '.dts-bad{font-size:12px;color:var(--dsw-alias-state-error-primary);font-weight:500}' +
      '.dts-badge{font-size:11px;padding:3px 8px;border-radius:999px;border:1px solid var(--dsw-alias-border-l2);color:var(--dsw-alias-label-secondary);white-space:nowrap;display:inline-flex;align-items:center;gap:4px;font-weight:500}' +
      '.dts-badge-on{color:var(--dsw-alias-state-success-primary);border-color:var(--dsw-alias-state-success-primary);background:color-mix(in srgb, var(--dsw-alias-state-success-primary) 8%, transparent)}' +
      '.dts-badge-warn{color:var(--dsw-alias-state-warn-primary, #f59e0b);border-color:var(--dsw-alias-state-warn-primary, #f59e0b);background:color-mix(in srgb, var(--dsw-alias-state-warn-primary, #f59e0b) 8%, transparent)}' +
      '.dts-badge-bad{color:var(--dsw-alias-state-error-primary);border-color:var(--dsw-alias-state-error-primary);background:color-mix(in srgb, var(--dsw-alias-state-error-primary) 8%, transparent)}' +
      '.dts-link{background:none;border:none;color:var(--dsw-alias-label-secondary);cursor:pointer;font-size:12px;padding:0;text-decoration:underline}' +
      '.dts-link:hover:not(:disabled){color:var(--dsw-alias-label-primary)}' +
      '.dts-alert{padding:10px 14px;border-radius:8px;font-size:13px}' +
      '.dts-alert-err{background:color-mix(in srgb, var(--dsw-alias-state-error-primary) 10%, transparent);color:var(--dsw-alias-state-error-primary);border:1px solid color-mix(in srgb, var(--dsw-alias-state-error-primary) 20%, transparent)}' +
      '.dts-alert-warn{background:color-mix(in srgb, var(--dsw-alias-state-warn-primary, #f59e0b) 10%, transparent);color:var(--dsw-alias-state-warn-primary, #f59e0b);border:1px solid color-mix(in srgb, var(--dsw-alias-state-warn-primary, #f59e0b) 20%, transparent)}' +
      '.dts-alert-ok{background:color-mix(in srgb, var(--dsw-alias-state-success-primary) 10%, transparent);color:var(--dsw-alias-state-success-primary);border:1px solid color-mix(in srgb, var(--dsw-alias-state-success-primary) 20%, transparent)}' +
      '.dts-grow{flex:1;min-width:100px}'

    const setCssId = 'dsh-tts/settings.module.css'
    if (typeof document !== 'undefined' && !document.querySelector('style[data-dsh-plugin="dsh-tts"]')) {
      const tag = document.createElement('style')
      tag.textContent = SET_CSS
      tag.setAttribute('data-dsh-plugin', 'dsh-tts')
      tag.dataset.pluginCss = setCssId
      document.head.appendChild(tag)
    }
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

        let clearGestureListeners = null
    function removeGestureListeners() {
      if (typeof clearGestureListeners === 'function') {
        clearGestureListeners()
        clearGestureListeners = null
      }
    }

    function unlockAudio() {
      removeGestureListeners()
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
                removeGestureListeners()
                const onUserGesture = () => {
                  removeGestureListeners()
                  unlockAudio()
                }
                window.addEventListener('click', onUserGesture, { once: true })
                window.addEventListener('keydown', onUserGesture, { once: true })
                window.addEventListener('touchstart', onUserGesture, { once: true })
                clearGestureListeners = () => {
                  window.removeEventListener('click', onUserGesture)
                  window.removeEventListener('keydown', onUserGesture)
                  window.removeEventListener('touchstart', onUserGesture)
                }
              }
              resolve()
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
      removeGestureListeners()
      player.blocked = false
      setAutoplayBlocked(false)
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
      try {
        if (typeof window !== 'undefined' && window.speechSynthesis) {
          window.speechSynthesis.cancel()
        }
      } catch (_err) { /* no speechSynthesis */ }
      if (player.audio) {
        try {
          player.audio.pause()
          player.audio.currentTime = 0
        } catch (_err) { /* ignore pause error */ }
      }
      if (currentAudioResolve) {
        currentAudioResolve()
      } else {
        player.audio = null
        player.busy = false
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
        if (!player.bargeIn || player.vadBargeIn === false) return
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
        } catch (_err) { /* ignore malformed chime payload */ }
      }

      const connect = () => {
        if (sseDisposed) return
        if (activeSse) {
          try { activeSse.close() } catch (_err) { /* active sse already closed */ }
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
              try { es.close() } catch (_err) { /* eventsource already closed */ }
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
          try { activeSse.close() } catch (_err) { /* active sse already closed on dispose */ }
          activeSse = null
        }
      }
    }

    async function pollPending() {
      try {
        const st = await clientFetch('/dsh-tts/status', { cache: 'no-store', timeoutMs: 8000 })
        if (!st.ok) return
        const meta = await st.json()
        player.enabled = !!(meta && meta.speakReplies)
        if (meta && typeof meta.rate === 'number') player.rate = meta.rate
        if (meta && meta.chime) player.chime = meta.chime
        if (meta && meta.roles) player.roles = meta.roles
        if (meta && typeof meta.bargeIn === 'boolean') player.bargeIn = meta.bargeIn
        if (meta && typeof meta.vadBargeIn === 'boolean') player.vadBargeIn = meta.vadBargeIn
        if (!player.enabled) return
        const res = await clientFetch('/dsh-tts/pending?after=' + encodeURIComponent(player.after || ''), { cache: 'no-store', timeoutMs: 8000 })
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
      clientFetch('/dsh-tts/speak', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text, channel: 'web' }),
        timeoutMs: 15000,
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
        .catch((err) => {
          console.warn('[dsh-tts] playStandalone fetch failed:', err)
        })
    }

    function previewSpeech(provider, model, voice, text) {
      stopPlayback()
      return clientFetch('/dsh-tts/preview', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ provider, model, voice, text }),
        timeoutMs: 15000,
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
      clientFetch('/dsh-tts/speak', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: phrase, channel: 'web' }),
        timeoutMs: 15000,
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
    const en = {
      'ttsUiError': '⚠️ TTS UI Error:',
      'modelHint_openai': 'provider default',
      'modelHint_elevenlabs': 'provider default',
      'modelHint_google': 'provider default',
      'modelHint_azure': 'region voice name',
      'modelHint_groq': 'provider default',
      'modelHint_deepgram': 'provider default (English-only voices)',
      'modelHint_openrouter': 'provider/model id',
      'modelHint_siliconflow': 'model id (e.g. FunAudioLLM/CosyVoice2-0.5B)',
      'modelHint_deepinfra': 'model id (e.g. hexgrad/Kokoro-82M)',
      'modelHint_fireworks': 'model id (e.g. kokoro)',
      'modelHint_mimo': 'model id (e.g. mimo-v2.5-tts)',
      'modelHint_custom': 'custom model',
      'modelHint_minimax': 'model id',
      'modelHint_edge': 'BCP-47 voice, e.g. en-US-AriaNeural',
      'modelHint_piper': 'path to .onnx',
      'modelHint_espeak': 'language code, e.g. en',
      'modelHint_kokoro': 'not bundled — offline neural runtime unavailable',
      'modelHint_f5': 'not bundled — offline neural runtime unavailable',
      'dockLabel': 'Speech',
      'dockPause': 'Pause',
      'dockResume': 'Resume speech',
      'dockStop': 'Stop speech',
      'dockCurrent': 'Now speaking',
      'dockNone': 'Waiting for speech',
      'dockQueue': 'Queue',
      'dockClearQueue': 'Clear queue',
      'dockReplay': 'Replay',
      'dockFavorite': 'Favorite',
      'dockUnfavorite': 'Unfavorite',
      'dockFavorites': 'Favorite clips',
      'exportAudio': 'Export audio clip',
      'exportSuccess': 'Audio exported',
      'statusOnline': 'Host online',
      'recent': 'Recent',
      'recentEmpty': 'No recent speech yet',
      'retry': 'Retry',
      'advancedCollapsed': 'Advanced',
      'confirmClearCache': 'Clear the synthesis cache? This cannot be undone.',
      'confirmDeleteModel': 'Delete downloaded weights for this engine?',
      'autoplayBlocked': 'Sound is blocked until you click or tap once',
      'enableSound': 'Enable sound',
      'runtimeNotBundled': 'Neural inference runtime is not bundled',
      'runtimeNotBundledHint': 'Install weights does not enable speech. Use Edge, Piper, or eSpeak for offline TTS.',
      'testProvider': 'Test provider',
      'breakerOpen': 'Circuit open',
      'lastError': 'Last error',
      'activeProvider': 'Active provider',
      'queueLen': 'Queue',
      'sseState': 'SSE',
      'currentVoice': 'Voice',
      'statusOffline': 'Host unreachable',
      'cacheStats': 'Cache',
      'general': 'General',
      'loading': 'Loading…',
      'chainHintCard': 'Pick a provider, paste its API key, and Save (or leave the key field). The key is written to the host credentials store immediately. The browser never reads it back.',
      'speakRepliesHint': 'When on, each finished reply is synthesized on the host and played in this browser. Audio is not sent back to the model.',
      'chainHint': 'Top to bottom is the fallback order. Cloud keys are saved to the host credentials store, never into plugin settings.',
      'title': 'Speech',
      'speakReplies': 'Speak agent replies',
      'speakAsItGoes': 'Speak as it goes',
      'speakAsItGoesHint': 'Read each reply the moment it lands, sentence by sentence, instead of waiting for the whole turn.',
      'rate': 'Playback speed',
      'rateHint': '0.5 to 2. Synthesis is untouched; the browser plays faster or slower.',
      'bargeIn': 'Fall silent when you speak',
      'bargeInHint': 'Stop reading the moment the microphone opens.',
      'announce': 'Announce approvals',
      'announceHint': 'Say it out loud and play a chime when the agent stops for an approval or asks a question.',
      'approvalText': 'Approval wording',
      'approvalHint': 'Said when an approval is asked for; the tool name is appended.',
      'questionText': 'Question wording',
      'questionHint': 'Said when the agent asks a question. Empty disables it.',
      'chime': 'Chime',
      'chimeHint': 'ding, beep or none.',
      'language': 'Language',
      'languageHint': 'Hint for voices that need a locale (eSpeak, Azure SSML).',
      'piperModel': 'Piper model path',
      'piperModelHint': 'Absolute path to an ONNX model. Leave empty to skip Piper.',
      'piperBin': 'Piper binary',
      'binHint': 'Looked up in PATH unless absolute.',
      'espeakBin': 'eSpeak binary',
      'espeakHint': 'Usually espeak-ng.',
      'edgeBin': 'edge-tts binary',
      'edgeHint': 'Python CLI from the edge-tts package.',
      'azureRegion': 'Azure region',
      'azureHint': 'Required for the azure provider, e.g. eastus.',
      'openaiBaseUrl': 'OpenAI base URL',
      'openaiBaseUrlHint': 'OpenAI-compatible origin for the openai provider.',
      'mimoBaseUrl': 'MiMo base URL',
      'mimoBaseUrlHint': 'MiMo API root; synthesis uses its chat endpoint.',
      'mimoFormat': 'MiMo format',
      'mimoFormatHint': 'mp3 or wav.',
      'minimaxBin': 'MiniMax CLI',
      'minimaxBinHint': 'Looked up in PATH unless absolute; install and log in separately.',
      'advancedTitle': 'Advanced',
      'advancedHint': 'Limits and endpoint overrides. Provider API keys stay in the chain editor; credential slot names (*KeyEnv) are config-only.',
      'maxChars': 'Max characters',
      'maxCharsHint': 'Hard cap before long-reply handling; 0 disables.',
      'sentenceChars': 'Sentence chunk size',
      'sentenceCharsHint': 'Max characters per streaming sentence piece.',
      'timeoutMs': 'Provider timeout (ms)',
      'timeoutMsHint': 'Abort a provider attempt after this many milliseconds.',
      'maxQueue': 'Max queue length',
      'maxQueueHint': 'Drop oldest pending pieces beyond this count.',
      'chainTitle': 'Provider chain',
      'addProvider': 'Add provider',
      'localProvider': 'Local / CLI provider — no API key',
      'configured': 'Configured',
      'notSet': 'Not set',
      'fromEnv': 'Set in environment',
      'clear': 'Clear',
      'remove': 'Remove',
      'up': 'Up',
      'down': 'Down',
      'save': 'Save',
      'saved': 'Saved',
      'cardHint': 'Provider chain, voices and playback options.',
      'skipCode': 'Skip code blocks',
      'skipCodeHint': 'Say a short notice instead of reading code aloud.',
      'cache': 'Synthesis cache',
      'cacheHint': 'Reuse synthesized audio for repeated phrases.',
      'cacheMaxMb': 'Cache size limit, MB',
      'cacheMaxMbHint': 'Least recently used items are evicted first.',
      'clearCache': 'Clear cache',
      'pronTitle': 'Pronunciation',
      'pronHint': 'Rules run top-down. Wrap left side in /…/ for a regex; Lang filters the rule.',
      'pronFrom': 'Replace',
      'pronTo': 'With',
      'pronWhole': 'Whole word',
      'pronLang': 'Lang',
      'addRule': 'Add rule',
      'rolesTitle': 'Voice roles',
      'rolesHint': 'Empty fields inherit the main chain.',
      'roleReply': 'Reply',
      'roleApproval': 'Approval',
      'roleError': 'Error',
      'ssmlStyle': 'SSML tone style',
      'ssmlStyleHint': 'Expressive tone (e.g. cheerful, serious, empathetic).',
      'longReply': 'Long replies',
      'longReplyHint': 'truncate: cut at the limit; summarize: short retelling; full: read everything.',
      'summaryModel': 'Summary model',
      'summaryModelHint': 'provider/model, empty = conversation default.',
      'summarySentences': 'Retelling length',
      'summarySentencesHint': 'Sentences in the spoken retelling.',
      'preview': 'Preview',
      'statsTitle': 'Statistics',
      'statTotal': 'Total',
      'statHits': 'Cache hits',
      'statErrors': 'Errors',
      'statReset': 'Reset stats',
      'autoDetect': 'Auto language per piece',
      'autoDetectHint': 'Guess zh/en per spoken piece instead of the language setting.',
      'narrateQuotesOnly': 'Only quotes',
      'narrateQuotesHint': 'Read only «quoted» fragments of a reply.',
      'skipActions': 'Skip *actions*',
      'skipActionsHint': 'Drop asterisk action blocks.',
      'removeRegex': 'Remove regex',
      'removeRegexHint': 'Global regex; matches are removed before synthesis.',
      'customBaseUrl': 'Custom TTS endpoint',
      'customBaseUrlHint': 'OpenAI-compatible origin, e.g. http://localhost:8880/v1; empty = off.',
      'customKeyEnv': 'Custom key env',
      'customKeyEnvHint': 'Credential name for the custom endpoint bearer key.',
      'localEnginesTitle': 'Local Engines (Offline)',
      'localEnginesHint': 'Run speech synthesis 100% offline without API keys.',
      'enableLocalEngines': 'Enable local engines',
      'enableLocalEnginesHint': 'Use Kokoro or F5-TTS when installed.',
      'streamingEnabled': 'Instant streaming (< 300 ms)',
      'streamingEnabledHint': 'Play audio via AudioWorklet and SSE in real-time.',
      'useKokoro': 'Enable Kokoro-82M (CPU)',
      'useKokoroHint': 'Fast neural synthesis on CPU.',
      'useF5': 'Enable F5-TTS (GPU)',
      'useF5Hint': 'High-fidelity zero-shot synthesis on NVIDIA GPU.',
      'installed': 'Installed',
      'notInstalled': 'Not installed',
      'downloading': 'Downloading',
      'installKokoro': 'Install (350 MB)',
      'installF5': 'Install (2.1 GB)',
      'deleteModel': 'Delete',
      'voiceDuplexTitle': 'Voice Duplex (Voice-to-Voice)',
      'voiceDuplexHint': 'Interactive voice conversation integrated with dsh-voice.',
      'voiceNotInstalledTitle': 'Required plugin @goodandready/dsh-voice is not installed',
      'voiceInstallHint': 'To enable voice duplex, install the plugin with',
      'voiceDuplex': 'Voice-to-Voice mode',
      'voiceDuplexHintToggle': 'Automatically synthesize agent reply when finished talking.',
      'vadBargeIn': 'VAD Barge-in',
      'vadBargeInHint': 'Mute speech synthesis immediately when user voice is detected.',
      'newSubagentRole': 'Subagent name (e.g. coder, reviewer)',
      'addSubagentRole': 'Add Subagent',
      'autoDetectSubagent': 'Auto-detect subagent roles',
      'role_coder': 'Coder',
      'role_reviewer': 'Reviewer',
      'role_planner': 'Planner',
      'enableItDictionary': 'Built-in IT dictionary',
      'enableItDictionaryHint': 'Auto-correct pronunciation for SQL, Nginx, K8s, Docker, API, JSON, YAML, etc.',
      'loadItDictionary': 'Populate IT terms',
      'previewRule': 'Listen',
      'messengerIntegrationTitle': 'Messenger Integration (Telegram, Discord)',
      'messengerIntegrationHint': 'Voice replies and notes sent through @goodandready/dsh-messenger-gateway.',
      'messengerNotInstalledTitle': 'Required plugin @goodandready/dsh-messenger-gateway is not installed',
      'messengerInstallHint': 'To enable voice replies in messengers, install the plugin with',
      'messengerTtsEnabled': 'Voice replies in messengers',
      'messengerTtsEnabledHint': 'Allow the messenger gateway to deliver replies as voice notes.',
      'updaterTitle': 'Plugin Updates',
      'updaterCheck': 'Check updates',
      'updaterChecking': 'Checking…',
      'updaterCurrent': 'Current version',
      'updaterLatest': 'Latest version',
      'updaterUpToDate': 'Up to date',
      'updaterUpdateNow': 'Update to v{version}',
      'updaterUpdating': 'Updating…',
      'updaterSuccess': 'Plugin updated successfully! Please restart DSH service.',
      'updaterFailed': 'Update check failed: ',
      'exportJson': '📥 Export JSON',
      'importJson': '📤 Import JSON',
      'invalidJsonFormat': 'Invalid dictionary JSON format',
      'subtitle': 'Text-to-speech for DeepSeek Harness',
      'available': 'available',
      'dockSkip': 'Skip',
      'longReplyTruncate': 'Truncate',
      'longReplySummarize': 'Summarize',
      'longReplyFull': 'Full',
      'unlockAudio': 'Click to unlock audio',
      'errorLoading': 'Error loading settings: ',
    }

    const zh = {
      'ttsUiError': '⚠️ TTS 界面错误：',
      'modelHint_openai': '服务商默认',
      'modelHint_elevenlabs': '服务商默认',
      'modelHint_google': '服务商默认',
      'modelHint_azure': '区域语音名称',
      'modelHint_groq': '服务商默认',
      'modelHint_deepgram': '服务商默认 (仅英语语音)',
      'modelHint_openrouter': '服务商/模型 ID',
      'modelHint_siliconflow': '模型 ID (如 FunAudioLLM/CosyVoice2-0.5B)',
      'modelHint_deepinfra': '模型 ID (如 hexgrad/Kokoro-82M)',
      'modelHint_fireworks': '模型 ID (如 kokoro)',
      'modelHint_mimo': '模型 ID (如 mimo-v2.5-tts)',
      'modelHint_custom': '自定义模型',
      'modelHint_minimax': '模型 ID',
      'modelHint_edge': 'BCP-47 语音名称，如 en-US-AriaNeural',
      'modelHint_piper': '.onnx 模型文件路径',
      'modelHint_espeak': '语言代码，如 en',
      'modelHint_kokoro': '未内置 — 离线神经语音运行时不可用',
      'modelHint_f5': '未内置 — 离线神经语音运行时不可用',
      'dockLabel': '语音朗读',
      'dockPause': '暂停朗读',
      'dockResume': '继续朗读',
      'dockStop': '停止朗读',
      'dockCurrent': '当前朗读',
      'dockNone': '等待语音',
      'dockQueue': '队列',
      'dockClearQueue': '清空队列',
      'dockReplay': '重新朗读',
      'dockFavorite': '收藏',
      'dockUnfavorite': '取消收藏',
      'dockFavorites': '收藏语音',
      'exportAudio': '导出语音片段',
      'exportSuccess': '音频已导出',
      'statusOnline': '服务在线',
      'recent': '最近朗读',
      'recentEmpty': '暂无朗读记录',
      'retry': '重试',
      'advancedCollapsed': '高级设置',
      'confirmClearCache': '确定清除语音合成缓存吗？此操作无法撤销。',
      'confirmDeleteModel': '确定删除该引擎已下载的模型权重吗？',
      'autoplayBlocked': '声音已受系统限制，请点击任意位置以激活音频',
      'enableSound': '开启声音',
      'runtimeNotBundled': '未捆绑神经推理运行时',
      'runtimeNotBundledHint': '仅下载权重无法直接合成。建议使用 Edge、Piper 或 eSpeak 进行离线语音合成。',
      'testProvider': '测试服务商',
      'breakerOpen': '熔断中',
      'lastError': '最近错误',
      'activeProvider': '当前服务商',
      'queueLen': '队列长度',
      'sseState': 'SSE状态',
      'currentVoice': '发音人',
      'statusOffline': '服务不可达',
      'cacheStats': '缓存统计',
      'general': '常规设置',
      'loading': '加载中…',
      'chainHintCard': '选择服务商，粘贴 API Key 并保存。密钥将直接写入服务端安全凭证库，前端不会回显。',
      'speakRepliesHint': '启用后，智能体回复将在服务端合成语音并在当前浏览器中播放。音频不会回传至模型。',
      'chainHint': '从上到下为降级候选顺序。云端密钥直接保存在服务端凭证中心，绝不存入插件公开设置中。',
      'title': '语音朗读 (TTS)',
      'speakReplies': '朗读智能体回复',
      'speakAsItGoes': '流式逐句朗读',
      'speakAsItGoesHint': '模型输出时按句子即时流式朗读，无需等待整段内容生成完毕。',
      'rate': '播放语速',
      'rateHint': '0.5 到 2.0 倍速。服务端按标准速度合成，由浏览器调整播放速率。',
      'bargeIn': '打断静音 (Barge-in)',
      'bargeInHint': '当麦克风开启或检测到说话时立即中断朗读。',
      'announce': '重要事件播报',
      'announceHint': '当智能体等待用户审批或提出问题时，播放提示音并语音播报。',
      'approvalText': '审批提示语',
      'approvalHint': '请求审批时播报的短语，会自动附带工具名称。',
      'questionText': '提问提示语',
      'questionHint': '智能体提问时播报的前导短语。留空则直接读出问题。',
      'chime': '提示音效',
      'chimeHint': '可选 ding、beep 或无。',
      'language': '语言选择',
      'languageHint': '针对需要指定语言的服务商（如 eSpeak 或 Azure SSML）。',
      'piperModel': 'Piper 模型路径',
      'piperModelHint': 'ONNX 模型的绝对路径。留空则跳过 Piper。',
      'piperBin': 'Piper 可执行文件',
      'binHint': '默认从 PATH 查找，除非指定绝对路径。',
      'espeakBin': 'eSpeak 可执行文件',
      'espeakHint': '通常为 espeak-ng。',
      'edgeBin': 'edge-tts 可执行文件',
      'edgeHint': 'Python edge-tts 命令行工具。',
      'azureRegion': 'Azure 区域',
      'azureHint': 'Azure 语音服务所在区域，例如 eastus。',
      'openaiBaseUrl': 'OpenAI API 地址',
      'openaiBaseUrlHint': '兼容 OpenAI 的 TTS 接口地址。',
      'mimoBaseUrl': 'MiMo API 地址',
      'mimoBaseUrlHint': 'MiMo 接口根地址，通过其对话接口提取语音。',
      'mimoFormat': 'MiMo 音频格式',
      'mimoFormatHint': 'mp3 或 wav。',
      'minimaxBin': 'MiniMax CLI 路径',
      'minimaxBinHint': '默认从 PATH 查找，需提前安装并登录。',
      'advancedTitle': '高级参数',
      'advancedHint': '字符上限与接口重定向。API 密钥在候选链中维护，凭证环境变量仅在后台生效。',
      'maxChars': '最大字符上限',
      'maxCharsHint': '触发长文本截断或摘要的硬性上限；0 表示无限制。',
      'sentenceChars': '单句切片大小',
      'sentenceCharsHint': '流式语音合成中单句的最大字符长度。',
      'timeoutMs': '服务商超时 (毫秒)',
      'timeoutMsHint': '单次语音合成请求超时时间，超时后自动切换下一服务商。',
      'maxQueue': '最大队列长度',
      'maxQueueHint': '超出该长度时丢弃最旧的未播放语音片段。',
      'chainTitle': '服务商降级链 (Fallback Chain)',
      'addProvider': '添加服务商',
      'localProvider': '本地 / CLI 服务商（无需 API 密钥）',
      'configured': '已配置',
      'notSet': '未设置',
      'fromEnv': '来自环境变量',
      'clear': '清空',
      'remove': '移除',
      'up': '上移',
      'down': '下移',
      'save': '保存设置',
      'saved': '已保存',
      'cardHint': '配置服务商降级顺序、发音人与朗读参数。',
      'skipCode': '跳过代码块',
      'skipCodeHint': '遇到代码块时朗读简短提示，而不逐行朗读代码字符。',
      'cache': '合成音频缓存',
      'cacheHint': '重复短语直接从本地缓存读取，无需重复合成。',
      'cacheMaxMb': '缓存上限 (MB)',
      'cacheMaxMbHint': '超出容量时优先淘汰最近最少使用 (LRU) 的音频。',
      'clearCache': '清空缓存',
      'pronTitle': '发音纠正字典',
      'pronHint': '规则自上而下匹配。左侧支持 /…/ 正则表达式；支持按语言过滤。',
      'pronFrom': '原词',
      'pronTo': '替换为',
      'pronWhole': '全词匹配',
      'pronLang': '语言',
      'addRule': '添加规则',
      'rolesTitle': '角色专属音色',
      'rolesHint': '留空项将自动继承主服务商配置。',
      'roleReply': '普通回复',
      'roleApproval': '操作审批',
      'roleError': '系统错误',
      'ssmlStyle': '情感语调 (SSML)',
      'ssmlStyleHint': '情绪语调风格（如 cheerful、serious、empathetic 等）。',
      'longReply': '长回复处理',
      'longReplyHint': 'truncate: 截断超长部分; summarize: 智能生成简述; full: 完整朗读全文。',
      'summaryModel': '摘要生成模型',
      'summaryModelHint': 'provider/model 格式，留空则跟随当前对话模型。',
      'summarySentences': '摘要句数',
      'summarySentencesHint': '语音朗读所采用的摘要句子数量。',
      'preview': '试听',
      'statsTitle': '实时统计',
      'statTotal': '总请求数',
      'statHits': '缓存命中',
      'statErrors': '合成失败',
      'statReset': '重置统计',
      'autoDetect': '按句自动识别语种',
      'autoDetectHint': '每句根据字符特征自动推测语言，而非强制使用全局设定。',
      'narrateQuotesOnly': '仅朗读引用内容',
      'narrateQuotesHint': '仅朗读正文中用引号括起来的引用短语。',
      'skipActions': '跳过 *星号动作*',
      'skipActionsHint': '自动剔除 *动作说明* 文本。',
      'removeRegex': '自定义正则过滤',
      'removeRegexHint': '在合成前由全局正则表达式匹配并剔除匹配文本。',
      'customBaseUrl': '自定义 TTS API 地址',
      'customBaseUrlHint': '兼容 OpenAI 的接口地址，如 http://localhost:8880/v1；留空禁用。',
      'customKeyEnv': '自定义接口凭据名',
      'customKeyEnvHint': '用于存储自定义接口 Bearer Token 的凭证槽位名称。',
      'localEnginesTitle': '本地离线引擎 (Offline)',
      'localEnginesHint': '在本地离线运行语音合成，无需 API 密钥与互联网。',
      'enableLocalEngines': '启用本地引擎',
      'enableLocalEnginesHint': '检测并调用本地 Kokoro 或 F5-TTS 模型。',
      'streamingEnabled': '毫秒级低延迟流式 (< 300 ms)',
      'streamingEnabledHint': '利用 AudioWorklet 和 SSE 实时输出流式音频。',
      'useKokoro': '启用 Kokoro-82M (CPU)',
      'useKokoroHint': '基于 CPU 的轻量级快速神经语音合成。',
      'useF5': '启用 F5-TTS (GPU)',
      'useF5Hint': '基于 NVIDIA GPU 的高保真零样本克隆语音合成。',
      'installed': '已就绪',
      'notInstalled': '未安装',
      'downloading': '下载中',
      'installKokoro': '安装权重 (350 MB)',
      'installF5': '安装权重 (2.1 GB)',
      'deleteModel': '删除模型',
      'voiceDuplexTitle': '双工语音对话 (Voice-to-Voice)',
      'voiceDuplexHint': '与 dsh-voice 协同提供全双工交互式对话。',
      'voiceNotInstalledTitle': '依赖插件 @goodandready/dsh-voice 尚未安装',
      'voiceInstallHint': '如需启用语音对话，请通过以下命令安装该插件：',
      'voiceDuplex': '语音双工模式',
      'voiceDuplexHintToggle': '用户语音输入结束后，自动使用语音朗读回复。',
      'vadBargeIn': 'VAD 语音打断',
      'vadBargeInHint': '检测到人类语音时立即终止智能体当前语音输出。',
      'newSubagentRole': '子智能体标识 (例如 coder, reviewer)',
      'addSubagentRole': '添加子智能体',
      'autoDetectSubagent': '自动感应会话中的子智能体角色',
      'role_coder': '编码助手 (Coder)',
      'role_reviewer': '代码评审 (Reviewer)',
      'role_planner': '架构规划 (Planner)',
      'enableItDictionary': '内置 IT 术语发音校正',
      'enableItDictionaryHint': '自动纠正 SQL、Nginx、K8s、Docker、API、JSON、YAML 等专有名词发音。',
      'loadItDictionary': '填入常用 IT 术语',
      'exportJson': '📥 导出 JSON',
      'importJson': '📤 导入 JSON',
      'invalidJsonFormat': '无效的字典 JSON 格式',
      'previewRule': '试听发音',
      'messengerIntegrationTitle': '即时通讯联动 (Telegram, Discord)',
      'messengerIntegrationHint': '通过 @goodandready/dsh-messenger-gateway 向聊天群组发送语音回复。',
      'messengerNotInstalledTitle': '依赖插件 @goodandready/dsh-messenger-gateway 尚未安装',
      'messengerInstallHint': '如需向聊天软件发送语音回复，请运行：',
      'messengerTtsEnabled': '群组语音回复',
      'messengerTtsEnabledHint': '允许网关将回复以语音便签 (Voice Note) 形式发送。',
      'updaterTitle': '插件更新',
      'updaterCheck': '检查更新',
      'updaterChecking': '正在检查…',
      'updaterCurrent': '当前版本',
      'updaterLatest': '最新版本',
      'updaterUpToDate': '已是最新',
      'updaterUpdateNow': '一键更新至 v{version}',
      'updaterUpdating': '正在更新…',
      'updaterSuccess': '插件更新成功！请重启 DSH 服务以生效。',
      'updaterFailed': '更新检查失败：',
      'subtitle': 'DeepSeek Harness 语音合成插件',
      'available': '可用',
      'dockSkip': '跳过',
      'longReplyTruncate': '截断',
      'longReplySummarize': '总结',
      'longReplyFull': '完整朗读',
      'unlockAudio': '点击解锁音频',
      'errorLoading': '加载设置失败：',
    }
    function ChainEditor(props) {
      // Translator comes from the card: the slot passes props.t only to it.
      const t = props.t || ((key) => key)
      const rows = Array.isArray(props.value) ? props.value : []
      const change = (i, patch) => {
        const next = rows.map((r, k) => (k === i ? Object.assign({}, r, patch) : r))
        props.onChange(next)
      }
      const move = (i, delta) => {
        const j = i + delta
        if (j < 0 || j >= rows.length) return
        const next = rows.slice()
        const tmp = next[i]; next[i] = next[j]; next[j] = tmp
        props.onChange(next)
      }
      const remove = (i) => props.onChange(rows.filter((_, k) => k !== i))
      const add = () => props.onChange(rows.concat([{ provider: 'espeak', model: '', voice: '' }]))
      return React.createElement('div', { className: 'dts-block' },
        rows.map((row, i) => {
          const cloud = !!CLOUD[row.provider]
          const cred = credOf(props.credentials, row.provider)
          const draft = (props.keyDrafts && props.keyDrafts[row.provider]) || ''
          const badge = !cloud ? null
            : (!cred.writable ? t('fromEnv') : (cred.configured ? t('configured') : t('notSet')))
          return React.createElement('div', { className: 'dts-entry', key: i },
            React.createElement('div', { className: 'dts-row' },
              React.createElement('select', {
                className: 'dts-input',
                value: row.provider, disabled: !props.writable,
                onChange: (e) => change(i, { provider: e.target.value }),
              }, PROVIDERS.map((p) => React.createElement('option', { key: p, value: p }, p))),
              React.createElement('input', {
                className: 'dts-model dts-input', value: row.model || '', disabled: !props.writable,
                placeholder: (typeof getModelHint === 'function' ? getModelHint(row.provider, t) : (MODEL_HINT[row.provider] || '')), onChange: (e) => change(i, { model: e.target.value }),
              }),
              React.createElement('input', {
                className: 'dts-model dts-input', value: row.voice || '', disabled: !props.writable,
                placeholder: 'voice', onChange: (e) => change(i, { voice: e.target.value }),
              }),
              React.createElement('button', { type: 'button', className: 'dts-mini', title: t('up'), disabled: !props.writable, onClick: () => move(i, -1) }, '\u2191'),
              React.createElement('button', { type: 'button', className: 'dts-mini', title: t('down'), disabled: !props.writable, onClick: () => move(i, 1) }, '\u2193'),
              React.createElement('button', { type: 'button', className: 'dts-mini', title: t('testProvider') || t('preview'), disabled: !props.writable, onClick: () => props.onPreview(row.provider, row.model, row.voice) }, '\u25b6'),
              React.createElement('button', { type: 'button', className: 'dts-mini', title: t('remove'), disabled: !props.writable, onClick: () => remove(i) }, '\u00d7'),
            ),
            cloud ? React.createElement('div', { className: 'dts-row' },
              React.createElement('input', {
                className: 'dts-key dts-input', type: 'password', autoComplete: 'off',
                value: draft, disabled: !props.writable || !cred.writable,
                placeholder: cred.configured ? 'leave blank to keep' : 'paste API key',
                onChange: (e) => props.onDraft(row.provider, e.target.value),
                onBlur: (e) => props.onCommitKey(row.provider, e.target.value),
              }),
              React.createElement('span', { className: 'dts-badge' + (cred.configured ? ' dts-badge-on' : '') }, badge),
              cred.configured && cred.writable ? React.createElement('button', {
                type: 'button', className: 'dts-link', disabled: !props.writable,
                onClick: () => props.onClearKey(row.provider),
              }, t('clear')) : null,
            ) : React.createElement('span', { className: 'dts-sub' }, t('localProvider')),
            cloud && cred.ref ? React.createElement('span', { className: 'dts-sub' }, 'Stored as ' + cred.ref) : null,
            (() => {
              const hit = Array.isArray(props.breaker) ? props.breaker.find((b) => b && b.id === row.provider) : null
              if (!hit || (!hit.open && !hit.lastError)) return null
              return React.createElement('div', { className: 'dts-sub dts-bad' },
                (hit.open ? t('breakerOpen') + ' · ' : '') + (hit.lastError || '')
              )
            })(),
          )
        }),
        React.createElement('div', { className: 'dts-row' },
          React.createElement('button', { type: 'button', className: 'dts-mini', title: t('addProvider'), disabled: !props.writable, onClick: add }, '+'),
          React.createElement('span', { className: 'dts-sub' }, t('chainHint')),
        ),
      )
    }

    // Card strings live in the locale registry so a separate package can translate
    // them without touching this plugin. English is the source language and fallback.

    function LocalEnginesEditor(props) {
      const t = props.t || ((key) => key)
      const [models, setModels] = React.useState({})

      const loadStatus = React.useCallback(() => {
        if (typeof clientFetch === 'undefined' && typeof fetch === 'undefined') return
        clientFetch('/dsh-tts/models/status', { timeoutMs: 8000 })
          .then((r) => r.json())
          .then((d) => { if (d && d.ok && d.models) setModels(d.models) })
          .catch(() => {}) // status poll best-effort
      }, [])

      React.useEffect(() => {
        loadStatus()
        const timer = setInterval(loadStatus, 5000)
        return () => clearInterval(timer)
      }, [loadStatus])

      const remove = (engine) => {
        if (typeof window !== 'undefined' && window.confirm) {
          if (!window.confirm(t('confirmDeleteModel'))) return
        }
        clientFetch('/dsh-tts/models/delete', {
          method: 'DELETE',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ engine }),
          timeoutMs: 10000,
        }).then(() => loadStatus()).catch((err) => {
          console.warn('[dsh-tts] model delete failed:', err)
        })
      }

      const kokoro = models.kokoro || { installed: false, downloading: false, progress: 0 }
      const f5 = models.f5 || { installed: false, downloading: false, progress: 0 }

      const engineRow = (label, state) => React.createElement('div', { className: 'dts-entry' },
        React.createElement('div', { className: 'dts-row' },
          React.createElement('span', { className: 'dts-h', style: { minWidth: '150px' } }, label),
          React.createElement('span', {
            className: 'dts-badge dts-badge-warn',
          }, t('runtimeNotBundled')),
          state.installed ? React.createElement('button', {
            type: 'button', className: 'dts-link', disabled: !props.writable,
            onClick: () => remove(label.toLowerCase().includes('kokoro') ? 'kokoro' : 'f5'),
          }, t('deleteModel')) : null,
        ),
        React.createElement('div', { className: 'dts-sub' }, t('runtimeNotBundledHint')),
      )

      return React.createElement('div', { className: 'dts-block' },
        React.createElement('div', { className: 'dts-h' }, t('localEnginesTitle')),
        React.createElement('div', { className: 'dts-sub' }, t('localEnginesHint')),
        React.createElement('div', { className: 'dts-alert-warn dts-sub' }, t('runtimeNotBundledHint')),
        props.boolField('streamingEnabled', t('streamingEnabled'), t('streamingEnabledHint')),
        engineRow('Kokoro-82M (CPU)', kokoro),
        engineRow('F5-TTS (GPU)', f5),
      )
    }

    const CLIENT_IT_TERMS = [
      { from: 'API', to: 'A P I', whole: true, lang: '' },
      { from: 'CLI', to: 'C L I', whole: true, lang: '' },
      { from: 'CPU', to: 'C P U', whole: true, lang: '' },
      { from: 'GPU', to: 'G P U', whole: true, lang: '' },
      { from: 'RAM', to: 'ram', whole: true, lang: '' },
      { from: 'SQL', to: 'sequel', whole: true, lang: '' },
      { from: 'UI', to: 'U I', whole: true, lang: '' },
      { from: 'URL', to: 'U R L', whole: true, lang: '' },
      { from: 'UUID', to: 'U U I D', whole: true, lang: '' },
      { from: 'JSON', to: 'j-son', whole: true, lang: '' },
      { from: 'YAML', to: 'yam-el', whole: true, lang: '' },
      { from: 'HTML', to: 'H T M L', whole: true, lang: '' },
      { from: 'CSS', to: 'C S S', whole: true, lang: '' },
      { from: 'SSH', to: 'S S H', whole: true, lang: '' },
      { from: 'DNS', to: 'D N S', whole: true, lang: '' },
      { from: 'IP', to: 'I P', whole: true, lang: '' },
    ]

    // Pronunciation dictionary editor: rules apply top-down.
    function PronEditor(props) {
      const t = props.t || ((key) => key)
      const rows = Array.isArray(props.value) ? props.value : []
      const fileInputRef = React.useRef(null)

      const change = (i, patch) => {
        props.onChange(rows.map((r, k) => (k === i ? Object.assign({}, r, patch) : r)))
      }
      const remove = (i) => props.onChange(rows.filter((_, k) => k !== i))
      const add = () => props.onChange(rows.concat([{ from: '', to: '', whole: false, lang: '' }]))
      const loadIt = () => {
        const existing = new Set(rows.map((r) => String(r.from).toLowerCase()))
        const toAdd = CLIENT_IT_TERMS.filter((r) => !existing.has(String(r.from).toLowerCase()))
        props.onChange(rows.concat(toAdd))
      }

      const exportJson = () => {
        const data = JSON.stringify(rows, null, 2)
        const blob = new Blob([data], { type: 'application/json' })
        const url = URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url
        a.download = 'pronunciation-dictionary.json'
        document.body.appendChild(a)
        a.click()
        document.body.removeChild(a)
        setTimeout(() => { try { URL.revokeObjectURL(url) } catch (alreadyRevoked) { /* already revoked */ } }, 1000)
      }

      const triggerImport = () => {
        if (fileInputRef.current) fileInputRef.current.click()
      }

      const handleImportFile = (e) => {
        const file = e.target.files && e.target.files[0]
        if (!file) return
        const reader = new FileReader()
        reader.onload = (event) => {
          try {
            const parsed = JSON.parse(event.target.result)
            if (!Array.isArray(parsed)) {
              if (typeof window !== 'undefined' && window.alert) window.alert(t('invalidJsonFormat'))
              return
            }
            const importedRules = parsed.map((item) => ({
              from: String(item.from || ''),
              to: String(item.to || ''),
              whole: !!item.whole,
              lang: String(item.lang || ''),
            })).filter((r) => r.from || r.to)

            const existingKeys = new Set(rows.map((r) => String(r.from).toLowerCase()))
            const newItems = importedRules.filter((r) => !existingKeys.has(String(r.from).toLowerCase()))
            props.onChange(rows.concat(newItems))
          } catch (err) {
            if (typeof window !== 'undefined' && window.alert) window.alert(t('invalidJsonFormat'))
          }
          e.target.value = ''
        }
        reader.readAsText(file)
      }

      return React.createElement('div', { className: 'dts-wrap-in' },
        React.createElement('input', {
          type: 'file',
          ref: fileInputRef,
          accept: '.json',
          style: { display: 'none' },
          onChange: handleImportFile,
        }),
        rows.map((rule, i) => React.createElement('div', { className: 'dts-row', key: i },
          React.createElement('input', {
            className: 'dts-input dts-grow', placeholder: t('pronFrom'),
            value: rule.from || '', disabled: !props.writable,
            onChange: (e) => change(i, { from: e.target.value }),
          }),
          React.createElement('input', {
            className: 'dts-input dts-grow', placeholder: t('pronTo'),
            value: rule.to || '', disabled: !props.writable,
            onChange: (e) => change(i, { to: e.target.value }),
          }),
          React.createElement('label', { className: 'dts-sub', title: t('pronWhole') },
            React.createElement('input', {
              type: 'checkbox', checked: !!rule.whole, disabled: !props.writable,
              onChange: (e) => change(i, { whole: e.target.checked }),
            }),
          ),
          React.createElement('input', {
            className: 'dts-input', style: { maxWidth: '70px' }, placeholder: t('pronLang'),
            value: rule.lang || '', disabled: !props.writable,
            onChange: (e) => change(i, { lang: e.target.value }),
          }),
          React.createElement('button', {
            type: 'button', className: 'dts-mini', title: t('previewRule'), disabled: !props.writable,
            onClick: () => {
              if (props.onPreviewPhrase) props.onPreviewPhrase(rule.to || rule.from)
            },
          }, '\u25b6'),
          React.createElement('button', { type: 'button', className: 'dts-mini', disabled: !props.writable, onClick: () => remove(i) }, '\u00d7'),
        )),
        React.createElement('div', { className: 'dts-row' },
          React.createElement('button', { type: 'button', className: 'dts-mini', disabled: !props.writable, onClick: add }, '+'),
          React.createElement('button', { type: 'button', className: 'dts-link', disabled: !props.writable, onClick: loadIt }, t('loadItDictionary')),
          React.createElement('button', { type: 'button', className: 'dts-link', disabled: !props.writable, onClick: exportJson }, t('exportJson')),
          React.createElement('button', { type: 'button', className: 'dts-link', disabled: !props.writable, onClick: triggerImport }, t('importJson')),
          React.createElement('span', { className: 'dts-sub' }, t('pronHint')),
        ),
      )
    }

    function RolesEditor(props) {
      const t = props.t || ((key) => key)
      const value = props.value || {}
      const [newRole, setNewRole] = React.useState('')
      const set = (r, patch) => props.onChange(Object.assign({}, value, { [r]: Object.assign({}, value[r] || {}, patch) }))
      const removeRole = (r) => {
        const next = Object.assign({}, value)
        delete next[r]
        props.onChange(next)
      }

      const standardKeys = ['reply', 'approval', 'error']
      const customKeys = Object.keys(value).filter((k) => !standardKeys.includes(k))
      const allKeys = [...standardKeys, ...customKeys]

      const addCustom = () => {
        const name = newRole.trim().toLowerCase()
        if (!name || value[name]) return
        set(name, { provider: '', model: '', voice: '', chime: '', ssmlStyle: '' })
        setNewRole('')
      }

      return React.createElement('div', { className: 'dts-block' },
        React.createElement('span', { className: 'dts-sub' }, t('rolesHint')),
        allKeys.map((r) => React.createElement('div', { className: 'dts-row', key: r },
          React.createElement('span', { className: 'dts-sub', style: { minWidth: '110px' } }, t('role_' + r) !== ('role_' + r) ? t('role_' + r) : `👤 ${r}`),
          React.createElement('select', {
            className: 'dts-input', value: (value[r] && value[r].provider) || '', disabled: !props.writable,
            onChange: (e) => set(r, { provider: e.target.value }),
          },
            React.createElement('option', { value: '' }, '—'),
            PROVIDERS.map((p) => React.createElement('option', { key: p, value: p }, p)),
          ),
          React.createElement('input', {
            className: 'dts-input dts-grow', placeholder: 'model',
            value: (value[r] && value[r].model) || '', disabled: !props.writable,
            onChange: (e) => set(r, { model: e.target.value }),
          }),
          React.createElement('input', {
            className: 'dts-input dts-grow', placeholder: 'voice',
            value: (value[r] && value[r].voice) || '', disabled: !props.writable,
            onChange: (e) => set(r, { voice: e.target.value }),
          }),
          React.createElement('input', {
            className: 'dts-input', style: { maxWidth: '90px' }, placeholder: t('chime'),
            value: (value[r] && value[r].chime) || '', disabled: !props.writable,
            onChange: (e) => set(r, { chime: e.target.value }),
          }),
          React.createElement('input', {
            className: 'dts-input dts-grow', placeholder: t('ssmlStyle') || 'ssml',
            title: t('ssmlStyleHint') || 'SSML tone style',
            value: (value[r] && value[r].ssmlStyle) || '', disabled: !props.writable,
            onChange: (e) => set(r, { ssmlStyle: e.target.value }),
          }),
          React.createElement('button', { type: 'button', className: 'dts-mini', disabled: !props.writable, onClick: () => props.onPreview((value[r] && value[r].provider) || '', (value[r] && value[r].model) || '', (value[r] && value[r].voice) || '') }, '\u25b6'),
          !standardKeys.includes(r) ? React.createElement('button', { type: 'button', className: 'dts-mini', title: t('remove'), disabled: !props.writable, onClick: () => removeRole(r) }, '\u00d7') : null,
        )),
        React.createElement('div', { className: 'dts-row' },
          React.createElement('input', {
            className: 'dts-input', style: { maxWidth: '180px' }, placeholder: t('newSubagentRole'),
            value: newRole, disabled: !props.writable,
            onChange: (e) => setNewRole(e.target.value),
            onKeyDown: (e) => { if (e.key === 'Enter') addCustom() },
          }),
          React.createElement('button', { type: 'button', className: 'dts-save', disabled: !props.writable || !newRole.trim(), onClick: addCustom }, t('addSubagentRole')),
        ),
      )
    }

    function VoiceDuplexEditor(props) {
      const t = props.t || ((key) => key)
      const installed = !!props.installed

      return React.createElement('div', { className: 'dts-block' },
        React.createElement('div', { className: 'dts-h' }, t('voiceDuplexTitle')),
        React.createElement('div', { className: 'dts-sub' }, t('voiceDuplexHint')),
        !installed ? React.createElement('div', {
          style: {
            padding: '10px 14px',
            borderRadius: '8px',
            border: '1px solid var(--dsw-alias-state-warn-primary, #f59e0b)',
            background: 'var(--dsw-alias-bg-layer-2)',
            display: 'flex',
            flexDirection: 'column',
            gap: '4px',
            fontSize: '13px',
          },
        },
          React.createElement('span', { style: { fontWeight: 600, color: 'var(--dsw-alias-state-warn-primary, #f59e0b)' } },
            '⚠️ ' + t('voiceNotInstalledTitle')
          ),
          React.createElement('span', { className: 'dts-sub' },
            t('voiceInstallHint') + ': '
          ),
          React.createElement('code', {
            style: {
              fontFamily: 'monospace',
              fontSize: '12px',
              padding: '2px 6px',
              borderRadius: '4px',
              background: 'var(--dsw-alias-bg-layer-3)',
              color: 'var(--dsw-alias-label-primary)',
              width: 'fit-content',
            },
          }, 'dsh plugin --profile web add @goodandready/dsh-voice')
        ) : null,
        props.boolField('voiceDuplexEnabled', t('voiceDuplex'), t('voiceDuplexHintToggle'), !installed),
        props.boolField('vadBargeIn', t('vadBargeIn'), t('vadBargeInHint'), !installed),
      )
    }

    function MessengerIntegrationEditor(props) {
      const t = props.t || ((key) => key)
      const installed = !!props.installed

      return React.createElement('div', { className: 'dts-block' },
        React.createElement('div', { className: 'dts-h' }, t('messengerIntegrationTitle')),
        React.createElement('div', { className: 'dts-sub' }, t('messengerIntegrationHint')),
        !installed ? React.createElement('div', {
          style: {
            padding: '10px 14px',
            borderRadius: '8px',
            border: '1px solid var(--dsw-alias-state-warn-primary, #f59e0b)',
            background: 'var(--dsw-alias-bg-layer-2)',
            display: 'flex',
            flexDirection: 'column',
            gap: '4px',
            fontSize: '13px',
          },
        },
          React.createElement('span', { style: { fontWeight: 600, color: 'var(--dsw-alias-state-warn-primary, #f59e0b)' } },
            '⚠️ ' + t('messengerNotInstalledTitle')
          ),
          React.createElement('span', { className: 'dts-sub' },
            t('messengerInstallHint') + ': '
          ),
          React.createElement('code', {
            style: {
              fontFamily: 'monospace',
              fontSize: '12px',
              padding: '2px 6px',
              borderRadius: '4px',
              background: 'var(--dsw-alias-bg-layer-3)',
              color: 'var(--dsw-alias-label-primary)',
              width: 'fit-content',
            },
          }, 'dsh plugin --profile web add @goodandready/dsh-messenger-gateway')
        ) : null,
        props.boolField('messengerTtsEnabled', t('messengerTtsEnabled'), t('messengerTtsEnabledHint'), !installed),
      )
    }


    // Plugin updater block: check updates, show badge, and trigger one-click update
    function PluginUpdaterBlock(props) {
      const t = props.t || ((key) => key)
      const [status, setStatus] = React.useState(null)
      const [loading, setLoading] = React.useState(false)
      const [updating, setUpdating] = React.useState(false)
      const [msg, setMsg] = React.useState(null)

      const checkUpdate = React.useCallback(async () => {
        setLoading(true)
        setMsg(null)
        try {
          const res = await clientFetch('/api/dsh-tts/update', {
            headers: { 'x-dsh-plugin-update': '1' },
            timeoutMs: 10000,
          })
          if (!res.ok) throw new Error('HTTP ' + res.status)
          const data = await res.json()
          setStatus(data)
        } catch (e) {
          setMsg({ ok: false, text: (t('updaterFailed') || 'Update check failed: ') + (e && e.message || String(e)) })
        } finally {
          setLoading(false)
        }
      }, [t])

      const onUpdateNow = async () => {
        setUpdating(true)
        setMsg(null)
        try {
          const res = await clientFetch('/api/dsh-tts/update', {
            method: 'POST',
            headers: {
              'x-dsh-plugin-update': '1',
              'content-type': 'application/json',
            },
            timeoutMs: 60000,
          })
          const data = await res.json()
          if (!res.ok) throw new Error((data && (data.error || data.message)) || 'HTTP ' + res.status)
          setStatus(data)
          setMsg({ ok: true, text: t('updaterSuccess') || 'Plugin updated successfully! Please restart DSH service.' })
        } catch (e) {
          setMsg({ ok: false, text: e && e.message || String(e) })
        } finally {
          setUpdating(false)
        }
      }

      React.useEffect(() => {
        checkUpdate()
      }, [checkUpdate])

      const currentVer = (status && status.currentVersion) || '0.4.23'
      const latestVer = status && status.latestVersion
      const updateAvailable = Boolean(status && status.updateAvailable && latestVer && latestVer !== currentVer)

      return React.createElement(
        'div',
        { className: 'dts-block', style: { gap: '10px' } },
        React.createElement(
          'div',
          { style: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '8px' } },
          React.createElement(
            'div',
            { style: { display: 'flex', alignItems: 'center', gap: '8px' } },
            React.createElement('span', { className: 'dts-title' }, '🔄 ' + t('updaterTitle')),
            React.createElement('span', { className: 'dts-badge ' + (updateAvailable ? 'dts-badge-warn' : 'dts-badge-on') },
              updateAvailable ? 'v' + latestVer + ' ' + (t('available') || 'available') : 'v' + currentVer + ' (' + t('updaterUpToDate') + ')'
            )
          ),
          React.createElement(
            'div',
            { style: { display: 'flex', gap: '8px' } },
            updateAvailable
              ? React.createElement(
                  'button',
                  {
                    type: 'button',
                    className: 'dts-btn',
                    style: { borderColor: 'var(--dsw-alias-state-warn-primary, #f59e0b)', color: 'var(--dsw-alias-state-warn-primary, #f59e0b)' },
                    onClick: onUpdateNow,
                    disabled: updating || loading,
                  },
                  updating ? (t('updaterUpdating') || 'Updating…') : (t('updaterUpdateNow') || 'Update to v{version}').replace('{version}', latestVer)
                )
              : null,
            React.createElement(
              'button',
              {
                type: 'button',
                className: 'dts-btn',
                onClick: checkUpdate,
                disabled: loading || updating,
              },
              loading ? (t('updaterChecking') || 'Checking…') : (t('updaterCheck') || 'Check updates')
            )
          )
        ),
        msg
          ? React.createElement('div', { className: msg.ok ? 'dts-alert dts-alert-ok' : 'dts-alert dts-alert-err' }, msg.text)
          : null
      )
    }

    // Synthesis stats panel: live host counters.
    function StatsPanel(props) {
      const t = props.t || ((key) => key)
      const [data, setData] = React.useState(null)
      const loadStats = () => {
        clientFetch('/dsh-tts/stats', { cache: 'no-store', timeoutMs: 8000 }).then((r) => r.json()).then(setData).catch((err) => console.warn('[dsh-tts] loadStats failed:', err))
      }
      React.useEffect(() => { loadStats() }, [])
      const reset = () => {
        clientFetch('/dsh-tts/stats', { method: 'DELETE', timeoutMs: 8000 }).then(loadStats).catch((err) => console.warn('[dsh-tts] resetStats failed:', err))
      }
      return React.createElement('div', { className: 'dts-block' },
        React.createElement('span', { className: 'dts-sub' }, data
          ? t('statTotal') + ': ' + data.total + ' · ' + t('statHits') + ': ' + data.cacheHits + ' · ' + t('statErrors') + ': ' + data.errors
          : t('loading')),
        data && Object.keys(data.providers || {}).map((p) => React.createElement('span', { className: 'dts-sub', key: p },
          p + ': ' + data.providers[p].n + ' / ' + data.providers[p].ms + 'ms')),
        React.createElement('button', { type: 'button', className: 'dts-link', onClick: reset }, t('statReset')),
      )
    }

    // Plugin-settings tab card follows the shared card pattern: li in the core list,
    // theme-reset header, body with a divider. Chevron is ours; core does not provide it.
    function TtsSection(props) {
      // Translator comes from the slot because its registration sets locale.
      const t = (props && props.t) || ((key) => key)
      const [draft, setDraft] = React.useState(null)
      const [credentials, setCredentials] = React.useState({})
      const [keyDrafts, setKeyDrafts] = React.useState({})
      const [saved, setSaved] = React.useState(false)
      const [err, setErr] = React.useState('')
      const [integrations, setIntegrations] = React.useState({ voice: { installed: false }, messenger: { installed: false } })
      const [telemetry, setTelemetry] = React.useState({ online: true, cacheHits: 0, sseOk: true, total: 0, sseClients: 0, breaker: [], provider: '', queue: 0 })
      const [advancedOpen, setAdvancedOpen] = React.useState(() => {
        try { return localStorage.getItem('dsh-tts/advancedOpen') === '1' } catch { /* localStorage unavailable */ return false }
      })
      const autoplay = useAutoplayGate()

      const ctx = props && props.ctx
      const scope = React.useMemo(() => {
        const s = (ctx && ctx.get && ctx.get('lanSettings')) || (ctx && ctx.configForms)
        if (!s || !s.get) return null
        try {
          return s.get(NS)
        } catch (_) { /* settings scope binding failed */ 
          return null
        }
      }, [ctx])

      const subscribe = React.useMemo(() => {
        return (cb) => {
          if (!scope || !scope.subscribe) return () => {}
          try {
            return scope.subscribe(cb) || (() => {})
          } catch (_) { /* settings scope binding failed */ 
            return () => {}
          }
        }
      }, [scope])

      const getSnapshot = React.useCallback(() => {
        if (!scope || !scope.getSnapshot) return SNAPSHOT_LOADING
        try {
          return scope.getSnapshot() || SNAPSHOT_LOADING
        } catch (_) { /* settings scope binding failed */ 
          return SNAPSHOT_LOADING
        }
      }, [scope])

      const snap = (React.useSyncExternalStore
        ? React.useSyncExternalStore(subscribe, getSnapshot, React.useCallback(() => SNAPSHOT_LOADING, []))
        : null) || (scope && scope.getSnapshot ? scope.getSnapshot() : SNAPSHOT_LOADING)

    // Snapshot status matters more than the value:
    //   loading     — host has not answered yet;
    //   unavailable — host answered but the settings namespace is not ready;
    //   ready       — values are present.
    // On unavailable, writable defaults true; without a status check the card
    // looks like a working empty form.
      // Snapshot status contract (#163):
      // Without valid scope, or when loading/unavailable, editing is disabled.
      const [revision, setRevision] = React.useState(null)
      const ready = !!scope && !!snap && snap.status === 'ready'
      const writable = ready && snap.writable !== false

      const applyPayload = (data) => {
        const cfg = data && data.config ? data.config : {}
        setDraft(JSON.parse(JSON.stringify(cfg)))
        setCredentials(data && data.credentials ? data.credentials : {})
        if (data && data.revision !== undefined) setRevision(data.revision)
        player.enabled = !!cfg.speakReplies
      }

      React.useEffect(() => {
        let alive = true
        clientFetch('/dsh-tts/config', { cache: 'no-store', timeoutMs: 8000 }).then((res) => res.json()).then((data) => {
          if (!alive) return
          applyPayload(data)
        }).catch((e) => { if (alive) setErr(String(e && e.message ? e.message : e)) })

        clientFetch('/dsh-tts/integrations', { cache: 'no-store', timeoutMs: 8000 }).then((res) => res.json()).then((data) => {
          if (!alive) return
          if (data && data.ok) setIntegrations(data.integrations || data)
        }).catch(() => {})

        const loadTelemetry = () => {
          clientFetch('/dsh-tts/stats', { cache: 'no-store', timeoutMs: 8000 }).then((res) => res.json()).then((st) => {
            if (!alive || !st) return
            setTelemetry((prev) => Object.assign({}, prev, {
              cacheHits: st.cacheHits || 0,
              total: st.total || 0,
              online: true,
              breaker: st.breaker || prev.breaker || [],
            }))
          }).catch(() => {
            if (alive) setTelemetry((prev) => Object.assign({}, prev, { online: false }))
          })
          clientFetch('/dsh-tts/status', { cache: 'no-store', timeoutMs: 8000 }).then((res) => res.json()).then((st) => {
            if (!alive || !st) return
            setTelemetry((prev) => Object.assign({}, prev, {
              sseClients: st.sseClients || 0,
              sseOk: (st.sseClients || 0) >= 0,
              provider: (player.audio && player.provider) || (player.queue[0] && player.queue[0].provider) || '',
              queue: player.queue.length,
            }))
          }).catch(() => {})
        }
        loadTelemetry()
        const telTimer = setInterval(loadTelemetry, 3000)
        // interval cleaned by effect return below

        return () => { alive = false; clearInterval(telTimer) }
      }, [])

      if (err && !draft) {
        return React.createElement('div', { className: 'dts-wrap dts-warn' },
          React.createElement('span', null, (t('errorLoading') || 'Error loading settings: ') + err),
        )
      }
      if (!draft) return React.createElement('div', { className: 'dts-wrap' }, t('loading'))

      const setTop = (key, v) => setDraft((d) => Object.assign({}, d || {}, { [key]: v }))
      const setDraftKey = (provider, value) => setKeyDrafts((d) => Object.assign({}, d, { [provider]: value }))

      const commitKey = async (provider, raw) => {
        const value = String(raw != null ? raw : ((keyDrafts && keyDrafts[provider]) || '')).trim()
        if (!value) return
        setErr('')
        const res = await clientFetch('/dsh-tts/credential', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ provider: provider, value: value }),
          timeoutMs: 10000,
        })
        const data = await res.json().catch(() => ({ /* parse error */ }))
        if (!res.ok) throw new Error((data && data.error && data.error.message) || ('HTTP ' + res.status))
        if (data && data.credentials) setCredentials(data.credentials)
        setKeyDrafts((d) => Object.assign({}, d, { [provider]: '' }))
      }

      const clearKey = async (provider) => {
        setErr('')
        try {
          const res = await clientFetch('/dsh-tts/credential', {
            method: 'DELETE',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ provider: provider }),
            timeoutMs: 10000,
          })
          const data = await res.json().catch(() => ({ /* parse error */ }))
          if (!res.ok) throw new Error((data && data.error && data.error.message) || ('HTTP ' + res.status))
          if (data && data.credentials) setCredentials(data.credentials)
          setKeyDrafts((d) => Object.assign({}, d, { [provider]: '' }))
        } catch (e) { setErr(String(e && e.message ? e.message : e)) }
      }

      const save = async () => {
        setErr(''); setSaved(false)
        if (!draft) return
        try {
          const keys = {}
          Object.keys(keyDrafts || {}).forEach((p) => {
            const v = String(keyDrafts[p] || '').trim()
            if (v) keys[p] = v
          })
          const bodyPayload = Object.assign({}, draft, { keys: keys })
          if (revision !== null && revision !== undefined) {
            bodyPayload.revision = revision
          }
          const res = await clientFetch('/dsh-tts/config', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(bodyPayload),
            timeoutMs: 10000,
          })
          const data = await res.json().catch(() => ({ /* parse error */ }))
          if (!res.ok) throw new Error((data && data.error && data.error.message) || ('HTTP ' + res.status))
          applyPayload(data)
          setKeyDrafts({})
          setSaved(true); setTimeout(() => setSaved(false), 2000)
        } catch (e) { setErr(String(e && e.message ? e.message : e)) }
      }

      const onCommitKey = (provider, raw) => {
        commitKey(provider, raw).catch((e) => setErr(String(e && e.message ? e.message : e)))
      }

      const clearCacheNow = async () => {
        setErr('')
        const res = await clientFetch('/dsh-tts/cache', { method: 'DELETE', timeoutMs: 10000 })
        if (!res.ok) throw new Error('HTTP ' + res.status)
        setSaved(true); setTimeout(() => setSaved(false), 2000)
      }
      const onClearCache = () => {
        if (typeof window !== 'undefined' && window.confirm) {
          if (!window.confirm(t('confirmClearCache'))) return
        }
        clearCacheNow().catch((e) => setErr(String(e && e.message ? e.message : e)))
      }

      const onPreview = (provider, model, voice, text) => {
        previewSpeech(provider, model, voice, text)
          .catch((e) => setErr(String(e && e.message ? e.message : e)))
      }

      const onPreviewPhrase = (phrase) => {
        if (!phrase) return
        const first = draft && draft.chain && draft.chain[0]
        onPreview((first && first.provider) || 'kokoro', (first && first.model) || '', (first && first.voice) || '', phrase)
      }

      const boolField = (key, label, hint, disabled = false) => React.createElement('label', { className: 'dts-field' }, label,
        React.createElement('input', {
          type: 'checkbox', checked: !!(draft && draft[key]), disabled: !writable || !!disabled,
          onChange: (e) => setTop(key, e.target.checked),
        }),
        React.createElement('span', { className: 'dts-sub' }, hint))

      const numberField = (key, label, hint, step) => React.createElement('label', { className: 'dts-field' }, label,
        React.createElement('input', {
          type: 'number', step: step || 1,
          className: 'dts-input',
          value: draft && draft[key] !== undefined ? draft[key] : '', disabled: !writable,
          onChange: (e) => setTop(key, Number(e.target.value)),
        }),
        React.createElement('span', { className: 'dts-sub' }, hint))

      const textField = (key, label, hint) => React.createElement('label', { className: 'dts-field' }, label,
        React.createElement('input', {
          className: 'dts-input',
          value: draft && draft[key] !== undefined ? draft[key] : '', disabled: !writable,
          onChange: (e) => setTop(key, e.target.value),
        }),
        React.createElement('span', { className: 'dts-sub' }, hint))

      const autoplayBanner = autoplay.blocked
        ? React.createElement('div', { className: 'dts-unlock' },
            React.createElement('span', null, t('autoplayBlocked')),
            React.createElement('button', {
              type: 'button', className: 'dts-unlock-btn',
              onClick: () => player.unlockAudio && player.unlockAudio(),
            }, t('enableSound')),
          )
        : null
      const breakerBadges = (telemetry.breaker || []).filter((b) => b && b.open).slice(0, 2)
        .map((b) => React.createElement('span', { key: b.id, className: 'dts-badge dts-badge-bad' }, t('breakerOpen') + ': ' + b.id))
      const telemetryBadges = React.createElement('div', { className: 'dts-row', style: { marginBottom: '8px' }, 'data-dsh-tts-telemetry': '1' },
        React.createElement('span', {
          className: 'dts-badge ' + (telemetry.online ? 'dts-badge-on' : 'dts-badge-bad'),
        }, telemetry.online ? t('statusOnline') : t('statusOffline')),
        React.createElement('span', {
          className: 'dts-badge ' + (telemetry.sseClients > 0 ? 'dts-badge-on' : ''),
        }, t('sseState') + ': ' + (telemetry.sseClients || 0)),
        React.createElement('span', { className: 'dts-badge' },
          t('queueLen') + ': ' + (telemetry.queue || player.queue.length || 0)),
        telemetry.provider ? React.createElement('span', { className: 'dts-badge' },
          t('activeProvider') + ': ' + telemetry.provider) : null,
        React.createElement('span', { className: 'dts-badge' },
          t('cacheStats') + ': ' + telemetry.cacheHits + ' / ' + telemetry.total),
        ...breakerBadges,
      )
      const titleLine = props && props.compact ? null : React.createElement('div', { className: 'dts-header' },
        React.createElement('div', { className: 'dts-page-title' }, '🔊 ' + t('title')),
        React.createElement('div', { className: 'dts-page-sub' }, t('subtitle')),
        telemetryBadges,
      )
      return React.createElement('div', { className: 'dts-wrap' },
        autoplayBanner,
        React.createElement('div', { className: 'dts-block' },
          titleLine,
          React.createElement('label', { className: 'dts-row' },
            React.createElement('input', {
              type: 'checkbox', checked: !!(draft && draft.speakReplies), disabled: !writable,
              onChange: (e) => setTop('speakReplies', e.target.checked),
            }),
            React.createElement('span', null, t('speakReplies')),
          ),
          React.createElement('div', { className: 'dts-sub' },
            t('speakRepliesHint')),
        ),
        React.createElement(LocalEnginesEditor, {
          t: t, writable: writable, draft: draft,
          boolField: boolField, setTop: setTop,
        }),
        React.createElement(VoiceDuplexEditor, {
          t: t, writable: writable, draft: draft,
          boolField: boolField, setTop: setTop,
          installed: !!(integrations && (integrations.voice?.installed ?? integrations.integrations?.voice?.installed ?? integrations.voiceInstalled)),
        }),
        React.createElement(MessengerIntegrationEditor, {
          t: t, writable: writable, draft: draft,
          boolField: boolField, setTop: setTop,
          installed: !!(integrations && (integrations.messenger?.installed ?? integrations.integrations?.messenger?.installed ?? integrations.messengerInstalled)),
        }),
        React.createElement('div', { className: 'dts-block' },
          React.createElement('div', { className: 'dts-h' }, t('pronTitle')),
          boolField('enableItDictionary', t('enableItDictionary'), t('enableItDictionaryHint')),
          React.createElement(PronEditor, {
            t: t, writable: writable,
            value: draft && draft.pronunciation ? draft.pronunciation : [],
            onChange: (v) => setTop('pronunciation', v),
            onPreviewPhrase: onPreviewPhrase,
          }),
        ),
        React.createElement('div', { className: 'dts-block' },
          React.createElement('div', { className: 'dts-h' }, t('rolesTitle')),
          boolField('autoDetectSubagent', t('autoDetectSubagent'), t('autoDetectSubagent')),
          React.createElement(RolesEditor, {
            t: t, writable: writable, onPreview: onPreview,
            value: draft && draft.roles ? draft.roles : {},
            onChange: (v) => setTop('roles', v),
          }),
        ),
        React.createElement('div', { className: 'dts-block' },
          React.createElement('div', { className: 'dts-h' }, t('statsTitle')),
          React.createElement(StatsPanel, { t: t }),
        ),
        React.createElement(PluginUpdaterBlock, { t: t }),
        React.createElement('div', { className: 'dts-block' },
          React.createElement('div', { className: 'dts-h' }, t('chainTitle')),
          React.createElement('div', { className: 'dts-sub' },
            t('chainHintCard')),
          React.createElement(ChainEditor, {
            breaker: telemetry.breaker,
            t: t,
            value: draft && draft.chain ? draft.chain : [], writable: writable,
            credentials: credentials, keyDrafts: keyDrafts,
            onChange: (v) => setTop('chain', v),
            onDraft: setDraftKey,
            onCommitKey: onCommitKey,
            onClearKey: clearKey,
            onPreview: onPreview,
          }),
        ),
        React.createElement('div', { className: 'dts-block' },
          React.createElement('div', { className: 'dts-h' }, t('general')),
          boolField('speakAsItGoes', t('speakAsItGoes'),
            t('speakAsItGoesHint')),
          numberField('rate', t('rate'), t('rateHint'), 0.1),
          boolField('bargeIn', t('bargeIn'),
            t('bargeInHint')),
          boolField('announceApproval', t('announce'),
            t('announceHint')),
          boolField('skipCode', t('skipCode'),
            t('skipCodeHint')),
          boolField('cache', t('cache'),
            t('cacheHint')),
          numberField('cacheMaxMb', t('cacheMaxMb'), t('cacheMaxMbHint'), 10),
          React.createElement('label', { className: 'dts-field' }, t('longReply'),
            React.createElement('select', {
              className: 'dts-input', value: (draft && draft.longReply) || 'truncate', disabled: !writable,
              onChange: (e) => setTop('longReply', e.target.value),
            }, ['truncate', 'summarize', 'full'].map((mode) => React.createElement('option', { key: mode, value: mode }, t('longReply' + mode.charAt(0).toUpperCase() + mode.slice(1)) || mode))),
            React.createElement('span', { className: 'dts-sub' }, t('longReplyHint'))),
          textField('summaryModel', t('summaryModel'), t('summaryModelHint')),
          numberField('summarySentences', t('summarySentences'), t('summarySentencesHint'), 1),
          boolField('autoDetect', t('autoDetect'), t('autoDetectHint')),
          boolField('narrateQuotesOnly', t('narrateQuotesOnly'), t('narrateQuotesHint')),
          boolField('skipActions', t('skipActions'), t('skipActionsHint')),
          textField('removeRegex', t('removeRegex'), t('removeRegexHint')),
          textField('customBaseUrl', t('customBaseUrl'), t('customBaseUrlHint')),
          textField('customKeyEnv', t('customKeyEnv'), t('customKeyEnvHint')),
          textField('approvalText', t('approvalText'), t('approvalHint')),
          textField('questionText', t('questionText'), t('questionHint')),
          textField('chime', t('chime'), t('chimeHint')),
          textField('language', t('language'), t('languageHint')),
          textField('piperModel', t('piperModel'), t('piperModelHint')),
          textField('piperBin', t('piperBin'), t('binHint')),
          textField('espeakBin', t('espeakBin'), t('espeakHint')),
          textField('edgeBin', t('edgeBin'), t('edgeHint')),
          textField('azureRegion', t('azureRegion'), t('azureHint')),
        ),
        React.createElement('div', { className: 'dts-block' },
          React.createElement('button', {
            type: 'button',
            className: 'dts-head',
            'aria-expanded': advancedOpen,
            onClick: () => {
              setAdvancedOpen((v) => {
                const next = !v
                try { localStorage.setItem('dsh-tts/advancedOpen', next ? '1' : '0') } catch { /* private mode */ }
                return next
              })
            },
          },
            React.createElement('div', { className: 'dts-headText' },
              React.createElement('div', { className: 'dts-title' }, t('advancedTitle')),
              React.createElement('div', { className: 'dts-sub' }, t('advancedHint')),
            ),
          ),
          advancedOpen ? React.createElement('div', { className: 'dts-body' },
            numberField('maxChars', t('maxChars'), t('maxCharsHint'), 100),
            numberField('sentenceChars', t('sentenceChars'), t('sentenceCharsHint'), 20),
            numberField('timeoutMs', t('timeoutMs'), t('timeoutMsHint'), 1000),
            numberField('maxQueue', t('maxQueue'), t('maxQueueHint'), 1),
            textField('openaiBaseUrl', t('openaiBaseUrl'), t('openaiBaseUrlHint')),
            textField('mimoBaseUrl', t('mimoBaseUrl'), t('mimoBaseUrlHint')),
            textField('mimoFormat', t('mimoFormat'), t('mimoFormatHint')),
            textField('minimaxBin', t('minimaxBin'), t('minimaxBinHint')),
          ) : null,
        ),
        React.createElement('div', { className: 'dts-foot' },
          React.createElement('button', { type: 'button', className: 'dts-link', disabled: !writable, onClick: onClearCache }, t('clearCache')),
          React.createElement('button', { type: 'button', className: 'dts-save', disabled: !writable, onClick: save }, t('save')),
          saved ? React.createElement('span', { className: 'dts-ok' }, t('saved')) : null,
          err ? React.createElement('span', { className: 'dts-bad' }, err) : null,
        ),
      )
    }


    function TtsCard(props) {
      const t = (props && props.t) || ((key) => key)
      const [open, setOpen] = React.useState(false)
      return React.createElement('li', { className: 'dts-card' },
        React.createElement('button', {
          type: 'button',
          className: 'dts-head',
          onClick: () => setOpen(!open),
          'aria-expanded': open,
        },
          React.createElement('div', { className: 'dts-headText' },
            React.createElement('div', { className: 'dts-title' }, t('title')),
            React.createElement('div', { className: 'dts-sub' }, t('cardHint')),
          ),
          ChevronIcon
            ? React.createElement(ChevronIcon, { className: 'dts-chev' + (open ? ' dts-chevOpen' : '') })
            : React.createElement('svg', {
                className: 'dts-chev' + (open ? ' dts-chevOpen' : ''),
                width: 14, height: 14, viewBox: '0 0 16 16', fill: 'none',
              },
                React.createElement('path', {
                  d: 'M4 6l4 4 4-4', stroke: 'currentColor', 'stroke-width': 1.5,
                  'stroke-linecap': 'round', 'stroke-linejoin': 'round',
                }),
              ),
        ),
        open ? React.createElement('div', { className: 'dts-body' },
          React.createElement(ErrorBoundary, null,
            React.createElement(TtsSection, Object.assign({}, props, { compact: true, ctx: props && props.ctx })),
          ),
        ) : null,
      )
    }

    // Input-dock button: shows what is playing, stop control, and recents for replay.
    function SpeakerControl(props) {
    // A slot with `locale` injects translations into props; the fallback is the
    // binder created at registration, in case the slot drops translations.
      const t = (props && props.t) || fallbackDockText
      const p = usePlayer()
      const [showList, setShowList] = React.useState(false)
      const active = !!p.audio || p.queue.length > 0 || p.busy
      const [, force] = React.useReducer((n) => n + 1, 0)
      const lists = recent.list()
      const hasHistory = (lists.items && lists.items.length > 0) || (lists.favs && lists.favs.length > 0)

      // Hide only if completely idle and no recent/favorites history (#161)
      if (!active && !hasHistory && !showList && !p.blocked) return null

      const row = (text, starred) => React.createElement('div', { className: 'dts-row', key: text.slice(0, 24) + starred },
        React.createElement('button', {
          type: 'button', className: 'dts-link', style: { flex: 1, textAlign: 'left', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
          title: text,
          onClick: () => playStandalone(text),
        }, text.slice(0, 80)),
        React.createElement('button', {
          type: 'button', className: 'dts-link', title: '★',
          onClick: () => { recent.toggleFav(text); force() },
        }, starred ? '★' : '☆'),
        React.createElement('button', {
          type: 'button', className: 'dts-link', title: t('exportAudio') || 'Export',
          onClick: () => exportAudioClip(text),
        }, '⤓'),
      )
      return React.createElement('div', { style: { position: 'relative', display: 'inline-flex', gap: '4px', alignItems: 'center' } },
        p.blocked ? React.createElement('button', {
          type: 'button', className: 'dts-link dts-warn', title: t('unlockAudio') || 'Click to unlock audio',
          onClick: unlockAudio,
        }, '🔔') : null,
        (hasHistory || active) ? React.createElement('button', {
          type: 'button', className: 'dts-link', title: t('recent') || 'Recent',
          onClick: () => setShowList((v) => !v),
        }, '☰') : null,
        showList ? React.createElement('div', {
          className: 'dts-wrap',
          style: { position: 'absolute', bottom: '36px', right: 0, zIndex: 30, maxHeight: '320px', overflowY: 'auto', background: 'var(--dsw-alias-bg-layer-2)', border: '1px solid var(--dsw-alias-border-l2)', borderRadius: '12px', padding: '10px 12px', minWidth: '260px', flexDirection: 'column', gap: '6px', display: 'flex' },
        },
          lists.favs.length ? React.createElement('div', { className: 'dts-h' }, '★') : null,
          lists.favs.map((text) => row(text, true)),
          React.createElement('div', { className: 'dts-h' }, '⟳'),
          lists.items.filter((x) => !lists.favs.includes(x)).map((text) => row(text, false)),
          !lists.items.length ? React.createElement('span', { className: 'dts-sub' }, t('recentEmpty') || 'No recent speech yet') : null,
        ) : null,
        active ? React.createElement(React.Fragment, null,
          React.createElement('button', {
            type: 'button',
            className: 'dts-link',
            title: p.paused ? t('dockResume') : t('dockPause'),
            onClick: togglePause,
          }, p.paused ? '▶' : '❚❚'),
          React.createElement('button', {
            type: 'button',
            className: 'dts-link',
            title: t('dockStop'),
            onClick: stopPlayback,
          }, '■'),
          React.createElement('button', {
            type: 'button',
            className: 'dts-link',
            title: t('dockSkip') || 'Skip',
            onClick: skipCurrent,
          }, '⏭'),
          React.createElement('button', {
            type: 'button',
            className: 'dts-link',
            title: t('exportAudio') || 'Export clip',
            onClick: () => exportAudioClip(player.lastText),
          }, '⤓'),
        ) : null,
      )
    }

    /**
     * Fallback translator for the dock.
     *
     * Bound at registration for the page lifetime. The core draws the slot label;
     * props.t never reaches it, so the binder is the only way to give it a language.
     */
    let fallbackDockText = (key) => key

    function registerSpeaker(ctx) {
    // `locale` in the slot descriptor is how core injects translations into props.
    // Without it the dock would show raw keys only.
      fallbackDockText = ctx.locale.bind(NS)
      ctx.slots.inject('conversation.input.dock', () => ctx.slots.register(
        {
          name: 'conversation.input.dock',
          id: '@goodandready/dsh-tts',
          locale: NS,
          order: 5,
          label: () => fallbackDockText('dockLabel'),
        },
        SpeakerControl,
      ))
    }

    /**
     * Plugins page row seat (`plugins.row.config`, current core).
     *
     * The host page draws the title, icon and crumb and provides the content
     * padding, so the page view renders the settings form bare: our own card
     * chrome would double the border and shift the form out of the content
     * area. The summary view feeds the one-liner under the row title.
     */
    function TtsRowConfig(props) {
      const t = (props && props.t) || ((key) => key)
      if (props && props.view === 'summary') {
        return React.createElement('div', { className: 'dts-sub' }, t('subtitle'))
      }
      return React.createElement('div', { className: 'dts-page' },
        React.createElement(ErrorBoundary, null,
          React.createElement(TtsSection, Object.assign({}, props, { ctx: props && props.ctx })),
        ),
      )
    }

    function registerSettings(ctx) {
    // Dictionary packages may also register languages for other namespaces.
    // Core throws on duplicate namespace+language; an unguarded call used to
    // take down the whole plugin ("Failed to load plugins"). Register each
    // language separately: skip if taken; English still lands.
      const addLocale = (locale, dictionary) => {
        try {
          return ctx.locale.register(NS, locale, dictionary)
        } catch (alreadyTaken) {
          return () => {}
        }
      }
      ctx.effect(() => {
        const undo = [addLocale('en', en), addLocale('zh', zh)]
        return () => { for (const off of undo) off() }
      }, 'dsh-tts: locales')
    // The sidebar draws the section label, not our component: props.t never
    // reaches it, so bind the translator to the namespace ourselves.
      const t = ctx.locale.bind(NS)
    // Current core: settings live on the plugin's own row on the Plugins page
    // (`plugins.row.config`). Key = '<package name>#<row id>'; the row gains a
    // configure control that asks for view:'summary' and view:'page'.
      try {
        ctx.slots.inject('plugins.row.config', () => ctx.slots.register(
          {
            name: 'plugins.row.config',
            key: ROW_CONFIG_KEY,
            locale: NS,
            inject: () => ({ ctx: ctx }),
          },
          TtsRowConfig,
        ))
      } catch (rowSeatUnavailable) {
        console.warn('[dsh-tts] row seat plugins.row.config not available:', rowSeatUnavailable && rowSeatUnavailable.message)
      }
    // Plugin-list seat (`plugins.item`): the seat the current core (0.1.6-alpha.2)
    // renders as the plugin's own page with its configuration. The label is a static
    // string on purpose — it is resolved while the page renders, and a locale lookup
    // there would take the whole client batch down with it.
      try {
        ctx.slots.inject('plugins.item', () => ctx.slots.register(
          {
            name: 'plugins.item',
            id: ROW_ID,
            order: 60,
            label: () => fallbackDockText('title') || 'Text to Speech',
            locale: NS,
            inject: () => ({ ctx: ctx }),
          },
          TtsRowConfig,
        ))
      } catch (itemSeatUnavailable) {
        console.warn('[dsh-tts] list seat plugins.item not available:', itemSeatUnavailable && itemSeatUnavailable.message)
      }
    // Fallback for hosts that render the older plugin-settings tab card. The tab
    // looks up a slot by entryKey equal to the namespace name: key must equal NS
    // or the card never appears, with no log error.
      ctx.slots.inject('settings.plugin.item', () => ctx.slots.register(
        {
          name: 'settings.plugin.item',
          key: NS,
          locale: NS,
          inject: () => ({ ctx: ctx }),
        },
        TtsCard,
      ))
    }

    exports.inject = ['slots', 'configForms', 'locale']
    exports.apply = function apply(ctx) {
      registerSettings(ctx)
      registerSpeaker(ctx)
      ctx.effect(() => listenForVoice(), 'dsh-tts: barge-in on user speech')
      ctx.effect(() => {
        if (typeof window === 'undefined') return () => {}
        const onKey = (e) => {
          if (e.ctrlKey && e.key === 'Escape') { togglePause(); e.preventDefault() }
          else if (e.altKey && (e.code === 'KeyS' || e.key === 's' || e.key === 'S')) { stopPlayback(); e.preventDefault() }
          else if (e.altKey && e.key === 'ArrowRight') { skipCurrent(); e.preventDefault() }
        }
        window.addEventListener('keydown', onKey)
        return () => window.removeEventListener('keydown', onKey)
      }, 'dsh-tts: hotkeys')
      ctx.effect(() => startSseStream(), 'dsh-tts: SSE audio stream')
      ctx.effect(() => {
        const timer = setInterval(pollPending, 1000)
        return () => clearInterval(timer)
      }, 'dsh-tts: poll pending audio')
    }
    return module.exports
  },
})

// ModelManager UI placeholder - manual install buttons for Kokoro/F5
// Actual implementation would show download progress and status

