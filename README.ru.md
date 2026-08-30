# 📦 @goodandready/dsh-tts

<div align="center">

<h3>Озвучивание ответов агента через 10+ TTS-провайдеров с кэшированием на диске</h3>

<p align="center">
  <a href="https://www.npmjs.com/package/@goodandready/dsh-tts"><img src="https://img.shields.io/npm/v/@goodandready/dsh-tts.svg?style=for-the-badge&color=6366f1&labelColor=1e1b4b" alt="npm version"></a>
  <a href="LICENSE"><img src="https://img.shields.io/github/license/GooDAnDReaDY/dsh-tts.svg?style=for-the-badge&color=10b981&labelColor=064e3b" alt="license"></a>
  <a href="https://github.com/topics/dsh-plugin"><img src="https://img.shields.io/badge/DSH-Plugin-8b5cf6.svg?style=for-the-badge&labelColor=2e1065" alt="DSH Plugin"></a>
  <a href="https://nodejs.org"><img src="https://img.shields.io/badge/Node-20%2B-f59e0b.svg?style=for-the-badge&labelColor=451a03" alt="Node version"></a>
</p>

<p align="center">
  <a href="README.md"><b>🇬🇧 English</b></a> •
  <a href="README.ru.md"><b>🇷🇺 Русский</b></a> •
  <a href="README.zh.md"><b>🇨🇳 中文说明</b></a>
</p>

</div>

---

## ⚡ Обзор

**`dsh-tts`** озвучивает ответы ассистента в веб-интерфейсе **DeepSeek Harness** через цепочку из 10+ облачных и оффлайн TTS-движков с умной фильтрацией синтаксиса и LRU-кэшированием на диске.

```mermaid
graph LR
    Reply[💬 Текст ответа агента] --> Filter[Фильтр кода и формул]
    Filter --> Cache{Дисковый LRU кэш}
    Cache -->|Попадание| Audio[Воспроизведение аудио]
    Cache -->|Промах| Chain{Цепочка фолбеков}
    Chain -->|1-й приоритет| Eleven[ElevenLabs / OpenAI]
    Chain -.->|2-й приоритет| Edge[EdgeTTS / Azure]
    Chain -.->|3-й приоритет| Local[Локальный Piper / eSpeak]
    Eleven --> Audio
    Edge --> Audio
    Local --> Audio
```

---

## ✨ Ключевые возможности

* 🔊 **10+ TTS движков**: ElevenLabs, OpenAI, Azure, Google Cloud, EdgeTTS (бесплатно), Deepgram, Groq, Piper, eSpeak.
* 🧹 **Очистка от шума**: заменяет блоки кода и формулы на голосовые ремарки, не зачитывая синтаксис.
* 💾 **Дисковый LRU-кэш**: повторные фразы мгновенно берутся из кэша, экономя баланс API.
* 🎭 **Индивидуальные роли**: назначение голосов и стилей конкретным агентам.

---

## 📦 Быстрая установка

```bash
dsh plugin --profile web add @goodandready/dsh-tts
```

---

## 📄 Лицензия

MIT © [GooDAnDReaDY](https://github.com/GooDAnDReaDY)
