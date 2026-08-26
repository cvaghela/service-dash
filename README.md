# Service Dash — Docker Package

This package deploys the framework-free dashboard and a bundled Netdata Agent as one self-contained Compose stack. Nginx proxies `/kuma/` to Uptime Kuma and `/netdata/` to the included Netdata service. No separate Netdata installation, build tools, or Node.js runtime are required.

All application files are included in the image. Two optional assets are fetched from the internet when it is available: Google Fonts, and service icons from [selfh.st/icons](https://github.com/selfhst/icons) via the jsDelivr CDN. Without either, the dashboard remains fully usable — text falls back to system fonts and service cards fall back to the bundled Service Dash mark.

## Package contents

```text
service-dash/
├── assets/
│   ├── css/styles.css
│   ├── img/service-dash-icon.png
│   └── js/app.js
├── .dockerignore
├── .gitignore
├── CHANGELOG.md
├── LICENSE
├── Dockerfile
├── Dockerfile.network-info
├── docker-compose.build.yml
├── docker-compose.casaos.yml
├── docker-compose.yml
├── .github/workflows/
│   ├── publish-images.yml
│   └── validate.yml
├── entrypoint.sh
├── install-linux.sh
├── icon-favicon.png
├── index.html
├── network-info.sh
├── nginx.conf.template
└── README.md
```

## Supported platforms

Service Dash currently supports ZimaOS, CasaOS, and conventional Linux AMD64 hosts running Docker Engine with Docker Compose v2. The published images target `linux/amd64`.

| Platform | Support level | Notes |
| --- | --- | --- |
| ZimaOS on ZimaBoard | Supported | Primary target and expected to provide full host metrics |
| CasaOS on Linux AMD64 | Supported | Use the dedicated `docker-compose.casaos.yml` importer file |
| Debian/Ubuntu Linux AMD64 | Supported | Requires standard Docker Engine and permission to use host mounts and capabilities |
| Other Linux AMD64 distributions | Best effort | AppArmor, SELinux, firewall, or mount policies may require adjustments |
| Synology/QNAP and similar NAS systems | Best effort | Vendor Docker restrictions may prevent some host metrics or mounts |
| Linux ARM64 | Not currently supported | Service Dash images are not yet published for ARM64 |
| macOS or Windows Docker Desktop | Not supported for real host metrics | Containers would monitor Docker's Linux VM instead of the physical computer |
| Rootless Docker | Not supported | Host PID access, network detection, capabilities, and host mounts are required |
| Kubernetes or Podman | Not currently supported | The supplied deployment is specifically designed for Docker Compose |

The `x-casaos` section adds ZimaOS/CasaOS presentation metadata. Standard Docker Compose implementations ignore this extension and continue using the regular service configuration.

CasaOS users must use `docker-compose.casaos.yml`. Its UI importer does not reliably preserve named volumes or the default Compose network, so the dedicated file uses explicit `/DATA/AppData/service-dash` bind mounts and a named bridge network with service aliases.

## Requirements

- A Linux AMD64 host
- Docker Engine 24 or newer with Docker Compose v2 recommended
- Rootful Docker, or equivalent permission to use host PID access, host networking, Linux capabilities, and read-only host mounts
- An Uptime Kuma instance on the same Linux host with its HTTP port published to the host
- Outbound HTTPS and DNS for WAN-address detection
- Network access from the Service Dash container to Uptime Kuma

## Quick start

1. Download `docker-compose.yml` into an empty directory.
2. Start Service Dash with the built-in defaults:

   ```sh
   docker compose pull
   docker compose up -d
   ```

   Docker pulls the published Service Dash, network helper, Netdata, and Docker metadata images automatically. No source checkout or local image build is required.

3. Open `http://localhost:8888`.
4. Check status:

   ```sh
   docker compose ps
   docker compose logs -f service-dash
   ```

Stop it with `docker compose down`.

When installing from a full source checkout or ZIP, `install-linux.sh` performs the same deployment plus platform, Compose, Netdata, network, and Uptime Kuma checks:

```sh
chmod +x install-linux.sh
./install-linux.sh
```

## ZimaBoard with ZimaOS

Service Dash uses published container images, so ZimaOS can install it directly from `docker-compose.yml` without building source code.

### 1. Download the Compose file

Create a persistent directory and download the Compose file:

```sh
mkdir -p /DATA/AppData/service-dash
cd /DATA/AppData/service-dash
curl -fsSL https://raw.githubusercontent.com/cvaghela/service-dash/main/docker-compose.yml -o docker-compose.yml
```

### 2. Enable SSH

In the ZimaOS web interface, open the View menu and enable SSH Access. Connect to the ZimaBoard using its LAN IP and your ZimaOS account.

### 3. Configuration

Service Dash never uses a separate `.env` file. The default Compose configuration expects Uptime Kuma on port `3001` of the ZimaBoard, uses the published status-page slug `homelab`, automatically selects storage, and exposes Service Dash on port `8888`. Legacy `.env` files from earlier packages can be deleted because the Compose file contains no variable substitutions.

If a default differs, edit only the relevant line in `docker-compose.yml`:

```yaml
ports:
  - "8888:80"
environment:
  KUMA_PORT: "3001"
  STATUS_SLUG: "homelab"
  STORAGE_MOUNT: "auto"
```

Service Dash constructs the internal Kuma origin as `http://host.docker.internal:KUMA_PORT`. Users configure only the port; the hostname, scheme, and proxy paths are implementation details. Netdata is installed by this stack and uses a fixed private address that is not exposed as user configuration.

### 4. Install

Become root and start the stack:

```sh
sudo -i
cd /DATA/AppData/service-dash
export DOCKER_CONFIG=/var/lib/docker/.docker
mkdir -p "$DOCKER_CONFIG"
docker compose pull
docker compose up -d
```

Then open:

```text
http://ZIMAOS-IP:8888
```

The Compose project includes a fixed project name so ZimaOS can identify it consistently. The container uses `restart: unless-stopped`, so it starts again after a ZimaBoard reboot.

Check `docker compose ps` after installation. The four services should be running and Netdata should report healthy.

The ZimaOS app tile uses `https://i.postimg.cc/BnL4qBwB/service-dash.png`. A copy is also bundled as `icon-favicon.png`, so the browser favicon does not depend on the external host after the image has been built.

### ZimaOS management commands

Run these as root from the extracted package directory:

```sh
export DOCKER_CONFIG=/var/lib/docker/.docker

# Status and logs
docker compose ps
docker compose logs -f service-dash

# Download published image updates for the version selected by Compose
docker compose pull
docker compose up -d

# Stop and remove the dashboard container
docker compose down
```

Keep `docker-compose.yml` in this directory so the stack can be managed and updated later.

## CasaOS UI installation

CasaOS requires the dedicated `docker-compose.casaos.yml`; do not import the standard `docker-compose.yml` through its UI.

1. Open **App Store**, select **Custom Install**, and choose the Docker Compose import option.
2. Paste the complete contents of `docker-compose.casaos.yml`.
3. Adjust `KUMA_PORT`, `STATUS_SLUG`, `STORAGE_MOUNT`, or the host port only when their defaults differ.
4. Install the application and open `http://CASAOS-IP:8888`.

The CasaOS file stores persistent data below `/DATA/AppData/service-dash`, exposes `/DATA` to Netdata for storage metrics, and attaches Service Dash, Netdata, and Docker metadata to the explicit `service-dash-network`. The LAN/WAN helper intentionally continues using host networking.

If the dashboard container does not become healthy, inspect it with:

```sh
docker inspect service-dash --format '{{json .State.Health}}'
docker logs --tail=100 service-dash
```

### Portainer and other stack managers

The public Compose file uses registry images and can be pasted directly into a compatible Portainer or ZimaOS stack editor. Keep the `x-casaos` metadata when importing into ZimaOS so its title, icon, port, and main service are recognized.

## Configuration

The frontend expects same-origin paths `/kuma` and `/netdata`. Nginx maps `/kuma` to the configured Uptime Kuma service and reaches the included Netdata Agent directly over the stack's private Docker network. Netdata port `19999` is not published on the ZimaBoard.

All installation settings live directly in the Compose file used for the installation (`docker-compose.yml`, or `docker-compose.casaos.yml` on CasaOS); no `.env` file is supported or required. These settings contain no Uptime Kuma credentials. Do not add a Kuma password or token to Compose; the optional status-page login remains a browser-only action.

| Compose setting | Purpose | Default value |
| --- | --- | --- |
| `ports` | Host port mapped to container port 80 | `8888:80` |
| `KUMA_PORT` | HTTP port published by Uptime Kuma on the same Linux host | `3001` |
| `STATUS_SLUG` | Final path segment of the published Kuma status-page URL | `homelab` |
| `STORAGE_MOUNT` | Initial storage mount for browsers without a saved dropdown selection | `auto` |

The dashboard also proxies the icon catalogue at `/icon-index`; nothing to configure, but it does mean the container
makes one outbound request a day to `cdn.jsdelivr.net`. Without internet access the picker falls back to its built-in
list and cards fall back to monograms.
| `KUMA_URL` | Where the `kuma-auth` service reaches Uptime Kuma. Must point at the same instance as `KUMA_PORT` | `http://host.docker.internal:3001` |
| `NETWORK_INFO_REFRESH_SECONDS` | Starting value for how often the LAN route and WAN address are re-read. Optional — the **Settings** page overrides it | `600` |

### Container CPU and RAM

Where a service maps to one or more Docker containers on the host, its card shows their current CPU percentage and RAM
in MB. The figures come from the bundled Netdata Agent's per-container charts (`cgroup_NAME.cpu` and
`cgroup_NAME.mem_usage`) through the existing `/netdata/` proxy — the Docker socket proxy stays restricted to read-only
network metadata and is not involved.

Service Dash matches a card to a container automatically only when the names genuinely agree. Uptime Kuma monitor names
and container names are usually different, so most cards need to be pointed at their container once: hover the card,
click the pencil on its icon, and open **Mapped to** in **Card settings**. The list contains every container Netdata can
see. **Match automatically** keeps name matching; clear it to choose containers yourself, and the choice is saved in that
browser.

A service that runs as several containers — an app with its own database, cache, or worker — can be mapped to all of
them. Their CPU percentages and RAM are added together and shown as one figure, with the card's tooltip naming what was
combined. A container that stops reporting is left out of the total rather than counted as zero, and the tooltip says how
many are missing. Selecting no containers hides the row for that card.

Cards with no container mapped simply omit the row. Container stats refresh every 10 seconds rather than every 2, since
each mapped container costs an extra pair of Netdata queries — a card mapped to four containers costs eight.

### Shared settings

Card settings, filters, the storage and network selections, and the notes panel are shared by every browser and device.
There is nothing to switch on and no password to set: **reading them is open, and saving a change requires being signed
in to Uptime Kuma** — the login the dashboard already offers.

nginx cannot verify a Kuma token, and a browser claiming to be signed in proves nothing, so the question is put to Kuma
itself. The `kuma-auth` service answers it: it emits Kuma's `loginByToken`, which verifies the token against Kuma's own
secret, confirms the user is still active, and rejects tokens issued before a password change. Anything that is not an
explicit yes is a no — an unreachable or slow Kuma means the write is refused.

The token stays in the browser that signed in. It is never written into the document other devices read, and the
validator stores answers by fingerprint rather than by token.

Practical consequences:

- **Anyone who can reach the dashboard can read the settings**, as they can already read the dashboard itself.
- **Anyone who can sign in to your Uptime Kuma can change them for everyone.** Kuma's user list is the guest list.
- **Last write wins.** No merge, no locking; changes made elsewhere appear on reload rather than live.
- **If `kuma-auth` is down, shared settings become unavailable — reads included.** nginx checks every request to the
  document and cannot be made to check only writes, so a validator outage takes reads with it. The dashboard falls back
  to each browser's own copy and keeps working; the rest of the dashboard is unaffected.
- The document is capped at 256 KB, and a failed write leaves the browser working from its own copy with a warning.

### Settings

The gear in the top bar opens a settings page. What is there applies to every browser and device, stored in the same
shared document: reading it needs nothing, changing it asks you to sign in to Uptime Kuma.

It currently holds how often the LAN route and public IP are re-read, between 30 seconds and 24 hours. The value is
bounded in the browser and again in the `network-info` service, which reads it straight from the shared document and
picks it up on its next pass — no container to recreate. The `settings` volume is mounted read-only into that service
for the purpose. Without it, or with an unreadable or out-of-range value, the service falls back to
`NETWORK_INFO_REFRESH_SECONDS`, and failing that to 600 seconds.

`KUMA_PORT`, `STATUS_SLUG` and `STORAGE_MOUNT` stay in Compose, because the dashboard needs them before it can start.

### Values hidden until you sign in

Service URLs and the host's LAN and WAN addresses render as a blurred mask until you sign in to Uptime Kuma. While
locked the addresses are not requested at all, so they never reach the browser — the blur is how it looks, not what
protects it. Signing in reveals them; signing out hides them again immediately.

### Response headers

The dashboard sends a Content-Security-Policy on its own document, along with `X-Content-Type-Options: nosniff` and
`Referrer-Policy: no-referrer`.

The policy allows scripts and styles from the dashboard itself, fonts from Google Fonts, and images from the dashboard,
`data:` URIs, and any **HTTPS** host. That last part is deliberate: a plain-`http` image URL cannot be loaded, which
blocks a hostile icon link from making requests to LAN equipment out of each viewer's browser. Self-hosted icons still
work over a relative path such as `/icons/plex.png`; an icon served from a plain-`http` host on your LAN does not, and
should be served over HTTPS or bind-mounted into the container instead.

### Service icons

Service cards show a real application logo from [selfh.st/icons](https://github.com/selfhst/icons), matched automatically
from the service name — `Radarr` finds the Radarr logo, `Home Assistant` finds Home Assistant, and so on.

Icons load from `https://cdn.jsdelivr.net/gh/selfhst/icons/png/`, and the dashboard searches the **full selfh.st
catalogue** — around 2,900 icons — not a fixed list. The catalogue index is proxied through the dashboard at
`/icon-index` rather than fetched by the browser, which is what lets the page keep `connect-src 'self'` in its
Content-Security-Policy. It is cached for a day, and a host with no internet simply falls back to the built-in list.

Any card whose service has no match, or whose icon fails
to load for any reason, shows a monogram instead: the service's initials over a gradient keyed to its name, so every card
stays distinguishable. The monogram is drawn in the browser rather than fetched, so it works on a host with no internet
access and can never itself fail to load.

To change the icon for a card, hover it and click the small pencil button at the bottom-left corner of the tile. Type a
service name to pick from the matching icons, or paste an image link of your own — either way the card updates
immediately. **Default icon** returns to the automatically matched icon, and clearing the field shows the monogram. The
choice is saved in that browser, so no redeploy or Compose edit is needed.

For a server-wide default that applies to every browser and device — useful when the dashboard is shared — set
`SERVICE_ICONS` to a JSON object keyed by the name shown on the card:

```yaml
environment:
  SERVICE_ICONS: '{"LTT Catalog":"https://cdn.jsdelivr.net/gh/selfhst/icons/png/youtube.png","Plex":"/icons/plex.png"}'
```

- Names are matched case-insensitively, and a paired `Plex` / `Plex local` set is covered by the single entry `Plex`.
- Any image URL works. A relative path such as `/icons/plex.png` is served from the dashboard container, so icons can be
  bind-mounted and kept entirely local.
- An empty value — `{"Plex":""}` — disables the automatic match for that card and shows its monogram.
- An override always beats the automatic match, and a per-browser choice made with the pencil button beats `SERVICE_ICONS`.
- A link that cannot be loaded falls back to the monogram, and the icon editor says so rather than failing quietly.

Precedence is: the icon picked in this browser, then `SERVICE_ICONS`, then the automatic match, then the monogram.

Recreate the container after changing it:

```sh
docker compose up -d --force-recreate service-dash
```

If the value is not valid JSON the dashboard logs a warning in the browser console and ignores the overrides; it does not
break the page.

### Storage mount options

`STORAGE_MOUNT` controls the initial storage source for a browser that has not already saved a selection. It accepts either `"auto"` or one exact absolute mount path reported by Netdata.

| Value | When to use it |
| --- | --- |
| `"auto"` | Recommended default. Prefers a named data disk, then `/DATA`, CasaOS data storage, `/mnt`, and finally `/`. |
| `"/"` | Monitor the Linux system/root filesystem. |
| `"/DATA"` | Monitor a ZimaOS/CasaOS data filesystem when Netdata reports `/DATA` as a mount point. |
| `"/var/lib/casaos_data"` | Use the CasaOS data filesystem when this exact mount is reported. |
| `"/media/1TB-SSD-1"` | Example named disk mounted under `/media`. Replace it with the exact name on the host. |
| `"/mnt/storage"` | Example conventional Linux data disk mounted under `/mnt`. Replace it with the exact host path. |

The value must be an actual filesystem mount point—not merely a directory—and it is case-sensitive. Do not enter a Netdata chart ID such as `disk_space./`; enter its `chart_labels.mount_point` value, such as `/`.

The easiest way to see usable sources is to open the Storage card's **Sources** dropdown. To list every mount reported by the bundled Netdata API from the command line, run:

```sh
curl -fsSL http://127.0.0.1:8888/netdata/api/v1/charts \
  | jq -r '.charts | to_entries[] | select(.key | startswith("disk_space.")) | .value.chart_labels.mount_point // empty' \
  | sort -u
```

If `jq` is unavailable, open `http://SERVER-IP:8888/netdata/api/v1/charts` in a browser and search the response for `mount_point`.

Ignore transient mounts under `/proc`, `/sys`, `/run`, `/dev`, Docker overlays, and other container-related paths. Select the host filesystem whose capacity you actually want displayed.

To change the server-wide initial source, edit the environment value in `docker-compose.yml`:

```yaml
environment:
  STORAGE_MOUNT: "/DATA"
```

Then recreate the dashboard container:

```sh
docker compose up -d --force-recreate service-dash
```

`STORAGE_MOUNT` sets only one initial source. To combine multiple disks, select them in the dashboard's **Sources** dropdown; the browser saves that selection and the dashboard aggregates their used, free, and total capacity. A saved browser selection takes precedence over the Compose default. After changing Compose, either select the new source in the dropdown or remove only the saved storage choice in the browser console and reload:

```js
localStorage.removeItem("storageMounts");
location.reload();
```

`KUMA_PORT` must be a number from `1` through `65535`. For example, if Uptime Kuma opens at `http://SERVER-IP:3001`, keep `KUMA_PORT: "3001"`. If it opens at `http://SERVER-IP:3010`, use `KUMA_PORT: "3010"`. Do not enter a hostname, scheme, URL, or `/status/...` path.

This simplified setting intentionally supports Uptime Kuma on the same Linux host. An installation with Kuma only on another machine, available only over HTTPS, or behind a URL prefix requires a future advanced-upstream option and is not supported by the current Compose file.

Compose is required because it starts and connects both included services and applies Netdata's host-monitoring permissions and read-only mounts.

## Deploy on a server

1. Install Docker Engine and its Compose plugin on the target server.
2. Transfer and extract this package into a persistent directory such as `/opt/service-dash`.
3. If the defaults do not fit that server, edit only the required values directly in `docker-compose.yml`.
4. Run `docker compose pull && docker compose up -d` from that directory.
5. Allow the selected dashboard port through the host firewall, or publish it only through an existing reverse proxy.
6. For public access, terminate HTTPS at a trusted reverse proxy and forward traffic to the dashboard container. Preserve WebSocket upgrade headers so the dashboard’s optional Uptime Kuma login flow works.

When placing this dashboard behind another reverse proxy, proxy the whole dashboard origin. Do not separately remap `/kuma` and `/netdata`; this container already handles them.

## Use the dashboard

- The dashboard reads the Uptime Kuma status page selected by `STATUS_SLUG`; the built-in default is `homelab`.
- Live status data is polled through `/kuma/api/status-page/...`.
- Netdata host metrics are collected by the bundled Agent and read through `/netdata/api/v1/...`.
- LAN displays only the host IP address; subnet, interface, and gateway details remain available in its tooltip. Both the LAN and WAN addresses stay blurred until you hover, focus, or tap them, so the dashboard can sit on a visible screen without publishing its own IPs. Click either one to copy it to the clipboard.
- CPU shows live utilization, normalized 1-minute load, package power draw, and package temperature when the host exposes Intel RAPL and hardware sensor feeds. Load is shown as a percentage of logical CPU capacity with its raw value and CPU count, such as `32% (1.28 / 4)`. Missing optional sensors display `—` rather than mock values.
- RAM shows utilization and total installed capacity in GB. Storage shows utilization as a percentage, with used, free, and total capacity on the line beneath it; capacity labels automatically scale between MB, GB, and TB.
- Storage auto-detection excludes container overlays and transient system mounts, preferring named persistent paths such as `/media/1TB-SSD-1` and `/var/lib/casaos_data`. Open the Sources dropdown to select one or several mounts. Multiple selections are converted to bytes and aggregated before Used, Free, Total, and percentage are calculated. The selection is saved in that browser. See **Storage mount options** above for server-wide initial-source configuration.
- Each service card shows its two endpoints, Local and External. The one a click will open is tinted; flipping the Local/External switch in the top bar moves that highlight. A service with only one endpoint shows only that row.
- **Login** loads Socket.IO through `/kuma/socket.io/`. Credentials are sent to your proxied Uptime Kuma instance; choosing “remember” stores the returned login token in that browser’s local storage. Without it the dashboard still works, showing status and uptime with the URLs hidden.
- Hover a card and click the pencil at its corner for **Card settings**: the icon for that service, and the Docker containers whose CPU and RAM the card should show. Several containers can be mapped to one card, and their figures are added together. Both settings are saved in that browser.
- Theme, accent, filters, and other client-side preferences may also persist in the browser.

To find the correct slug, open the published status page in Uptime Kuma. For a URL ending in `/status/homelab`, use `STATUS_SLUG: "homelab"`—which is already the built-in default. If yours differs, edit `STATUS_SLUG` in `docker-compose.yml` and recreate the Service Dash container.

## Security notes

The embedded Netdata API is not published directly; it is available through the dashboard's same-origin `/netdata/` proxy. Keep the dashboard on a trusted private network or protect it with an authenticated HTTPS reverse proxy before wider distribution.

Friendly Docker interface names are discovered through a private CetusGuard sidecar. CetusGuard is the only service with the Docker socket mounted, and its allowlist permits only read-only network listing and inspection requests. Container creation, execution, modification, logs, secrets, and other Docker API operations remain blocked. The dashboard exposes only this limited network metadata so it can correlate `veth` endpoint IDs with container names.

LAN is detected from the Linux host's actual default route, not from the address used by the browser. The private `network-info` helper runs with host networking, reads the route and interface directly, and writes the source address, prefix, interface, and gateway to a private named volume shared read-only with the dashboard. It publishes no port and requires neither host PID visibility nor `SYS_ADMIN`.

WAN is looked up server-side every ten minutes using `api.ipify.org`, with Cloudflare trace as a fallback. Those providers see the ZimaBoard's public source IP, but receive no browser identifiers, dashboard data, or Uptime Kuma data. If host detection or outbound lookup is unavailable, the corresponding field displays `unavailable`.

Other recommendations:

- Use HTTPS whenever the dashboard is accessible outside a trusted LAN.
- Do not publish Uptime Kuma or Netdata admin interfaces unnecessarily.
- Limit upstream access by network/firewall rules.
- If a browser login was remembered, use the dashboard logout control and clear site data on shared devices.

## Troubleshooting

### Dashboard does not open

Run `docker compose ps` and `docker compose logs service-dash`. Confirm the host port in the Compose `ports` mapping is unused and test `http://SERVER:PORT/healthz`; a healthy container returns `ok`.

### 502 Bad Gateway for `/kuma/`

The dashboard cannot reach Uptime Kuma. Verify `KUMA_PORT` in `docker-compose.yml` and confirm Uptime Kuma publishes that HTTP port on the same Linux host.

### Status cards do not load

Confirm the Uptime Kuma status page exists and is published. Test `http://SERVER:PORT/kuma/api/status-page/YOUR_SLUG` in a browser. If it returns `Status Page Not Found`, edit `STATUS_SLUG` in `docker-compose.yml` and run `docker compose up -d --force-recreate service-dash`.

### Netdata shows mock or missing metrics

Run `docker compose ps` and `docker compose logs netdata`, then open `http://SERVER:PORT/netdata/api/v1/charts`. Confirm the Netdata service is healthy and that the chart names expected by `app.js` exist. The bundled Agent uses host PID access, Linux capabilities, and read-only host mounts to collect Linux host metrics. It shares a private Docker network with the dashboard, avoiding host-gateway and firewall issues.

CPU watts and temperature are optional sensor readings and do not reduce the `REALTIME x/5` count when unavailable. For Intel systems, look for a `cpu.powercap_intel_rapl_zone` chart and a `system.hw.sensor.temperature.input` chart in the charts response. The dashboard prefers the complete package power zone and CPU package temperature over individual cores.

If storage capacity is unexpected, open the Sources dropdown in the Storage card and select the intended mount or mounts. Be careful not to combine two mount paths that represent the same underlying filesystem, because the dashboard would count that filesystem twice. Use the **Storage mount options** instructions above to discover and configure the initial source.

### LAN or WAN is unavailable

Run `docker compose ps` and `docker compose logs network-info`. The helper should be healthy. Then test the private status file through the dashboard:

```sh
docker compose exec -T service-dash wget -q -O - http://127.0.0.1/network-info/status
```

The `lan.address` value comes from the source address on the Linux host's default IPv4 route. If no internet route exists, the helper falls back to a global IPv4 address on a non-container host interface. WAN needs outbound HTTPS and DNS access; it remains `unavailable` if both public-IP providers cannot be reached. The dashboard deliberately does not substitute the browser URL for a missing LAN address. LAN and WAN values remain white even when network throughput changes the rest of the Network panel's state color.

### Login or private URLs fail

Confirm `/kuma/socket.io/socket.io.js` loads, WebSockets are allowed by any outer reverse proxy, browser blockers are not blocking Socket.IO, and the Uptime Kuma account/2FA token is correct.

### Changes do not appear

Pull and recreate the published container, then hard-refresh the browser:

```sh
docker compose pull service-dash
docker compose up -d --force-recreate service-dash
```

Static assets are cached for seven days, so a browser hard refresh or cache clear may be required.

## Upgrading from 1.3.0

A drop-in upgrade: pull the new images and restart. Only the dashboard's own JavaScript and markup changed, so nothing
in the Compose files, the images' configuration or `entrypoint.sh` needs editing.

```bash
docker compose pull && docker compose up -d
```

Static assets are cached for seven days, so a hard refresh may be needed before the change shows.

## Upgrading from 1.2.2

A drop-in upgrade: pull the new images and restart. Nothing in the Compose files, the images' configuration or
`entrypoint.sh` changed, so an existing 1.2.2 deployment needs no edits.

```bash
docker compose pull && docker compose up -d
```

Static assets are cached for seven days, so a hard refresh may be needed before the new sign-in dialog and locked-value
styling appear.

## Upgrading from 1.2.1

**If you deployed 1.2.1 on CasaOS, your stack could not start** — `kuma-auth` was on the wrong network, so nginx exited
with `host not found in upstream "kuma-auth"` and the dashboard restart-looped. Fixing it needs a one-line Compose edit,
not just a new image: give `kuma-auth` the same network as everything else.

```yaml
  kuma-auth:
    image: ghcr.io/cvaghela/service-dash-kuma-auth:1.3.1
    # …
    networks:                      # replaces `- default`
      service-dash-network:
        aliases:
          - kuma-auth
```

The `docker-compose.casaos.yml` shipped with any release from 1.2.2 onwards already has it, so taking that file
wholesale is the simplest route. Everything else arrives with the images and needs no configuration change; the standard
`docker-compose.yml` was never affected.

## Upgrading from 1.2.0

This release **changes the Compose file**, so pulling the image alone is not enough.

1. Add the new `kuma-auth` service and point `KUMA_URL` at the same Uptime Kuma as `KUMA_PORT`.
2. Mount the `settings` volume read-only into `network-info` at `/settings`.
3. Remove `SHARED_SETTINGS`, `SHARED_SETTINGS_USER`, `SHARED_SETTINGS_PASSWORD_FILE` and `SERVICE_ICONS`, and the
   `settings_password` secret. They no longer exist, and the container ignores them.
4. `NETWORK_INFO_REFRESH_SECONDS` is now optional; keep it as a starting value or drop it.

Taking the release's `docker-compose.yml` wholesale and re-applying your `KUMA_PORT`, `STATUS_SLUG` and
`STORAGE_MOUNT` is the least error-prone route.

What changes for people using it: **saving settings now requires signing in to Uptime Kuma**, and anyone who can sign
in there can change them for everyone. Any per-service icons previously set through `SERVICE_ICONS` are gone — set them
per card instead, where the picker now searches the whole catalogue. Service URLs and the LAN and WAN addresses are
hidden until you sign in.

## Upgrading from 1.1.1

Pull the new image and recreate the container. **No configuration changes are required** — the existing
`docker-compose.yml` from 1.1.1 works unchanged, every new setting defaults off, and no new volume, secret, or
environment variable is needed to keep what you already have.

```sh
docker compose pull service-dash
docker compose up -d --force-recreate service-dash
```

Existing per-browser customisations survive untouched: card icons, container mappings, storage and network selections,
notes, theme, and accent. Container mappings written by 1.1.1 stored a single container name; they are now read as
one-item lists automatically, with nothing to migrate by hand.

### What looks different

- Cards with no matching icon show a monogram — the service's initials over a gradient — instead of the bundled
  Service Dash mark.
- The status dot moved to the card's top-right corner.
- Card settings has an icon picker: type a service name to choose from matching icons. Pasting a link still works.
- **Use default** in that dialog is now **Default icon**.
- Byte figures pick their own unit, so container RAM under a gigabyte reads in MB rather than always MB.

### The one thing that can break

The dashboard now sends a Content-Security-Policy that restricts images to itself, `data:` URIs, and HTTPS hosts. If
any of your icons — in `SERVICE_ICONS` or picked per-browser — point at a **plain-`http`** address, they will stop
loading and those cards fall back to a monogram.

This is deliberate: it stops a hostile icon link from making each viewer's browser call LAN equipment. Fix an affected
icon by serving it over HTTPS, or by bind-mounting the image into the container and using a relative path:

```yaml
volumes:
  - ./icons:/usr/share/nginx/html/icons:ro
environment:
  SERVICE_ICONS: '{"Plex":"/icons/plex.png"}'
```

Icons from `https://` hosts, including the default `cdn.jsdelivr.net` artwork, are unaffected.

### Turning on shared settings

Settings stay per-browser unless you opt in, exactly as before. To share them across every browser and device, create
the password file and set three values — see **Shared settings** above for the full detail:

```sh
printf '%s' 'a-long-random-passphrase' > ./settings-password.txt
chmod 600 ./settings-password.txt
```

```yaml
environment:
  SHARED_SETTINGS: "on"
  SHARED_SETTINGS_USER: "dashboard"
  SHARED_SETTINGS_PASSWORD_FILE: "/run/secrets/settings_password"
secrets:
  - settings_password
volumes:
  - settings:/var/lib/service-dash
```

The container **refuses to start** if `SHARED_SETTINGS` is `on` and the password is missing, too short, or points at a
directory rather than a file, so a misconfiguration fails loudly instead of leaving the write endpoint open.

**Decide which browser seeds the shared settings.** When you first turn this on, the shared document does not exist
yet and every browser keeps showing its own settings. The first browser to save a change publishes *its* settings to
everyone, and other browsers adopt them on their next load — replacing what those browsers had. So make your first
change from the browser whose setup you want to keep, before opening the dashboard elsewhere.

Turning the setting back off leaves the document in the volume untouched and returns every browser to its own copy.

## Update and rollback

The current release is **1.3.1**; the Compose files in this repository reference the matching `1.3.1` images.

Download the appropriate Compose file from the desired release—`docker-compose.yml` for standard Docker/ZimaOS or `docker-compose.casaos.yml` for the CasaOS UI—then run:

```sh
docker compose pull
docker compose up -d
docker compose ps
docker compose logs --tail=100 service-dash
```

To roll back, restore the previous release's corresponding Compose file and run the same pull and up commands. Dashboard preferences and remembered tokens live in each browser. Standard installations retain Netdata data in named Docker volumes; CasaOS installations retain it below `/DATA/AppData/service-dash/netdata`.

## Maintenance commands

```sh
# Show status
docker compose ps

# Follow both dashboard and Netdata logs
docker compose logs -f

# Restart
docker compose restart service-dash

# Recreate after changing Compose configuration
docker compose up -d --force-recreate

# Stop and remove the dashboard container/network
docker compose down
```

## Local development builds

Contributors can build the two Service Dash images from source without changing the public Compose file:

```sh
docker compose -f docker-compose.yml -f docker-compose.build.yml up -d --build
```

## License

Service Dash is free software, licensed under the
[GNU General Public License v3.0](LICENSE) or, at your option, any later version.

You may run, study, modify, and redistribute it. If you distribute a modified version, you must release your changes
under the GPLv3 as well. Running a modified copy on your own server without distributing the software is not
distribution, and carries no such obligation.

This program is distributed WITHOUT ANY WARRANTY; see sections 15 and 16 of the license for details.
