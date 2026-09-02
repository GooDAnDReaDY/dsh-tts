# 📦 @goodandready/dsh-tts

<div align="center">

<h3>Multi-Provider Text-to-Speech Voice Synthesis with Local Neural Engines, Sub-300ms Streaming, IT Dictionary & Messenger Integration for DeepSeek Harness</h3>

<p align="center">
  <a href="https://www.npmjs.com/package/@goodandready/dsh-tts"><img src="https://img.shields.io/npm/v/@goodandready/dsh-tts.svg?style=for-the-badge&color=6366f1&labelColor=1e1b4b" alt="npm version"></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/License-MIT-10b981.svg?style=for-the-badge&color=10b981&labelColor=064e3b" alt="license"></a>
  <a href="https://github.com/topics/dsh-plugin"><img src="https://img.shields.io/badge/DSH-Plugin-8b5cf6.svg?style=for-the-badge&labelColor=2e1065" alt="DSH Plugin"></a>
  <a href="https://nodejs.org"><img src="https://img.shields.io/badge/Node-20%2B-f59e0b.svg?style=for-the-badge&labelColor=451a03" alt="Node version"></a>
</p>

<p align="center">
  <a href="https://goodandready.app/"><img src="https://img.shields.io/badge/All_Author_Projects-goodandready.app-ff4500.svg?style=for-the-badge&logo=rocket&logoColor=white&labelColor=1a1a2e" alt="All Author Projects"></a>
</p>

<p align="center">
  <a href="README.md"><b>🇬🇧 English</b></a> •
  <a href="README.ru.md"><b>🇷🇺 Русский</b></a> •
  <a href="README.zh.md"><b>🇨🇳 中文说明</b></a>
</p>

</div>

---

## ⚡ Overview

**`dsh-tts`** provides robust, lifelike spoken voice synthesis for assistant replies in the **DeepSeek Harness** Web UI. When **Speak agent replies** is enabled, each finished assistant turn or real-time streaming chunk is synthesized on the host and streamed directly to the browser.

API keys never reach client browsers: synthesis is executed entirely on the host backend across **independent multi-provider fallback chains**, including completely offline neural models (Kokoro-82M and F5-TTS).

```mermaid
graph LR
    subgraph Input [Assistant Message]
        Reply[💬 Agent Reply Text] --> Scrub[Smart Text Scrubbing & IT Dictionary]
    end

    subgraph Stream [Low-Latency Streaming]
        Scrub --> SSE[SSE /dsh-tts/stream]
        SSE --> Worklet[AudioWorklet PCM Processor]
    end

    subgraph Cache [Performance Layer]
        Scrub --> LRU{Disk LRU Cache}
        LRU -->|Cache Hit| Play[Immediate Audio Playback]
    end

    subgraph Fallback [TTS Provider Fallback Chain]
        LRU -->|Cache Miss| Chain{Active Chain}
        Chain -->|Priority 1| P1[Kokoro / F5-TTS Local Offline]
        Chain -.->|Cloud Neural| P2[ElevenLabs / OpenAI / CosyVoice]
        Chain -.->|Free Cloud / Edge| P3[EdgeTTS / SiliconFlow]
        Chain -.->|System Fallback| P4[Local Piper / eSpeak NG]
    end

    subgraph Output [Delivery & Integrations]
        P1 --> Store[Save to Cache]
        P2 --> Store
        P3 --> Store
        P4 --> Store
        Store --> Play
        Store --> Msg[Telegram / Discord via dsh-messenger-gateway]
    end

    style Input fill:#1e1e2e,stroke:#89b4fa,stroke-width:2px,color:#cdd6f4
    style Stream fill:#181825,stroke:#89dceb,stroke-width:2px,color:#cdd6f4
    style Cache fill:#181825,stroke:#cba6f7,stroke-width:2px,color:#cdd6f4
    style Fallback fill:#11111b,stroke:#a6e3a1,stroke-width:2px,color:#cdd6f4
    style Output fill:#181825,stroke:#f38ba8,stroke-width:2px,color:#cdd6f4
```

---

## 🚀 Key Features

### 1. 📴 Offline Local Neural Engines (Kokoro CPU & F5-TTS GPU)
* **Kokoro-82M (CPU)**: 82M-parameter lightweight neural model running locally on CPU via ONNX Runtime. High-speed synthesis with zero cloud dependencies.
* **F5-TTS (GPU)**: Zero-shot diffusion transformer voice synthesis running on NVIDIA GPUs via a local inference daemon.
* **ModelManager UI**: Direct manual installation in settings with real-time download progress bar, SHA-256 validation, and deletion. No silent or automatic multi-gigabyte downloads.

### 2. ⚡ Real-Time Streaming Audio (< 300 ms Latency)
* **AudioWorklet (`TTSWorklet`)**: High-performance Web Audio Worklet processor playing seamless Float32Array PCM chunks at 24 kHz without audible clicks or buffer underruns.
* **Server-Sent Events (SSE)**: Dedicated `/dsh-tts/stream` route delivering synthesized chunks to connected browsers instantly.

### 3. 🎙️ Voice Duplex & VAD Barge-In (with `@goodandready/dsh-voice`)
* **Full-Duplex Conversation**: Automatic voice reply synthesis upon completion of speech dictation.
* **VAD Barge-In**: Immediately mutes assistant speech playback when user voice activity is detected.
* **Installation Guard**: If `@goodandready/dsh-voice` is not present, settings controls are disabled with an explicit instruction banner (`dsh plugin --profile web add @goodandready/dsh-voice`).

### 4. 📚 Built-in IT Terminology Pronunciation Dictionary
* **Pre-configured Lexicon**: Correct phonetic pronunciation for common technical abbreviations and developer terms:
  - `SQL` $\rightarrow$ "сиквел"
  - `Nginx` $\rightarrow$ "энджинкс"
  - `Kubernetes` / `K8s` $\rightarrow$ "кубернетис"
  - `Docker` $\rightarrow$ "докер", `API` $\rightarrow$ "апи", `JSON` $\rightarrow$ "джейсон", `YAML` $\rightarrow$ "ямл"
  - `GUI`, `CLI`, `CI/CD`, `PR`, `Regex`, `OAuth`, `HTTP`, `HTTPS`, `CPU`, `GPU`, `RAM`
* **Interactive UI Editor**: Edit rules, preview phonetic substitutions with the **▶ Listen** button, and populate standard IT terms with one click.

### 5. 👥 Multi-Agent Personas & Subagent Voice Overrides
* Assign distinct voices, providers, models, and audio chimes to individual subagents (e.g. `coder`, `reviewer`, `planner`, `tester`).
* Automatically matches incoming assistant turn events (`session.agent` or `message.agent`).

### 6. 💬 Messenger Voice Notes Integration (with `@goodandready/dsh-messenger-gateway`)
* Generates voice audio for Telegram and Discord bot replies via `POST /dsh-tts/speak`.
* Protective dependency check with installation hint when gateway plugin is missing.

---

## 🛠️ Complete Supported Providers Matrix (18 Backends)

| Provider Key | Service Backend | Default Model | Default Voice | Credential Ref | Features & Notes |
|---|---|---|---|---|---|
| `kokoro` | Local Kokoro-82M ONNX | `hexgrad/Kokoro-82M` | `af_bella` | *None* | **100% offline CPU neural synthesis** |
| `f5` | Local F5-TTS GPU Daemon | `F5-TTS` | Default | *None* | **High-fidelity GPU zero-shot voice synthesis** |
| `elevenlabs` | ElevenLabs API | `eleven_multilingual_v2` | `Rachel` | `ELEVENLABS_API_KEY` | Ultra-realistic, emotional nuance |
| `openai` | OpenAI Audio | `gpt-4o-mini-tts` / `tts-1` | `alloy` | `OPENAI_API_KEY` | High-quality industry standard |
| `edge` | Microsoft Edge Online | `ru-RU-SvetlanaNeural` | `ru-RU-SvetlanaNeural` | *None* | **Free, high-fidelity neural TTS without API keys** |
| `siliconflow` | SiliconFlow CosyVoice | `FunAudioLLM/CosyVoice2-0.5B` | Default | `SILICONFLOW_API_KEY` | State-of-the-art CosyVoice2 neural engine |
| `deepinfra` | DeepInfra Kokoro | `hexgrad/Kokoro-82M` | Default | `DEEPINFRA_API_KEY` | Fast open-weights Kokoro synthesis |
| `fireworks` | Fireworks AI | `kokoro` | Default | `FIREWORKS_API_KEY` | Ultra-low latency Kokoro inference |
| `minimax` | MiniMax Speech | `speech-01-turbo` | Default | `MINIMAX_API_KEY` | High-expressiveness neural voice |
| `mimo` | Xiaomi MiMo Audio | `mimo-v2.5-tts` | Default | `MIMO_API_KEY` | Low-latency streaming TTS |
| `google` | Google Cloud TTS | `gemini-2.5-flash-preview-tts` | Language default | `GEMINI_API_KEY` | Multilingual Google Gemini voice synthesis |
| `azure` | Azure Cognitive Speech | `en-US-JennyNeural` | Region default | `AZURE_SPEECH_KEY` | Enterprise neural synthesis |
| `deepgram` | Deepgram Aura | `aura-asteria-en` | `asteria` | `DEEPGRAM_API_KEY` | Ultra-low latency voice output |
| `groq` | Groq TTS | `playai-tts` | `default` | `GROQ_API_KEY` | Near-instant inference speed |
| `openrouter` | OpenRouter Audio | `openai/gpt-4o-mini-tts` | `alloy` | `OPENROUTER_API_KEY` | Unified router access |
| `custom` | Custom OpenAI-compatible | Configurable | Configurable | `CUSTOM_TTS_API_KEY` | Any `/v1/audio/speech` endpoint |
| `piper` | Local Piper ONNX | Local ONNX weights | Model default | *None* | 100% offline neural engine |
| `espeak` | Local eSpeak NG | System synth | `ru` / `en` | *None* | 100% offline lightweight fallback |

---

## 🧹 Smart Text Scrubbing & Formatting Engine

Before text reaches speech synthesizers, `dsh-tts` intelligently sanitizes and filters the message so the assistant doesn't read out syntax noise:
* **Fenced Code Blocks**: Spoken as *"code block, N lines"* / *"блок кода, N строк"*.
* **Markdown Tables**: Spoken as *"table, N rows"* / *"таблица, N строк"*.
* **Summary Intros**: Spoken as *"Summary of the reply"* / *"Пересказ ответа"*.
* **Narration Filters**: Skip asterisk actions (`*smiles*`), narrate quotes only, and apply custom regex removal.

---

## 📦 Quick Installation

```bash
dsh plugin --profile web add @goodandready/dsh-tts
```

> [!IMPORTANT]
> Restart DSH Web UI after installation (`systemctl --user restart dsh-web`) and refresh your browser tab.

---

## ⚙️ Configuration Recipes (`settings.yaml`)

```yaml
dsh-tts:
  speakReplies: true
  enableLocalEngines: true
  kokoroEnabled: true
  streamingEnabled: true
  enableItDictionary: true
  voiceDuplexEnabled: true
  vadBargeIn: true
  messengerTtsEnabled: true
  cache: true
  cacheMaxMb: 150
  autoDetect: true
  chain:
    - provider: kokoro
    - provider: edge
      voice: ru-RU-SvetlanaNeural
    - provider: openai
      model: tts-1
      voice: alloy
  roles:
    coder:
      provider: openai
      voice: onyx
    reviewer:
      provider: edge
      voice: ru-RU-DmitryNeural
```

---

## 🤖 HTTP Endpoints Reference

* `GET /dsh-tts/stream` — Real-time Server-Sent Events (SSE) audio streaming.
* `POST /dsh-tts/speak` — `{ text, voice?, model? }` → Returns synthesized audio.
* `POST /dsh-tts/preview` — `{ provider, model, voice, text? }` → Test voice playback in UI.
* `GET /dsh-tts/models/status` — Reports local Kokoro and F5-TTS model installation states.
* `POST /dsh-tts/models/install` — `{ engine: 'kokoro' | 'f5' }` → Starts HuggingFace model download.
* `DELETE /dsh-tts/models/delete` — `{ engine: 'kokoro' | 'f5' }` → Removes local model files.
* `GET /dsh-tts/integrations` — Status of sibling plugins (`dsh-voice`, `dsh-messenger-gateway`).
* `GET /dsh-tts/status` — Returns active chain state, cache statistics, and engine readiness.

---

## 📄 License

MIT © [GooDAnDReaDY](https://github.com/GooDAnDReaDY)
