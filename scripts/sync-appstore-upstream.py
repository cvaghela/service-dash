#!/usr/bin/env python3
"""Render the official-store variant of the app entry from our own store source.

The ZimaOS app lives in this repository at appstore/Apps/ServiceDash/. IceWhale's
official store wants the same app under its own conventions, which differ in
three ways that are easy to get wrong by hand and impossible to notice once
wrong:

  * `x-casaos.id` is namespaced `org.icewhale.*` there -- every one of its 168
    apps is, whoever wrote them.
  * Asset URLs point at its own jsDelivr path, because that is where the files
    sit once merged.
  * "Install Uptime Kuma from this store" is true there and false here: our
    store carries one app.

Doing this by hand means the two copies drift, and the drift is silent -- the
store build validates structure, not whether the text matches reality. So the
transform is written down once, applied deterministically, and diffable.

    python3 scripts/sync-appstore-upstream.py --out /path/to/CasaOS-AppStore
    python3 scripts/sync-appstore-upstream.py --check   # print, change nothing
"""
import argparse
import pathlib
import shutil
import sys

REPO = pathlib.Path(__file__).resolve().parent.parent
SRC_DIR = REPO / "appstore" / "Apps" / "ServiceDash"
SRC_COMPOSE = SRC_DIR / "docker-compose.yml"

OUR_CDN = "https://cdn.jsdelivr.net/gh/cvaghela/service-dash@main/appstore/Apps/ServiceDash/"
THEIR_CDN = "https://cdn.jsdelivr.net/gh/IceWhaleTech/CasaOS-AppStore@main/Apps/ServiceDash/"

ASSETS = [
    "icon.png",
    "thumbnail.png",
    "screenshot-1.jpg",
    "screenshot-2.jpg",
    "screenshot-3.jpg",
]

# (description, must appear in the source, replacement)
SUBSTITUTIONS = [
    (
        "id namespaced to the store's convention",
        "id: io.github.cvaghela.servicedash",
        "id: org.icewhale.servicedash",
    ),
    (
        "assets served from the store's own CDN path",
        OUR_CDN,
        THEIR_CDN,
    ),
    (
        "Uptime Kuma really is in that store",
        "1. Install **Uptime Kuma** -- it is in the official ZimaOS app store --\n"
        "           and leave it on its default port `3001`.",
        "1. Install **Uptime Kuma** from this store, and leave it on its default\n"
        "           port `3001`.",
    ),
]


def render() -> str:
    text = SRC_COMPOSE.read_text()
    for label, old, new in SUBSTITUTIONS:
        if old not in text:
            sys.exit(
                f"FAIL: {SRC_COMPOSE.relative_to(REPO)} no longer contains the text for "
                f"'{label}'.\nThe upstream transform is stale -- update SUBSTITUTIONS in "
                f"{pathlib.Path(__file__).name} to match the new wording, rather than "
                f"letting the two copies drift."
            )
        text = text.replace(old, new)
    return text


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--out", help="Checkout of the store repo to write Apps/ServiceDash into")
    parser.add_argument("--check", action="store_true", help="Print the rendered compose and exit")
    args = parser.parse_args()

    rendered = render()

    if args.check or not args.out:
        sys.stdout.write(rendered)
        return 0

    dest = pathlib.Path(args.out) / "Apps" / "ServiceDash"
    dest.mkdir(parents=True, exist_ok=True)
    (dest / "docker-compose.yml").write_text(rendered)
    for name in ASSETS:
        shutil.copy2(SRC_DIR / name, dest / name)

    print(f"wrote {dest}/docker-compose.yml and {len(ASSETS)} assets")
    return 0


if __name__ == "__main__":
    sys.exit(main())
