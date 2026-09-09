# dsh-tts design (2026-08-20)

Web UI text-to-speech plugin. Messenger hubs are not coupled here: they can
call `POST /dsh-tts/speak` later.

## Behaviour

- Settings namespace `dsh-tts`, registered with `settings.register`.
- `speakReplies` default false. On `turn/end`, concatenate `assistant/message`
  text from that session, strip code fences, synthesize, enqueue for the browser.
- Browser polls `/dsh-tts/pending` and plays the blob. New audio interrupts the previous clip.
- Provider chain matches `dsh-voice`: skip missing credentials, fail only if all fail.

## Publication

Package `@goodandready/dsh-tts`. README uses placeholders only.

## Credentials

Cloud API keys are entered on the Speech card (write-only password + Configured badge). The host writes them with credentials.set under the provider env name. Plugin settings store chain/models only. GET config returns configured/writable/ref, never the value.

## 2026-09-09 update (quality block → 0.4.0)

- Host apply split: `lib/routes.js` (HTTP), `lib/stream-hub.js` (SSE), `lib/http-util.js`.
- Local Kokoro/F5: weight manager + honest failure; no bundled neural inference.
- Integrations detect peers only via `webServer.hasRoute`.
- Client remains a single ModuleLoader factory (`lib/client.js`).
