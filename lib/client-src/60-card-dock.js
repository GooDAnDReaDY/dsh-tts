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

    // Per-message speak button in the reply action strip (left of the feedback
    // thumbs). The slot only hands over the durable message id, so the reply
    // text is read back from the rendered turn: the same prose blocks the
    // built-in copy button copies.
    function replyTextFromTurn(el) {
      try {
        const tail = el && el.closest ? el.closest('[data-turn-tail]') : null
        if (!tail) return ''
        const turn = tail.getAttribute('data-turn-tail')
        // The tail sits in its own flow item, so climb until an ancestor also
        // holds rendered reply blocks, then keep only this turn's ones.
        let scope = tail.parentElement
        for (let hops = 0; scope && hops < 8; hops++) {
          if (scope.querySelector('[data-chat-flow-kind="assistant-step"]')) break
          scope = scope.parentElement
        }
        if (!scope) return ''
        const collect = (inProcess) => {
          const parts = []
          for (const node of scope.querySelectorAll('[data-chat-flow-kind="assistant-step"]')) {
            if (turn !== null && node.getAttribute('data-chat-turn') !== turn) continue
            if (node.querySelector('[data-turn-tail]')) continue
            const nestedProcess = !!node.closest('[data-turn-process-hidden]')
            if (nestedProcess !== inProcess) continue
            const text = String(node.innerText || node.textContent || '').trim()
            if (text) parts.push(text)
          }
          return parts
        }
        // Prose first; fall back to the compacted process answers only when the
        // turn kept the reply inside the process accordion.
        let parts = collect(false)
        if (!parts.length) parts = collect(true)
        return parts.join('\n\n').trim()
      } catch (unreadable) {
        return ''
      }
    }

    /** Rounded-square speaker chip, styled after the reference design. */
    function speakGlyph() {
      return React.createElement('svg', { viewBox: '0 0 24 24', fill: 'none', 'aria-hidden': 'true', focusable: 'false' },
        React.createElement('path', {
          d: 'M11 5.6 6.7 9H3.6v6h3.1L11 18.4z',
          stroke: 'currentColor', strokeWidth: 1.6, strokeLinecap: 'round', strokeLinejoin: 'round',
        }),
        React.createElement('path', {
          'data-wave': '1',
          d: 'M14.7 9.3a3.8 3.8 0 0 1 0 5.4',
          stroke: 'currentColor', strokeWidth: 1.6, strokeLinecap: 'round',
        }),
        React.createElement('path', {
          'data-wave': '2',
          d: 'M17.8 6.5a8.2 8.2 0 0 1 0 11',
          stroke: 'currentColor', strokeWidth: 1.6, strokeLinecap: 'round',
        }),
      )
    }

    // Transport glyphs for the in-row playback cluster.
    function transportIcon(name) {
      const stroke = { stroke: 'currentColor', strokeWidth: 1.7, strokeLinecap: 'round', strokeLinejoin: 'round' }
      const kids = []
      if (name === 'pause') {
        kids.push(React.createElement('rect', { key: 'l', x: 7, y: 5, width: 3.2, height: 14, rx: 1, fill: 'currentColor' }))
        kids.push(React.createElement('rect', { key: 'r', x: 13.8, y: 5, width: 3.2, height: 14, rx: 1, fill: 'currentColor' }))
      } else if (name === 'play') {
        kids.push(React.createElement('path', { key: 'p', d: 'M8 5.6 19 12 8 18.4z', fill: 'currentColor' }))
      } else if (name === 'stop') {
        kids.push(React.createElement('rect', { key: 's', x: 6.5, y: 6.5, width: 11, height: 11, rx: 2, fill: 'currentColor' }))
      } else if (name === 'skip') {
        kids.push(React.createElement('path', { key: 't', d: 'M6.5 5.8 14 12l-7.5 6.2z', fill: 'currentColor' }))
        kids.push(React.createElement('rect', { key: 'b', x: 15.6, y: 5.8, width: 2.4, height: 12.4, rx: 1, fill: 'currentColor' }))
      } else {
        kids.push(React.createElement('path', { key: 'a', d: 'M12 4.5v9.4', ...stroke }))
        kids.push(React.createElement('path', { key: 'b', d: 'm8.4 10.4 3.6 3.6 3.6-3.6', ...stroke }))
        kids.push(React.createElement('path', { key: 'c', d: 'M5.5 17.6h13', ...stroke }))
      }
      return React.createElement('svg', { viewBox: '0 0 24 24', fill: 'none', 'aria-hidden': 'true', focusable: 'false' }, kids)
    }

    /** Does this reply own the transport cluster right now? */
    function ownsTransport(tail) {
      if (!tail) return false
      if (activeTailEl && activeTailEl.isConnected) return tail === activeTailEl || tail.contains(activeTailEl)
      // Auto-speech has no explicit owner: the newest reply carries the controls.
      const all = document.querySelectorAll('[data-turn-tail]')
      return all.length > 0 && all[all.length - 1] === tail
    }

    function MessageSpeakAction(props) {
      const t = (props && props.t) || ((key) => key)
      const p = usePlayer()
      const btnRef = React.useRef(null)
      const menuRef = React.useRef(null)
      const textRef = React.useRef('')
      const seqRef = React.useRef(0)
      const [busy, setBusy] = React.useState(false)
      const [warn, setWarn] = React.useState(false)
      const [menu, setMenu] = React.useState(null)
      const active = !busy && !!p.audio && textRef.current !== '' && p.lastText === textRef.current

      React.useEffect(() => {
        if (!busy) return undefined
        const guard = setTimeout(() => setBusy(false), 20000)
        return () => clearTimeout(guard)
      }, [busy])

      // Close the context menu on an outside press, Esc, or any scroll.
      React.useEffect(() => {
        if (!menu) return undefined
        const onDown = (event) => {
          if (menuRef.current && menuRef.current.contains(event.target)) return
          if (btnRef.current && btnRef.current.contains(event.target)) return
          setMenu(null)
        }
        const onKey = (event) => { if (event.key === 'Escape') setMenu(null) }
        // Scrolling inside the menu (its recent list) must not dismiss it.
        const onScroll = (event) => {
          if (event && menuRef.current && event.target && menuRef.current.contains(event.target)) return
          setMenu(null)
        }
        window.addEventListener('pointerdown', onDown, true)
        window.addEventListener('keydown', onKey, true)
        window.addEventListener('scroll', onScroll, true)
        window.addEventListener('resize', onScroll)
        return () => {
          window.removeEventListener('pointerdown', onDown, true)
          window.removeEventListener('keydown', onKey, true)
          window.removeEventListener('scroll', onScroll, true)
          window.removeEventListener('resize', onScroll)
        }
      }, [menu])

      // Keep the whole menu on screen: shift it up when it would run past the fold.
      React.useEffect(() => {
        if (!menu || !menuRef.current) return
        const rect = menuRef.current.getBoundingClientRect()
        const overflow = rect.bottom - (window.innerHeight - 8)
        if (overflow > 0) {
          setMenu((current) => (current ? { x: current.x, y: Math.max(8, current.y - overflow) } : current))
        }
      }, [menu])

      const tailOf = () => (btnRef.current && btnRef.current.closest ? btnRef.current.closest('[data-turn-tail]') : null)

      const speak = (text, seq, tailEl, overrides = {}) => {
        stopPlayback()
        return clientFetch('/dsh-tts/speak', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ text, channel: 'web', ...overrides }),
          timeoutMs: 30000,
        })
          .then((r) => r.json())
          .then((d) => {
            // A second click cancels the first request; never play stale audio.
            if (seqRef.current !== seq) return false
            if (!d || !d.ok || !d.audioBase64) return false
            activeTailEl = tailEl
            playAudioItem({
              id: `reply-${Date.now()}`,
              text,
              rate: d.rate,
              mime: d.mime || 'audio/mpeg',
              audioBase64: d.audioBase64,
            })
            return true
          })
          .catch((failed) => {
            console.warn('[dsh-tts] reply speak failed:', failed)
            return false
          })
      }

      const onClick = () => {
        if (menu) { setMenu(null); return }
        if (busy) {
          seqRef.current += 1
          stopPlayback()
          setBusy(false)
          return
        }
        if (active) {
          stopPlayback()
          return
        }
        const tailEl = tailOf()
        const text = replyTextFromTurn(btnRef.current)
        if (!text) {
          setWarn(true)
          setTimeout(() => setWarn(false), 1600)
          return
        }
        // Already synthesised this clip? Play it from memory instead of the network.
        const last = player.lastItem
        if (last && last.audioBase64 && last.text === text) {
          textRef.current = text
          activeTailEl = tailEl
          playAudioItem({
            id: `replay-${Date.now()}`,
            text,
            mime: last.mime || 'audio/mpeg',
            audioBase64: last.audioBase64,
          })
          return
        }
        const seq = seqRef.current + 1
        seqRef.current = seq
        textRef.current = text
        setWarn(false)
        setBusy(true)
        speak(text, seq, tailEl).then((ok) => {
          if (seqRef.current !== seq) return
          setBusy(false)
          if (!ok) {
            setWarn(true)
            setTimeout(() => setWarn(false), 1600)
          }
        })
      }

      const openMenu = (event) => {
        event.preventDefault()
        event.stopPropagation()
        const box = btnRef.current ? btnRef.current.getBoundingClientRect() : { left: event.clientX, bottom: event.clientY }
        const x = Math.max(8, Math.min(Math.round(box.left) - 8, window.innerWidth - 312))
        // Open just under the button; the measuring effect above shifts the menu
        // up if the (now scrollable, possibly tall) list would run past the fold.
        const y = Math.max(8, Math.min(Math.round(box.bottom) + 6, window.innerHeight - 120))
        setMenu({ x, y })
      }

      const run = (fn) => () => { setMenu(null); fn() }

      const label = active ? t('speakMessageStop') : t('speakMessage')
      const title = warn ? t('speakMessageEmpty') : label
      const button = React.createElement('button', {
        ref: btnRef,
        type: 'button',
        className: 'dts-act',
        title,
        'aria-label': title,
        'aria-pressed': active || undefined,
        'data-active': active || undefined,
        'data-busy': busy || undefined,
        onClick,
        onContextMenu: openMenu,
      }, speakGlyph())

      // Playback transport lives at the end of the same row, after the clock.
      const tail = tailOf()
      const speaking = isSpeakingNow()
      const transport = speaking && ownsTransport(tail) ? React.createElement('div', { className: 'dts-transport' },
        React.createElement('button', {
          type: 'button', className: 'dts-tbtn', title: p.paused ? t('dockResume') : t('dockPause'),
          'aria-label': p.paused ? t('dockResume') : t('dockPause'),
          onClick: () => togglePause(),
        }, transportIcon(p.paused ? 'play' : 'pause')),
        React.createElement('button', {
          type: 'button', className: 'dts-tbtn', title: t('dockStop'), 'aria-label': t('dockStop'),
          onClick: () => stopPlayback(),
        }, transportIcon('stop')),
        React.createElement('button', {
          type: 'button', className: 'dts-tbtn', title: t('dockSkip'), 'aria-label': t('dockSkip'),
          onClick: () => skipCurrent(),
        }, transportIcon('skip')),
        React.createElement('button', {
          type: 'button', className: 'dts-tbtn', title: t('exportAudio'), 'aria-label': t('exportAudio'),
          onClick: () => exportAudioClip(player.lastText),
        }, transportIcon('export')),
      ) : null

      if (!menu) return React.createElement(React.Fragment, null, button, transport)

      // Recents only, all of them: the menu scrolls when the list is longer than
      // the popup. Playback controls stay in the reply row, right of the clock.
      const history = (recent.list().items || [])

      const row = (text, index) => React.createElement('button', {
        key: `recent-${index}`,
        type: 'button',
        className: 'dts-menu-text',
        title: text,
        onClick: run(() => playStandalone(text)),
      }, text.slice(0, 80))

      const tldrButton = React.createElement('button', {
        type: 'button',
        className: 'dts-menu-item',
        style: { width: '100%', textAlign: 'left', borderBottom: '1px solid var(--dsh-border, rgba(128,128,128,0.2))', paddingBottom: '6px', marginBottom: '4px' },
        onClick: run(() => {
          const tailEl = tailOf()
          const text = replyTextFromTurn(btnRef.current)
          if (!text) return
          const seq = seqRef.current + 1
          seqRef.current = seq
          textRef.current = text
          setBusy(true)
          speak(text, seq, tailEl, { tldr: true }).finally(() => {
            if (seqRef.current === seq) setBusy(false)
          })
        }),
      }, React.createElement('span', null, t('speakMessageTldr')))

      const menuEl = React.createElement('div', {
        ref: menuRef,
        className: 'dts-menu',
        role: 'menu',
        style: { left: `${menu.x}px`, top: `${menu.y}px` },
        onContextMenu: (event) => { event.preventDefault(); event.stopPropagation() },
      },
        tldrButton,
        history.length
          ? React.createElement('div', {
              className: 'dts-menu-list',
              // Wheel over the list scrolls the list, not the conversation.
              onWheel: (event) => event.stopPropagation(),
            }, history.map((text, index) => row(text, index)))
          : React.createElement('div', { className: 'dts-menu-item', style: { opacity: 0.45, cursor: 'default' } },
              React.createElement('span', null, t('recentEmpty')),
            ),
      )

      return React.createElement(React.Fragment, null, button, transport, menuEl)
    }

    function registerMessageAction(ctx) {
      try {
        ctx.slots.inject('conversation.chat.assistant-actions', () => ctx.slots.register(
          {
            name: 'conversation.chat.assistant-actions',
            id: 'dsh-tts-speak',
            // 10 is the feedback thumbs; a lower order keeps us to their left.
            order: 5,
            locale: NS,
          },
          MessageSpeakAction,
        ))
      } catch (seatUnavailable) {
        console.warn('[dsh-tts] reply action seat not available:', seatUnavailable && seatUnavailable.message)
      }
    }

    // The dock keeps only the "sound is blocked" hint now: the transport moved
    // into the reply row, to the right of the message clock.
    function SpeakerControl(props) {
      const t = (props && props.t) || fallbackDockText
      const p = usePlayer()
      if (!p.blocked) return null
      return React.createElement('div', { style: { position: 'relative', display: 'inline-flex', gap: '4px', alignItems: 'center' } },
        React.createElement('button', {
          type: 'button', className: 'dts-link dts-warn', title: t('unlockAudio') || 'Click to unlock audio',
          onClick: unlockAudio,
        }, '🔔'),
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
      registerMessageAction(ctx)
      ctx.effect(() => listenForVoice(), 'dsh-tts: barge-in on user speech')
      ctx.effect(() => {
        if (typeof window === 'undefined') return () => {}
        const onKey = (e) => {
          // Shift+Space: stop while speaking, otherwise replay the last clip
          // (memory first, then the host cache) so a finished reply is one key away.
          if (e.shiftKey && !e.ctrlKey && !e.altKey && !e.metaKey && (e.code === 'Space' || e.key === ' ')) {
            e.preventDefault()
            if (e.repeat) return
            if (isSpeakingNow()) stopPlayback()
            else replayLast()
            return
          }
          if (e.ctrlKey && e.key === 'Escape') { togglePause(); e.preventDefault() }
          else if (e.altKey && (e.code === 'KeyS' || e.key === 's' || e.key === 'S')) { stopPlayback(); e.preventDefault() }
          else if (e.altKey && e.key === 'ArrowRight') { skipCurrent(); e.preventDefault() }
        }
        window.addEventListener('keydown', onKey)
        return () => window.removeEventListener('keydown', onKey)
      }, 'dsh-tts: hotkeys')
      ctx.effect(() => startSseStream(), 'dsh-tts: SSE audio stream')
      ctx.effect(() => {
        // Prime the status flag right away: autoplay used to wait out the first
        // interval tick, which dropped early stream items on a fresh start.
        pollPending()
        const timer = setInterval(pollPending, 1000)
        return () => clearInterval(timer)
      }, 'dsh-tts: poll pending audio')
    }
    return module.exports
  },
})

// ModelManager UI placeholder - manual install buttons for Kokoro/F5
// Actual implementation would show download progress and status

