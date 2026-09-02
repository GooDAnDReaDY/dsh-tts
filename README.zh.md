# 📦 @goodandready/dsh-tts

<div align="center">

<h3>DeepSeek Harness 多引擎语音合成：本地离线神经网络引擎、低延迟流式音频（<300ms）、IT术语词典与即时通讯集成</h3>

<p align="center">
  <a href="https://www.npmjs.com/package/@goodandready/dsh-tts"><img src="https://img.shields.io/npm/v/@goodandready/dsh-tts.svg?style=for-the-badge&color=6366f1&labelColor=1e1b4b" alt="npm version"></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/License-MIT-10b981.svg?style=for-the-badge&color=10b981&labelColor=064e3b" alt="license"></a>
  <a href="https://github.com/topics/dsh-plugin"><img src="https://img.shields.io/badge/DSH-Plugin-8b5cf6.svg?style=for-the-badge&labelColor=2e1065" alt="DSH Plugin"></a>
  <a href="https://nodejs.org"><img src="https://img.shields.io/badge/Node-20%2B-f59e0b.svg?style=for-the-badge&labelColor=451a03" alt="Node version"></a>
</p>

<p align="center">
  <a href="https://goodandready.app/"><img src="https://img.shields.io/badge/作者全部项目-goodandready.app-ff4500.svg?style=for-the-badge&logo=rocket&logoColor=white&labelColor=1a1a2e" alt="作者全部项目"></a>
</p>

<p align="center">
  <a href="README.md"><b>🇬🇧 English</b></a> •
  <a href="README.ru.md"><b>🇷🇺 Русский</b></a> •
  <a href="README.zh.md"><b>🇨🇳 中文说明</b></a>
</p>

</div>

---

## ⚡ 插件概览

**`dsh-tts`** 为 **DeepSeek Harness** Web 界面提供高保真智能体回复语音朗读服务。开启 **朗读智能体回复** 后，每条生成的助手回复或实时流式片段均由服务端合成并即时推流至浏览器播放。

API 密钥绝不暴露给前端：音频合成全程在服务端通过**多服务商独立备用链**执行，包括完全离线的本地神经网络模型（Kokoro-82M 和 F5-TTS）。

```mermaid
graph LR
    subgraph Input [助手回复文本]
        Reply[💬 智能体生成文本] --> Scrub[智能过滤 & IT术语词典]
    end

    subgraph Stream [低延迟流式音频 < 300ms]
        Scrub --> SSE[SSE /dsh-tts/stream]
        SSE --> Worklet[AudioWorklet PCM 处理器]
    end

    subgraph Cache [性能缓存层]
        Scrub --> LRU{磁盘 LRU 缓存}
        LRU -->|命中缓存| Play[即刻推流播放]
    end

    subgraph Fallback [TTS 引擎备用链]
        LRU -->|未命中| Chain{生效备用链}
        Chain -->|首选| P1[Kokoro / F5-TTS 本地离线]
        Chain -.->|云端神经网络| P2[ElevenLabs / OpenAI / CosyVoice]
        Chain -.->|免费云端| P3[EdgeTTS / SiliconFlow]
        Chain -.->|系统兜底| P4[本地 Piper / eSpeak NG]
    end

    subgraph Output [输出与集成]
        P1 --> Store[写入磁盘缓存]
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

## 🚀 核心功能

### 1. 📴 完全离线本地神经网络引擎（Kokoro CPU 与 F5-TTS GPU）
* **Kokoro-82M (CPU)**：8200万参数轻量级神经网络模型，通过 ONNX Runtime 在 CPU 上本地运行，零云端依赖。
* **F5-TTS (GPU)**：零样本扩散 Transformer 语音合成，通过本地推理守护进程运行于 NVIDIA GPU。
* **ModelManager 管理界面**：在设置中手动安装模型，实时显示下载进度条、SHA-256 校验和一键删除。无任何静默或自动下载。

### 2. ⚡ 实时流式音频播放（延迟 < 300ms）
* **AudioWorklet (`TTSWorklet`)**：高性能 Web Audio Worklet 处理器，以 24kHz 采样率无缝播放 Float32Array PCM 数据块，无可感知的爆音或缓冲区欠载。
* **Server-Sent Events (SSE)**：专用 `/dsh-tts/stream` 路由将合成音频片段即时推送至浏览器。

### 3. 🎙️ 语音双工对话与 VAD 打断（配合 `@goodandready/dsh-voice`）
* **全双工对话**：语音听写完成后自动启动回复语音合成。
* **VAD 打断**：检测到用户开始说话时立即静音助手语音播放。
* **安装保护**：若未安装 `@goodandready/dsh-voice`，相关控件将禁用并显示安装指引。

### 4. 📚 内置 IT 术语发音词典
* **预配置词汇表**：为常见技术缩写和开发者术语提供正确语音替换（SQL、Nginx、Kubernetes/K8s、Docker、API、JSON、YAML、GUI、CLI、CI/CD 等 25 个术语）。
* **交互式编辑器**：编辑规则，逐条点击 **▶ 试听** 按钮预听效果，一键加载全部 IT 术语。

### 5. 👥 多智能体角色个性化语音
* 为不同子智能体（`coder`、`reviewer`、`planner`、`tester` 等）分配独立的语音、服务商、模型和提示音。
* 自动从会话事件中识别智能体名称。

### 6. 💬 即时通讯语音消息集成（配合 `@goodandready/dsh-messenger-gateway`）
* 通过 `POST /dsh-tts/speak` 为 Telegram 和 Discord 机器人回复生成语音消息。
* 缺少网关插件时自动显示安装提示，防护性依赖检查。

---

## 🛠️ 支持的 18 大服务商矩阵

| 服务商 Key | 对应引擎 | 默认模型 | 默认发音人 | 凭证变量名 | 说明与亮点 |
|---|---|---|---|---|---|
| `kokoro` | 本地 Kokoro-82M ONNX | `hexgrad/Kokoro-82M` | `af_bella` | *无需密钥* | **100% 离线 CPU 神经网络合成** |
| `f5` | 本地 F5-TTS GPU 守护进程 | `F5-TTS` | 默认 | *无需密钥* | **高保真 GPU 零样本语音合成** |
| `elevenlabs` | ElevenLabs API | `eleven_multilingual_v2` | `Rachel` | `ELEVENLABS_API_KEY` | 极致拟人情感音色 |
| `openai` | OpenAI Audio | `gpt-4o-mini-tts` / `tts-1` | `alloy` | `OPENAI_API_KEY` | 经典高清发音 |
| `edge` | 微软 Edge 在线 | `zh-CN-XiaoxiaoNeural` | `zh-CN-XiaoxiaoNeural` | *无需密钥* | **免费免 Key 高保真神经网络语音** |
| `siliconflow` | 硅基流动 CosyVoice | `FunAudioLLM/CosyVoice2-0.5B` | 默认 | `SILICONFLOW_API_KEY` | SOTA CosyVoice2 语音大模型 |
| `deepinfra` | DeepInfra Kokoro | `hexgrad/Kokoro-82M` | 默认 | `DEEPINFRA_API_KEY` | 极速轻量 Kokoro 开源引擎 |
| `fireworks` | Fireworks AI | `kokoro` | 默认 | `FIREWORKS_API_KEY` | 毫秒级 Kokoro 推理 |
| `minimax` | MiniMax Speech | `speech-01-turbo` | 默认 | `MINIMAX_API_KEY` | 高表现力中文旗舰发音 |
| `mimo` | 小米 MiMo Audio | `mimo-v2.5-tts` | 默认 | `MIMO_API_KEY` | 低延迟流式语音 |
| `google` | Google Cloud TTS | `gemini-2.5-flash-preview-tts` | 语种默认 | `GEMINI_API_KEY` | 谷歌 Gemini 多语种神经网络合成 |
| `azure` | Azure 认知语音 | `en-US-JennyNeural` | 区域默认 | `AZURE_SPEECH_KEY` | 企业级神经网络发音人 |
| `deepgram` | Deepgram Aura | `aura-asteria-en` | `asteria` | `DEEPGRAM_API_KEY` | 极低延迟英文输出 |
| `groq` | Groq TTS | `playai-tts` | `default` | `GROQ_API_KEY` | 极速推理 |
| `openrouter` | OpenRouter Audio | `openai/gpt-4o-mini-tts` | `alloy` | `OPENROUTER_API_KEY` | 统一路由器通道 |
| `custom` | 自定义 OpenAI 规范 | 可配置 | 可配置 | `CUSTOM_TTS_API_KEY` | 任意兼容 `/v1/audio/speech` 接口 |
| `piper` | 本地 Piper ONNX | 本地权重 | 模型默认 | *无需密钥* | 100% 离线神经网络引擎 |
| `espeak` | 本地 eSpeak NG | 系统合成器 | `zh` / `en` | *无需密钥* | 100% 离线轻量兜底 |

---

## 📦 安装指南

```bash
dsh plugin --profile web add @goodandready/dsh-tts
```

> [!IMPORTANT]
> 安装后请重启 Web UI（`systemctl --user restart dsh-web`）并刷新浏览器标签页。

---

## ⚙️ 配置示例（`settings.yaml`）

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
      voice: zh-CN-XiaoxiaoNeural
    - provider: openai
      model: tts-1
      voice: alloy
  roles:
    coder:
      provider: openai
      voice: onyx
    reviewer:
      provider: edge
      voice: zh-CN-YunxiNeural
```

---

## 🤖 HTTP API 路由

* `GET /dsh-tts/stream` — 实时 SSE 音频流推送。
* `POST /dsh-tts/speak` — `{ text, voice?, model? }` → 返回合成音频。
* `POST /dsh-tts/preview` — `{ provider, model, voice, text? }` → UI 中试听语音。
* `GET /dsh-tts/models/status` — 查询本地模型安装状态（Kokoro、F5-TTS）。
* `POST /dsh-tts/models/install` — `{ engine: 'kokoro' | 'f5' }` → 启动模型下载。
* `DELETE /dsh-tts/models/delete` — `{ engine: 'kokoro' | 'f5' }` → 删除本地模型。
* `GET /dsh-tts/integrations` — 查询关联插件状态（`dsh-voice`、`dsh-messenger-gateway`）。
* `GET /dsh-tts/status` — 返回引擎链状态、缓存统计与引擎就绪信息。

---

## 📄 开源协议

MIT © [GooDAnDReaDY](https://github.com/GooDAnDReaDY)
