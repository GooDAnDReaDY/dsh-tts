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

# dsh-tts

Text-to-speech for the DeepSeek Harness Web GUI. When **Speak agent replies**
is on, each finished assistant turn is synthesized on the host and played in
the browser. API keys never reach the browser.

A later messenger hub can call the same host chain (`POST /dsh-tts/speak` or
the `speak_text` tool). This package does not talk to Telegram itself.

## Install

```bash
# From npm (after a GitHub/npm release):
dsh plugin --profile web add @goodandready/dsh-tts

# From a local checkout:
dsh plugin --profile web add file:/path/to/dsh-tts
```

Restart the Web UI, then hard-refresh the browser.

## Configure

Settings -> **Speech**:

- **Speak agent replies** -- off by default.
- **Provider chain** -- pick a provider, paste its API key in that row, then
  Save (or leave the key field). The value is written to the host credentials
  store immediately and is never sent back to the browser. The row shows
  **Configured** / **Not set**. Leave the field blank to keep an existing key.
  Local providers (`edge`, `piper`, `espeak`) have no key field.
- A provider without a credential is skipped, not fatal.
- Piper / eSpeak / edge-tts binaries and the Piper model path.

Keys land in the same store the rest of DSH uses (credentials file, then the
process environment). The plugin stores names, never values:

```text
OPENAI_API_KEY
ELEVENLABS_API_KEY
GEMINI_API_KEY
AZURE_SPEECH_KEY
GROQ_API_KEY
DEEPGRAM_API_KEY
OPENROUTER_API_KEY
```

Put additional keys in the same pool (`<PROVIDER>_API_KEY_2`, ...) if you use
a key-rotation plugin.

## Providers

| Key | Service | Default model / voice | Credential |
|---|---|---|---|
| `openai` | OpenAI Audio Speech | `gpt-4o-mini-tts` / `alloy` | `OPENAI_API_KEY` |
| `elevenlabs` | ElevenLabs | `eleven_multilingual_v2` | `ELEVENLABS_API_KEY` |
| `google` | Gemini TTS | `gemini-2.5-flash-preview-tts` / `Kore` | `GEMINI_API_KEY` |
| `azure` | Azure Speech | neural voice + region | `AZURE_SPEECH_KEY` + region |
| `groq` | Groq PlayAI | `playai-tts` | `GROQ_API_KEY` |
| `deepgram` | Deepgram Aura | `aura-asteria-en` | `DEEPGRAM_API_KEY` |
| `openrouter` | OpenRouter `/audio/speech` | `openai/gpt-4o-mini-tts-2025-12-15` | `OPENROUTER_API_KEY` |
| `edge` | Microsoft Edge Neural via `edge-tts` CLI | `ru-RU-SvetlanaNeural` | none |
| `piper` | local Piper | path to an ONNX model | none |
| `espeak` | eSpeak NG | voice `ru` | none |

Default chain: `edge` → `piper` → `espeak`. Deepgram Aura does not list Russian;
keep it below a Russian-capable voice if you speak Russian.

### Free local / CLI providers

```bash
pip install edge-tts          # provides the `edge-tts` binary
# piper: install the Piper binary and point Settings at your .onnx model
sudo apt install espeak-ng    # or the equivalent package on your OS
```

## Tool

`speak_text(text)` — synthesize with the same chain. The tool result is a short
status line; it does not inject audio into the model history.

## Routes

| Route | Purpose |
|---|---|
| `GET /dsh-tts/status` | chain and whether auto-speak is on |
| `GET` or `PUT /dsh-tts/config` | settings plus configured/writable/ref per cloud provider. PUT may include keys; values are stored as credentials and never echoed. |
| `PUT` or `DELETE /dsh-tts/credential` | writes or clears one host credential immediately |
| `GET /dsh-tts/pending?after=` | audio produced for finished replies |
| `POST /dsh-tts/speak` | `{text}` -> `{ok, provider, mime, audioBase64}` |

## Requirements

- DeepSeek Harness with the Web GUI
- Node 20+
- Optional: `edge-tts`, `piper`, `espeak-ng` for the free providers

## License

MIT

---

<a name="-русский"></a>
<details open>
<summary><h2>🇷🇺 Русский (Полное руководство)</h2></summary>

Озвучивание текста (TTS) для Web GUI DeepSeek Harness. При включённой опции **Озвучивать ответы агента**, каждая готовая реплика ассистента синтезируется на хосте и воспроизводится в браузере. API-ключи никогда не попадают в браузер.

### Возможности и архитектура

- **Цепочка фолбеков**: пробует провайдеров по списку до первого успешного ответа; исчерпание лимитов не прервёт воспроизведение.
- **Очистка синтаксического шума**: блоки кода (`skipCode`), разметка Markdown и формулы вырезаются или заменяются голосовыми уведомлениями.
- **Дисковый LRU-кэш**: повторные фразы берутся из кэша (`cacheMaxMb`), экономя баланс API и время.
- **Индивидуальные роли**: назначение разных голосов, моделей и SSML-стилей разным персонажам.

### Установка

```bash
dsh plugin --profile web add @goodandready/dsh-tts
```

### Провайдеры

| Ключ | Сервис | Модель по умолчанию | Учётные данные |
|---|---|---|---|
| `elevenlabs` | ElevenLabs | `eleven_multilingual_v2` / `Rachel` | `ELEVENLABS_API_KEY` |
| `openai` | OpenAI Audio | `tts-1` / `alloy` | `OPENAI_API_KEY` |
| `azure` | Azure Speech | нейросети Azure | `AZURE_SPEECH_KEY` |
| `google` | Google Cloud TTS | Neural2 | `GOOGLE_TTS_KEY` |
| `edgetts` | Microsoft Edge TTS | Online Neural | не требуются (бесплатно) |
| `piper` | Локальный Piper | локальные ONNX модели | не требуются (оффлайн) |
| `espeak` | Локальный eSpeak NG | системный синтез | не требуются (оффлайн) |

## Лицензия

MIT

</details>

---

<a name="-中文"></a>
<details>
<summary><h2>🇨🇳 中文 (完整技术文档)</h2></summary>

DeepSeek Harness Web GUI 文本转语音 (TTS) 朗读插件。开启 **朗读智能体回复** 后，助手生成的每条消息均由服务端合成并在浏览器中实时播放。

### 核心特性

- **故障转移备用链**：按优先级轮询合成引擎，避免单点故障导致静音。
- **智能文本清洗**：自动跳过代码块 (`skipCode`) 与 Markdown 语法符号。
- **磁盘 LRU 缓存**：相同语句直接读取本地音频缓存 (`cacheMaxMb`)。
- **多角色发音人覆盖**：为不同智能体独立配置发音人与 SSML 风格。

### 安装方法

```bash
dsh plugin --profile web add @goodandready/dsh-tts
```

### 引擎列表

| Key | 对应服务 | 默认模型 / 声音 | 凭证 |
|---|---|---|---|
| `elevenlabs` | ElevenLabs | `eleven_multilingual_v2` / `Rachel` | `ELEVENLABS_API_KEY` |
| `openai` | OpenAI Audio | `tts-1` / `alloy` | `OPENAI_API_KEY` |
| `azure` | Azure 语音 | 神经网络音色 | `AZURE_SPEECH_KEY` |
| `google` | Google Cloud TTS | Neural2 | `GOOGLE_TTS_KEY` |
| `edgetts` | 微软 Edge TTS | 在线高保真语音 | 免费免 Key |
| `piper` | 本地 Piper 引擎 | 本地 ONNX 权重 | 完全离线 |
| `espeak` | 本地 eSpeak NG | 系统合成器 | 完全离线 |

## 开源协议

MIT

</details>
