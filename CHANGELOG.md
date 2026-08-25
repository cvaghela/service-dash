# Changelog

All notable changes to Service Dash are recorded here. This project follows
[Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.2.2] — 2026-08-25

A fix release. Anyone running the CasaOS Compose file from 1.2.1 needs this
one: that stack could not start.

### Fixed

- **The CasaOS stack failed to start.** `kuma-auth` was placed on the implicit
  `default` network while everything else sits on `service-dash-network`. Two
  separate bridges means Docker's DNS never resolves the name, so nginx exited
  with `host not found in upstream "kuma-auth"` and the dashboard sat in a
  restart loop. The file is valid YAML and `docker compose config` accepts it,
  which is why validation missed it; `scripts/check-compose-networks.py` now
  cross-references every nginx upstream against each Compose file's networks and
  runs in CI.
- **A missing validator no longer takes the whole dashboard down.** nginx looks
  `kuma-auth` up per request through Docker's resolver instead of at config-load
  time, so a validator that is stopped or slow to start fails only its own
  subrequest — which `auth_request` turns into a refused write, the same answer
  as an explicit no. The dashboard keeps serving.
- **Cards no longer flicker every poll.** The fifteen-second poll rebuilt both
  chip rows from `innerHTML` and rewrote every card's status, uptime, URLs,
  active row and container figures whether or not anything had changed. Since
  `.card` carries a `backdrop-filter`, each pointless write cost a real repaint.
  Idle over 35 seconds, card mutations drop from 899 to 189.
- **CPU and RAM no longer vanish and return.** A single missed Netdata sample
  blanked the reading; the last good value is held for 20 seconds before giving
  way to `—`, and the bars hold with their figures rather than emptying beneath
  them.
- **Scrolling.** The scroll handler was not passive, so the browser had to wait
  to see whether it would call `preventDefault` before it could scroll, and it
  wrote a class on every event.
- **Icons rendered as words on a host with no internet.** Material Symbols were
  styled entirely by Google's stylesheet, so a host that cannot reach
  `fonts.googleapis.com` got no rule at all and every icon showed its raw
  ligature — `stacked_line_chart` printed in a panel heading. The icons are now
  hidden when the font genuinely fails to load.
- **Security headers reached only one endpoint.** They were declared inside
  `location /`, which is a sibling of every other location rather than their
  parent, so `add_header` never applied to `/config.js`, `/assets/`,
  `/settings/state.json`, `/icon-index` or the JSON endpoints. `nosniff` and
  `Referrer-Policy` are now declared per block. The Kuma and Netdata proxies are
  deliberately excluded, since they serve third-party UIs.

### Changed

- **Service URLs and the LAN and WAN addresses swapped their two states.**
  Signed out they read `URL Locked` / `IP Locked` rather than sitting behind a
  blur, because there is nothing to reveal — the value is never requested.
  Signed in, the real value is covered until hovered or focused, which is what
  the addresses already did and now applies to every card link. A signed-in
  monitor that simply has no URL reads `No URL`.
- **The network caption** now reads "Auto detected from the host network!".

### Performance

- Per-card elements are resolved once when the card is built rather than
  re-queried on every poll, and the clock builds its `Intl` formatters once
  instead of once a second.

## [1.2.1] — 2026-08-25

### Added

- **Uptime Kuma's login now gates settings changes**, replacing the separate password. A new `kuma-auth` service answers
  one question for nginx — is this browser really signed in? — by asking Kuma itself, which verifies the token against
  its own secret, checks the user is still active, and rejects tokens issued before a password change. Reading settings
  stays open; anything that is not an explicit yes is a no.
- **A settings page**, opened from the gear in the top bar. Settings apply to every browser and device; changing them
  asks for a Kuma sign-in. It holds how often the network addresses are re-read, which the `network-info` service now
  reads from the shared document and picks up on its next pass, so `NETWORK_INFO_REFRESH_SECONDS` is optional and only
  a starting value.
- **Service URLs, and the host's LAN and WAN addresses, are hidden until you sign in**, shown as a blurred mask. While
  locked the addresses are not requested at all, so they never reach the browser.
- **The icon picker now searches the whole selfh.st catalogue** — around 2,900 icons rather than the 48 built in — and
  automatic matching uses it too, so a service the curated list never knew about (Frigate, Scrypted, and most of what a
  homelab actually runs) gets its real icon. The index is proxied at `/icon-index` so the page keeps `connect-src
  'self'`, cached for a day, and a host with no internet falls back to the built-in list.

### Removed

- **`SHARED_SETTINGS`, `SHARED_SETTINGS_USER` and `SHARED_SETTINGS_PASSWORD_FILE`.** Settings are always shared and
  always gated on a Kuma login, so there is nothing to switch on and no password to create.
- **`SERVICE_ICONS`.** Icons are matched from the full catalogue and edited per card in the browser.

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

[1.2.2]: https://github.com/cvaghela/service-dash/releases/tag/v1.2.2
[1.2.1]: https://github.com/cvaghela/service-dash/releases/tag/v1.2.1
[1.2.0]: https://github.com/cvaghela/service-dash/releases/tag/v1.2.0
[1.1.1]: https://github.com/cvaghela/service-dash/releases/tag/v1.1.1
[1.1.0]: https://github.com/cvaghela/service-dash/releases/tag/v1.1.0
