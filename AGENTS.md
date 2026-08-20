# dsh-tts

Publishable DSH plugin. Scoped name `@goodandready/dsh-tts` must match in
`package.json`, `cordis.patch.yml` → `name:`, and `lib/client.js` loader id.

- Develop in this repository only (Gitea `goodandready/dsh-tts`).
- Git: `git-cursor`. Do not put infra paths, IPs, or secrets in the tree.
- Tests: `npm test`. After `file:` installs, `remove` then `add` so pnpm copies files.
- Do not speak into the model transcript; audio stays on the host/browser path.
- Telegram wiring is out of scope for this plugin.
