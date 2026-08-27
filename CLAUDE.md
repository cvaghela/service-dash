# Service Dash — working notes

A framework-free Uptime Kuma dashboard: static HTML, CSS and one JavaScript
file, served by nginx in Docker, with two small sidecars. There is no build
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
```

`check-compose-networks.py` exists because of that outage: it cross-references
every `proxy_pass` host in `nginx.conf.template` against each Compose file's
networks. `check-release.py` takes the newest CHANGELOG heading as the intended
version and fails if any image tag, asset cache-buster, or the README's
current-release line disagrees.

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
3. Add a README "Upgrading from <previous>" section **whenever the Compose file
   changes** — an image bump alone cannot carry a Compose edit, and saying so is
   the difference between a smooth upgrade and a restart loop.
4. PR, wait for CI, merge.
5. Tag and release. Pushing the tag is what triggers `publish-images.yml`; check
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
