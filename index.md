# dsh-tts

Text-to-speech for the DeepSeek Harness Web UI. Speaks agent replies through a host-side provider fallback chain. npm: `@goodandready/dsh-tts`.

- Package version: see `package.json` (source of truth)
- Install: `dsh plugin --profile web add @goodandready/dsh-tts`
- Tests: `npm test` (`node --test test/*.test.mjs`)
- Pack gate: `npm pack --dry-run` — every file `< 262144` bytes

## Honest offline status

| Engine | Weights download | Speech in this package |
|---|---|---|
| Edge TTS | n/a (CLI) | yes, if `edge-tts` is installed |
| Piper | user ONNX path | yes, if `piper` + model configured |
| eSpeak NG | n/a | yes, if `espeak-ng` is installed |
| Kokoro-82M | yes | **no** — inference not bundled |
| F5-TTS | yes | **no** — inference not bundled |

## Providers (18)

`kokoro`, `f5`, `openai`, `elevenlabs`, `google`, `azure`, `groq`, `deepgram`, `openrouter`, `siliconflow`, `deepinfra`, `fireworks`, `mimo`, `custom`, `edge`, `piper`, `espeak`, `minimax`

## HTTP routes

`/dsh-tts/status`, `/stream`, `/pending`, `/speak`, `/preview`, `/config`, `/credential`, `/stats`, `/cache`, `/integrations`, `/models/status`, `/models/install`, `/models/delete`

## Navigation

- README.md / README.ru.md / README.zh.md — install, config, provider matrix, routes
- AGENTS.md — agent rules
- docs/design/DESIGN.md — UX contract
- docs/architecture/2026-08-20-dsh-tts-design.md — baseline
- docs/testing/test-matrix.md — verification commands
- docs/deployment/0.4.0-checklist.md — release gate checklist

## Module map

| Path | Role |
|---|---|
| lib/index.js | apply, Config, synthesis, tools |
| lib/routes.js | HTTP routes |
| lib/providers.js | provider implementations |
| lib/text.js | scrubbing, pronunciation, split |
| lib/cache.js | disk LRU cache |
| lib/keys.js | credential refs / secret strip |
| lib/client.js | browser factory (single ModuleLoader entry) |
| lib/engines/* | local engine wrappers + model manager |
| scripts/f5_daemon.py | F5 ping-only control stub |
