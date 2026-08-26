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

1. Bump the three image tags in both Compose files, the `?v=` query strings in
   `index.html`, and the README's current-release line.
2. Date the CHANGELOG entry and add its link reference.
3. Add a README "Upgrading from <previous>" section **whenever the Compose file
   changes** — an image bump alone cannot carry a Compose edit, and saying so is
   the difference between a smooth upgrade and a restart loop.
4. PR, wait for CI, merge.
5. Tag and release. Pushing the tag is what triggers `publish-images.yml`; check
   that all three images actually built.

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
- Verify in a browser rather than by reading. There is a preview harness in the
  session scratchpad that inlines the real sources behind stand-in backends.
