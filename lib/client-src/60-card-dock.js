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

