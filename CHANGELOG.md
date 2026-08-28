# Changelog

All notable changes to Service Dash are recorded here. This project follows
[Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Fixed

- **Content ran under the iPhone status bar.** `viewport-fit=cover` in 1.4.1
  correctly took the background edge to edge, but nothing then held the cards
  clear of the notch, so the date and time panel sat behind the clock and signal
  icons and the hamburger landed on the battery. The inset now goes on `.app`
  and on the two pieces of fixed mobile chrome — never on the background, which
  is painted by `.bg` and `.noise`, fixed siblings covering the whole viewport.
  The gradient still runs under the notch and behind the home indicator; only
  the content moves. `env()` is zero on every device without a notch, so
  nothing about the desktop layout changes.
- **The header would have been inset twice.** `.topbar` lives inside `.app` and
  carried its own `env(safe-area-inset-top)` in `padding-top`. With `.app` now
  supplying the inset, that padding pushed the header down by twice the notch;
  it is a flat 14px again. The sticky offset keeps its inset, because that one
  is measured from the viewport rather than from `.app`.

## [1.4.1] — 2026-08-28

**Drop-in.** No Compose file changed shape on any platform — `docker compose pull && docker compose up -d` is the whole upgrade. Phone-only changes; nothing about the desktop layout moves.

### Added

- **Haptic feedback on phones.** Opening a card, flipping the link-mode or theme
  switch, the long-press peek and a settings save each carry a distinct buzz,
  through one small vocabulary so the whole app speaks the same language.
  Android and Chrome only — iOS Safari has never implemented the Vibration API,
  and no shim changes that. Gated on a coarse pointer too, since a desktop
  paired with a gamepad can expose `navigator.vibrate()` and buzzing a laptop is
  a fault report, not feedback.

### Changed

- **The page no longer zooms on a phone.** Three mechanisms, because no single
  one covers it: `user-scalable=no` stops pinch-zoom where it is honoured,
  `touch-action: manipulation` removes double-tap-to-zoom and the ~300ms tap
  delay that came with it — which is the part iOS actually respects — and form
  controls step up to 16px below 820px.

### Fixed

- **iOS zoomed the page in whenever a field took focus, and never zoomed back
  out.** Every input, textarea and select was inheriting a ~13.3px default, and
  iOS scales the viewport up for anything under 16px. This is the zoom people
  actually hit; the viewport meta tag does not prevent it.
- **`env(safe-area-inset-*)` was resolving to zero on iOS.** Five rules already
  used it — the top bar, the scroll-top button, the side stack, the demo banner
  — but it only returns a real value with `viewport-fit=cover` in the viewport
  meta, which was missing. The notch and home indicator were being ignored.

## [1.4.0] — 2026-08-28

**Drop-in.** No Compose file changed shape on any platform — `docker compose pull && docker compose up -d` is the whole upgrade. Your saved Local/External preference is kept exactly as it was; the new Auto mode is opt-in with one click.

### Fixed

- **Dialogs opened underneath the mobile chrome.** On a phone the hamburger
  (z-index 9999), the expanded topbar (9998) and the scroll-top button (9998)
  are all fixed, while every dialog sat at 100 — so the topbar covered the
  sign-in fields and had to be dismissed by hand before the form could be used.
  Tapping where the username field appears hit the topbar instead. Dialogs now
  outrank the mobile chrome, and the toast outranks dialogs so feedback about a
  dialog stays readable.
- **The settings panel could not be reached on a short screen.** The overlay had
  no overflow handling, and a centred grid item overflows its container at
  *both* ends — the half above the top edge sits at negative scroll offset,
  where nothing reaches it. At 500×603 the heading measured at -138px. The
  overlay now scrolls, centring gives way to start-alignment when it cannot fit,
  and scrolling a dialog no longer scrolls the dashboard behind it.
- **Single-key shortcuts fired while you were typing.** Every one of them had
  to remember its own guard, and two had forgotten. <kbd>L</kbd> cycled the link
  mode on every `l` typed anywhere — including the search box, whose placeholder
  suggests typing `plex`. <kbd>/</kbd> was worse: typing a slash in the notes
  jumped focus to the search field *and* swallowed the character, because the
  handler calls `preventDefault()`. The check now lives in one place
  (`isTypingTarget()`), covers `select` and `contenteditable` as well, and
  <kbd>Escape</kbd> is deliberately exempt — it is how you leave the field you
  are typing in.
- **The demo banner wrapped on almost every window.** Centring it with
  `left: 50%` capped its shrink-to-fit width at half the viewport, whatever
  `max-width` said, so the full sentence wrapped below roughly 1300px. It is now
  centred with auto margins, trims to just the credentials when the window is
  genuinely narrow, squares its corners only when it has actually wrapped, and
  steps aside for the toast and for any open dialog.
- **A service with only a LAN monitor was titled "Duplicati local".** The
  `local` suffix is a pairing hint, not part of the service's name, and it was
  only being stripped when a matching public monitor existed to supply a
  cleaner one. Found by giving the demo realistic addresses.

### Added

- **Automatic link mode.** The header toggle gains a third position, ✨ Auto,
  which is now the default for a new install. Each card opens its LAN address
  when this browser can reach one and its public address otherwise, decided per
  card rather than for the whole dashboard. The evidence is the address bar: a
  dashboard loaded from `http://192.168.1.50:8888` has already proved this
  browser routes to that LAN, so nothing is probed — which also keeps the
  dashboard's `connect-src 'self'` policy intact and costs no time on load. The
  two mistakes are not equally cheap, so the rule is one-sided: the public
  address still works from the sofa, a LAN address from a café does not, and
  anything unproven — a Tailscale or carrier-NAT address, an unrecognised name
  — resolves to public. Kuma's own heartbeat breaks the tie when the LAN
  monitor is down and the public one is up. Hovering a card says which address
  it picked and why. An upgrade changes nothing on its own: a saved Local or
  External preference is kept exactly as it was, and Auto is one click away.
  Choosing Local or External is remembered against the address it was chosen
  at, so "Local", picked at home, is no longer still in force on a public URL
  where it would open a dead link.
- **A live demo**, at
  [cvaghela.github.io/service-dash/demo](https://cvaghela.github.io/service-dash/demo/),
  so the dashboard can be tried before anything is installed. It inlines the
  real `index.html`, stylesheet and `app.js` and fakes only the backends, so it
  is the application rather than a mock-up of it. Sign in as `test` / `Test`.
  The icons and the ~2,900-entry catalogue behind the picker are the real ones.
- **A GitHub Pages mirror of the app store**, at
  `https://cvaghela.github.io/service-dash/pages/store.json`, for when jsDelivr
  is serving a stale catalogue — as it was for several hours after 1.3.3, still
  advertising 1.3.2 while `gh-pages` was correct. It is a second build rather
  than a copy: the generated paths are joined onto the `base_url` fixed at build
  time, so a one-build mirror would have sent clients back to the stale copy for
  everything but the index. jsDelivr stays the documented URL, being reachable
  where Pages is not.

## [1.3.3] — 2026-08-27

**Drop-in.** No Compose file changed shape this release, on any platform — `docker compose pull && docker compose up -d` is the whole upgrade.

### Added

- **A ZimaOS app store source.** `appstore/` publishes Service Dash as a
  subscribable ZimaOS store, built by IceWhale's official build action
  and served from the `gh-pages` branch. ZimaOS users add
  `https://cdn.jsdelivr.net/gh/cvaghela/service-dash@gh-pages/store.json` once,
  then install and update from the UI without SSH. No change to the app itself.
- **arm64 images.** All three images now build for `linux/arm64` as well as
  `linux/amd64`, which brings CasaOS on a Raspberry Pi and other ARM boards into
  range. Both bundled third-party images already published arm64.

  This is the release that first publishes them, so the app-store entry
  advertises `arm64` from here too. The store verifies that claim against the
  real registry manifest, which is exactly why it could not be declared any
  earlier.

- **A scripted submission to IceWhale's official store.**
  `scripts/sync-appstore-upstream.py` renders that store's variant of the app
  entry from the one in `appstore/`, so the two cannot drift, and
  `sync-upstream-appstore.yml` opens the pull request. Manual to run: nothing
  here can merge into their repository, so a PR per release would only pile up
  on their tracker.

- **Saving settings closes the dialog** and returns you to the dashboard,
  rather than leaving it open over the page you were looking at. Confirmation
  moves to a toast, so it survives the close — including the one message worth
  keeping, that a save made while signed out reached only this browser.

### Fixed

- **The store served users a stale catalogue indefinitely.** Publishing pushed
  `gh-pages` with `force_orphan`, replacing its history with a fresh root commit
  every time. That left jsDelivr's `@gh-pages` resolution pinned to a commit no
  longer on the branch, and it kept serving that content — purging a path does
  not invalidate a stuck ref. A commit-pinned URL returned the new store while
  the branch URL returned an old one, which is how it was found. gh-pages now
  accumulates ordinary commits.

  Publishing also purges the CDN for every metadata file it writes, since
  jsDelivr serves `@gh-pages` with `s-maxage=43200`, and then **checks that the
  purge took** by comparing what the CDN serves against what was just built —
  a purge can report success and still leave the edge stale if it re-fetched
  before GitHub had propagated the push. Every file is checked, not a sample:
  they expire independently, and a run that checked one file reported success
  while `store.json` was still serving the previous catalogue.
- **The store claimed to work on CasaOS.** It publishes ZimaOS's v2 protocol
  only, with no legacy `store/main.zip`, so CasaOS's custom-source feature
  cannot read it. The README, `appstore/README.md` and the store's own
  description now say ZimaOS, and point CasaOS users at the Compose file.
- **The app-store listing described features that do not exist** — cards being
  renamed, re-categorised and reordered, and public URLs being set per card.
  Both addresses come from how the Uptime Kuma monitors are named, and the
  install tips now say so, with an example. The tips also no longer tell people
  to install Uptime Kuma "from this store", which carries only Service Dash.

## [1.3.2] — 2026-08-26

**CasaOS and ZimaOS deployments need a one-line Compose edit** — see
"Upgrading from 1.3.1" in the README. Everything else arrives with the images.

### Added

- **Two privacy settings.** Service links and the host's LAN and WAN addresses
  stay unreadable until pointed at; either cover can now be turned off. Both
  default on, and a settings document written before this release keeps
  behaving as it did.
- **An About section in Settings**, showing the running version, the copyright
  and links to the source and licence. The version is read from the asset
  cache-buster, so it cannot disagree with the release it claims to be.

### Changed

- **The refresh interval is a stepped slider** over the intervals someone would
  actually pick — 30 seconds through 24 hours — rather than a number field. A
  value that is not one of those stops keeps its own stop, so opening the dialog
  and saving cannot quietly round it.
- **The settings dialog was rebuilt around one row.** Every setting reads the
  same way: what it is on the left, the control on the right. "Fixed at
  deployment" now shows the values it previously only named, and the status line
  sits beside Save instead of adrift above it.
- **The dashboard's own switch is used for the privacy toggles**, which turned up
  two faults in it: its track and on-state colours pointed at CSS variables that
  are declared nowhere, and its input was `display: none`, so it could not be
  reached from the keyboard. Both are fixed for the top bar too.
- **Attribution** is shown in Settings → About, and every source file carries a
  copyright header. The README states the attribution term GPLv3 §7(b) permits.

### Fixed

- **Storage reported a single `/` on CasaOS and ZimaOS**, and had since the
  CasaOS Compose file was first added. Netdata's disk collector needs the host
  root bound into its container to walk the mount table; the file bound only
  `/DATA`, so the collector fell back to the container's own root. Confirmed on
  a real host.

### Documentation

- The README was rewritten and now leads with what is actually distinctive:
  every service's local *and* public URL on one card, with a single switch
  deciding which a click opens. It gains screenshots, an architecture diagram,
  and platform claims that carry their reasons. It also loses a section
  documenting `SERVICE_ICONS` as an environment variable — that was removed in
  1.2.1, and following it would have done nothing.

## [1.3.1] — 2026-08-26

A drop-in upgrade from 1.3.0: only the dashboard's own JavaScript and markup
changed, so pulling the new images is enough.

### Changed

- **The settings gear is hidden until you sign in.** Settings can only be
  changed while signed in — nginx refuses the write otherwise — so offering the
  gear to a signed-out visitor led only to a dialog whose Save could not work.
  It is hidden rather than disabled, starts hidden in the markup so it never
  flashes on the way there, and `openSettings()` is guarded as well as the
  button being hidden, so the rule holds however the dialog is reached.

### Fixed

- **A revealed button no longer has its layout overridden.** Showing one set an
  inline `display: flex`, which suits a `.pill` but not the gear: `.iconbtn`
  centres its glyph with `display: grid` and `place-items: center`, and the
  inline value overrode that, leaving the glyph against the start of its own
  circle instead of the middle of it. Showing now clears the inline display
  rather than choosing one, so each button lays out the way its own rule says.

## [1.3.0] — 2026-08-26

A drop-in upgrade from 1.2.2: nothing in the Compose files, the images'
configuration or `entrypoint.sh` changed, so pulling the new images is enough.

### Added

- **A padlock in front of every locked value** — the card links, the LAN and WAN
  addresses, and the notes panel — so the state reads at a glance rather than
  resting on the word alone. Drawn as a masked SVG rather than a Material
  Symbols glyph: the icon font is hidden outright when it cannot load, and a
  lock that vanished exactly when the page could least explain itself would be
  the wrong trade.
- **Clicking a locked value says what to do about it.** The notes panel is a
  real button, so it answers to the keyboard as well as the pointer.
- **The sign-in password can be revealed.** A typo could previously only be
  found by clearing the field and starting again, on a form whose only other
  feedback is that the username or password was wrong, with no clue which. The
  dialog always opens masked, and closing it re-masks.
- **The wheel now chains from the page into the pinned left column.** The column
  already chained outward; the other direction did not exist, so with the
  pointer over the cards the page scrolled to its end and stopped, leaving the
  rest of the column unreachable. The hovered pane consumes first in either
  direction, which is the rule the column already followed. The listener is
  passive: it acts only once the page cannot move, so ordinary scrolling stays
  entirely native.

### Changed

- **Notes are covered until you sign in**, like the service URLs. The field is
  emptied rather than merely disabled, so the text is not sitting in the page,
  and a "Notes Locked" panel stands in at the same height so nothing resizes.
  Note that the shared settings document is readable without signing in by
  design, so this hides the notes from the page rather than making them secret.
- **The sign-in dialog is written in the reader's terms.** It described its own
  plumbing — a heading naming Socket.IO, a paragraph naming `/kuma/socket.io`
  and the public status API — and promised only monitor URLs, which had stopped
  being true. It now says what it is and what signing in gets you. The button
  that signs you in says so instead of "Connect", and the note under Remember me
  says the session is kept on this device rather than naming localStorage.
- **The refresh button is gone.** The fifteen-second poll already covered it.

### Fixed

- **Notes could be wiped for every device.** Saving read the note straight back
  out of the textarea, so any save while the field was deliberately empty — and
  changing a filter is enough to trigger one — would have written an empty
  string over the shared notes.
- **A locked address reported itself as "unavailable"**, which reads like a
  fault to go and investigate. Locked and unavailable are different problems and
  only one is actionable. A locked card offered "Use Unlock URLs", naming a
  control that does not exist.
- **Card URLs are gated on the session**, not merely on whether a URL happens to
  be known — the same test the LAN and WAN addresses already applied. Uptime
  Kuma only sends the monitor list to an authenticated socket, so these were
  equivalent in practice; relying on a server not to send something is weaker
  than not displaying it.

### Internal

- `scripts/check-release.py` fails the build when the version in the Compose
  image tags, the asset cache-busters, the README and the CHANGELOG disagree —
  the slip that ships a release pointing at the previous images.

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

[1.4.1]: https://github.com/cvaghela/service-dash/releases/tag/v1.4.1
[1.4.0]: https://github.com/cvaghela/service-dash/releases/tag/v1.4.0
[1.3.3]: https://github.com/cvaghela/service-dash/releases/tag/v1.3.3
[1.3.2]: https://github.com/cvaghela/service-dash/releases/tag/v1.3.2
[1.3.1]: https://github.com/cvaghela/service-dash/releases/tag/v1.3.1
[1.3.0]: https://github.com/cvaghela/service-dash/releases/tag/v1.3.0
[1.2.2]: https://github.com/cvaghela/service-dash/releases/tag/v1.2.2
[1.2.1]: https://github.com/cvaghela/service-dash/releases/tag/v1.2.1
[1.2.0]: https://github.com/cvaghela/service-dash/releases/tag/v1.2.0
[1.1.1]: https://github.com/cvaghela/service-dash/releases/tag/v1.1.1
[1.1.0]: https://github.com/cvaghela/service-dash/releases/tag/v1.1.0
