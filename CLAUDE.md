# Service Dash — working notes

A framework-free Uptime Kuma dashboard: static HTML, CSS and one JavaScript
file, served by nginx in Docker, with a handful of small sidecars. There is no build
step — `assets/js/app.js` is the file the browser runs.

## Releasing

Every release ships **both Compose files as release assets** — the standard
`docker-compose.yml` and the ZimaOS/CasaOS `docker-compose.casaos.yml`. People
deploy from the release page, and a release whose assets are missing sends them
to a Compose file that may not match the images they just pulled.

```bash
gh release create vX.Y.Z \
  --title "Service Dash X.Y.Z" \
  --notes-file <notes> \
  docker-compose.yml docker-compose.casaos.yml
```

**Verify the Compose files before tagging.** A 1.2.1 release shipped a CasaOS
file that could not start: `kuma-auth` sat on the implicit `default` network
while everything else was on `service-dash-network`, so nginx exited with
`host not found in upstream` and the dashboard restart-looped. The file was
valid YAML and `docker compose config` accepted it — the mistake was semantic,
so schema validation could never have caught it.

Run all of these, and read the output rather than the exit code alone:

```bash
docker compose -f docker-compose.yml config --quiet
docker compose -f docker-compose.casaos.yml config --quiet
docker compose -f docker-compose.yml -f docker-compose.build.yml config --quiet
docker compose -f appstore/Apps/ServiceDash/docker-compose.yml config --quiet
python3 scripts/check-compose-networks.py   # every nginx upstream is reachable
python3 scripts/check-release.py            # one version, stated the same everywhere
python3 scripts/check-service-additions.py  # a new service must come with an upgrade path
sh scripts/test-reporters.sh                # regression tests for the AI reporters
```

`check-compose-networks.py` exists because of that outage: it cross-references
every `proxy_pass` host in `nginx.conf.template` against each Compose file's
networks. `check-release.py` takes the newest CHANGELOG heading as the intended
version and fails if any image tag, asset cache-buster, or the README's
current-release line disagrees.

`check-service-additions.py` exists because 1.5.0 shipped a wrong claim rather
than wrong code: it told CasaOS users the store update would bring the new
services along. **A CasaOS app update rewrites image tags and does not add
services.** Every static check passed, the images were right, the stack was
healthy — and existing installs still could not enable the feature. If a release
adds a service, the README's upgrade section must name it; the script enforces
that, and `docs/ai-usage.override.yml` is the path for installs already out
there.

The wider rule that came out of it: **anything the smoke host can verify, verify
before publishing it.** Upgrade instructions especially — they are read once, by
people who cannot easily recover when they are wrong.

Static checks cannot boot the stack. When a release changes anything about the
Compose files, the images, or `entrypoint.sh`, say plainly that it has not been
run, and recommend a smoke test on a real host.

### The rest of the release

1. Bump the three image tags in **all three** Compose files — the two at the
   root and `appstore/Apps/ServiceDash/docker-compose.yml` — plus that file's
   `x-casaos.version` and `update_at`, the `?v=` query strings in `index.html`,
   and the README's current-release line. `check-release.py` enforces every one
   of these except `update_at`.
2. Date the CHANGELOG entry and add its link reference.
3. Rewrite `x-casaos.release_notes` **in all fifteen locales**, not just
   `en_US`. `check-release.py` checks each one separately and names the stale
   ones; a single-locale update used to satisfy it, which is exactly how the
   store's What's New sat at 1.3.2 for three releases.
4. Add a README "Upgrading from <previous>" section **whenever the Compose file
   changes** — an image bump alone cannot carry a Compose edit, and saying so is
   the difference between a smooth upgrade and a restart loop.
5. PR, wait for CI, merge.
6. Tag and release. Pushing the tag is what triggers `publish-images.yml`; check
   that all three images actually built.

## The ZimaOS app store

`appstore/` is a one-app store source in ZimaOS's v2 protocol, published to the
`gh-pages` branch by `publish-appstore.yml` and served from there by jsDelivr.
ZimaOS users subscribe to
`https://cdn.jsdelivr.net/gh/cvaghela/service-dash@gh-pages/store.json`.

The workflow fires on pushes to `main` that touch `appstore/**` — **not** on
tags, because a tag push carries no `appstore/**` change of its own and the
paths filter would drop it. The release commit that bumps `x-casaos.version` is
what republishes the store, so step 1 above is what makes an update appear on
users' tiles. A release that skips it ships new images that store users are
never offered.

### The store entry is translated, and that has upkeep

`x-casaos.tagline`, `description`, `release_notes` and `tips.before_install`
each carry the same fifteen locales — the set every app in IceWhale's store
uses. `title` deliberately stays `en_US`: it is a product name.

The set was added because IceWhale's maintainer asked for it on the upstream
PR, and it is now load-bearing in two ways that fail quietly if forgotten:

- **`appstore/supported-languages.json` is what the v2 store build reads to
  decide which languages to emit, and it is the easiest half of this to
  forget.** It listed only `en_US` while the app entry carried fifteen, so
  fourteen translations sat correctly in the repository and reached nobody.
  Every locale in the app entry must appear there, and `store-config.json`
  needs a `name` and `description` for each. `check-release.py` enforces both.

  **Check the right file when verifying this.** The build does not put the
  locale maps into `meta.json`; it emits a *text overlay per language* beside
  it — `meta.<locale>.json`, plus `index.<locale>.json` and
  `store.<locale>.json` — each carrying only the translated `tagline`,
  `description`, `tips.before_install` and `release_note`. `meta.json` itself
  is the English default and holds flat strings **by design**. So a store
  publishing correctly and one publishing English-only look identical in
  `meta.json`; what tells them apart is whether the siblings exist:

      git fetch origin gh-pages
      git ls-tree -r --name-only origin/gh-pages | grep 'meta\..*\.json'

  Fifteen locales means fourteen `meta.<locale>.json` files, because `en_US`
  is the base rather than an overlay.
- **`check-release.py` requires the current version in every locale's release
  notes, and requires all four fields to carry an identical locale set.** A
  language added to the description but not to the release notes is a
  half-translated store entry, and nothing else would have said so.
- **`sync-appstore-upstream.py` swaps the install-Kuma sentence per locale.**
  One sentence differs between the two stores — ours carries a single app so it
  points at the official ZimaOS store for Uptime Kuma; theirs carries Kuma. The
  swap was English-only when the tips were English-only. Translating the tips
  without making the swap per-locale would have shipped fourteen translations
  telling IceWhale's own users to go and find Kuma in somebody else's store.
  Every locale's pair is required, so adding a language without its pair fails
  the render rather than publishing a quietly wrong instruction.

Product names, monitor names (`Plex local`), environment variables, ports and
the on-screen **URL Locked** label stay in English in every locale. They are
strings a user types or reads on screen, not prose: a translated `Plex local`
names a monitor the pairing rule will not recognise, and a translated "URL
Locked" sends someone hunting for text the interface never shows.

### Submitting to IceWhale's official store

`scripts/sync-appstore-upstream.py` renders the official-store variant from
`appstore/Apps/ServiceDash/`: `org.icewhale.*` id, their CDN asset paths, and
the one tip whose wording is true there and false here ("Install Uptime Kuma
from this store" — ours carries one app). It fails loudly if the source wording
changes out from under it, rather than emitting a quietly wrong file.

`sync-upstream-appstore.yml` runs it, pushes to the fork and opens the PR. It is
**workflow_dispatch only, on purpose**: nothing here can merge into their repo,
and an automatic PR per release would pile unmerged PRs onto a tracker that
already carries a large community backlog. It needs a `UPSTREAM_APPSTORE_TOKEN`
secret — a fine-grained PAT scoped to the fork — because `GITHUB_TOKEN` cannot
push to another repository. Default the `dry_run` input to true and read the
diff before submitting.

`appstore/Apps/ServiceDash/docker-compose.yml` is a third copy of the CasaOS
stack, so it is subject to the same failure that broke 1.2.1 — both release
guards and CI now cover it. See `appstore/README.md`.

`x-casaos.architectures` is checked against the real registry manifests, so it
cannot be bumped ahead of the images. `publish-images.yml` builds
`linux/amd64,linux/arm64` as of this change, but the 1.3.2 images are amd64-only
— add `arm64` to the store entry in the same release that first publishes
multi-arch images, or the store build fails and no app is produced at all.

Four other places still say AMD64-only and must flip in that same release.
Nothing enforces these, so they are easy to half-do:

1. `appstore/Apps/ServiceDash/docker-compose.yml` — `x-casaos.architectures`
2. `README.md` — the `Platform` badge (`platform-linux%2Famd64`)
3. `README.md` — the Requirements bullet naming the published images
4. `README.md` — the "Linux ARM64" row in the Platform support table

## The AI usage reporter

`claude-usage` **runs always and idles until signed in**. It was profile-gated
once; that was wrong, and the reason is worth keeping because it is invisible
from this repository: **CasaOS silently drops any service that declares
`profiles:`.** Proven by installing 1.5.0 fresh from the store — the resulting
Compose file carried correct 1.5.0 image tags and no reporters, so it was not a
stale CDN entry. A CasaOS *update* separately rewrites image tags without adding
new services. Between them, a profile-gated service reaches ZimaOS users by no
route at all, and the enable command the settings page printed found nothing to
start. Present-but-idle costs ~6MB of RAM
and makes "enable" a sign-in. Do not reintroduce a profile here. It is the
only service that holds a credential, and the only one whose image carries
Claude Code — which is why it starts for nobody by default. Adding it to the
three Compose files means three different shapes: named volumes at the root,
`type: bind` under `/DATA/AppData/service-dash/...` in both CasaOS copies.

Two things it must keep doing:

- **Refresh through `claude auth status --json`, not by posting to the token
  endpoint.** Claude Code owns the credential format, the rotation and the lock
  file that stops two writers clobbering each other. Reimplementing that here
  would mean owning all three.
- **Classify failures by HTTP status, and never blank a good reading over a
  transient one.** Only 401/403 means the login is the problem. Everything else
  leaves the previous document untouched so the dashboard's own age thresholds
  (`AI_STALE_MS` 15 min, `AI_DEAD_MS` 60 min) can do their job — those two
  constants only ever fire because of that branch. An earlier version used
  `curl -fsS` and treated an empty result as an expired login, which at a
  five-minute poll would have printed "sign in again" for a dropped packet.
- **Judge the built document by what survived, not by whether the string is
  empty.** jq will happily build a well-formed document with zero providers out
  of a response it recognised nothing in. Testing `[ -z "$document" ]` therefore
  published that silence: the panel vanished and nothing anywhere said why.
  `poll_once` counts providers that are connected and kept at least one window,
  mirroring the dashboard's own `connectedProviders()` filter.
- **Treat `windows_spec` as labels, not as an allowlist.** Any window the
  endpoint offers that carries both a percentage and a reset is passed through
  with a label derived from its id; the spec only supplies nicer names and the
  window/model split. It was a strict allowlist once, which meant the day a new
  model got its own window the dashboard would show nothing, report nothing,
  and leave no way to tell "the API does not send it" from "we threw it away".
  The both-fields requirement is what keeps this safe: the live response is full
  of internal fields carrying one or the other (`nimbus_quill`, `extra_usage`)
  and none of them get in.
- **Drop a window it cannot fully parse rather than zeroing it.** A dial reading
  0% is a claim; a missing dial is an absence. The jq transform accepts both
  response shapes (`used_percentage`/`resets_at` and `utilization`/`reset`) and
  emits nothing for a window missing either.

The status document's `note` says only *why* it is disconnected, and `action`
says what the reader can do: `"sign-in"` (the command fixes it), `"report"`
(nothing they can run does — file the issue) or `"none"` (transient; wait). The sign-in
command belongs to the dashboard: putting it in the note printed it twice, and a
sign-in button under "Claude changed its response shape" sends people to run
something that cannot help. A document with no `action` predates the field and
means `"sign-in"`.

What the live endpoint actually returns (verified 2026-08-28 against a Max
account): `five_hour` and `seven_day` as objects with `utilization` and an
**ISO 8601 `resets_at`** — fractional seconds and a `+00:00` offset, which jq's
`fromdateiso8601` rejects and `tonumber` throws on. `seven_day_opus`,
`seven_day_sonnet` and `seven_day_oauth_apps` were all `null`. There is **no
Fable window**; Fable usage is not reported separately. Several internal
codenames appear as top-level keys and are either null or missing a reset.

The endpoint is undocumented and gated on the `user:profile` scope. Tokens from
`claude setup-token` are inference-only and will not work — it needs a full
`claude auth login`.

**Every command the settings page shows must run from any folder, with nothing
installed on the host but Docker.** A bare `docker compose ...` only works from
the directory holding the Compose file, and on ZimaOS that is somewhere under
`/var/lib/casaos` the user has never opened. The enable command therefore reads
the path back out of the `com.docker.compose.project.config_files` label Compose
stamps on the dashboard container; the sign-in uses `docker exec` against
`service-dash-claude-usage` (a fixed `container_name` in all three Compose
files) so it needs no Compose file and runs the container's own Claude Code.
Substituting into `-f "$(...)"` rather than `cd "$(...)"` matters: when the
inspect fails, `-f ""` errors out, while `cd ""` succeeds in bash and would run
Compose against whatever happened to be in the current directory.

**Both commands carry `sudo`, and it is not decoration.** Smoke-tested on a real
ZimaOS host: the label resolves to
`/var/lib/casaos/apps/service-dash/docker-compose.yml`, which CasaOS writes
`0600 root:root`, and a ZimaOS user is not in the `docker` group by default, so
the inner `docker inspect` is denied too. Unprivileged, the command dies with a
bare "permission denied" naming a file the reader has never seen. Do not
"clean up" the sudo.

The `diagnostic` field carries **field names and window ids only** — the
"Report this on GitHub" button quotes it verbatim into a public issue, so a
value leaking in there is a value published. `describe_shape` builds it with
`keys` and `.id`, never a `values` walk, and that is the whole reason.

## The Codex usage reporter

`codex-usage` is the second provider, on the same always-running footing. Three
things about it are load-bearing and were each found the hard way on a real
host:

- **`codex login --device-auth`, never a bare `codex login`.** The default flow
  starts a callback server on the container's own localhost and opens a browser
  at it. Nothing outside the container can reach that, and it fails by *hanging*
  rather than by erroring.
- **The `User-Agent` header is required.** With curl's default the endpoint
  answers 403 holding a perfectly good credential, which reads exactly like an
  expired login. It filters browsers and anonymous tools rather than checking
  for Codex (`Mozilla/5.0` also 403s), so the reporter names itself honestly.
  403 is kept separate from 401 for this reason: it genuinely means "expired
  login *or* rejected client".
- **The response contains `email`, `user_id` and `account_id`.** The served
  document has no auth in front of it. Only `plan_type` and the window figures
  are copied across, and `describe_shape` emits names only. Adding a field
  there is publishing it.

Read usage with the passive GET only. Codex also attaches rate limits to a
completed turn, but polling that would spend quota to measure quota.

**Each reporter owns its own file** (`/status/<provider>.json`), served by one
nginx regex location. That regex is **quoted**, and must stay quoted: nginx
reads an unquoted `{` or `}` in a location regex as a block delimiter, so the
`{0,30}` ends the directive mid-pattern and nginx dies at boot with "missing
closing parenthesis" naming a regex nobody wrote.

**The CI job names are load-bearing.** Every job in `validate.yml` is a
required status check in the "Protect main" ruleset. Rename one, or add an
image or an architecture, and the ruleset still demands the old context:
GitHub waits forever for a status nobody will report, and every PR blocks on
"Expected -- Waiting for status to be reported". Splitting that workflow into
per-architecture builds did exactly this. Update the ruleset in the same change
(Settings -> Rules -> Protect main), listing `Checks` plus one
`Build <image> (<arch>)` per combination.

**The release publish names its digest artifacts with `__`, not `-`.** Each
architecture is pushed by digest and the two are stitched into one tag, and the
merge job collects them by glob. `service-dash` is a *prefix* of every other
image name, so `digest-service-dash-*` matched all ten artifacts instead of its
own two and 1.5.2 published four images out of five — the dashboard image, the
one the Compose files name, was the one left behind. Its count check turned that
into a loud failure rather than a single-architecture manifest under a release
tag. `check-publish-matrix.py` simulates the glob against the real matrix, so a
separator that any image name contains fails in CI instead of at tag time.

**Every fix ships with something that fails if it comes back.** `scripts/`
holds a guard per outage — network reachability (1.2.1), version drift and a
store "What's New" frozen three releases back, services silently dropped by
CasaOS — and `scripts/test-reporters.sh` covers the reporter bugs: the ISO 8601
reset times that read as an unrecognised response, a window dropped rather than
zeroed, and the PII that must never reach the served document.

A guard that has never failed is a guard nobody has tested. Reintroduce the
original fault, watch the guard fail *by name*, then restore. Two of these
passed vacuously on first writing — the nginx one only inspected quoted regexes,
so removing the quotes made it find nothing and succeed.

## The empty state

A blank grid has three quite different causes and, until this existed, said
nothing about which: the only signals were the word **OFFLINE** in small type in
the topbar and a toast that cleared itself after 5.2 seconds. IceWhale's
maintainer hit exactly that while reviewing the app for their store, checked
that every container was healthy, and reasonably concluded Service Dash was
broken. It was not — Uptime Kuma was simply not there to read.

`renderEmptyState()` names the cause instead:

- **Kuma unreachable** — the fetch failed. Names the URL it tried, the port and
  the slug, and offers a copyable command that prints a different, unmistakable
  line for each cause.
- **Connected, page empty** — `publicGroupList: []` is a *valid* array, so this
  shows **CONNECTED** with no cards. It is not the same failure as the one
  above, and conflating them sends people to check the wrong thing.
- **Nothing matches** — cards exist but the filters hide them all.

Three things about it are load-bearing:

- **`#emptyState` is a sibling of `#groups`, not a child.**
  `buildDomOnceIfNeeded()` clears `#groups` wholesale and would take the panel
  with it, which reads as the empty state randomly not appearing.
- **It is called from three places.** The filter pass covers the healthy paths;
  the failure branches of `loadKumaOrMock()` and `pollOnce()` are the ones that
  matter, and `applyFiltersAndCounts()` is never reached on those.
- **The diagnostic command interpolates `KUMA_PORT` and `STATUS_SLUG`**, which
  is the only reason `entrypoint.sh` puts `kumaPort` into `config.js` at all. A
  command naming the wrong port sends the reader to prove something irrelevant.

`--pending` is a dark-ground token: on the light panel it measures **1.36:1**
and needs the `[data-theme="light"]` override, which reaches 9.34:1. It looked
fine by eye — measure it.

`scripts/check-empty-state.py` guards all of the above. Its entrypoint check
passed vacuously when first written, because it looked for the string
`kumaPort` anywhere in the file and the explanatory *comment* satisfied it.

## Conventions

- Match the surrounding code: no framework, no build step, plain DOM APIs.
- Comments explain *why*, especially where something looks odd. Several
  workarounds here are load-bearing (nginx `add_header` not being inherited,
  `auth_request` not interpolating variables, WebDAV temp files not crossing
  filesystems) and will read as removable if the reason is not written down.
- Icons that must survive a host with no route to Google Fonts are masked SVGs,
  not Material Symbols ligatures — the icon font is hidden outright when it
  fails to load.
- Anything that runs on every poll must be idempotent: compare before writing.
  `.card` carries a `backdrop-filter`, so a pointless DOM write costs a real
  repaint across the whole grid.
- Verify in a browser rather than by reading. `demo/build-demo.py` inlines the
  real sources behind stand-in backends and needs no Docker:
  `python3 demo/build-demo.py --out /tmp/d/index.html && python3 -m http.server
  8000 --directory /tmp/d`, then sign in as `test` / `Test`. Serve it rather
  than opening the file — the shim answers absolute paths. It is also what is
  published as the public demo, so it must keep working.

## Load-bearing decisions that look arbitrary

Each of these reads as removable. Each has been a real bug. The heading used to
carry a count and the count kept going stale, so it does not any more.

**Stopping the page zooming on a phone takes three separate mechanisms, and
deleting any one of them brings the problem back.** They are not redundant:

1. `user-scalable=no, maximum-scale=1` in the viewport meta — stops pinch-zoom
   *where it is honoured*. Safari has ignored it deliberately since iOS 10, so
   it can never be the whole answer on an iPhone.
2. `touch-action: manipulation` on anything interactive — this is the part iOS
   does honour. It drops double-tap-to-zoom and with it the ~300ms delay the
   browser spent waiting to see whether a tap was half of a double-tap.
   Removing that delay is most of what makes the page feel like an app.
3. Form controls at 16px below 820px — iOS scales the whole viewport up when a
   field under 16px takes focus and does not scale back out. 16px is the
   browser's threshold, not a design preference: 15.5px still zooms. The rule
   has to name `.search input` explicitly, which carries its own smaller size.

`viewport-fit=cover` belongs in the same meta tag for a different reason:
without it every `env(safe-area-inset-*)` in the stylesheet resolves to zero,
which silently undoes five rules that already depend on it.

**Inset the content, never the background.** `viewport-fit=cover` hands the page
the whole screen, notch included, and the background is meant to have it: `.bg`
and `.noise` are fixed siblings of `.app` covering the viewport, so no margin on
`.app` can shrink them. The top inset therefore goes on `.app` and on the two
fixed pieces of mobile chrome (`.mobile-menu-btn`, `--mobile-topbar-offset`),
and nowhere else. Putting it on `body` or on a background layer is the mistake
that trades a full-bleed gradient for a letterboxed one.

The corollary catches people out: anything *inside* `.app` must not add the
inset again. `.topbar` did, and its header content sat two notches down. A
sticky or fixed `top` is the exception — that is measured from the viewport, not
from `.app`, so it still needs `env()`.

`.overlay` is that exception, and it was missed the first time: it is
`position: fixed; inset: 0`, so `.app`'s margin does nothing for it and its flat
`18px` padding put the settings heading under the iPhone clock — the same bug as
the main screen, in the one place the main screen's fix could not reach. Its
padding is now `max(18px, env(safe-area-inset-*))` per side. `max()` rather than
addition, so a device with no notch keeps exactly the 18px it had. All three
dialogs share `.overlay`, so they are fixed together.

**`backdrop-filter` belongs on small surfaces only, and the cost is AREA, not
count.** iOS Safari was killing the tab — "A problem repeatedly occurred" —
after a few minutes of scrolling. Every `backdrop-filter` forces its own GPU
compositing layer, and scrolling makes the compositor re-rasterise them.

Two wrong turns are worth recording, because both are the intuitive answer.
First: it is not the *number* of blurred elements. Measured at 3x DPR on a
phone —

    .main            1 element    84.6MB   <- the whole scroll container
    .card           23 elements   66.4MB
    sidebar panels   2 elements   24.4MB
    .section         6 elements   19.8MB
    .topbar          1 element     4.2MB
    .linkMeta       36 elements    1.3MB
    .pill           19 elements    1.2MB
    .svcIconEdit    23 elements    0.3MB

The 78 small elements come to 3MB between them; one `.main` is 84.6MB. Second:
it is not a mobile problem. Desktop measured 85.2MB and scrolled at ~23fps —
removing it took that to 6.9MB and ~42fps, average frame 39.3ms → 23.0ms,
confirmed by benchmarking in both orders.

So `.glass`, `.card` and `.section` carry no filter at all now, at any width —
and they lose nothing, because blurring a large flat surface that sits on a
smooth gradient returns the same smooth gradient. Screenshots before and after
are indistinguishable. Everything small keeps it and still reads as glass: the
pills, link rows, icon buttons and dialogs.

`.topbar` is the exception and declares its own filter. It is `position:
sticky`, so cards scroll *under* it; without the filter it becomes a window onto
whatever is passing behind, and a near-opaque substitute reads as a flat slab
that no longer matches the sign-in and settings panels. At ~2MB desktop / ~4MB
phone it was never what needed cutting.

The rule for anything new: a large container gets no `backdrop-filter`; a small
one costs almost nothing.

**Haptics are Android-only, and that is not a bug to fix.** iOS Safari has never
implemented the Vibration API. `haptic()` is also gated on a coarse pointer,
because Chrome on a desktop exposes `navigator.vibrate()` — verified: without
that gate a laptop buzzes on every card click. Every call goes through the one
helper and its fixed pattern table, so there is a single place to retune or
silence it.


**Single-key shortcuts go through `isTypingTarget()`, always.** The global
`keydown` listener fires on the window, so a bare-letter shortcut reaches it
from inside every field on the page. Two shortcuts shipped without a guard and
both were real bugs: `l` cycled the link mode while you typed `plex` into the
search box, and `/` jumped focus out of the notes and ate the character, since
it calls `preventDefault()`. The guard is one function called once, before any
key is matched, rather than a line each handler has to remember. `Escape` is
checked first and exempt on purpose — it is how you leave the field you are in.

**Auto link mode never probes.** `autoEndpointKind()` decides Local vs External
from `location.hostname` alone. That is not laziness — the dashboard's own CSP
(`connect-src 'self'` in `nginx.conf.template`) blocks a `fetch` to any service
URL, `img-src` blocks an `http://` image probe, and Chrome's Private Network
Access rules would block it from an HTTPS origin regardless. Even if all three
relented, an unreachable LAN address costs a TCP timeout on every card at load.
Reaching the dashboard at `http://192.168.1.50:8888` already proves the browser
routes to that network, so there is nothing left to test.

The rule is deliberately one-sided, and a "fix" that makes it symmetrical is a
regression: opening the public URL from the LAN works and merely hairpins, while
opening a LAN URL from outside is a dead link. Everything unproven — CGNAT and
Tailscale's `100.64/10` especially — must resolve to External. `100.64/10` is
absent from `PRIVATE_V4_BLOCKS` on purpose; adding it would break exactly the
people it looks like it would help.

Top-level navigation from HTTPS to `http://` is *not* mixed content and is not
blocked, so there is no rule forcing External on an HTTPS dashboard. Adding one
would break every local link for anyone behind a TLS proxy.

**The z-index ladder is load-bearing.** On mobile the hamburger (`9999`), the
expanded topbar (`9998`) and the scroll-top button (`9998`) are all fixed. Any
dialog must sit above them or it opens underneath the chrome — which is what
`.overlay` at `100` used to do, leaving the sign-in fields untappable. The order
is: mobile chrome < `.overlay` (`10000`) < `.toast` (`10001`). The toast is last
because feedback about a dialog has to be readable while the dialog is open.

`.overlay` also needs `overflow-y: auto` *and* `align-items: safe center`. Either
alone leaves a panel taller than the viewport unreachable: a centred grid item
overflows at both ends, and the half above the top edge sits at negative scroll
offset where no scrolling reaches it.
