# 📦 @goodandready/dsh-tts

<div align="center">

<h3>DeepSeek Harness 智能体多引擎语音合成与磁盘 LRU 缓存插件</h3>

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

## ⚡ 插件概览

**`dsh-tts`** 为 **DeepSeek Harness** Web 界面提供高保真智能体回复语音朗读服务。开启 **朗读智能体回复** 后，每条生成的助手回复均由服务端合成并实时推流至浏览器播放。

API 密钥绝不暴露给前端：音频合成全程在服务端通过**多服务商独立备用链**执行。

```mermaid
graph LR
    subgraph Input [助手回复文本]
        Reply[💬 智能体生成文本] --> Scrub[代码与 Markdown 智能过滤器]
    end

    subgraph Cache [性能缓存层]
        Scrub --> LRU{磁盘 LRU 缓存}
        LRU -->|命中缓存| Play[即刻推流播放]
    end

    subgraph Fallback [TTS 引擎备用链]
        LRU -->|未命中| Chain{生效备用链}
        Chain -->|首选优先级| P1[ElevenLabs / OpenAI]
        Chain -.->|遇 429 限流| P2[EdgeTTS / Azure / Google]
        Chain -.->|离线兜底| P3[本地 Piper / eSpeak NG]
    end

    subgraph Output [输出交付]
        P1 --> Store[写入磁盘缓存]
        P2 --> Store
        P3 --> Store
        Store --> Play
    end

    style Input fill:#1e1e2e,stroke:#89b4fa,stroke-width:2px,color:#cdd6f4
    style Cache fill:#181825,stroke:#cba6f7,stroke-width:2px,color:#cdd6f4
    style Fallback fill:#11111b,stroke:#a6e3a1,stroke-width:2px,color:#cdd6f4
    style Output fill:#181825,stroke:#f38ba8,stroke-width:2px,color:#cdd6f4
```

---

## 🛠️ 支持的服务商矩阵

| 服务商 Key | 对应后端 | 默认模型 | 默认发音人 | 环境变量凭证 | 特性说明 |
|---|---|---|---|---|---|
| `elevenlabs` | ElevenLabs API | `eleven_multilingual_v2` | `Rachel` | `ELEVENLABS_API_KEY` | 极致拟人情感音色 |
| `openai` | OpenAI Audio | `tts-1` | `alloy` | `OPENAI_API_KEY` | 经典高清发音 |
| `azure` | Azure 认知语音 | `neural` | 按区域适配 | `AZURE_SPEECH_KEY` | 企业级神经网络语音 |
| `google` | Google Cloud TTS | `Neural2` | 语种默认 | `GOOGLE_TTS_KEY` | 多语种高保真合成 |
| `edgetts` | 微软 Edge 在线 | Online Neural | `zh-CN-XiaoxiaoNeural` | *无需密钥* | **免费免 Key 高保真神经网络语音** |
| `deepgram` | Deepgram Aura | `aura-asteria-en` | `asteria` | `DEEPGRAM_API_KEY` | 极低延迟语音输出 |
| `groq` | Groq TTS | 极速推理 | `default` | `GROQ_API_KEY` | 毫秒级生成 |
| `piper` | 本地 Piper ONNX | 本地模型 | 模型默认 | *无需密钥* | 100% 离线轻量级神经网络引擎 |
| `espeak` | 本地 eSpeak NG | 系统合成器 | `zh` / `en` | *无需密钥* | 100% 离线轻量兜底 |

---

## 📦 安装指南

```bash
dsh plugin --profile web add @goodandready/dsh-tts
```

---

## 📄 开源协议

MIT © [GooDAnDReaDY](https://github.com/GooDAnDReaDY)
