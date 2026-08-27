# TTS Live + Offline — Design

**Date:** 2026-08-26
**Project:** dsh-tts
**Goals:** B (live feeling, streaming) + C (offline/cheap), both engine variants (CPU+GPU) with manual install, all toggles in settings.

## 1. Architecture

`TtsEngine` interface unifies all synthesizers:

```ts
interface TtsEngine {
  id: 'kokoro'|'f5'|'piper'|'cloud'
  supports(lang: string): boolean
  synthesize(text: string, voice: string): AsyncIterable<Float32Array> // streaming
}
```

Layers:
- **Local engines:** `KokoroEngine` (ONNX 82M, CPU, streaming generator), `F5Engine` (Python daemon `scripts/f5_daemon.py`, GPU, zero-shot), `Piper`/`eSpeak` existing wrappers.
- **Cloud streaming:** `CloudStreamingEngine` wraps `openai/elevenlabs/edge` with `stream:true` → SSE PCM.
- **AdaptiveRouter:** `detectGPU()` via `nvidia-smi`, checks `models/` presence, per-role `engine: auto|local|cloud|off`, latency tracking (`lastLatency`, `failCount` → unhealthy 5min).

Existing `PROVIDER_KEYS` chain remains as cloud fallback. Single `speechCache` key includes `engine+voice`.

## 2. Components & Settings

**Components:**
- `EngineRegistry` — lists `availableEngines` (installed + supports lang)
- `ModelManager` — downloads from HF (`hexgrad/Kokoro-82M`, `SWivid/F5-TTS`), progress, sha256 verify, delete. **No auto-download.**

**Settings card (all toggles, collapsible):**
- Master: `[ ] Enable local engines`
  - `[x] Kokoro (CPU)` — status: Not installed → button `Install 450MB` → progress bar → Installed
  - `[ ] F5-TTS (GPU)` — auto `enabled: nvidia-smi ? true : false`, same manual install flow (`Install 2.1GB`)
- Per-role engine: `Reply [auto ▼]`, `Approval [local ▼]`, `Error [cloud ▼]` — `off` skips TTS for role
- Streaming: `[x] Enable streaming`

All toggles write immediately to `settings` (no restart). `ModelManager` shows size/status.

## 3. Data Flow

```
[Settings] Install click → POST /dsh-tts/models/install {engine} → ModelManager stream → models/f5/*
TTS request → Router:
  if role.engine=='local' && !installed → error "Press Install" (no silent fallback)
  if auto → try local if installed && supports(lang) && healthy else cloud
  RTF>1.0 → mark unhealthy, fallback to cloud next request
Synthesis → Kokoro/F5 PCM chunks → SSE → AudioWorklet feeds AudioContext immediately
```

## 4. Error Handling

- Not installed → red badge + Install button, synthesis returns clear error (not fallback)
- Download interrupted → rm tmp, status Error, retry via button
- GPU OOM → mark F5 unhealthy 5min, fallback to Kokoro/cloud, increment `stats.providers[f5].errors`
- All `require` for primitives guarded (existing pattern).

## 5. Testing

- Unit: `EngineRegistry` detect, `ModelManager` download/verify, `Router` selection matrix, `detectLang` already exists
- Integration: `POST /models/install` progress, `synthesize` with mocked engines
- Manual: dark/light theme, cold start without models, GPU vs CPU machine, streaming first-audio latency <500ms

## 6. Rollout

Worktree `feat/tts-live-offline` from `origin/main`, one commit per component, `node --test` + production smoke, version bump `z` only after 5-feature pool or hotfix.

