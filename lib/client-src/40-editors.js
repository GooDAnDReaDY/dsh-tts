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
                placeholder: MODEL_HINT[row.provider] || '', onChange: (e) => change(i, { model: e.target.value }),
              }),
              React.createElement('input', {
                className: 'dts-model dts-input', value: row.voice || '', disabled: !props.writable,
                placeholder: 'voice', onChange: (e) => change(i, { voice: e.target.value }),
              }),
              React.createElement('button', { type: 'button', className: 'dts-mini', title: t('up'), disabled: !props.writable, onClick: () => move(i, -1) }, '\u2191'),
              React.createElement('button', { type: 'button', className: 'dts-mini', title: t('down'), disabled: !props.writable, onClick: () => move(i, 1) }, '\u2193'),
              React.createElement('button', { type: 'button', className: 'dts-mini', title: t('preview'), disabled: !props.writable, onClick: () => props.onPreview(row.provider, row.model, row.voice) }, '\u25b6'),
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
              return React.createElement('div', { className: 'dts-sub' },
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
        if (typeof fetch === 'undefined') return
        fetch('/dsh-tts/models/status')
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
        fetch('/dsh-tts/models/delete', {
          method: 'DELETE',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ engine }),
        }).then(() => loadStatus()).catch(() => {})
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
      { from: 'SQL', to: 'сиквел', whole: true, lang: 'ru' },
      { from: 'Nginx', to: 'энджинкс', whole: true, lang: 'ru' },
      { from: 'Kubernetes', to: 'кубернетис', whole: true, lang: 'ru' },
      { from: 'K8s', to: 'кубернетис', whole: true, lang: 'ru' },
      { from: 'PostgreSQL', to: 'постгрес', whole: true, lang: 'ru' },
      { from: 'Redis', to: 'рэдис', whole: true, lang: 'ru' },
      { from: 'Docker', to: 'докер', whole: true, lang: 'ru' },
      { from: 'API', to: 'апи', whole: true, lang: 'ru' },
      { from: 'JSON', to: 'джейсон', whole: true, lang: 'ru' },
      { from: 'YAML', to: 'ямл', whole: true, lang: 'ru' },
      { from: 'GUI', to: 'гуи', whole: true, lang: 'ru' },
      { from: 'CLI', to: 'си элай', whole: true, lang: 'ru' },
      { from: 'CI/CD', to: 'си ай си ди', whole: false, lang: 'ru' },
      { from: 'PR', to: 'пулл реквест', whole: true, lang: 'ru' },
      { from: 'Regex', to: 'регэкс', whole: true, lang: 'ru' },
      { from: 'OAuth', to: 'о-аус', whole: true, lang: 'ru' },
      { from: 'HTTP', to: 'эйч ти ти пи', whole: true, lang: 'ru' },
      { from: 'HTTPS', to: 'эйч ти ти пи эс', whole: true, lang: 'ru' },
      { from: 'URL', to: 'юрл', whole: true, lang: 'ru' },
      { from: 'SSH', to: 'эс эс эйч', whole: true, lang: 'ru' },
      { from: 'IP', to: 'ай пи', whole: true, lang: 'ru' },
      { from: 'DNS', to: 'ди эн эс', whole: true, lang: 'ru' },
      { from: 'CPU', to: 'си пи ю', whole: true, lang: 'ru' },
      { from: 'GPU', to: 'джи пи ю', whole: true, lang: 'ru' },
      { from: 'RAM', to: 'рам', whole: true, lang: 'ru' },
    ]

    // Pronunciation dictionary editor: rules apply top-down.
    function PronEditor(props) {
      const t = props.t || ((key) => key)
      const rows = Array.isArray(props.value) ? props.value : []
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

      return React.createElement('div', { className: 'dts-wrap-in' },
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
            className: 'dts-input dts-grow', placeholder: 'ssml',
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
            border: '1px solid var(--dsw-alias-state-warning-primary)',
            background: 'var(--dsw-alias-bg-layer-2)',
            display: 'flex',
            flexDirection: 'column',
            gap: '4px',
            fontSize: '13px',
          },
        },
          React.createElement('span', { style: { fontWeight: 600, color: 'var(--dsw-alias-state-warning-primary)' } },
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
            border: '1px solid var(--dsw-alias-state-warning-primary)',
            background: 'var(--dsw-alias-bg-layer-2)',
            display: 'flex',
            flexDirection: 'column',
            gap: '4px',
            fontSize: '13px',
          },
        },
          React.createElement('span', { style: { fontWeight: 600, color: 'var(--dsw-alias-state-warning-primary)' } },
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

    // Synthesis stats panel: live host counters.
    function StatsPanel(props) {
      const t = props.t || ((key) => key)
      const [data, setData] = React.useState(null)
      const loadStats = () => {
        fetch('/dsh-tts/stats', { cache: 'no-store' }).then((r) => r.json()).then(setData).catch(() => {})
      }
      React.useEffect(() => { loadStats() }, [])
      const reset = () => {
        fetch('/dsh-tts/stats', { method: 'DELETE' }).then(loadStats).catch(() => {})
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
