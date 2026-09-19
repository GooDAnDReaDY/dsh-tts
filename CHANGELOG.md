# Changelog

Notable changes to `@goodandready/dsh-tts`.

## 0.4.18

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
