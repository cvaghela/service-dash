# ZimaOS app store source

This directory is a one-app store source in the ZimaOS **v2 app-store protocol**.

**ZimaOS only.** The build publishes v2 output alone — no legacy `store/main.zip`
— so older CasaOS clients, whose custom-source feature expects that bundle,
cannot subscribe to it. CasaOS users install from `docker-compose.casaos.yml`.
`.github/workflows/publish-appstore.yml` builds it with IceWhale's official
[`build-appstore-action`][action] and publishes the generated `dist/` to the
`gh-pages` branch, where jsDelivr serves it. GitHub Pages does not need to be
turned on — jsDelivr reads the branch directly.

**Store source URL** — paste this into ZimaOS under *App Store → ⋯ → Add Source*:

```
https://cdn.jsdelivr.net/gh/cvaghela/service-dash@gh-pages/store.json
```

## Layout

```
appstore/
├── store-config.json          store identity (id, name, maintainer)
├── supported-languages.json   locales the build should consider
└── Apps/
    └── ServiceDash/
        ├── docker-compose.yml the app: Compose services + top-level x-casaos
        ├── icon.png           256×256, shown on the ZimaOS dashboard
        ├── thumbnail.png      1280×640 store hero image
        └── screenshot-{1,2,3}.jpg
```

## The compose file is a third copy

`Apps/ServiceDash/docker-compose.yml` is the same stack as the root
`docker-compose.casaos.yml` — ZimaOS shares CasaOS's `/DATA/AppData` layout —
with a v2 `x-casaos` block instead of the legacy one. Keeping it in this repository rather than only in a store fork is what lets
the existing release guards cover it:

- `scripts/check-release.py` fails if its three image tags or its
  `x-casaos.version` disagree with the newest CHANGELOG heading. ZimaOS uses
  `x-casaos.version` to decide an update exists, so a stale value silently
  leaves store users on the previous release.
- `scripts/check-compose-networks.py` fails if `kuma-auth` is not on a network
  the dashboard can reach — the semantic mistake that made 1.2.1 unstartable.
- CI runs `docker compose config --quiet` on it, which is the same command the
  official store's validator gates on.

Anything that changes the root CasaOS Compose file almost certainly has to
change this one too.

## What the store build enforces

Beyond valid YAML, IceWhale's build fails an app on: a missing or non
reverse-domain `x-casaos.id`, a missing referenced icon/thumbnail/screenshot,
and **a declared architecture the image does not actually publish** — verified
against the real registry manifests, not taken on trust.

That last one sequences the arm64 rollout. `publish-images.yml` now builds
`linux/amd64,linux/arm64`, but the images released as 1.3.2 are amd64-only, so
this entry still declares `amd64` alone. Declaring `arm64` before an arm64 image
exists fails the build outright:

```
ERROR App declares architecture 'arm64', but service 'service-dash' image
'ghcr.io/cvaghela/service-dash:1.3.2' does not provide that platform.
```

Add `arm64` here in the **same release** that first publishes multi-arch images
— not before it, and not a release later.

## Submitting to the official store

The same `Apps/ServiceDash/` directory drops into a fork of
[IceWhaleTech/CasaOS-AppStore][official] unchanged. The asset URLs in
`x-casaos` point at jsDelivr on this repository, so they resolve from either
store; the official store's convention is to rewrite them to its own CDN path.

[action]: https://github.com/IceWhaleTech/build-appstore-action
[official]: https://github.com/IceWhaleTech/CasaOS-AppStore
