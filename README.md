# Service Dash — Docker Package

This package deploys the framework-free dashboard and a bundled Netdata Agent as one self-contained Compose stack. Nginx proxies `/kuma/` to Uptime Kuma and `/netdata/` to the included Netdata service. No separate Netdata installation, build tools, or Node.js runtime are required.

All application files are included in the image. The page optionally downloads Google Fonts when internet access is available; without them, it remains usable with fallback fonts, although some iconography may be less polished.

## Package contents

```text
service-dash/
├── assets/
│   ├── css/styles.css
│   └── js/app.js
├── .dockerignore
├── .env.example
├── Dockerfile
├── Dockerfile.network-info
├── docker-compose.build.yml
├── docker-compose.yml
├── .github/workflows/
│   ├── publish-images.yml
│   └── validate.yml
├── entrypoint.sh
├── install-zimaos.sh
├── icon-favicon.png
├── index.html
├── network-info.sh
├── nginx.conf.template
└── README.md
```

## Requirements

- Docker Engine 24 or newer with Docker Compose v2 recommended
- A reachable Uptime Kuma instance
- Network access from the dashboard container to Uptime Kuma

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

### 3. Optional configuration

No `.env` file is required. The default configuration expects Uptime Kuma on port `3001` of the ZimaBoard, uses the published status-page slug `homelab`, automatically selects storage, and exposes Service Dash on port `8888`.

Only when one of those defaults is different, create an optional `.env` file containing the changed value. The template is available from the repository:

```sh
cd /DATA/AppData/service-dash
curl -fsSL https://raw.githubusercontent.com/cvaghela/service-dash/main/.env.example -o .env
```

Edit only the value that differs. The included `host.docker.internal` mapping lets Service Dash reach Uptime Kuma on the ZimaOS Docker host. Netdata is installed by this stack and has a fixed private address, so users never need to configure `NETDATA_UPSTREAM`.

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

### Portainer and other stack managers

The public Compose file uses registry images and can be pasted directly into a compatible Portainer or ZimaOS stack editor. Keep the `x-casaos` metadata when importing into ZimaOS so its title, icon, port, and main service are recognized.

## Configuration

The frontend expects same-origin paths `/kuma` and `/netdata`. Nginx maps `/kuma` to the configured Uptime Kuma service and reaches the included Netdata Agent directly over the stack's private Docker network. Netdata port `19999` is not published on the ZimaBoard.

All defaults live in `docker-compose.yml`, so `.env` is optional. These settings contain no Uptime Kuma credentials. Do not add a Kuma password or token to either file; the optional URL-unlock login remains a browser-only action.

| Variable | Purpose | Compose default |
| --- | --- | --- |
| `DASHBOARD_PORT` | Host port for the web dashboard | `8888` |
| `KUMA_UPSTREAM` | Uptime Kuma origin, without a trailing proxy path | `http://host.docker.internal:3001` |
| `STATUS_SLUG` | Final path segment of the published Kuma status-page URL | `homelab` |
| `STORAGE_MOUNT` | Initial storage mount for browsers without a saved dropdown selection | `auto` |

Valid upstream examples:

- Services on the Docker host: `http://host.docker.internal:3001`
- Services on another LAN host: `http://192.168.1.50:3001`
- Services in the same Docker network: `http://uptime-kuma:3001`
- HTTPS upstream: `https://kuma.internal.example`

Do not use `localhost` for an upstream unless the service runs inside this same container. Inside Docker, `localhost` means the dashboard container itself.

Compose is required because it starts and connects both included services and applies Netdata's host-monitoring permissions and read-only mounts.

## Deploy on a server

1. Install Docker Engine and its Compose plugin on the target server.
2. Transfer and extract this package into a persistent directory such as `/opt/service-dash`.
3. If the defaults do not fit that server, create `.env` from `.env.example` and change only the required values.
4. Run `docker compose pull && docker compose up -d` from that directory.
5. Allow the selected dashboard port through the host firewall, or publish it only through an existing reverse proxy.
6. For public access, terminate HTTPS at a trusted reverse proxy and forward traffic to the dashboard container. Preserve WebSocket upgrade headers so the dashboard’s optional Uptime Kuma login flow works.

When placing this dashboard behind another reverse proxy, proxy the whole dashboard origin. Do not separately remap `/kuma` and `/netdata`; this container already handles them.

## Use the dashboard

- The dashboard reads the Uptime Kuma status page selected by `STATUS_SLUG`; the built-in default is `homelab`.
- Live status data is polled through `/kuma/api/status-page/...`.
- Netdata host metrics are collected by the bundled Agent and read through `/netdata/api/v1/...`.
- LAN displays only the host IP address; subnet, interface, and gateway details remain available in its tooltip. Click either the LAN or WAN address to copy it to the clipboard.
- CPU shows live utilization, normalized 1-minute load, package power draw, and package temperature when the host exposes Intel RAPL and hardware sensor feeds. Load is shown as a percentage of logical CPU capacity with its raw value and CPU count, such as `32% (1.28 / 4)`. Missing optional sensors display `—` rather than mock values.
- RAM shows utilization and total installed capacity in GB. Storage shows utilization with the used amount in parentheses, plus free and total capacity; capacity labels automatically scale between MB, GB, and TB.
- Storage auto-detection excludes container overlays and transient system mounts, preferring named persistent paths such as `/media/1TB-SSD-1` and `/var/lib/casaos_data`. Open the Sources dropdown to select one or several mounts. Multiple selections are converted to bytes and aggregated before Used, Free, Total, and percentage are calculated. The selection is saved in that browser. Override `STORAGE_MOUNT` only when you want a different initial source for browsers without a saved selection.
- “Unlock URLs” loads Socket.IO through `/kuma/socket.io/`. Credentials are sent to your proxied Uptime Kuma instance; choosing “remember” stores the returned login token in that browser’s local storage.
- Theme, accent, filters, and other client-side preferences may also persist in the browser.

To find the correct slug, open the published status page in Uptime Kuma. For a URL ending in `/status/homelab`, use `STATUS_SLUG=homelab`—which is already the built-in default. If yours differs, set it in an optional `.env` file and recreate the Service Dash container.

## Security notes

The embedded Netdata API is not published directly; it is available through the dashboard's same-origin `/netdata/` proxy. Keep the dashboard on a trusted private network or protect it with an authenticated HTTPS reverse proxy before wider distribution.

Friendly Docker interface names are discovered through a private CetusGuard sidecar. CetusGuard is the only service with the Docker socket mounted, and its allowlist permits only read-only network listing and inspection requests. Container creation, execution, modification, logs, secrets, and other Docker API operations remain blocked. The dashboard exposes only this limited network metadata so it can correlate `veth` endpoint IDs with container names.

LAN is detected from the ZimaOS host's actual default route, not from the address used by the browser. The private `network-info` helper runs with host networking, reads the route and interface directly, and writes the source address, prefix, interface, and gateway to a private named volume shared read-only with the dashboard. It publishes no port and requires neither host PID visibility nor `SYS_ADMIN`.

WAN is looked up server-side every ten minutes using `api.ipify.org`, with Cloudflare trace as a fallback. Those providers see the ZimaBoard's public source IP, but receive no browser identifiers, dashboard data, or Uptime Kuma data. If host detection or outbound lookup is unavailable, the corresponding field displays `unavailable`.

Other recommendations:

- Use HTTPS whenever the dashboard is accessible outside a trusted LAN.
- Do not publish Uptime Kuma or Netdata admin interfaces unnecessarily.
- Limit upstream access by network/firewall rules.
- Avoid committing `.env` to source control.
- If a browser login was remembered, use the dashboard logout control and clear site data on shared devices.

## Troubleshooting

### Dashboard does not open

Run `docker compose ps` and `docker compose logs service-dash`. Confirm `DASHBOARD_PORT` is unused and test `http://SERVER:PORT/healthz`; a healthy container returns `ok`.

### 502 Bad Gateway for `/kuma/`

The dashboard cannot reach Uptime Kuma. Verify `KUMA_UPSTREAM`, ensure you did not use `localhost`, and confirm Uptime Kuma is listening on the expected host port.

### Status cards do not load

Confirm the Uptime Kuma status page exists and is published. Test `http://SERVER:PORT/kuma/api/status-page/YOUR_SLUG` in a browser. If it returns `Status Page Not Found`, set the correct `STATUS_SLUG` in `.env` and run `docker compose up -d --force-recreate service-dash`.

### Netdata shows mock or missing metrics

Run `docker compose ps` and `docker compose logs netdata`, then open `http://SERVER:PORT/netdata/api/v1/charts`. Confirm the Netdata service is healthy and that the chart names expected by `app.js` exist. The bundled Agent uses host PID access, Linux capabilities, and read-only host mounts to collect ZimaBoard metrics. It shares a private Docker network with the dashboard, avoiding ZimaOS host-gateway and firewall issues.

CPU watts and temperature are optional sensor readings and do not reduce the `REALTIME x/5` count when unavailable. For Intel systems, look for a `cpu.powercap_intel_rapl_zone` chart and a `system.hw.sensor.temperature.input` chart in the charts response. The dashboard prefers the complete package power zone and CPU package temperature over individual cores.

If storage capacity is unexpected, open the Sources dropdown in the Storage card and select the intended mount or mounts. Be careful not to combine two bind mounts that represent the same underlying filesystem, because any capacity dashboard would count that filesystem twice. To set an initial server-wide choice, find its `chart_labels.mount_point` under a `disk_space.*` chart, set (for example) `STORAGE_MOUNT=/media/1TB-SSD-1` in `.env`, and recreate the dashboard container.

### LAN or WAN is unavailable

Run `docker compose ps` and `docker compose logs network-info`. The helper should be healthy. Then test the private status file through the dashboard:

```sh
docker compose exec -T service-dash wget -q -O - http://127.0.0.1/network-info/status
```

The `lan.address` value comes from the source address on ZimaOS's default IPv4 route. If no internet route exists, the helper falls back to a global IPv4 address on a non-container host interface. WAN needs outbound HTTPS and DNS access; it remains `unavailable` if both public-IP providers cannot be reached. The dashboard deliberately does not substitute the browser URL for a missing LAN address. LAN and WAN values remain white even when network throughput changes the rest of the Network panel's state color.

### “Unlock URLs” or login fails

Confirm `/kuma/socket.io/socket.io.js` loads, WebSockets are allowed by any outer reverse proxy, browser blockers are not blocking Socket.IO, and the Uptime Kuma account/2FA token is correct.

### Changes do not appear

Pull and recreate the published container, then hard-refresh the browser:

```sh
docker compose pull service-dash
docker compose up -d --force-recreate service-dash
```

Static assets are cached for seven days, so a browser hard refresh or cache clear may be required.

## Update and rollback

Download the `docker-compose.yml` from the desired release, then run:

```sh
docker compose pull
docker compose up -d
docker compose ps
docker compose logs --tail=100 service-dash
```

To roll back, restore the previous release's Compose file and run the same pull and up commands. Dashboard preferences and remembered tokens live in each browser. Netdata configuration, history, and cache persist in the named Docker volumes `netdataconfig`, `netdatalib`, and `netdatacache`.

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
