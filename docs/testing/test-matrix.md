# dsh-tts test matrix

Run from repository root.

| Check | Command | Pass criteria |
|---|---|---|
| Unit tests | `npm test` | all green (`node --test test/*.test.mjs`) |
| Pack size | `npm pack --dry-run` | no file `>= 262144` bytes; prefer `< 256000` |
| Scoped name | `grep -n @goodandready/dsh-tts package.json cordis.patch.yml lib/index.js lib/client.js` | match in all four |
| Style mark | `grep -n data-dsh-plugin lib/client.js` | present |
| No synthetic tone | `grep -n 440 lib/engines/kokoro.js` | no sine generator |
| No sibling FS probe | `grep -n process.cwd lib/routes.js` | absent |

## Manual / runtime (DSH harness)

1. Enable **Speak agent replies** with chain `edge` then `espeak`.
2. Confirm speech, pause/stop in input dock, recents replay.
3. Preview a cloud provider with a test key (not in git).
4. Settings card loads; `unavailable` snapshot blocks writes.
5. `/dsh-tts/status` and `/dsh-tts/config` same-origin only for writes.
6. Kokoro/F5 enabled → chain falls through with honest error, no tone.
