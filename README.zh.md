# 📦 @goodandready/dsh-tts

<div align="center">

<h3>DeepSeek Harness 智能体语音朗读扩展插件（支持 10+ 引擎与磁盘缓存）</h3>

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

**`dsh-tts`** 为 **DeepSeek Harness** Web UI 提供智能体语音朗读功能，支持多达 10 种云端与本地 TTS 引擎，具备代码过滤与磁盘 LRU 缓存。

```mermaid
graph LR
    Reply[💬 智能体生成文本] --> Filter[代码与语法过滤器]
    Filter --> Cache{磁盘 LRU 缓存}
    Cache -->|命中缓存| Audio[播放语音]
    Cache -->|未命中| Chain{备用链轮询}
    Chain -->|首选引擎| Eleven[ElevenLabs / OpenAI]
    Chain -.->|备选引擎| Edge[EdgeTTS / Azure]
    Chain -.->|离线引擎| Local[本地 Piper / eSpeak]
    Eleven --> Audio
    Edge --> Audio
    Local --> Audio
```

---

## 📦 安装指南

```bash
dsh plugin --profile web add @goodandready/dsh-tts
```

---

## 📄 开源协议

MIT © [GooDAnDReaDY](https://github.com/GooDAnDReaDY)
