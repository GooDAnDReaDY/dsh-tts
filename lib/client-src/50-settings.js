    function TtsSection(props) {
      // Translator comes from the slot because its registration sets locale.
      const t = (props && props.t) || ((key) => key)
      const [draft, setDraft] = React.useState(null)
      const [credentials, setCredentials] = React.useState({})
      const [keyDrafts, setKeyDrafts] = React.useState({})
      const [saved, setSaved] = React.useState(false)
      const [err, setErr] = React.useState('')
      const [integrations, setIntegrations] = React.useState({ voice: { installed: false }, messenger: { installed: false } })
      const [telemetry, setTelemetry] = React.useState({ online: true, cacheHits: 0, sseOk: true, total: 0 })
      const ctx = props && props.ctx
      const scope = React.useMemo(() => {
        const s = (ctx && ctx.get && ctx.get('lanSettings')) || (ctx && ctx.settingsScope)
        if (!s || !s.bind) return null
        try {
          return s.bind({ namespace: NS })
        } catch (_) {
          return null
        }
      }, [ctx])

      const subscribe = React.useMemo(() => {
        return (cb) => {
          if (!scope || !scope.subscribe) return () => {}
          try {
            return scope.subscribe(cb) || (() => {})
          } catch (_) {
            return () => {}
          }
        }
      }, [scope])

      const getSnapshot = React.useCallback(() => {
        if (!scope || !scope.getSnapshot) return SNAPSHOT_LOADING
        try {
          return scope.getSnapshot() || SNAPSHOT_LOADING
        } catch (_) {
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
      const ready = !scope || (!!snap && snap.status === 'ready')
      const writable = !scope ? true : (ready && snap.writable !== false)

      const applyPayload = (data) => {
        const cfg = data && data.config ? data.config : {}
        setDraft(JSON.parse(JSON.stringify(cfg)))
        setCredentials(data && data.credentials ? data.credentials : {})
        player.enabled = !!cfg.speakReplies
      }

      React.useEffect(() => {
        let alive = true
        fetch('/dsh-tts/config', { cache: 'no-store' }).then((res) => res.json()).then((data) => {
          if (!alive) return
          applyPayload(data)
        }).catch((e) => { if (alive) setErr(String(e && e.message ? e.message : e)) })

        fetch('/dsh-tts/integrations', { cache: 'no-store' }).then((res) => res.json()).then((data) => {
          if (!alive) return
          if (data && data.ok) setIntegrations(data)
        }).catch(() => {})

        fetch('/dsh-tts/stats', { cache: 'no-store' }).then((res) => res.json()).then((st) => {
          if (!alive || !st) return
          setTelemetry((prev) => Object.assign({}, prev, {
            cacheHits: st.cacheHits || 0,
            total: st.total || 0,
            online: true,
          }))
        }).catch(() => {
          if (alive) setTelemetry((prev) => Object.assign({}, prev, { online: false }))
        })

        return () => { alive = false }
      }, [])

      if (!draft) return React.createElement('div', { className: 'dts-wrap' }, t('loading'))

      const setTop = (key, v) => setDraft((d) => Object.assign({}, d || {}, { [key]: v }))
      const setDraftKey = (provider, value) => setKeyDrafts((d) => Object.assign({}, d, { [provider]: value }))

      const commitKey = async (provider, raw) => {
        const value = String(raw != null ? raw : ((keyDrafts && keyDrafts[provider]) || '')).trim()
        if (!value) return
        setErr('')
        const res = await fetch('/dsh-tts/credential', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ provider: provider, value: value }),
        })
        const data = await res.json().catch(() => ({}))
        if (!res.ok) throw new Error((data && data.error && data.error.message) || ('HTTP ' + res.status))
        if (data && data.credentials) setCredentials(data.credentials)
        setKeyDrafts((d) => Object.assign({}, d, { [provider]: '' }))
      }

      const clearKey = async (provider) => {
        setErr('')
        try {
          const res = await fetch('/dsh-tts/credential', {
            method: 'DELETE',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ provider: provider }),
          })
          const data = await res.json().catch(() => ({}))
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
          const res = await fetch('/dsh-tts/config', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(Object.assign({}, draft, { keys: keys })),
          })
          const data = await res.json().catch(() => ({}))
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
        const res = await fetch('/dsh-tts/cache', { method: 'DELETE' })
        if (!res.ok) throw new Error('HTTP ' + res.status)
        setSaved(true); setTimeout(() => setSaved(false), 2000)
      }
      const onClearCache = () => {
        clearCacheNow().catch((e) => setErr(String(e && e.message ? e.message : e)))
      }

      const onPreview = (provider, model, voice, text) => {
        fetch('/dsh-tts/preview', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ provider, model, voice, text }),
        })
          .then((r) => r.json())
          .then((d) => {
            if (!d.ok) throw new Error((d.error && d.error.message) || 'HTTP error')
            new Audio('data:' + d.mime + ';base64,' + d.audioBase64).play().catch(() => {})
          })
          .catch((e) => setErr(String(e && e.message ? e.message : e)))
      }

      const onPreviewPhrase = (phrase) => {
        if (!phrase) return
        const first = draft && draft.chain && draft.chain[0]
        onPreview((first && first.provider) || 'kokoro', (first && first.model) || '', (first && first.voice) || '', phrase)
      }

      const boolField = (key, label, hint) => React.createElement('label', { className: 'dts-field' }, label,
        React.createElement('input', {
          type: 'checkbox', checked: !!(draft && draft[key]), disabled: !writable,
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

      const telemetryBadges = React.createElement('div', { className: 'dts-row', style: { marginBottom: '8px' } },
        React.createElement('span', {
          className: 'dts-badge ' + (telemetry.online ? 'dts-badge-on' : 'dts-badge-bad'),
        }, telemetry.online ? '🟢 ' + (t('statusOnline') || 'Host online') : '🔴 ' + (t('statusOffline') || 'Host offline')),
        React.createElement('span', {
          className: 'dts-badge dts-badge-on',
        }, '⚡ SSE Active'),
        React.createElement('span', {
          className: 'dts-badge',
        }, '💾 ' + (t('cacheStats') || 'Cache') + ': ' + telemetry.cacheHits + ' / ' + telemetry.total),
      )
      const titleLine = props && props.compact ? null : React.createElement('div', { className: 'dts-header' },
        React.createElement('div', { className: 'dts-page-title' }, '🔊 ' + t('title')),
        React.createElement('div', { className: 'dts-page-sub' }, t('subtitle')),
        telemetryBadges,
      )
      return React.createElement('div', { className: 'dts-wrap' },
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
          installed: !!(integrations && integrations.voice && integrations.voice.installed),
        }),
        React.createElement(MessengerIntegrationEditor, {
          t: t, writable: writable, draft: draft,
          boolField: boolField, setTop: setTop,
          installed: !!(integrations && integrations.messenger && integrations.messenger.installed),
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
        React.createElement('div', { className: 'dts-block' },
          React.createElement('div', { className: 'dts-h' }, t('chainTitle')),
          React.createElement('div', { className: 'dts-sub' },
            t('chainHintCard')),
          React.createElement(ChainEditor, {
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
            }, ['truncate', 'summarize', 'full'].map((mode) => React.createElement('option', { key: mode, value: mode }, mode))),
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
          React.createElement('div', { className: 'dts-h' }, t('advancedTitle')),
          React.createElement('div', { className: 'dts-sub' }, t('advancedHint')),
          numberField('maxChars', t('maxChars'), t('maxCharsHint'), 100),
          numberField('sentenceChars', t('sentenceChars'), t('sentenceCharsHint'), 20),
          numberField('timeoutMs', t('timeoutMs'), t('timeoutMsHint'), 1000),
          numberField('maxQueue', t('maxQueue'), t('maxQueueHint'), 1),
          textField('openaiBaseUrl', t('openaiBaseUrl'), t('openaiBaseUrlHint')),
          textField('mimoBaseUrl', t('mimoBaseUrl'), t('mimoBaseUrlHint')),
          textField('mimoFormat', t('mimoFormat'), t('mimoFormatHint')),
          textField('minimaxBin', t('minimaxBin'), t('minimaxBinHint')),
        ),
        React.createElement('div', { className: 'dts-foot' },
          React.createElement('button', { type: 'button', className: 'dts-link', disabled: !writable, onClick: onClearCache }, t('clearCache')),
          React.createElement('button', { type: 'button', className: 'dts-save', disabled: !writable, onClick: save }, t('save')),
          saved ? React.createElement('span', { className: 'dts-ok' }, t('saved')) : null,
          err ? React.createElement('span', { className: 'dts-bad' }, err) : null,
        ),
      )
    }


