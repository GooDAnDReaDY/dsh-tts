# 📦 @goodandready/dsh-tts

<div align="center">

[![npm version](https://img.shields.io/npm/v/@goodandready/dsh-tts.svg?style=flat-square)](https://www.npmjs.com/package/@goodandready/dsh-tts)
[![license](https://img.shields.io/github/license/GooDAnDReaDY/dsh-tts.svg?style=flat-square)](LICENSE)
[![DSH Plugin](https://img.shields.io/badge/DSH-Plugin-6366f1.svg?style=flat-square)](https://github.com/topics/dsh-plugin)

**[ 🇬🇧 English ](#-english) • [ 🇷🇺 Русский ](#-русский) • [ 🇨🇳 中文 ](#-中文)**

</div>

---

<a name="-english"></a>
## 🇬🇧 English

Text-to-speech for the DeepSeek Harness Web UI: speak agent replies aloud via a provider fallback chain (OpenAI, ElevenLabs, Google, Azure, Groq, Deepgram, OpenRouter, Edge, Piper, eSpeak).

### Features

- **Fallback chain**: tries providers in order until one succeeds; rate limits or provider downtime will not leave the agent silent.
- **Smart text scrubbing**: code blocks, markdown syntax, and equations are stripped or summarized before synthesis so the agent doesn't read out syntax noise.
- **Synthesis caching**: identical sentences reuse cached audio (LRU disk cache with configurable `cacheMaxMb`).
- **Role overrides**: assign distinct voices, models, and SSML styles to different personas or agents.
- **Auto language detection**: dynamically selects appropriate voice models for multilingual dialogs.

### Install

```bash
dsh plugin --profile web add @goodandready/dsh-tts
```

Restart the Web UI (`systemctl --user restart dsh-web`) and reload the browser tab.

### Providers

| Key | Service | Model / Voice | Credential |
|---|---|---|---|
| `elevenlabs` | ElevenLabs | `eleven_multilingual_v2` / `Rachel` | `ELEVENLABS_API_KEY` |
| `openai` | OpenAI Audio | `tts-1` / `alloy` | `OPENAI_API_KEY` |
| `azure` | Azure Cognitive Speech | neural voices | `AZURE_SPEECH_KEY` |
| `google` | Google Cloud TTS | Neural2 | `GOOGLE_TTS_KEY` |
| `edgetts` | Microsoft Edge TTS | Online Neural | none (free) |
| `deepgram` | Deepgram Aura | `aura-asteria-en` | `DEEPGRAM_API_KEY` |
| `groq` | Groq TTS | fast inference | `GROQ_API_KEY` |
| `piper` | Local Piper neural TTS | local ONNX models | none (offline) |
| `espeak` | Local eSpeak NG | system synth | none (offline) |

### Configuration (Web GUI)

Navigate to **Settings → Plugins → Plugin settings → TTS**:
- **Speak replies**: Toggle automatic speech output on new agent messages.
- **Skip code blocks**: Replaces code blocks with a short spoken cue.
- **Provider Chain**: Reorder fallback hierarchy with Up/Down buttons.
- **Cache**: Enable synthesis audio caching and disk limit.

---

<a name="-русский"></a>
<details open>
<summary><h2>🇷🇺 Русский (Полное руководство)</h2></summary>

Озвучивание ответов агента для Web GUI DeepSeek Harness через цепочку фолбеков провайдеров (OpenAI, ElevenLabs, Google, Azure, Groq, Deepgram, OpenRouter, EdgeTTS, Piper, eSpeak).

### Возможности

- **Цепочка фолбеков**: перебирает TTS-провайдеров по порядку до первого успешного ответа; исчерпание лимитов не прервет озвучивание.
- **Умная очистка текста**: блоки кода, разметка Markdown и формулы вырезаются или заменяются короткими голосовыми ремарками, чтобы агент не зачитывал синтаксический шум.
- **Кэширование синтеза**: повторяющиеся фразы берутся из дискового LRU-кэша (`cacheMaxMb`), экономя трафик и баланс.
- **Переопределения ролей**: назначение индивидуальных голосов, моделей и SSML-стилей разным агентам и персонажам.
- **Автоопределение языка**: автоматический выбор нужного голоса при переключении между русским и английским.

### Установка

```bash
dsh plugin --profile web add @goodandready/dsh-tts
```

Перезапустите Web UI (`systemctl --user restart dsh-web`) и обновите страницу.

### Провайдеры

| Ключ | Сервис | Модель / Голос | Учётные данные |
|---|---|---|---|
| `elevenlabs` | ElevenLabs | `eleven_multilingual_v2` / `Rachel` | `ELEVENLABS_API_KEY` |
| `openai` | OpenAI Audio | `tts-1` / `alloy` | `OPENAI_API_KEY` |
| `azure` | Azure Speech | нейросети Azure | `AZURE_SPEECH_KEY` |
| `google` | Google Cloud TTS | Neural2 | `GOOGLE_TTS_KEY` |
| `edgetts` | Microsoft Edge TTS | Online Neural | не требуются (бесплатно) |
| `deepgram` | Deepgram Aura | `aura-asteria-en` | `DEEPGRAM_API_KEY` |
| `groq` | Groq TTS | быстрый инференс | `GROQ_API_KEY` |
| `piper` | Локальный Piper | локальные ONNX модели | не требуются (оффлайн) |
| `espeak` | Локальный eSpeak NG | системный синтез | не требуются (оффлайн) |

### Настройки (Web GUI)

Настройки → **Плагины → Настройки плагинов → TTS**:
- **Озвучивать ответы**: автоматическое чтение вслух новых реплик агента.
- **Пропускать код**: заменяет блоки кода на голосовое уведомление.
- **Цепочка провайдеров**: настройка приоритетов и порядка провайдеров.
- **Кэш**: включение дискового кэша и ограничение его размера.

</details>

---

<a name="-中文"></a>
<details>
<summary><h2>🇨🇳 中文 (完整技术文档)</h2></summary>

为 DeepSeek Harness Web GUI 打造的文本转语音 (TTS) 朗读插件：支持多服务商故障转移备用链（OpenAI、ElevenLabs、Google、Azure、Groq、Deepgram、OpenRouter、EdgeTTS、Piper、eSpeak）。

### 核心功能

- **多重备用链**：按顺序轮询 TTS 引擎，单一服务商限流或网络异常不会导致朗读中断。
- **智能文本清洗**：在语音合成前自动过滤代码块、Markdown 标记及公式，避免机械朗读语法符号。
- **合成音频缓存**：相同句子直接命中本地磁盘 LRU 缓存 (`cacheMaxMb`)，节省调用费用与等待时间。
- **角色个性化覆盖**：支持为不同智能体分配独立的声音、模型与 SSML 风格。
- **多语言自动识别**：根据生成内容动态切换中、英等对应语种的最佳发音人。

### 安装方法

```bash
dsh plugin --profile web add @goodandready/dsh-tts
```

安装后重启 Web UI (`systemctl --user restart dsh-web`) 并刷新浏览器。

### 服务商矩阵

| 标识 Key | 对应服务 | 默认模型 / 声音 | 凭据变量名 |
|---|---|---|---|
| `elevenlabs` | ElevenLabs | `eleven_multilingual_v2` / `Rachel` | `ELEVENLABS_API_KEY` |
| `openai` | OpenAI Audio | `tts-1` / `alloy` | `OPENAI_API_KEY` |
| `azure` | Azure 认知语音 | 神经网络发音人 | `AZURE_SPEECH_KEY` |
| `google` | Google Cloud TTS | Neural2 | `GOOGLE_TTS_KEY` |
| `edgetts` | 微软 Edge TTS | 在线高保真语音 | 无需密钥（免费使用） |
| `deepgram` | Deepgram Aura | `aura-asteria-en` | `DEEPGRAM_API_KEY` |
| `groq` | Groq TTS | 极速推理 | `GROQ_API_KEY` |
| `piper` | 本地 Piper 引擎 | 本地 ONNX 模型 | 无需密钥（完全离线） |
| `espeak` | 本地 eSpeak NG | 轻量级系统合成 | 无需密钥（完全离线） |

</details>
