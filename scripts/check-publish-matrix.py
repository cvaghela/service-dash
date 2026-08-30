#!/usr/bin/env python3
"""Guard the release publish against artifact-name collisions.

Why this exists. 1.5.2's release published four of its five images and then
stopped, because the merge job downloads per-architecture digests by glob:

    upload:   name: digest-<image>-<arch>
    download: pattern: digest-<image>-*

`service-dash` is a PREFIX of `service-dash-network-info`,
`service-dash-kuma-auth`, `service-dash-claude-usage` and
`service-dash-codex-usage`, so its pattern matched all ten artifacts rather
than its own two:

    expected 2 digests for ghcr.io/cvaghela/service-dash, found 10

The count check in that job turned it into a loud failure instead of a
single-architecture manifest published under a release tag, which is the
outcome worth protecting. This script makes the collision itself impossible to
reintroduce: it reads the real names and patterns out of the workflow and
simulates the match.

    python3 scripts/check-publish-matrix.py
"""
import fnmatch
import pathlib
import re
import sys

REPO = pathlib.Path(__file__).resolve().parent.parent
WORKFLOW = REPO / ".github" / "workflows" / "publish-images.yml"


def main() -> int:
    problems: list[str] = []
    text = WORKFLOW.read_text()

    images = re.findall(r"\{ name: (service-dash[a-z-]*), dockerfile:", text)
    arches = re.findall(r"^        arch: \[([^\]]+)\]", text, re.M)
    arches = [a.strip() for a in arches[0].split(",")] if arches else []

    if len(images) < 2:
        problems.append(f"{WORKFLOW.name}: found {len(images)} image names, expected the full matrix")
    if not arches:
        problems.append(f"{WORKFLOW.name}: could not read the arch matrix")

    upload = re.search(r"name: digest(?P<sep>.+?)\$\{\{ matrix\.image\.name \}\}(?P=sep)\$\{\{ matrix\.arch \}\}", text)
    download = re.search(r"pattern: digest(?P<sep>.+?)\$\{\{ matrix\.image \}\}(?P=sep)\*", text)

    if not upload:
        problems.append(f"{WORKFLOW.name}: could not read the digest upload name")
    if not download:
        problems.append(f"{WORKFLOW.name}: could not read the digest download pattern")

    if upload and download:
        up_sep, down_sep = upload.group("sep"), download.group("sep")
        if up_sep != down_sep:
            problems.append(
                f"{WORKFLOW.name}: the upload separator {up_sep!r} and the download separator "
                f"{down_sep!r} differ -- the merge job would find no digests at all"
            )
        elif images and arches:
            sep = up_sep
            # Exactly what the workflow produces and then globs for.
            artifacts = [f"digest{sep}{image}{sep}{arch}" for image in images for arch in arches]
            for image in images:
                pattern = f"digest{sep}{image}{sep}*"
                matched = fnmatch.filter(artifacts, pattern)
                if len(matched) != len(arches):
                    # Derive the culprits from the image list, not by splitting on
                    # the separator -- splitting on "-" turns
                    # "digest-service-dash-network-info-amd64" into "service".
                    others = sorted(
                        other for other in images
                        if other != image
                        and any(m.startswith(f"digest{sep}{other}{sep}") for m in matched)
                    )
                    problems.append(
                        f"{WORKFLOW.name}: the digest pattern for '{image}' matches "
                        f"{len(matched)} artifacts, expected {len(arches)} -- it also claims "
                        f"{', '.join(others)}. Image names share a prefix, so the separator "
                        f"{sep!r} has to be one that appears in none of them."
                    )

    for problem in problems:
        print(f"FAIL: {problem}", file=sys.stderr)
    if not problems:
        print(f"ok: each of the {len(images)} images claims exactly its own {len(arches)} digests")
    return 1 if problems else 0


if __name__ == "__main__":
    sys.exit(main())
