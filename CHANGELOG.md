# Changelog

All notable changes to Service Dash are recorded here. This project follows
[Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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

[1.1.1]: https://github.com/cvaghela/service-dash/releases/tag/v1.1.1
[1.1.0]: https://github.com/cvaghela/service-dash/releases/tag/v1.1.0
