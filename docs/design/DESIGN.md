# Design Contract: @goodandready/dsh-tts

- Продукт: Плагин озвучивания ответов агента (Text-to-Speech) для DeepSeek Harness.
- Владелец: Team GoodAndReady.
- Аудитория: Пользователи и разработчики DeepSeek Harness, которым требуется голосовой интерфейс, режим hands-free или duplex-диалог.
- Статус: Active / Production.

## User Surfaces
- Web/UI:
  - `conversation.input.dock` — элемент управления чтением в строке ввода (`SpeakerControl`): индикация текущего воспроизведения, пауза/возобновление, стоп, выпадающий список недавних реплик с избранным.
  - `plugins.row.config` — **основная** поверхность настроек: страница плагина, открывается по контролю «настроить» на его строке в «Плагинах» (ключ `@goodandready/dsh-tts#dsh-tts`). Форма рендерится **bare** (`TtsRowConfig` -> `TtsSection`), потому что страница сама рисует заголовок, иконку, хлебную крошку и отступы (#127).
  - `settings.plugin.item` — прежняя карточка во вкладке «Настройки → Плагины → Настройки плагинов» (`TtsCard` -> `TtsSection`), сохранена как **фолбэк** для старых ядер (#126, #127).
- DSH UI / settings / slots:
  - Слот `plugins.row.config` (primary, key `@goodandready/dsh-tts#dsh-tts`) + фолбэк `settings.plugin.item` (key = namespace `dsh-tts`).
  - Слот `conversation.input.dock` (order: 5) с локализацией `dsh-tts`.
  - Встроенный словарь IT-произношения и редактор пользовательских правил произношения.
  - Интеграция с `@goodandready/dsh-voice` (auto-mute при речи пользователя) и `@goodandready/dsh-messenger-gateway` (TTS для мессенджеров).
- API:
  - `GET /dsh-tts/status` — текущее состояние плеера, активный голос, скорость, chime.
  - `GET/PUT /dsh-tts/config` — чтение и запись настроек синтеза и цепочки.
  - `PUT /dsh-tts/credential` — безопасная запись API-ключей в credential storage.
  - `GET /dsh-tts/pending` — полинг готовых аудиочанков.
  - `GET /dsh-tts/stream` — Server-Sent Events (SSE) для стриминга аудио в реальном времени.
  - `GET /dsh-tts/models/status` & `POST /models/install` & `POST /models/delete` — управление весами локальных моделей.
  - `GET /dsh-tts/integrations` — статус внешних DSH-плагинов.
  - `POST /dsh-tts/preview` — предпрослушивание голоса/провайдера.
  - `DELETE /dsh-tts/cache` — сброс дискового кэша аудио.
- CLI:
  - Управление через стандартный DSH CLI: `dsh plugin --profile web add/update @goodandready/dsh-tts`.
- Документация:
  - Трёхъязычная документация: `README.md` (EN), `README.ru.md` (RU), `README.zh.md` (ZH).
  - Дизайн-контракт: `docs/design/DESIGN.md`.

## Visual Direction
- Атмосфера: Нативный компонент DeepSeek Harness, строго следующий единому дизайн-коду экосистемы DSH.
- Утверждённые референсы и что из них берём:
  - Карточки настроек ядра DSH («Консоль», «Цикл агента»): скругление 12px, заголовок 15px, пояснение 13px, разделители border-l2, правый шеврон `IconChevronDownOutline14` с CSS-поворотом на 180deg.
  - Бейджи статусов: `.dts-badge` (серый/зеленый) для локальных моделей (installed, downloading %, not installed).
- Не копировать:
  - Самодельные стрелочки (▼/▲) вместо нативного шеврона.
  - Прямоугольные кнопки без скруглений или несистемные градиенты.

## Foundations
- Цвета и роли:
  - Фоновые слои: `var(--dsw-alias-bg-layer-2)`, `var(--dsw-alias-bg-layer-3)`.
  - Границы: `var(--dsw-alias-border-l2)`.
  - Текст: `var(--dsw-alias-label-primary)` (основной), `var(--dsw-alias-label-secondary)` (пояснения), `var(--dsw-alias-label-tertiary)` (иконки/шевроны).
  - Акценты: зеленый статус `.dts-ok`, красный `.dts-bad`.
- Типографика:
  - Системный DSH UI шрифт, 13px для полей/меток, 15px (font-weight: 600) для заголовка карточки.
- Сетка, отступы, responsive:
  - Карточка с padding 14px 16px в шапке, отступы между полями 12px, адаптивные flex-строки.
- Accessibility:
  - `aria-expanded` на кнопке раскрытия карточки.
  - Поддержка горячих клавиш: `Ctrl+Esc` (пауза), `Alt+KeyS` (стоп), `Alt+Right` (пропуск текущей фразы).

## Components And States
- Компоненты:
  - `TtsCard`: сворачиваемая карточка настроек.
  - `TtsSection`: форма настроек с провайдерами, ползунком скорости, чекбоксами и интеграциями.
  - `SpeakerControl`: док-контрол в строке ввода с меню недавних реплик.
  - `LocalEnginesEditor`: блок управления локальными ONNX/PyTorch моделями.
  - `PronunciationEditor`: интерактивная таблица замены произношения и загрузка IT-словаря.
  - `RolesEditor`: сопоставление ролей субагентов с отдельными голосами.
- Loading / empty / error / success:
  - Loading: текст загрузки конфигурации (`t('loading')`), индикация скачивания весов с процентом.
  - Empty: заполнители `—` при отсутствии элементов в списках.
  - Error: inline `.dts-bad` с текстом ошибки.
  - Success: временная плашка `.dts-ok` («Сохранено»).
  - Unavailable: при статусе снимка настроек `unavailable` все поля блокируются (`writable = false`), исключая потерю ввода.
- Формы, валидация и действия:
  - Кнопки сохранения и сброса кэша с защитой от двойного клика и флагом `disabled: !writable`.

## User Flows
- Критические сценарии:
  1. Озвучивание ответа агента: стриминг чанков по SSE или опрос pending -> воспроизведение в Web Audio API.
  2. Включение/настройка провайдера: ввод API-ключа или установка локального движка Kokoro -> сохранение в secure storage -> тест голоса (Preview).
  3. Barge-in (прерывание речи): когда пользователь начинает говорить в микрофон (`@goodandready/dsh-voice`), плеер мгновенно замолкает.

## Do / Don't
- Do:
  - Регистрировать настройки в `plugins.row.config` первым, прежние посадки (`settings.plugin.item`) держать как фолбэк.
  - Держать форму на странице строки bare: страница сама рисует заголовок, иконку, крошку и отступы.
  - Проверять статус снимка настроек `snap.status === 'ready'` перед разрешением `writable`.
  - Экспортировать полное scoped-имя модуля `@goodandready/dsh-tts`.
- Don't:
  - Хардкодить `writable = true`.
  - Регистрировать боковой раздел `settings.section`.
  - Использовать внешние несистемные стили без префикса `.dts-`.

## Locked Design Decisions
- 2026-09-11 — Stability/UI/quality block #95–#108: SSE heartbeat + client reconnect; player stop safety + autoplay unlock banner; Kokoro/F5 install UX removed (runtime not bundled); soft provider circuit breaker surfaced in card telemetry; Advanced collapsed by default; Clear cache confirms; English source for defaults/reasons/comments; status theme tints via color-mix; stream-hub behavioral tests.
- 2026-08-20 — Карточка во вкладке плагинов `settings.plugin.item` утверждена как постоянное место настроек.
- 2026-09-02 — Интеграция с Kokoro и F5-TTS выполняется внутри плагина с потоковым скачиванием весов и WAV-кодировщиком.
- 2026-09-06 — Статус снимка настроек `unavailable` блокирует редактирование формы (`writable = false`) для предотвращения рассинхронизации состояния с сервером.
- 2026-09-07 — Релиз v0.3.23: защита сокращений/чисел от разрыва предложений (lib/text.js), in-flight deduplication синтеза для устранения Cache Stampede, увеличение cloud таймаутов до 10 сек (lib/providers.js), бесшовный gapless prebuffering в веб-плеере (lib/client.js), удаление мертвых заглушек router.js и worklet.js, честная ошибка локальных движков Kokoro/F5 при отсутствии онлайнового рантайма вместо синтетической синусоиды 440 Гц.

- 2026-09-09 — Local Kokoro/F5 neural inference is not bundled; providers fail with a clear reason and never emit synthetic tones. Marketing/docs must match. Revisit when a supported runtime is wired.
- 2026-09-10 — Settings card coverage (#88): user-facing schema fields `maxChars`, `sentenceChars`, `timeoutMs`, `maxQueue`, `openaiBaseUrl`, `mimoBaseUrl`, `mimoFormat`, `minimaxBin` live in the Advanced block. `*KeyEnv` fields name credential slots and stay config-only (keys are written via the chain editor / `/dsh-tts/credential`).
- 2026-09-18 — Fail-closed request trust policy (#119): isTrustedSettingsRequest enforces strict fail-closed validation. Accepts loopback IP, same-origin/same-site sec-fetch-site, matching origin/host header pair, or Bearer auth token. /credential endpoint never leaks secret key values.
- 2026-09-18 — Canonical EN+ZH Localization Audit & Strict Source Zero-Cyrillic Boundary (#121): SPEECH_PHRASES contains only canonical EN and ZH dictionaries. Core lib/ source code strictly purged of all hardcoded Russian pronunciation rules, Russian abbreviations, Cyrillic literals, and masked unicode escapes. BUILTIN_IT_DICTIONARY in core is empty by default; all Russian language pronunciation dictionaries and localization are 100% delegated to @goodandready/dsh-russian-lang (Gitea issue #248). Automated unit test in test/features_en_zh.test.mjs enforces zero Cyrillic literals, zero masked escapes, and zero lang: 'ru' rules in lib/.
- 2026-09-18 — Repository Hygiene & Public Tree Sanitization (#122): Internal documentation and platform configuration files (AGENTS.md, index.md, docs/plans/, docs/architecture/, docs/deployment/, docs/testing/, .gitea/) are untracked from git index and added to .gitignore. Only product design contract docs/design/DESIGN.md is tracked in repository.
- 2026-09-18 — Settings Section Redundancy Purge (#126): Redundant settings.section fallback registration removed from lib/client-src/60-card-dock.js and lib/client.js. All plugin settings live strictly inside the settings.plugin.item card in the Plugins tab.
- 2026-09-19 — Plugins Row Seat (#127): settings register into `plugins.row.config` first, keyed `@goodandready/dsh-tts#dsh-tts` (row id from cordis.patch.yml). The page view renders the form bare (`TtsRowConfig` -> `TtsSection`) because the host page supplies title, icon, crumb and padding; the summary view is a one-line state. `settings.plugin.item` stays as a fallback for older cores, and `settings.section` remains removed. Guard: test/row-config-seat.test.mjs.

## Superseded notes
Earlier free-form notes under docs/superpowers/ are retired; this file and docs/plans/ are canonical.


### v0.4.6 — Canonical EN+ZH Localization, Smart Boundary Tokenizer, Audio Clip Export & Subagent Persona Matrix
- **Dual Localization (EN + ZH)**: Плагин канонически двуязычный. Полный китайский словарь (`zh`) для всех 65+ ключей интерфейса и речевых шаблонов (`speechPhrases('zh-CN')`). Русский словарь `ru` вырезан из плагина — русификация выполняется через централизованный плагин `@goodandready/dsh-russian-lang` (Gitea issue #181).
- **Smart Boundary Tokenizer**: Интеллектуальный токенизатор предложений в `lib/text.js`. Защищает сокращения, доменные имена (`goodandready.app`), расширения файлов (`package.json`), версии и списки от ложного дробления. Поддерживает полноширинную китайскую пунктуацию (`。！？`) и адаптивный порог для CJK-иероглифов.
- **Audio Clip Export**: Экспорт озвученных фраз в аудиофайл (`exportAudioClip(text)`) с кнопкой мгновенного скачивания `⤓` в `SpeakerControl` и списке недавних реплик.
- **Subagent Persona Matrix & Auto-detection**: Опция `autoDetectSubagent` (boolean, default true) в конфигурации и карточке настроек. Автоматическое определение субагентов по метаданным сообщения (`subagent`, `agent`, `author`, `name`) с переключением голоса и стиля SSML.
- **Client Bundle Size**: Оптимизированный размер бандла (`< 92 KiB` minified/packed), полное покрытие тестами (108 unit-тестов).
