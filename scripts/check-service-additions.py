#!/usr/bin/env python3
"""Fail a release that adds a Compose service without documenting how existing
installs get it.

WHY THIS EXISTS
---------------
1.5.0 added the `claude-usage` and `codex-usage` services, and the README told
CasaOS/ZimaOS users that updating the app in the store would bring them along.
It does not. A CasaOS app update rewrites the **image tags** in its managed
Compose file and leaves the service list alone, so an install that updated to
1.5.0 ran the new images and never gained the new services -- and the enable
command the settings page prints found nothing to start.

The failure was not in the code. Every static check passed, the images were
correct, and the stack was healthy. What shipped wrong was a *claim about
platform behaviour* that nobody had tested. This script makes that claim
impossible to ship silently: if a release adds a service, the README must say
in its upgrade section how an existing install actually gets it.

WHAT IT CHECKS
--------------
Compares the services in the app-store Compose file against the previous
release tag. For every service that is new, the README's "Upgrading from
<previous>" section must mention it by name. That section is the one place a
person upgrading will look, and naming the service is the minimum honest
disclosure -- it forces whoever adds a service to state the upgrade path rather
than assume one.

Run with no previous tag (a first release) and it passes trivially.
"""

import pathlib
import re
import subprocess
import sys

REPO = pathlib.Path(__file__).resolve().parent.parent
STORE_COMPOSE = "appstore/Apps/ServiceDash/docker-compose.yml"
README = REPO / "README.md"

# `services:` block members are exactly two spaces in; anything deeper is a key
# inside a service. Parsed textually so this needs no YAML dependency in CI.
SERVICE_RE = re.compile(r"^  ([a-z][a-z0-9-]*):\s*$", re.M)


def services_in(text: str) -> set:
    start = text.find("\nservices:\n")
    if start == -1:
        return set()
    rest = text[start + len("\nservices:\n") :]
    # Stop at the next top-level key (a line starting with a non-space).
    end = re.search(r"^\S", rest, re.M)
    if end:
        rest = rest[: end.start()]
    return set(SERVICE_RE.findall(rest))


def previous_tag() -> str:
    try:
        tags = subprocess.run(
            ["git", "tag", "--list", "v*", "--sort=-v:refname"],
            cwd=REPO, capture_output=True, text=True, check=True,
        ).stdout.split()
    except subprocess.CalledProcessError:
        return ""
    return tags[0] if tags else ""


def main() -> int:
    # An explicit baseline makes this testable against history -- run it with
    # v1.4.2 and it must reproduce the 1.5.0 failure.
    tag = sys.argv[1] if len(sys.argv) > 1 else previous_tag()
    if not tag:
        print("no previous release tag; nothing to compare")
        return 0

    try:
        old = subprocess.run(
            ["git", "show", f"{tag}:{STORE_COMPOSE}"],
            cwd=REPO, capture_output=True, text=True, check=True,
        ).stdout
    except subprocess.CalledProcessError:
        print(f"{STORE_COMPOSE} did not exist at {tag}; nothing to compare")
        return 0

    new = (REPO / STORE_COMPOSE).read_text()
    added = sorted(services_in(new) - services_in(old))

    if not added:
        print(f"ok: no services added since {tag}")
        return 0

    readme = README.read_text()
    heading = f"### Upgrading from {tag.lstrip('v')}"
    section_start = readme.find(heading)
    if section_start == -1:
        print(
            f"FAIL: this release adds {', '.join(added)} to {STORE_COMPOSE}, "
            f"but README.md has no '{heading}' section.\n\n"
            "A CasaOS app update rewrites image tags and does NOT add services, so an\n"
            "existing install will not get these by updating. Say how it does.",
            file=sys.stderr,
        )
        return 1

    end = readme.find("\n### ", section_start + 1)
    section = readme[section_start : end if end != -1 else len(readme)]

    missing = [s for s in added if s not in section]
    if missing:
        print(
            f"FAIL: '{heading}' does not mention {', '.join(missing)}.\n\n"
            "These services are new in this release. A CasaOS app update will not add\n"
            "them, so that section must name them and say how an existing install gets\n"
            "them -- do not leave it to be inferred.",
            file=sys.stderr,
        )
        return 1

    print(f"ok: {', '.join(added)} added since {tag}, and the upgrade section names them")
    return 0


if __name__ == "__main__":
    sys.exit(main())
