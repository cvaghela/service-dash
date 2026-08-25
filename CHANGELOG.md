# Changelog

All notable changes to Service Dash are recorded here. This project follows
[Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- **The icon picker now searches the whole selfh.st catalogue** — around 2,900 icons rather than the 48 built in — and
  automatic matching uses it too, so a service the curated list never knew about (Frigate, Scrypted, and most of what a
  homelab actually runs) gets its real icon. The index is proxied at `/icon-index` so the page keeps `connect-src
  'self'`, cached for a day, and a host with no internet falls back to the built-in list.

### Fixed

- **CPU, RAM and load now appear immediately instead of waiting for chart discovery.** Every page load re-read the
  host's entire Netdata chart list, and the whole metrics panel stayed blank until that finished — on a busy host,
  several seconds, every refresh. Those three feeds do not depend on discovery, so they are painted on the first tick;
  storage and network still wait, rather than briefly showing the wrong volume or interface.
- **A saved network interface that no longer exists falls back to Auto.** When a container is recreated its `veth`
  interface disappears; the dropdown reset itself but the poller kept requesting the dead chart, so the network panel
  stayed broken and Netdata logged a 404 every two seconds.

## [1.2.0] — 2026-08-25

### Added

- **Icon picker in Card settings.** Typing a service name lists matching icons with their artwork; arrow keys move,
  Enter picks, Escape closes the list. Matching covers the icon's display name, its slug, and the keyword patterns
  automatic matching already used, so `hass` finds Home Assistant. Pasting an image link works exactly as before.
- **Several containers per card.** A card can be mapped to any number of Docker containers under **Mapped to**, and
  their CPU percentages and RAM are added together into the figure the card already showed. The tooltip names what was
  combined; a container that stops reporting is left out of the total rather than counted as zero.
- **`SHARED_SETTINGS`.** Set it to `on` to keep card settings, filters, storage and network selections, and notes in the
  `settings` volume instead of in each browser, so every browser and device sees the same dashboard. Off by default.
  Reading the shared settings is open; saving a change requires `SHARED_SETTINGS_USER` and a password supplied through
  `SHARED_SETTINGS_PASSWORD_FILE`, and the container refuses to start if the setting is on without one. Uptime Kuma
  credentials and the settings password are never included in the shared document.
- **A Content-Security-Policy on the dashboard document**, with `X-Content-Type-Options: nosniff` and
  `Referrer-Policy: no-referrer`. Images are restricted to the dashboard itself, `data:` URIs, and HTTPS hosts, so a
  hostile icon link cannot make a viewer's browser call plain-`http` LAN equipment.

### Changed

- **Cards with no icon now show a monogram** — the service's initials over a gradient keyed to its name — instead of the
  bundled Service Dash mark. It is drawn in the browser, so it still needs no internet access, and unlike a single
  shared mark it keeps every card distinguishable. The top-bar brand mark is unchanged.
- Opening **Card settings** on an automatically matched card shows the icon's name rather than its CDN URL.
- **Every byte figure now picks its own unit** — B, KB, MB, GB or TB — so a 40 MB container reads `40.0 MB` rather than
  `0.04 GB`, and container RAM is no longer pinned to MB. Host RAM, storage and container RAM all share one formatter.
- **The status dot sits in the card's top-right corner**, reporting the state of the whole card rather than riding along
  the top row.
- The icon editor's **Use default** button is now **Default icon**.

### Fixed

- Saving **Card settings** on an automatically matched card no longer converts the automatic match into a fixed
  override pinned to whatever URL was current at the time.
- Storage figures with no sample yet read `—` instead of `0.00 MB`, which reported an unread volume as an empty one.

## [1.1.1] — 2026-08-25

Housekeeping for the first public release. No functional changes to the dashboard.

### Added

- **`LICENSE`** — Service Dash is now explicitly released under the GNU General Public License v3.0.
- **`CHANGELOG.md`** — this file.
- `NETWORK_INFO_REFRESH_SECONDS` documented in the configuration table, including that it is required.

### Changed

- Favicon reduced from 800px/1.3 MB to 256px/94 KB. Every visitor previously downloaded 1.3 MB for a tab icon.

### Fixed

- Two stale statements in the README: an empty `SERVICE_ICONS` value now shows the bundled Service Dash mark rather
  than a "category emoji", and the browser-side login is no longer described as a "URL-unlock" action.

### Removed

- A leftover debug statement in the mobile long-press open path.

## [1.1.0] — 2026-08-25

### Added

- **Service icons.** Cards render a real service icon, resolved automatically from the
  [selfh.st icon set](https://github.com/selfhst/icons) by matching the service name (48 services recognised out of
  the box).
- **`SERVICE_ICONS`** environment variable, a JSON object of `"card name": "icon URL"`, for setting icon defaults
  across every browser.
- **Card settings.** A per-card panel for pointing a card at a custom icon URL and binding it to a Docker container,
  stored in the browser.
- **Per-container CPU and RAM.** Cards bound to a container show live CPU percentage and memory use, read from the
  bundled Netdata Agent's existing cgroup charts. No new privileges and no additional Docker socket access.
- **Login button** for status pages behind authentication.
- Bundled fallback and brand mark at `assets/img/service-dash-icon.png`.

### Changed

- Endpoint rows are individually tinted, and the endpoint currently serving the page is highlighted.
- LAN and WAN addresses stay blurred until hovered, focused, or tapped.
- Storage reads as a percentage, with used, free, and total capacity beneath it.
- Cards keep a consistent height across the grid regardless of endpoint count.
- Metrics and network panels rebuilt as plain rows rather than nested boxes.

### Fixed

- The left panel scrolls again; it previously swallowed the wheel and never moved.
- Removed an unintended colour cast on the metrics panel.
- The logo no longer overflows on narrow phones; the layout is clean down to 280px wide.
- Pinch zoom is no longer blocked on mobile.
- Icons no longer revert to placeholders when a page is restored from cache.
- `SERVICE_ICONS` default expansion in `entrypoint.sh` no longer depends on a brace form that POSIX `sh` parses
  differently, which would have crash-looped deployments on upgrade.

### Removed

- Dead group-count pill machinery that never rendered.

## [1.0.4] and earlier

See the [release history](https://github.com/cvaghela/service-dash/releases).

[1.2.0]: https://github.com/cvaghela/service-dash/releases/tag/v1.2.0
[1.1.1]: https://github.com/cvaghela/service-dash/releases/tag/v1.1.1
[1.1.0]: https://github.com/cvaghela/service-dash/releases/tag/v1.1.0
