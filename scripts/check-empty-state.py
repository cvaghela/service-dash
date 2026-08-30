#!/usr/bin/env python3
"""Guard the empty state: the panel that explains a blank grid.

Why this exists. IceWhale's maintainer installed Service Dash on ZimaOS while
reviewing it for their store, got a blank grid, checked that every container was
healthy, and reasonably concluded the app was broken. It was not -- Uptime Kuma
simply was not there to read. The only things the page said were the word
OFFLINE in small type in the topbar and a toast that cleared itself after 5.2
seconds, and neither survived long enough to answer the question.

A blank grid has three quite different causes and the reader cannot tell them
apart, so the panel names which one it is. Each check below is one way that
would silently stop being true.

    python3 scripts/check-empty-state.py
"""
import pathlib
import re
import sys

REPO = pathlib.Path(__file__).resolve().parent.parent
APP = REPO / "assets" / "js" / "app.js"
INDEX = REPO / "index.html"
STYLES = REPO / "assets" / "css" / "styles.css"
ENTRYPOINT = REPO / "entrypoint.sh"


def main() -> int:
    problems: list[str] = []

    app = APP.read_text()
    index = INDEX.read_text()
    styles = STYLES.read_text()
    entrypoint = ENTRYPOINT.read_text()

    # The container has to exist, and has to sit OUTSIDE #groups:
    # buildDomOnceIfNeeded() clears #groups wholesale and would take the panel
    # with it, which reads as "the empty state randomly stopped appearing".
    if 'id="emptyState"' not in index:
        problems.append('index.html: no element with id="emptyState"')
    else:
        groups = re.search(r'<div class="groups" id="groups">(.*?)</div>', index, re.S)
        if groups and "emptyState" in groups.group(1):
            problems.append(
                "index.html: #emptyState is inside #groups, which buildDomOnceIfNeeded() "
                "empties on every rebuild -- it must be a sibling"
            )

    if "function renderEmptyState(" not in app:
        problems.append("app.js: renderEmptyState() is gone")

    # Three call sites, and each is load-bearing. The filter pass covers the
    # healthy paths; the other two are the branches where Kuma failed, and
    # applyFiltersAndCounts() is never reached on those.
    calls = len(re.findall(r"^\s*renderEmptyState\(\);", app, re.M))
    if calls < 3:
        problems.append(
            f"app.js: renderEmptyState() is called from {calls} place(s), expected at least 3 "
            "(the filter pass, plus the failure branches of loadKumaOrMock and pollOnce) -- "
            "a missing call is a blank grid with no explanation on exactly the path that needs one"
        )

    # The command the panel offers must describe THIS install. It was hardcoded
    # to 3001/homelab once by accident; a command naming the wrong port sends
    # the reader to prove something irrelevant.
    command = re.search(r"function kumaDiagnosticCommand\(\) \{(.*?)\n\}", app, re.S)
    if not command:
        problems.append("app.js: kumaDiagnosticCommand() is gone")
    else:
        body = command.group(1)
        for token in ("${KUMA_PORT}", "${STATUS_SLUG}"):
            if token not in body:
                problems.append(
                    f"app.js: the diagnostic command no longer interpolates {token} -- "
                    "it would print a command describing somebody else's install"
                )

    # KUMA_PORT only reaches the browser because entrypoint.sh puts it there.
    # Both halves are checked, not just the name: the first version of this
    # check looked for "kumaPort" anywhere in the file and was satisfied by the
    # COMMENT above the printf, so deleting the emission itself passed clean.
    emit = re.search(r"printf 'window\.__DASHBOARD_CONFIG__[^\n]*\n(?:[^\n]*\n)?", entrypoint)
    if not emit:
        problems.append("entrypoint.sh: the config.js emission is gone")
    else:
        block = emit.group(0)
        if 'kumaPort: "%s"' not in block:
            problems.append(
                "entrypoint.sh: config.js no longer declares kumaPort -- the panel falls back "
                "to 3001 and silently prints the wrong port for anyone who changed it"
            )
        if "$KUMA_PORT" not in block:
            problems.append(
                "entrypoint.sh: kumaPort is declared but $KUMA_PORT is not passed to printf -- "
                "the value would be empty or, worse, shifted from the next argument"
            )
    if "RUNTIME_CONFIG.kumaPort" not in app:
        problems.append("app.js: kumaPort is no longer read from the runtime config")

    # --pending is a dark-ground token: on the light panel it measures 1.36:1,
    # which is not a heading so much as a rumour of one. The override is what
    # takes it to 9.34:1.
    if '.emptyState[data-kind="offline"] .emptyTitle' not in styles:
        problems.append("styles.css: the offline title no longer takes the warning colour")
    elif '[data-theme="light"] .emptyState[data-kind="offline"] .emptyTitle' not in styles:
        problems.append(
            'styles.css: no light-mode override for the offline title -- --pending measures '
            "1.36:1 on that panel in light mode, which fails AA badly"
        )

    # A stray NUL turns the whole file binary to grep, ripgrep and every editor
    # search. One got in here from a separator character and cost real time
    # before anyone noticed that grep had quietly stopped matching anything.
    for path in (APP, INDEX, STYLES, ENTRYPOINT):
        count = path.read_bytes().count(b"\x00")
        if count:
            problems.append(
                f"{path.relative_to(REPO)}: contains {count} NUL byte(s) -- grep and every "
                "editor search treat the file as binary and silently find nothing in it"
            )

    for problem in problems:
        print(f"FAIL: {problem}", file=sys.stderr)
    if not problems:
        print("ok: the empty state is wired up and can still explain itself")
    return 1 if problems else 0


if __name__ == "__main__":
    sys.exit(main())
