# The public demo

`build-demo.py` assembles one self-contained page from the real sources —
`index.html`, `assets/css/styles.css` and `assets/js/app.js`, inlined verbatim —
with `demo-shim.js` in front of them. It is published to
[cvaghela.github.io/service-dash/demo](https://cvaghela.github.io/service-dash/demo/)
by `publish-appstore.yml`, from the same `gh-pages` branch that carries the app
store.

**Credentials: `test` / `Test`.** The 2FA field is ignored.

```sh
python3 demo/build-demo.py --out /tmp/demo/index.html
python3 -m http.server 8000 --directory /tmp/demo
```

Serve it rather than opening the file directly: the shim answers absolute paths
like `/netdata/api/v1/charts`, which do not resolve under `file://`.

## What is faked, and what is not

Only the backends. `demo-shim.js` replaces `window.fetch` and stands in for
Uptime Kuma's Socket.IO client, answering the endpoints nginx normally proxies
with data of the same shape. The dashboard's own HTML, CSS and JavaScript are
untouched, so what a visitor clicks is the application, not a mock-up of it.

Two things are deliberately real:

- **Icon artwork**, straight from `cdn.jsdelivr.net/gh/selfhst/icons`.
- **The icon catalogue** behind the per-card picker — the shim passes
  `/icon-index` through to the same file nginx proxies, so search covers all
  ~2,900 entries rather than a trimmed copy.

That is also the one way the demo differs from the Claude artifact built from
the same shim: the artifact runs under a CSP that blocks every external host, so
there the catalogue and artwork are embedded instead.

Settings and notes are written to the visitor's own `localStorage`. Nothing
reaches a server, and no two visitors share state.

## Keeping it honest

The build asserts on each of the three sources it inlines and fails loudly if
`index.html` renames one, rather than shipping a demo with, say, no stylesheet:

```
FAIL: index.html no longer matches '<link rel="stylesheet" href="assets/css/styles.css…'
      -- update demo/build-demo.py
```

CI then greps the built page for a marker from each of the three, because a
page missing its stylesheet still renders *something*.

The workflow rebuilds the demo whenever `demo/`, `index.html`, the stylesheet or
`app.js` changes, so it cannot drift from the app it is demonstrating.
