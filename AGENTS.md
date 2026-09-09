# dsh-tts

Publishable DSH plugin. Scoped name `@goodandready/dsh-tts` must match in
`package.json`, `cordis.patch.yml` → `name:`, `lib/index.js` export, and
`lib/client.js` loader id.

## Constraints (MUST NOT)

- Do not put infra paths, IPs, hostnames, or secrets in the tree or README.
- Do not emit synthetic audio (sine/tone) as a stand-in for missing neural runtimes.
- Do not claim Kokoro/F5 offline neural synthesis in README until real inference is implemented and tested.
- Do not probe `../sibling-plugin` filesystem paths for integrations; use runtime routes only.
- Do not use `--force` install modes for the plugin profile.

## Conventions

- Develop in this repository only (Gitea `goodandready/dsh-tts`).
- Git identity: `git-mimo` (or the assigned agent wrapper). Bare `git` is not used for project commits.
- Host modules are ESM under `lib/`; browser half is a single ModuleLoader factory in `lib/client.js`.
- Styles must set `data-dsh-plugin="dsh-tts"`. Colors only from DSH theme variables.
- Source language is English (code, comments, locale keys). Speech data strings (IT dictionary, speech phrases) may be language-specific.
- Keys live in credentials storage; settings hold env-name refs only.

## Test matrix

- `npm test` — unit tests via `node --test test/*.test.mjs`
- `npm pack --dry-run` — Store file-size gate (256 KiB per file)

## Layout

- lib/index.js — apply + Config + synthesis
- lib/routes.js — HTTP routes
- lib/client.js — browser UI/player
- lib/engines/ — local engine wrappers (honest fail when runtime not bundled)
- docs/design/DESIGN.md — UX contract
