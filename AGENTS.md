# AGENTS.md — dsh-tts

Plugin-specific rules. The shared workflow stays in the DEV root AGENTS.md.

## Identity

- Package `@goodandready/dsh-tts`. The same name is in `package.json`, `cordis.patch.yml`, `lib/client.js` `load({ id })`, and `lib/index.js` `export const name`.
- Public npm package and public GitHub `GooDAnDReaDY/dsh-tts`.
- English is the canonical UI language. Chinese strings live in `lib/client-src/30-locales.js` and `README.zh.md`. Runtime code does not contain Russian.
