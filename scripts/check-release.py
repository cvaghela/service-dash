#!/usr/bin/env python3
"""Check that one version is stated consistently everywhere before a release.

A release is a set of files that must agree: three image tags in each Compose
file, the asset cache-busting query strings, the README's current-release line,
and a dated CHANGELOG entry. Missing one of them ships a release whose Compose
file points at the previous images -- which looks fine until someone deploys it.

The expected version is taken from the newest CHANGELOG heading, so the
changelog is the single source of truth and nothing has to be passed in.
"""
import re
import sys
import pathlib

REPO = pathlib.Path(__file__).resolve().parent.parent
IMAGES = [
    "service-dash",
    "service-dash-kuma-auth",
    "service-dash-network-info",
    # Optional at runtime, but its tag still has to move with the release --
    # a stale one points the ai-usage profile at last version's reporter.
    "service-dash-claude-usage",
    "service-dash-codex-usage",
]
COMPOSE_FILES = [
    "docker-compose.yml",
    "docker-compose.casaos.yml",
    "appstore/Apps/ServiceDash/docker-compose.yml",
]
# The app-store entry states the version a second time, in x-casaos.version.
# ZimaOS shows that string and uses it to decide an update is available, so a
# stale value leaves store users on the previous release with no prompt.
STORE_COMPOSE = "appstore/Apps/ServiceDash/docker-compose.yml"


def newest_changelog_version(text: str) -> str | None:
    m = re.search(r"^## \[(\d+\.\d+\.\d+)\]", text, re.M)
    return m.group(1) if m else None


def main() -> int:
    problems: list[str] = []

    changelog_path = REPO / "CHANGELOG.md"
    changelog = changelog_path.read_text()
    version = sys.argv[1] if len(sys.argv) > 1 else newest_changelog_version(changelog)
    if not version:
        print("FAIL: no '## [x.y.z]' heading found in CHANGELOG.md", file=sys.stderr)
        return 1

    print(f"checking release {version}")

    # The changelog entry must be dated, not left as Unreleased.
    if not re.search(rf"^## \[{re.escape(version)}\] — \d{{4}}-\d{{2}}-\d{{2}}", changelog, re.M):
        problems.append(f"CHANGELOG.md: the [{version}] heading has no date")
    if f"[{version}]: https://" not in changelog:
        problems.append(f"CHANGELOG.md: no link reference for [{version}]")

    # Every image in every Compose file must carry this version.
    for name in COMPOSE_FILES:
        path = REPO / name
        if not path.exists():
            problems.append(f"missing {name}")
            continue
        body = path.read_text()
        for image in IMAGES:
            found = re.findall(rf"ghcr\.io/[\w.-]+/{re.escape(image)}:([\w.-]+)", body)
            if not found:
                problems.append(f"{name}: no image reference for {image}")
            for tag in found:
                if tag != version:
                    problems.append(f"{name}: {image} is pinned to {tag}, expected {version}")

    # Cache-busting query strings, so a browser does not serve last release's JS.
    index = (REPO / "index.html").read_text()
    stale = [t for t in re.findall(r"\?v=([\w.]+)", index) if t != version]
    if stale:
        problems.append(f"index.html: asset versions {sorted(set(stale))}, expected {version}")
    if f"?v={version}" not in index:
        problems.append(f"index.html: no asset pinned to {version}")

    # x-casaos.version drives the update prompt in the ZimaOS app store.
    store = (REPO / STORE_COMPOSE).read_text()
    store_versions = re.findall(r'^  version:\s*"([^"]+)"', store, re.M)
    if not store_versions:
        problems.append(f"{STORE_COMPOSE}: no x-casaos.version found")
    for tag in store_versions:
        if tag != version:
            problems.append(f"{STORE_COMPOSE}: x-casaos.version is {tag}, expected {version}")

    # x-casaos.release_notes is the "What's New" panel a ZimaOS user reads on
    # the update prompt. Nothing referenced it, so it sat at 1.3.2 through
    # three releases while every other field moved -- the store cheerfully
    # offered 1.5.1 and described what 1.3.2 had fixed. Requiring the current
    # version to appear in it is crude, but it is enough to make the staleness
    # impossible to miss.
    notes = re.search(r"^  release_notes:\n(?:.*\n)*?^\S", store + "\nX", re.M)
    notes_text = notes.group(0) if notes else ""
    if not notes_text:
        problems.append(f"{STORE_COMPOSE}: no x-casaos.release_notes found")
    elif version not in notes_text:
        problems.append(
            f"{STORE_COMPOSE}: x-casaos.release_notes does not mention {version} -- "
            "it is what ZimaOS shows as What's New, so a stale one describes the "
            "wrong release to everyone upgrading"
        )

    # The README tells people which images to pull.
    readme = (REPO / "README.md").read_text()
    if f"The current release is **{version}**" not in readme:
        problems.append(f"README.md: current-release line does not name {version}")

    for problem in problems:
        print(f"FAIL: {problem}", file=sys.stderr)
    if not problems:
        print("ok: every file agrees on the version")
    return 1 if problems else 0


if __name__ == "__main__":
    sys.exit(main())
