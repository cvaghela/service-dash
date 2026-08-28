#!/usr/bin/env python3
"""Assemble the public demo: one self-contained page, no backends.

Reads index.html, styles.css and app.js verbatim and inlines them, then adds
demo-shim.js in front so the endpoints nginx normally proxies are answered with
plausible data. Nothing about the dashboard's own behaviour is rewritten -- what
a visitor clicks is the real application.

    python3 demo/build-demo.py [--out dist/demo/index.html]
"""
import argparse
import base64
import pathlib
import re
import sys

REPO = pathlib.Path(__file__).resolve().parent.parent
DEMO = REPO / "demo"

BANNER = """
<div id="demoBanner" role="note">
  <strong>Live demo</strong>
  <span><i class="demoWordy">Sample data, nothing real.</i> Sign in as <code>test</code> / <code>Test</code><i class="demoWordy"> to unlock URLs and settings.</i></span>
  <a href="https://github.com/cvaghela/service-dash" rel="noopener">Get&nbsp;it&nbsp;&rarr;</a>
</div>
<style>
/* Centred with auto margins rather than left:50% + translateX(-50%). With
   left:50% and right:auto a fixed element's shrink-to-fit width is capped at
   the space from that point to the right edge -- half the viewport -- so the
   banner could never be wider than 50vw no matter what max-width said, and
   wrapped on any window under roughly twice its content width (~1300px). That
   is why it looked wrong well beyond phones. Pinning both edges gives
   shrink-to-fit the whole viewport to work with. */
#demoBanner{position:fixed;left:0;right:0;bottom:14px;margin-inline:auto;width:fit-content;z-index:9999;
  display:flex;gap:10px;align-items:center;flex-wrap:wrap;justify-content:center;
  max-width:min(94vw,760px);padding:9px 15px;border-radius:999px;
  font:500 13px/1.45 system-ui,-apple-system,"Segoe UI",sans-serif;
  color:#f4f3ff;background:rgba(24,22,42,.82);border:1px solid rgba(255,255,255,.16);
  box-shadow:0 10px 32px rgba(0,0,0,.42);backdrop-filter:blur(14px)}
#demoBanner strong{font-weight:700;letter-spacing:.01em}
#demoBanner span{opacity:.85}
#demoBanner code{padding:1px 6px;border-radius:6px;background:rgba(255,255,255,.14);
  font:600 12px/1 ui-monospace,SFMono-Regular,Menlo,monospace}
#demoBanner a{color:#c9c2ff;text-decoration:none;font-weight:600;white-space:nowrap}
#demoBanner a:hover{text-decoration:underline}
#demoBanner i.demoWordy{font-style:normal}
/* The banner has to outrank the dashboard, but not a dialog: at z-index 9999
   over an overlay's 100 it was sitting on top of the settings panel's own
   Close and Save buttons. */
body:has(.overlay.show) #demoBanner{display:none}
/* Measured, not guessed: the full sentence needs 659px on one line at 13px,
   and the banner is capped at min(94vw,760px) -- so it wraps below a ~700px
   window, far above the phone range. A 560px cutoff left every window between
   561px and 700px showing the wordy version wrapped inside a pill. Trimmed to
   the one thing a visitor needs, the text fits on one line down to ~330px. */
@media (max-width:720px){
  #demoBanner{max-width:calc(100vw - 16px);padding:8px 12px;gap:7px}
  #demoBanner i.demoWordy{display:none}
}
/* Phone-only sizing. env() resolves to 0 everywhere else, so it is harmless
   above this width, but the smaller type is not wanted on a desktop window. */
@media (max-width:560px){
  #demoBanner{font-size:12px;bottom:calc(8px + env(safe-area-inset-bottom))}
}
/* A 999px radius on a block that has wrapped bows the sides inwards and eats
   the text. Driven by the measured height rather than a breakpoint, so it is
   right at every width -- see the script below. */
#demoBanner[data-wrapped]{border-radius:16px}

/* The banner is bottom-centred in exactly the place the toast is, and both
   carry z-index 9999 -- so raising one only reverses which of the two is
   unreadable. Lift the toast clear of the banner instead. The height is
   measured rather than guessed because the banner wraps to two lines on a
   narrow screen. Demo-only: the app has no banner to avoid. */
.toast{bottom:calc(24px + var(--demo-banner-h,52px))}
</style>
<script>
(function () {
    var banner = document.getElementById("demoBanner");
    // One line is ~37px at 13px and ~35px at 12px, two lines ~56px. Anything
    // above this has wrapped.
    var SINGLE_LINE_MAX = 44;
    var apply = function () {
        var height = Math.ceil(banner.getBoundingClientRect().height);
        // Safe inside a ResizeObserver: the radius cannot change the height,
        // so this cannot feed back and retrigger the observer.
        banner.toggleAttribute("data-wrapped", height > SINGLE_LINE_MAX);
        document.documentElement.style.setProperty("--demo-banner-h", height + "px");
    };
    apply();
    if (window.ResizeObserver) new ResizeObserver(apply).observe(banner);
    else addEventListener("resize", apply);
})();
</script>
"""


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--out", default=str(REPO / "dist" / "demo" / "index.html"))
    args = ap.parse_args()

    html = (REPO / "index.html").read_text(encoding="utf-8")
    css = (REPO / "assets/css/styles.css").read_text(encoding="utf-8")
    js = (REPO / "assets/js/app.js").read_text(encoding="utf-8")
    shim = (DEMO / "demo-shim.js").read_text(encoding="utf-8")

    # config.js is written by entrypoint.sh at container start. The demo has no
    # container, so the same values are supplied literally.
    config = (
        'window.KUMA_PORT="3001";'
        'window.STATUS_SLUG="homelab";'
        'window.STORAGE_MOUNT="auto";'
    )

    icon_uri = "data:image/png;base64," + base64.b64encode(
        (REPO / "assets/img/service-dash-icon.png").read_bytes()
    ).decode()

    # Replace the three external references with the real content. Each pattern
    # is asserted, so a rename in index.html fails the build here rather than
    # silently shipping a demo with no stylesheet.
    subs = [
        (r'\s*<link rel="stylesheet" href="assets/css/styles\.css[^"]*" />',
         f"\n<style>\n{css}\n</style>"),
        (r'\s*<script src="/config\.js[^"]*"></script>',
         f"\n<script>{config}</script>\n<script>\n{shim}\n</script>"),
        (r'\s*<script src="\./assets/js/app\.js[^"]*" defer></script>',
         f"\n<script defer>\n{js}\n</script>"),
    ]
    for pattern, replacement in subs:
        if not re.search(pattern, html):
            sys.exit(f"FAIL: index.html no longer matches {pattern!r} -- update demo/build-demo.py")
        html = re.sub(pattern, lambda _m, r=replacement: r, html, count=1)

    html = html.replace("assets/img/service-dash-icon.png", icon_uri)
    html = html.replace("<title>Service Dash</title>", "<title>Service Dash — live demo</title>", 1)
    html = html.replace("</body>", BANNER + "</body>", 1)

    out = pathlib.Path(args.out)
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(html, encoding="utf-8")
    print(f"wrote {out}  ({len(html.encode()) // 1024} KB)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
