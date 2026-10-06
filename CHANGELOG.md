# Changelog

## 0.4.30

### Fixed
- **Supply Chain Security & Updater** (#196, #199):
  - Removed `--config.minimumReleaseAge=0` bypass in `lib/updater.js:installExact`, respecting pnpm supply-chain quarantine during updates.
  - Consolidated updater endpoint to canonical `/api/dsh-tts/update`, removing legacy `/dsh-tts/updater` route alias.
  - Implemented shared `updaterMutex` returning HTTP 409 `Install already in progress` across concurrent requests.
- **Theme Tokens & Design System** (#197):
  - Replaced legacy CSS custom properties with canonical DSH core theme tokens (`--dsw-state-warn-primary`, `--dsw-brand-primary`, `--dsw-bg-layer-3`).
- **Client Networking & Timeout Safety** (#198):
  - Wrapped all client `fetch` calls in `clientFetch(url, options)` utility with configurable 15-second `AbortController` timeout.
  - Added error rejection handlers on fire-and-forget telemetry, settings, and player requests.

## 0.4.29

### Fixed
- **Settings & Revision Management** (#151, #152):
  - Added robust `extractRevision` supporting nested Schemastery namespaces and entries array.
  - Return revision in `GET /dsh-tts/config` and send it in `PUT /dsh-tts/config`.
  - Eliminated stale `savedConfig` caching in `live()`, enabling direct live Schemastery volatile box evaluation.
- **Audio Pipeline, Tool Schema & Dedup** (#156, #157, #166, #173, #175, #190):
  - Enforced speech preparation, maxChars, and summarizeReply before sentence splitting in `speakAsItGoes`.
  - Added `id: { type: 'string' }` to `speak_text` tool output schema under `additionalProperties: false` preventing core ToolOutputError.
  - Included credential slot reference in cache and flight fingerprints avoiding cross-credential collisions.
  - In-memory index for synthesis cache avoiding O(N) fs scans.
- **Stream Hub & Web Player** (#158, #159, #160, #161, #174, #176, #186):
  - `skipCurrent()` now cancels active browser SpeechSynthesis and clears busy state.
  - `playAudio` resolves promise on NotAllowedError and detaches gesture listeners cleanly.
  - Disconnect slow SSE subscribers exceeding backpressure buffer threshold.
  - Registered updater routes inside ctx.effect with clean disposers.
- **Providers & Local Engines** (#165, #167, #168, #169, #170, #171, #172, #177, #178, #179, #180):
  - Nested integrations parser in UI and gated /speak on disabled channels.
  - Canonical EN defaults for Edge and eSpeak.
  - 100% key parity for EN/ZH model hints.
  - Google TTS validates MIME and wraps raw PCM in valid WAV container.
  - Azure SSML includes required xmlns/mstts attributes.
  - Robust model download locking, cancellation awaiting writer cleanup, and HTML error page rejection.
- **Release Hygiene & Sanitization** (#183, #184, #185):
  - Removed outdated marketing claims from READMEs.
  - Restored internal DEV docs while verifying exclusion from npm pack and GitHub mirror.
  - Cleaned up publish-github script to handle negation patterns.

## 0.4.28

### Fixed
- **Settings Contracts & Schemastery Validation** (#151, #152, #153, #155, #187, #188, #189):
  - Made all 9 previously static fields volatile and ensured living Volatile boxes are unwrapped dynamically in live() without stale snapshots.
  - Constrained maxQueue with .step(1).min(0) to reject non-integer and negative queue limits.
  - Added optimistic revision validation and rollback on conflict (HTTP 409) in settings saving.
  - Enforced isTrustedSettingsRequest auth guards on GET /dsh-tts/config and GET /dsh-tts/status.
  - Enforced contiguous sequence ordering in SSE synthesis chunks.

- **Audio Pipeline, Cache & Concurrency** (#154, #156, #157, #166, #173, #174, #175, #186, #190):
  - Sanitized and normalized text once in prepareSpeechText() before character limits or summary generation, eliminating double-clean pronunciation distortions.
  - Fixed subagent voice override gating with autoDetectSubagent !== false.
  - Extended cache and dedup fingerprints with endpoint, models, voices, role, and language.
  - Added admission concurrency throttle and semaphore for maxQueue synthesis reservations.
  - Implemented SSE subscriber backpressure tracking and dropped slow lagging subscribers (>512 KB buffer) with drain handling.
  - Switched cache index to an in-memory Map to eliminate disk scans on eviction.
  - Ensured speak_text tool returns metadata and delivers audio to pending queue/SSE without dumping base64 into LLM context.

- **Client Player & UI Parity** (#158, #159, #160, #161, #162, #163, #164, #165, #167, #168, #169, #176):
  - Unified EventSource listener connection in client, preventing duplicate audio channels.
  - Ensured skipCurrent() halts active playback immediately, and preview/replay route through the unified player.
  - Gracefully handled browser autoplay restrictions (NotAllowedError), pausing the queue until user interaction.
  - Kept compact recent/favorites history control visible in idle state.
  - Registered updater routes inside ctx.effect() to properly unbind on plugin disposal.
  - Enabled all 16 active providers in client UI, with secure key management and read-only indicators when settings scope is missing.
  - Fixed sibling integration detection using Cordis services without relying on obsolete hasRoute.
  - Re-anchored canonical defaults to English (en, en-US-AriaNeural) and achieved 100% parity between EN and ZH dictionaries.

- **Model Weights Manager & System Hygiene** (#177, #178, #179, #180, #181, #182, #183, #184, #185):
  - Stream chunk downloads now properly manage EventEmitter listeners without leaking error or drain handlers.
  - Added synchronous concurrency lock per engine to share in-flight downloads and used unique nonce temporary file paths.
  - Added minimum file size validation (minBytes / 1024 bytes) to reject truncated or error HTML downloads.
  - Validated engine parameter in /dsh-tts/models/install and /dsh-tts/models/delete, returning HTTP 400 for unknown engines.
  - Replaced tautological regex and source inspection tests with true runtime behavior tests.
  - Isolated cache tests in temporary directories with automated cleanup.
  - Synchronized README documentation with reality and strictly excluded internal dev docs (AGENTS.md, index.md, plans) from package distributions.
  - Closes #151, #152, #153, #154, #155, #156, #157, #158, #159, #160, #161, #162, #163, #164, #165, #166, #167, #168, #169, #170, #171, #172, #173, #174, #175, #176, #177, #178, #179, #180, #181, #182, #183, #184, #185, #186, #187, #188, #189, #190, #191.

## 0.4.27

### Fixed
- **Cloud Timeout Cancellation Forwarding** (#145): Fixed unquoted `abort` identifier in `lib/providers.js:21` inside `withCloudTimeout()`. Passing an active `AbortSignal` in `synthesize()` now cleanly attaches cancellation listeners without throwing `ReferenceError`.
- **Settings Save Handler Runtime Crash** (#146): Added a defensive `settingsApi` adapter to `lib/index.js` and bound `getSettingsApi()` in `apply()`. `PUT /dsh-tts/config` now updates live configuration and persists changes without `ReferenceError: settingsApi is not defined`.
- **Client Bundle Parity Verification** (#147): Added non-destructive `--check` mode to `scripts/build-client.mjs`, registered `check:client` npm script, and added automated test in `test/client-redesign.test.mjs` to prevent bundle drift.

## 0.4.24

### Fixed
- **Peer gate on DSH 0.2.0-rc.1** (#58): DSH skips a profile bundle whose `peerDependencies` exclude the running version, so this plugin was absent from the profile with no error in the UI. Every `@deepseek-ai/dsh-*` peer now names both the 0.1.7-rc.2 and 0.2.0-rc.1 lines, because semver does not admit a prerelease of the next minor into a range that does not name it.

Notable changes to `@goodandready/dsh-tts`.

## 0.4.23

### Security
- **Strict Settings Request Trust Policy**: Eliminated `same-site` and arbitrary auth header bypasses in `isTrustedSettingsRequest`. Rejects non-same-origin callers, validates matching origin/host pair with loopback remote address, and requires explicit token verification against `DSH_AUTH_TOKEN`/`DSH_TOKEN` (#119).
- **Protected Model Status & Path Redaction**: `GET /dsh-tts/models/status` now requires `isTrustedSettingsRequest` authorization (returns 403 for untrusted/cross-site requests) and completely redacts absolute filesystem paths from model state descriptors (#139).

### Added
- **One-Click Updater in Settings Card**: Integrated a unified live updater block (`PluginUpdaterBlock`) into the settings card, displaying current version, latest npm release badge, update execution button, and DSH restart instructions connected to `/dsh-tts/updater` and `/api/dsh-tts/update` (#120).
- **Durable Model Download Failure Tracking**: `modelManager` now tracks sanitized download failure states across engines, reports errors through protected status (`failed: true`, `error: sanitizedMessage`), and clears errors on retry or deletion (#141).

### Packaging
- **Clean Runtime-Only Package Boundary**: Updated `package.json` files allowlist to exclude `scripts/` (build/release tooling) and `lib/client-src/` from published npm archive, preserving strict runtime-only surface (#140).

## 0.4.22

### Fixed
- Enforce fail-closed `isTrustedSettingsRequest(req)` validation on `/stream`, `/pending`, and `/speak` HTTP handlers to reject untrusted cross-site requests with 403 Forbidden (#136).

## 0.4.21

### Fixed
- Settings no longer wait on the removed settingsScope service. The client uses configForms (#137).

## 0.4.19

### Fixed
- **Integration and cache stats reads require a trusted settings request.** `GET /dsh-tts/integrations` and `GET /dsh-tts/stats` now return 403 for a cross-site caller, the same rule as the other settings routes.
- **Removed the unused Kokoro WAV encoder.** Local Kokoro inference is not bundled, and nothing called `pcmFloat32ToWav`.


### Fixed
- **Settings reachable again on the plugin's own page**: the current DSH core
  (0.1.6-alpha.2) renders a plugin's configuration page only for entries registered
  in the plugin-list seat `plugins.item`. `TtsRowConfig` is now registered there too
  (`id: 'dsh-tts'`, order 60, static label); the row seat and the legacy
  `settings.plugin.item` card stay as fallbacks. Sources edited in `lib/client-src`,
  `lib/client.js` rebuilt.

## 0.4.17

### Added

- Settings now register into the Plugins page's row seat, `plugins.row.config`,
  keyed `@goodandready/dsh-tts#dsh-tts` (row id as `cordis.patch.yml` declares
  it): the plugin's row on the Plugins page gains a configure control whose page
  is the same settings form (`view: 'page'`), with a one-line state under the row
  title (`view: 'summary'`). The previous seat, `settings.plugin.item`, stays as
  a fallback for older cores, so settings never become unreachable (#127).

### Fixed

- The row-seat page renders the settings form **bare**: the host page already
  draws the title, icon and crumb and provides the content padding, so our own
  card chrome would double the border and shift the form out of the content area.

### Tests

- `test/row-config-seat.test.mjs` guards the row-seat key, the row id against
  `cordis.patch.yml`, the fallback seats, and the bare view-aware rendering.
