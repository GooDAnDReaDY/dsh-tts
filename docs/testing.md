# Тестирование dsh-tts

## Запуск тестов

```bash
npm test
```

## Тестовые наборы

- `test/block1-contracts.test.mjs` — Тесты схемы конфигурации, Volatile-боксов и оптимистичной блокировки ревизий.
- `test/block2-pipeline.test.mjs` — Тесты конвейера обработки текста, саммари, инструмента speak_text и кеширования.
- `test/block3-player-sse.test.mjs` — Тесты клиентского плеера, SSE-стрима, очереди и autoplay.
- `test/block4-providers-ui.test.mjs` — Тесты провайдеров, форматов MIME, локализации и карточки настроек.
- `test/block5-models.test.mjs` — Тесты менеджера моделей, целостности файлов и отмены загрузок.
- `test/block6-sanitization-hygiene.test.mjs` — Тесты чистоты репозитория, отсутствия секретов и исключения служебных файлов.
