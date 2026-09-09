# dsh-tts

Text-to-speech plugin for the DeepSeek Harness Web UI. Speaks finished agent replies through a provider fallback chain (cloud + local system engines). Published on npm as @goodandready/dsh-tts.

- Status: active, working toward v0.4.0 (package version in package.json is source of truth)
- Install: `dsh plugin --profile web add @goodandready/dsh-tts`
- Tests: `npm test` (`node --test test/*.test.mjs`)
- Pack size gate: `npm pack --dry-run` — every file must stay under 262144 bytes

## Offline engines (honest status)

- Kokoro / F5 weights can be downloaded, but **ONNX/GPU inference is not bundled** in this package.
- Those providers fail with a clear reason and the chain falls through to Edge / Piper / eSpeak / cloud.
- Do not market local neural synthesis until a supported runtime is wired and tested.

## Navigation

- README.md / README.ru.md / README.zh.md — install, configuration, provider table, HTTP routes
- AGENTS.md — project rules for agents
- docs/design/DESIGN.md — design contract
- docs/architecture/2026-08-20-dsh-tts-design.md — design baseline
- docs/plans/2026-08-20-dsh-tts.md — original implementation plan

## Module map (host)

- lib/index.js — apply, Config, synthesis orchestration, tools
- lib/routes.js — all /dsh-tts HTTP routes
- lib/providers.js — provider implementations
- lib/text.js — scrubbing, pronunciation, sentence split
- lib/cache.js — disk LRU speech cache
- lib/keys.js — credential refs and secret stripping
- lib/client.js — browser factory (player, settings card, dock)
- lib/engines/* — local engine wrappers and model manager
