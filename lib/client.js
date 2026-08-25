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
    const CLOUD = {
      openai: 1, elevenlabs: 1, google: 1, azure: 1, groq: 1, deepgram: 1, openrouter: 1,
    }
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
      '.dts-entry{display:flex;flex-direction:column;gap:8px;padding:10px;border:1px solid var(--dsw-alias-border-l2);border-radius:8px}' +
      '.dts-row{display:flex;gap:8px;align-items:center;flex-wrap:wrap}' +
      '.dts-row select,.dts-row input,.dts-field input,.dts-field select{background:var(--dsw-alias-bg-layer-1);border:1px solid var(--dsw-alias-border-l1);color:var(--dsw-alias-label-primary);border-radius:6px;padding:6px 8px;font-size:13px}' +
      '.dts-row .dts-model{flex:1;min-width:120px}' +
      '.dts-row .dts-key{flex:1;min-width:180px}' +
      '.dts-field{display:flex;flex-direction:column;gap:4px;font-size:12px;color:var(--dsw-alias-label-secondary)}' +
      '.dts-mini{border:1px solid var(--dsw-alias-border-l2);background:transparent;color:var(--dsw-alias-label-primary);border-radius:6px;width:28px;height:28px;cursor:pointer;flex:none}' +
      '.dts-save{background:var(--dsw-alias-brand-primary);color:#fff;border:none;border-radius:6px;padding:7px 14px;font-size:13px;cursor:pointer}' +
      '.dts-ok{font-size:12px;color:var(--dsw-alias-state-success-primary)}' +
      '.dts-bad{font-size:12px;color:var(--dsw-alias-state-error-primary)}' +
      '.dts-badge{font-size:11px;padding:2px 8px;border-radius:999px;border:1px solid var(--dsw-alias-border-l2);color:var(--dsw-alias-label-secondary);white-space:nowrap}' +
      '.dts-badge-on{color:var(--dsw-alias-state-success-primary);border-color:currentColor}' +
      '.dts-link{background:none;border:none;color:var(--dsw-alias-label-secondary);cursor:pointer;font-size:12px;padding:0}' +
      // Карточка во вкладке «Настройки плагинов» — как у соседних
      // плагинов: li в списке ядра, шапка со сбросом темы, шеврон.
      '.dts-card{list-style:none;border:1px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-layer-3);border-radius:12px;transition:border-color .16s,background .16s}' +
      '.dts-card:hover{border-color:var(--dsw-alias-label-dimmed)}' +
      '.dts-cardOpen{background:var(--dsw-alias-bg-layer-2);border-color:var(--dsw-alias-label-dimmed)}' +
      '.dts-cardHead{appearance:none;width:100%;font:inherit;color:inherit;text-align:left;cursor:pointer;background:0 0;border:0;border-radius:12px;align-items:center;gap:12px;padding:14px 16px;display:flex}' +
      '.dts-cardHead:focus-visible{outline:2px solid var(--dsw-alias-brand-primary);outline-offset:-2px}' +
      '.dts-headText{flex-direction:column;flex:1;gap:4px;min-width:0;display:flex}' +
      '.dts-name{color:var(--dsw-alias-label-primary);font-size:15px;font-weight:600;line-height:1.4}' +
      '.dts-descr{color:var(--dsw-alias-label-tertiary);font-size:13px;line-height:1.5}' +
      '.dts-chev{color:var(--dsw-alias-label-tertiary);flex:none;transition:transform .16s}' +
      '.dts-chevOpen{transform:rotate(180deg)}' +
      '.dts-cardBody{border-top:1px solid var(--dsw-alias-border-l2);margin:0 16px;padding:16px 0 8px}'

    const setCssId = 'dsh-tts/settings.module.css'
    if (typeof document !== 'undefined' && !document.querySelector('style[data-plugin-css="' + setCssId + '"]')) {
      const tag = document.createElement('style')
      tag.textContent = SET_CSS
      tag.setAttribute('data-plugin', 'dsh-tts')
      tag.dataset.pluginCss = setCssId
      document.head.appendChild(tag)
    }

    // Проигрыватель.
    //
    // Раньше каждый пришедший кусок немедленно вытеснял предыдущий: при чтении
    // ответа целиком это было незаметно, а при чтении по ходу слышался бы
    // только последний. Теперь это очередь: следующее начинается, когда
    // закончилось предыдущее.
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
    }

    function playerChanged() {
      for (const listener of [...player.listeners]) {
        try { listener() } catch (listenerFailure) { /* чужой слушатель не наша забота */ }
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

    // Короткий сигнал рисуем сами: файл не нужен, значит нечего качать,
    // хранить и настраивать.
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
          setTimeout(() => { try { audioCtx.close() } catch (already) { /* закрыт */ } resolve() }, 600)
        } catch (noAudio) { resolve() }
      })
    }

    // Провайдер не смог — читаем голосом браузера. Хуже по звучанию, но
    // молчание хуже вдвойне: человек не узнает, что ответ готов.
    function speakInBrowser(text) {
      return new Promise((resolve) => {
        try {
          if (!window.speechSynthesis || !text) { resolve(); return }
          const utterance = new SpeechSynthesisUtterance(String(text))
          utterance.rate = Math.max(0.5, Math.min(2, player.rate || 1))
          utterance.onend = () => resolve()
          utterance.onerror = () => resolve()
          window.speechSynthesis.speak(utterance)
        } catch (noSpeech) { resolve() }
      })
    }

    function playAudio(item) {
      return new Promise((resolve) => {
        try {
          const bin = atob(item.audioBase64)
          const bytes = new Uint8Array(bin.length)
          for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
          const blob = new Blob([bytes], { type: item.mime || 'audio/mpeg' })
          const url = URL.createObjectURL(blob)
          const audio = new Audio(url)
          audio.playbackRate = Math.max(0.5, Math.min(2, player.rate || 1))
          player.audio = audio
          playerChanged()
          const done = () => { URL.revokeObjectURL(url); player.audio = null; playerChanged(); resolve() }
          audio.onended = done
          audio.onerror = done
          audio.play().catch(() => {
            // Браузер не даёт играть без действия человека — не считаем это
            // поломкой, просто ничего не звучит.
            done()
          })
        } catch (cannotDecode) { resolve() }
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
      player.queue.length = 0
      player.paused = false
      if (player.audio) { try { player.audio.pause() } catch (already) { /* стоит */ } }
      player.audio = null
      try { if (window.speechSynthesis) window.speechSynthesis.cancel() } catch (noSpeech) { /* нет синтеза */ }
      playerChanged()
    }

    function togglePause() {
      player.paused = !player.paused
      if (player.audio) {
        try { player.paused ? player.audio.pause() : player.audio.play() } catch (already) { /* всё равно */ }
      }
      if (!player.paused) drainQueue()
      playerChanged()
    }

    // Человек заговорил — замолкаем.
    //
    // Событие приходит из плагина голосового ввода, но никакой связи с ним
    // нет: если его не установили, событие просто никогда не придёт. Слушаем
    // окно, а не чужую службу, ровно поэтому.
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

    async function pollPending() {
      try {
        const st = await fetch('/dsh-tts/status', { cache: 'no-store' })
        if (!st.ok) return
        const meta = await st.json()
        player.enabled = !!(meta && meta.speakReplies)
        if (meta && typeof meta.rate === 'number') player.rate = meta.rate
        if (meta && meta.chime) player.chime = meta.chime
        if (meta && typeof meta.bargeIn === 'boolean') player.bargeIn = meta.bargeIn
        if (!player.enabled) return
        const res = await fetch('/dsh-tts/pending?after=' + encodeURIComponent(player.after || ''), { cache: 'no-store' })
        if (!res.ok) return
        const data = await res.json()
        const items = data && Array.isArray(data.items) ? data.items : []
        for (const item of items) {
          // Место в очереди занято, но синтез ещё идёт — подождём следующего
          // опроса, иначе порядок фраз рассыплется.
          if (item.kind === 'reserved') break
          player.after = item.id
          player.queue.push(item)
        }
        if (player.queue.length) drainQueue()
      } catch (hostRestarting) { /* хост перезапускается */ }
    }

    function credOf(map, provider) {
      return (map && map[provider]) || { configured: false, writable: true, ref: '' }
    }

    function ChainEditor(props) {
      // Переводчик приходит от карточки: слот отдаёт props.t только ей.
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
              React.createElement('button', { type: 'button', className: 'dts-mini', title: t('up'), disabled: !props.writable, onClick: () => move(i, -1) }, '\u2191'),
              React.createElement('button', { type: 'button', className: 'dts-mini', title: t('down'), disabled: !props.writable, onClick: () => move(i, 1) }, '\u2193'),
              React.createElement('button', { type: 'button', className: 'dts-mini', title: t('remove'), disabled: !props.writable, onClick: () => remove(i) }, '\u00d7'),
            ),
            cloud ? React.createElement('div', { className: 'dts-row' },
              React.createElement('input', {
                className: 'dts-key', type: 'password', autoComplete: 'off',
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
          )
        }),
        React.createElement('div', { className: 'dts-row' },
          React.createElement('button', { type: 'button', className: 'dts-mini', title: t('addProvider'), disabled: !props.writable, onClick: add }, '+'),
          React.createElement('span', { className: 'dts-sub' }, t('chainHint')),
        ),
      )
    }

    // Строки карточки живут в реестре локалей: так их переводит отдельный
    // пакет, не трогая код этого плагина. Английский — язык по умолчанию,
    // на него же приходится откат, если перевода нет.
    const en = {
      'general': 'General',
      'loading': 'Loading\u2026',
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
    }
    const ru = {
      'general': 'Общее',
      'loading': 'Загрузка…',
      'chainHintCard': 'Выберите провайдера, вставьте ключ и нажмите «Сохранить» (или просто уйдите из поля). Ключ сразу попадает в хранилище учётных данных харнесса; браузер его обратно не читает.',
      'speakRepliesHint': 'Каждый законченный ответ озвучивается на стороне харнесса и играет в этом браузере. Звук модели не отправляется.',
      'chainHint': 'Порядок сверху вниз — порядок отката. Ключи облачных провайдеров попадают в хранилище учётных данных харнесса, а не в настройки плагина.',
      'title': 'Озвучка',
      'speakReplies': 'Читать ответы агента',
      'speakAsItGoes': 'Читать по ходу',
      'speakAsItGoesHint': 'Читать каждый ответ, как только он пришёл, предложениями, не дожидаясь конца хода.',
      'rate': 'Скорость чтения',
      'rateHint': 'От 0.5 до 2. Синтез не меняется — быстрее или медленнее играет браузер.',
      'bargeIn': 'Замолкать, когда вы заговорили',
      'bargeInHint': 'Прекращать чтение, как только открылся микрофон.',
      'announce': 'Объявлять запрос подтверждения',
      'announceHint': 'Говорить вслух и подавать сигнал, когда агент остановился ради подтверждения или задал вопрос.',
      'approvalText': 'Что говорить о подтверждении',
      'approvalHint': 'Произносится при запросе подтверждения; имя инструмента добавляется следом.',
      'questionText': 'Что говорить о вопросе',
      'questionHint': 'Произносится, когда агент задал вопрос. Пусто — не произносить.',
      'chime': 'Сигнал',
      'chimeHint': 'ding, beep или none.',
      'language': 'Язык',
      'languageHint': 'Подсказка для голосов, которым нужен язык (eSpeak, Azure SSML).',
      'piperModel': 'Piper: путь к модели',
      'piperModelHint': 'Абсолютный путь к модели ONNX. Пусто — Piper пропускается.',
      'piperBin': 'Piper: бинарь',
      'binHint': 'Ищется в PATH, если путь не абсолютный.',
      'espeakBin': 'eSpeak: бинарь',
      'espeakHint': 'Обычно espeak-ng.',
      'edgeBin': 'edge-tts: бинарь',
      'edgeHint': 'Консольная утилита из пакета edge-tts.',
      'azureRegion': 'Azure: регион',
      'azureHint': 'Нужен провайдеру azure, например eastus.',
      'chainTitle': 'Цепочка провайдеров',
      'addProvider': 'Добавить провайдера',
      'localProvider': 'Локальный провайдер — ключ не нужен',
      'configured': 'Ключ задан',
      'notSet': 'Ключа нет',
      'fromEnv': 'Задан в окружении',
      'clear': 'Убрать',
      'remove': 'Удалить',
      'up': 'Выше',
      'down': 'Ниже',
      'save': 'Сохранить',
      'saved': 'Сохранено',
      'cardHint': 'Цепочка провайдеров, голоса и параметры чтения.',
    }

    function TtsSection(props) {
      // Переводчик приходит от слота, потому что в его записи указан locale.
      const t = (props && props.t) || ((key) => key)
      const [draft, setDraft] = React.useState(null)
      const [credentials, setCredentials] = React.useState({})
      const [keyDrafts, setKeyDrafts] = React.useState({})
      const [saved, setSaved] = React.useState(false)
      const [err, setErr] = React.useState('')
      const writable = true

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

      const boolField = (key, label, hint) => React.createElement('label', { className: 'dts-field' }, label,
        React.createElement('input', {
          type: 'checkbox', checked: !!(draft && draft[key]), disabled: !writable,
          onChange: (e) => setTop(key, e.target.checked),
        }),
        React.createElement('span', { className: 'dts-sub' }, hint))

      const numberField = (key, label, hint, step) => React.createElement('label', { className: 'dts-field' }, label,
        React.createElement('input', {
          type: 'number', step: step || 1,
          value: draft && draft[key] !== undefined ? draft[key] : '', disabled: !writable,
          onChange: (e) => setTop(key, Number(e.target.value)),
        }),
        React.createElement('span', { className: 'dts-sub' }, hint))

      const textField = (key, label, hint) => React.createElement('label', { className: 'dts-field' }, label,
        React.createElement('input', {
          value: draft && draft[key] !== undefined ? draft[key] : '', disabled: !writable,
          onChange: (e) => setTop(key, e.target.value),
        }),
        React.createElement('span', { className: 'dts-sub' }, hint))

      return React.createElement('div', { className: 'dts-wrap' },
        React.createElement('div', { className: 'dts-block' },
          React.createElement('div', { className: 'dts-h' }, t('title')),
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
        React.createElement('div', { className: 'dts-row' },
          React.createElement('button', { type: 'button', className: 'dts-save', disabled: !writable, onClick: save }, t('save')),
          saved ? React.createElement('span', { className: 'dts-ok' }, t('saved')) : null,
          err ? React.createElement('span', { className: 'dts-bad' }, err) : null,
        ),
      )
    }


    // Карточка во вкладке «Настройки плагинов» — та же структура, что у
    // ядра и соседних плагинов: li в списке, шапка-кнопка со сбросом
    // темы (иначе браузерный стиль кнопки красит её фирменным акцентом),
    // шеврон, тело с формой.
    function TtsCard(props) {
      const t = (props && props.t) || ((key) => key)
      const [open, setOpen] = React.useState(false)
      return React.createElement('li', { className: 'dts-card' + (open ? ' dts-cardOpen' : '') },
        React.createElement('button', {
          type: 'button',
          className: 'dts-cardHead',
          onClick: () => setOpen(!open),
          'aria-expanded': open,
        },
          React.createElement('div', { className: 'dts-headText' },
            React.createElement('div', { className: 'dts-name' }, t('title')),
            React.createElement('div', { className: 'dts-descr' }, t('cardHint')),
          ),
          React.createElement('svg', {
            className: 'dts-chev' + (open ? ' dts-chevOpen' : ''),
            width: 16, height: 16, viewBox: '0 0 16 16', fill: 'none',
          },
            React.createElement('path', {
              d: 'M4 6l4 4 4-4', stroke: 'currentColor', 'stroke-width': 1.5,
              'stroke-linecap': 'round', 'stroke-linejoin': 'round',
            }),
          ),
        ),
        open ? React.createElement('div', { className: 'dts-cardBody' },
          React.createElement(TtsSection, props),
        ) : null,
      )
    }

    // Кнопка в строке ввода: видно, что сейчас читается, и можно остановить.
    function SpeakerControl() {
      const p = usePlayer()
      const active = !!p.audio || p.queue.length > 0 || p.busy
      if (!active) return null
      return React.createElement('div', { style: { display: 'inline-flex', gap: '4px', alignItems: 'center' } },
        React.createElement('button', {
          type: 'button',
          className: 'dts-link',
          title: p.paused ? 'Продолжить чтение' : 'Пауза',
          onClick: togglePause,
        }, p.paused ? '▶' : '❚❚'),
        React.createElement('button', {
          type: 'button',
          className: 'dts-link',
          title: 'Прекратить чтение',
          onClick: stopPlayback,
        }, '■'),
      )
    }

    function registerSpeaker(ctx) {
      ctx.slots.inject('conversation.input.dock', () => ctx.slots.register(
        { name: 'conversation.input.dock', id: '@goodandready/dsh-tts', order: 5, label: () => 'Чтение' },
        SpeakerControl,
      ))
    }

    function registerSettings(ctx) {
      ctx.effect(() => ctx.locale.register(NS, { en, ru }), 'dsh-tts: словари')
      // Подпись раздела рисует боковой список, а не наш компонент: props.t
      // туда не доходит, поэтому берём переводчик, привязанный к namespace.
      const t = ctx.locale.bind(NS)
      // Штатное место настроек — карточка во вкладке «Настройки плагинов».
      // Вкладка перебирает пространства настроек и ищет слот по entryKey,
      // равному имени пространства: ключ обязан равняться NS, иначе карточка
      // не появится молча, без единой ошибки в журнале.
      let moved = false
      try {
        moved = !!ctx.slots.inject('settings.plugin.item', () => ctx.slots.register(
          {
            name: 'settings.plugin.item',
            key: NS,
            locale: NS,
            inject: () => ({ ctx: ctx }),
          },
          TtsCard,
        ))
      } catch (noPluginItemSlot) { moved = false }
      if (moved) return
      // Запасной путь для сборок без settings.plugin.item: прежний раздел
      // в боковом списке, чтобы настройки не пропали.
      ctx.slots.inject('settings.section', () => ctx.slots.register(
        {
          name: 'settings.section',
          id: '@goodandready/dsh-tts',
          order: 32,
          locale: NS,
          label: () => t('title'),
          inject: () => ({ ctx: ctx }),
        },
        TtsSection,
      ))
    }

    exports.inject = ['slots', 'locale']
    exports.apply = function apply(ctx) {
      registerSettings(ctx)
      registerSpeaker(ctx)
      ctx.effect(() => listenForVoice(), 'dsh-tts: замолкать, когда человек заговорил')
      ctx.effect(() => {
        const timer = setInterval(pollPending, 1000)
        return () => clearInterval(timer)
      }, 'dsh-tts: опрос готовых озвучек')
    }
    return module.exports
  },
})
