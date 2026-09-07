# DESIGN.md — @goodandready/dsh-tts

## Product / Purpose
- Назначение: Text-to-Speech (TTS) для DeepSeek Harness — голосовое озвучивание ответов агентов в Web UI с гибкой цепочкой провайдеров (fallback chain), локальными моделями (Kokoro-82M, F5-TTS) и облачными API.
- Аудитория: Пользователи и разработчики DeepSeek Harness, которым требуется голосовой интерфейс, режим hands-free или duplex-диалог.
- Статус: Active / Production.

## User Surfaces
- Web/UI:
  - `conversation.input.dock` — элемент управления чтением в строке ввода (`SpeakerControl`): индикация текущего воспроизведения, пауза/возобновление, стоп, выпадающий список недавних реплик с избранным.
  - `settings.plugin.item` — карточка плагина во вкладке «Настройки → Плагины → Настройки плагинов» (`TtsCard` -> `TtsSection`).
  - `settings.section` (fallback) — резервный пункт в боковом меню настроек на случай отсутствия слота `settings.plugin.item`.
- DSH UI / settings / slots:
  - Слот `settings.plugin.item` (primary) с ключом namespace `dsh-tts`.
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
  - Поддержка горячих клавиш: `Ctrl+Esc` (пауза), `Alt+S` / `Alt+Ы` (стоп), `Alt+Right` (пропуск текущей фразы).

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
  - Использовать `settings.plugin.item` как основной слот настроек.
  - Проверять статус снимка настроек `snap.status === 'ready'` перед разрешением `writable`.
  - Экспортировать полное scoped-имя модуля `@goodandready/dsh-tts`.
- Don't:
  - Хардкодить `writable = true`.
  - Регистрировать боковой раздел `settings.section`, если слот `settings.plugin.item` активен.
  - Использовать внешние несистемные стили без префикса `.dts-`.

## Locked Design Decisions
- 2026-08-20 — Карточка во вкладке плагинов `settings.plugin.item` утверждена как постоянное место настроек; боковой раздел оставлен только как аварийный fallback.
- 2026-09-02 — Интеграция с Kokoro и F5-TTS выполняется внутри плагина с потоковым скачиванием весов и WAV-кодировщиком.
- 2026-09-06 — Статус снимка настроек `unavailable` блокирует редактирование формы (`writable = false`) для предотвращения рассинхронизации состояния с сервером.
- 2026-09-07 — Релиз v0.3.23: защита сокращений/чисел от разрыва предложений (lib/text.js), in-flight deduplication синтеза для устранения Cache Stampede, увеличение cloud таймаутов до 10 сек (lib/providers.js), бесшовный gapless prebuffering в веб-плеере (lib/client.js), удаление мертвых заглушек router.js и worklet.js, честная ошибка локальных движков Kokoro/F5 при отсутствии онлайнового рантайма вместо синтетической синусоиды 440 Гц.
