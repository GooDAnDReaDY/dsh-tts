window.__ModuleLoader__.load({
  id: '@goodandready/dsh-tts',
  factory: (require) => {
    var module = { exports: {} }
    var exports = module.exports
    const React = require('react')
    const NS = 'dsh-tts'
    const PROVIDERS = [
      'openai', 'elevenlabs', 'google', 'azure', 'groq', 'deepgram', 'openrouter',
      'edge', 'piper', 'espeak',
    ]
    const MODEL_HINT = {
      openai: 'gpt-4o-mini-tts',
      elevenlabs: 'eleven_multilingual_v2',
      google: 'gemini-2.5-flash-preview-tts',
      azure: 'region voice, e.g. en-US-JennyNeural',
      groq: 'playai-tts',
      deepgram: 'aura-asteria-en (no Russian)',
      openrouter: 'openai/gpt-4o-mini-tts-2025-12-15',
      edge: 'ru-RU-SvetlanaNeural',
      piper: 'path to .onnx',
      espeak: 'ru',
    }

    const SET_CSS =
      '.dts-wrap{display:flex;flex-direction:column;gap:22px;padding:4px 0;max-width:720px}' +
      '.dts-block{display:flex;flex-direction:column;gap:10px}' +
      '.dts-h{font-size:14px;font-weight:600;color:var(--dsw-alias-label-primary)}' +
      '.dts-sub{font-size:12px;color:var(--dsw-alias-label-secondary)}' +
      '.dts-row{display:flex;gap:8px;align-items:center}' +
      '.dts-row select,.dts-row input,.dts-field input,.dts-field select{background:var(--dsw-alias-bg-layer-1);border:1px solid var(--dsw-alias-border-l1);color:var(--dsw-alias-label-primary);border-radius:6px;padding:6px 8px;font-size:13px}' +
      '.dts-row .dts-model{flex:1}' +
      '.dts-field{display:flex;flex-direction:column;gap:4px;font-size:12px;color:var(--dsw-alias-label-secondary)}' +
      '.dts-mini{border:1px solid var(--dsw-alias-border-l2);background:transparent;color:var(--dsw-alias-label-primary);border-radius:6px;width:28px;height:28px;cursor:pointer;flex:none}' +
      '.dts-save{background:var(--dsw-alias-brand-primary);color:#fff;border:none;border-radius:6px;padding:7px 14px;font-size:13px;cursor:pointer}' +
      '.dts-ok{font-size:12px;color:var(--dsw-alias-state-success-primary)}' +
      '.dts-bad{font-size:12px;color:var(--dsw-alias-state-error-primary)}'

    const setCssId = 'dsh-tts/settings.module.css'
    if (typeof document !== 'undefined' && !document.querySelector('style[data-plugin-css="' + setCssId + '"]')) {
      const tag = document.createElement('style')
      tag.textContent = SET_CSS
      tag.setAttribute('data-plugin', 'dsh-tts')
      tag.dataset.pluginCss = setCssId
      document.head.appendChild(tag)
    }

    const player = { audio: null, after: '', enabled: false }

    function playItem(item) {
      if (!item || item.error || !item.audioBase64) return
      try {
        if (player.audio) { try { player.audio.pause() } catch (e) { /* ignore */ } }
        const bin = atob(item.audioBase64)
        const bytes = new Uint8Array(bin.length)
        for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
        const blob = new Blob([bytes], { type: item.mime || 'audio/mpeg' })
        const url = URL.createObjectURL(blob)
        const audio = new Audio(url)
        player.audio = audio
        audio.onended = () => { URL.revokeObjectURL(url) }
        audio.play().catch(() => { URL.revokeObjectURL(url) })
      } catch (e) { /* autoplay policy or decode */ }
    }

    async function pollPending() {
      try {
        const st = await fetch('/dsh-tts/status', { cache: 'no-store' })
        if (!st.ok) return
        const meta = await st.json()
        player.enabled = !!(meta && meta.speakReplies)
        if (!player.enabled) return
        const res = await fetch('/dsh-tts/pending?after=' + encodeURIComponent(player.after || ''), { cache: 'no-store' })
        if (!res.ok) return
        const data = await res.json()
        const items = data && Array.isArray(data.items) ? data.items : []
        for (let i = 0; i < items.length; i++) {
          const item = items[i]
          player.after = item.id
          playItem(item)
        }
      } catch (e) { /* host restarting */ }
    }

    function ChainEditor(props) {
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
        rows.map((row, i) => React.createElement('div', { className: 'dts-row', key: i },
          React.createElement('select', {
            value: row.provider, disabled: !props.writable,
            onChange: (e) => change(i, { provider: e.target.value }),
          }, PROVIDERS.map((p) => React.createElement('option', { key: p, value: p }, p))),
          React.createElement('input', {
            className: 'dts-model', value: row.model || '', disabled: !props.writable,
            placeholder: MODEL_HINT[row.provider] || '', onChange: (e) => change(i, { model: e.target.value }),
          }),
          React.createElement('input', {
            className: 'dts-model', value: row.voice || '', disabled: !props.writable,
            placeholder: 'voice', onChange: (e) => change(i, { voice: e.target.value }),
          }),
          React.createElement('button', { type: 'button', className: 'dts-mini', title: 'Up', disabled: !props.writable, onClick: () => move(i, -1) }, '\u2191'),
          React.createElement('button', { type: 'button', className: 'dts-mini', title: 'Down', disabled: !props.writable, onClick: () => move(i, 1) }, '\u2193'),
          React.createElement('button', { type: 'button', className: 'dts-mini', title: 'Remove', disabled: !props.writable, onClick: () => remove(i) }, '\u00d7'),
        )),
        React.createElement('div', { className: 'dts-row' },
          React.createElement('button', { type: 'button', className: 'dts-mini', title: 'Add provider', disabled: !props.writable, onClick: add }, '+'),
          React.createElement('span', { className: 'dts-sub' }, 'Top to bottom is the fallback order'),
        ),
      )
    }

    function TtsSection() {
      const [draft, setDraft] = React.useState(null)
      const [saved, setSaved] = React.useState(false)
      const [err, setErr] = React.useState('')
      const writable = true

      React.useEffect(() => {
        let alive = true
        fetch('/dsh-tts/config', { cache: 'no-store' }).then((res) => res.json()).then((data) => {
          if (!alive) return
          const cfg = data && data.config ? data.config : {}
          setDraft(JSON.parse(JSON.stringify(cfg)))
          player.enabled = !!cfg.speakReplies
        }).catch((e) => { if (alive) setErr(String(e && e.message ? e.message : e)) })
        return () => { alive = false }
      }, [])

      if (!draft) return React.createElement('div', { className: 'dts-wrap' }, 'Loading\u2026')

      const setTop = (key, v) => setDraft((d) => Object.assign({}, d || {}, { [key]: v }))

      const save = async () => {
        setErr(''); setSaved(false)
        if (!draft) return
        try {
          const res = await fetch('/dsh-tts/config', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(draft),
          })
          const data = await res.json().catch(() => ({}))
          if (!res.ok) throw new Error((data && data.error && data.error.message) || ('HTTP ' + res.status))
          if (data && data.config) setDraft(data.config)
          player.enabled = !!(data && data.config ? data.config.speakReplies : draft.speakReplies)
          setSaved(true); setTimeout(() => setSaved(false), 2000)
        } catch (e) { setErr(String(e && e.message ? e.message : e)) }
      }

      const textField = (key, label, hint) => React.createElement('label', { className: 'dts-field' }, label,
        React.createElement('input', {
          value: draft && draft[key] !== undefined ? draft[key] : '', disabled: !writable,
          onChange: (e) => setTop(key, e.target.value),
        }),
        React.createElement('span', { className: 'dts-sub' }, hint))

      return React.createElement('div', { className: 'dts-wrap' },
        React.createElement('div', { className: 'dts-block' },
          React.createElement('div', { className: 'dts-h' }, 'Speech'),
          React.createElement('label', { className: 'dts-row' },
            React.createElement('input', {
              type: 'checkbox', checked: !!(draft && draft.speakReplies), disabled: !writable,
              onChange: (e) => setTop('speakReplies', e.target.checked),
            }),
            React.createElement('span', null, 'Speak agent replies'),
          ),
          React.createElement('div', { className: 'dts-sub' },
            'When on, each finished reply is synthesized on the host and played in this browser. Audio is not sent back to the model.'),
        ),
        React.createElement('div', { className: 'dts-block' },
          React.createElement('div', { className: 'dts-h' }, 'Provider chain'),
          React.createElement(ChainEditor, {
            value: draft && draft.chain ? draft.chain : [], writable: writable,
            onChange: (v) => setTop('chain', v),
          }),
        ),
        React.createElement('div', { className: 'dts-block' },
          React.createElement('div', { className: 'dts-h' }, 'General'),
          textField('language', 'Language', 'Hint for voices that need a locale (eSpeak, Azure SSML).'),
          textField('piperModel', 'Piper model path', 'Absolute path to an ONNX model. Leave empty to skip Piper.'),
          textField('piperBin', 'Piper binary', 'Looked up in PATH unless absolute.'),
          textField('espeakBin', 'eSpeak binary', 'Usually espeak-ng.'),
          textField('edgeBin', 'edge-tts binary', 'Python CLI from the edge-tts package.'),
          textField('azureRegion', 'Azure region', 'Required for the azure provider, e.g. eastus.'),
        ),
        React.createElement('div', { className: 'dts-row' },
          React.createElement('button', { type: 'button', className: 'dts-save', disabled: !writable, onClick: save }, 'Save'),
          saved ? React.createElement('span', { className: 'dts-ok' }, 'Saved') : null,
          err ? React.createElement('span', { className: 'dts-bad' }, err) : null,
        ),
      )
    }

    function registerSettings(ctx) {
      ctx.slots.inject('settings.section', () => ctx.slots.register(
        { name: 'settings.section', id: '@goodandready/dsh-tts', order: 32, label: () => 'Speech', inject: () => ({ ctx: ctx }) },
        TtsSection,
      ))
    }

    exports.inject = ['slots']
    exports.apply = function apply(ctx) {
      registerSettings(ctx)
      setInterval(pollPending, 1000)
    }
    return module.exports
  },
})
