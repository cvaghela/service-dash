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
    store carries one app. Swapped per locale, because the tips are
    translated into fifteen languages and only one of them is English.

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
]


# The one sentence whose truth depends on WHICH store the entry lands in: our
# store carries a single app, so it sends people to the official ZimaOS store
# for Uptime Kuma; theirs carries Kuma itself. It is per-locale because the
# tips are translated -- an English-only swap would have left fourteen
# translations telling their users to go and find Kuma in somebody else's
# store. Every entry is required, so adding a locale without its pair fails
# here rather than shipping a quietly wrong instruction.
KUMA_STORE_SENTENCE = [
    (
        'en_US',
        '1. Install **Uptime Kuma** -- it is in the official ZimaOS app store --\n           and leave it on its default port `3001`.',
        '1. Install **Uptime Kuma** from this store, and leave it on its default\n           port `3001`.',
    ),
    (
        'en_GB',
        '1. Install **Uptime Kuma** -- it is in the official ZimaOS app store --\n           and leave it on its default port `3001`.',
        '1. Install **Uptime Kuma** from this store, and leave it on its default\n           port `3001`.',
    ),
    (
        'de_DE',
        '1. Installieren Sie **Uptime Kuma** -- es liegt im offiziellen ZimaOS App\n           Store -- und belassen Sie es auf dem Standardport `3001`.',
        '1. Installieren Sie **Uptime Kuma** aus diesem Store und belassen Sie es auf\n           dem Standardport `3001`.',
    ),
    (
        'el_GR',
        '1. Εγκαταστήστε το **Uptime Kuma** -- βρίσκεται στο επίσημο app store του\n           ZimaOS -- και αφήστε το στην προεπιλεγμένη θύρα `3001`.',
        '1. Εγκαταστήστε το **Uptime Kuma** από αυτό το store και αφήστε το στην\n           προεπιλεγμένη θύρα `3001`.',
    ),
    (
        'fr_FR',
        '1. Installez **Uptime Kuma** -- il est dans la boutique officielle ZimaOS --\n           et laissez-le sur son port par défaut `3001`.',
        '1. Installez **Uptime Kuma** depuis cette boutique et laissez-le sur son port\n           par défaut `3001`.',
    ),
    (
        'hr_HR',
        '1. Instalirajte **Uptime Kuma** -- nalazi se u službenoj ZimaOS trgovini\n           aplikacija -- i ostavite ga na zadanom portu `3001`.',
        '1. Instalirajte **Uptime Kuma** iz ove trgovine i ostavite ga na zadanom\n           portu `3001`.',
    ),
    (
        'it_IT',
        "1. Installate **Uptime Kuma** -- si trova nell'app store ufficiale di ZimaOS\n           -- e lasciatelo sulla porta predefinita `3001`.",
        '1. Installate **Uptime Kuma** da questo store e lasciatelo sulla porta\n           predefinita `3001`.',
    ),
    (
        'ja_JP',
        '1. **Uptime Kuma** をインストールします。ZimaOS の公式アプリストアにあります。\n           ポートは既定の `3001` のままにしてください。',
        '1. このストアから **Uptime Kuma** をインストールし、ポートは既定の `3001` の\n           ままにしてください。',
    ),
    (
        'ko_KR',
        '1. **Uptime Kuma**를 설치하세요. ZimaOS 공식 앱 스토어에 있습니다.\n           포트는 기본값 `3001` 그대로 두세요.',
        '1. 이 스토어에서 **Uptime Kuma**를 설치하고, 포트는 기본값 `3001` 그대로\n           두세요.',
    ),
    (
        'nb_NO',
        '1. Installer **Uptime Kuma** -- det ligger i den offisielle ZimaOS-appbutikken\n           -- og la det stå på standardporten `3001`.',
        '1. Installer **Uptime Kuma** fra denne butikken, og la det stå på\n           standardporten `3001`.',
    ),
    (
        'pt_PT',
        '1. Instale o **Uptime Kuma** -- está na loja de aplicações oficial do ZimaOS\n           -- e deixe-o na porta predefinida `3001`.',
        '1. Instale o **Uptime Kuma** a partir desta loja e deixe-o na porta\n           predefinida `3001`.',
    ),
    (
        'ru_RU',
        '1. Установите **Uptime Kuma** -- он есть в официальном магазине приложений\n           ZimaOS -- и оставьте порт по умолчанию `3001`.',
        '1. Установите **Uptime Kuma** из этого магазина и оставьте порт по умолчанию\n           `3001`.',
    ),
    (
        'sv_SE',
        '1. Installera **Uptime Kuma** -- det finns i den officiella ZimaOS-appbutiken\n           -- och låt det ligga kvar på standardporten `3001`.',
        '1. Installera **Uptime Kuma** från den här butiken och låt det ligga kvar på\n           standardporten `3001`.',
    ),
    (
        'tr_TR',
        "1. **Uptime Kuma**'yı kurun -- resmi ZimaOS uygulama mağazasında bulunur --\n           ve varsayılan `3001` portunda bırakın.",
        "1. **Uptime Kuma**'yı bu mağazadan kurun ve varsayılan `3001` portunda\n           bırakın.",
    ),
    (
        'zh_CN',
        '1. 安装 **Uptime Kuma**——它在 ZimaOS 官方应用商店里——并保持它的默认端口\n           `3001` 不变。',
        '1. 从本商店安装 **Uptime Kuma**，并保持它的默认端口 `3001` 不变。',
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

    # Check every locale BEFORE replacing any of them. str.replace is global, so
    # en_US's pass also consumes en_GB's identical sentence; interleaving the two
    # made the en_GB check fail on a file that was perfectly correct.
    for locale, ours, _ in KUMA_STORE_SENTENCE:
        if ours not in text:
            sys.exit(
                f"FAIL: {SRC_COMPOSE.relative_to(REPO)} has no {locale} install-Kuma "
                f"sentence matching KUMA_STORE_SENTENCE.\nWithout the swap that locale "
                f"would tell store users to install Uptime Kuma from a store that is "
                f"not the one they are reading -- update the pair in "
                f"{pathlib.Path(__file__).name}."
            )
    for _, ours, theirs in KUMA_STORE_SENTENCE:
        text = text.replace(ours, theirs)

    # Nothing may survive that still points at the wrong store.
    if "official ZimaOS app store" in text:
        sys.exit("FAIL: an 'official ZimaOS app store' mention survived the transform")
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
