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
