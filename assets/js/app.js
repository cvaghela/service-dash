/* =========================
CONFIG (edit for your setup)
========================= */

// Uptime Kuma Setup
const RUNTIME_CONFIG = window.__DASHBOARD_CONFIG__ || {};
const KUMA_BASE = "/kuma";
const STATUS_SLUG = String(RUNTIME_CONFIG.statusSlug || "homelab");
const STORAGE_MOUNT = String(RUNTIME_CONFIG.storageMount || "auto").trim();
// Per-service icon overrides from SERVICE_ICONS in the Compose file. These are
// the server-wide default; anything the user sets in the browser beats them.
const ICON_OVERRIDES = parseIconOverrides(RUNTIME_CONFIG.iconOverrides);
const ICON_STORAGE_KEY = "serviceIcons";
let BROWSER_ICON_OVERRIDES = loadBrowserIconOverrides();
const POLL_MS = 15000;

const EP_STATUS = `${KUMA_BASE}/api/status-page/${encodeURIComponent(STATUS_SLUG)}`;
const EP_HEART = `${KUMA_BASE}/api/status-page/heartbeat/${encodeURIComponent(STATUS_SLUG)}`;

// Netdata (served via Nginx Proxy Manager)
// Recommended: proxy Netdata under the SAME origin as this dashboard, e.g. https://dash.example.com/netdata/
// NPM should route: /netdata/* -> http://192.168.1.1:19999/*
const NETDATA_BASE = "/netdata";
const NETDATA_TOKEN = ""; // Embedded Netdata is reachable only through the dashboard proxy.
const NETDATA_POLL_MS = 2000;

// Debug handle (always present)
window.__netdata = {
    base: NETDATA_BASE,
    tokenSet: !!NETDATA_TOKEN,
    charts: {
        cpu: "system.cpu",
        ram: "system.ram",
        disk: "disk_space./",
        net: "system.net",
    },
    last: {
        ok: null,
        status: "boot",
        at: null,
        error: null,
    },
};

// Chart IDs (verify via: /netdata/api/v1/charts)
const ND_CHART_CPU = "system.cpu";
const ND_CHART_LOAD = "system.load";
let ND_CHART_CPU_POWER = null;
let ND_CHART_CPU_TEMP = null;
let ND_CPU_COUNT = null;

// RAM varies by install; we'll auto-detect from these candidates:
const ND_CHART_RAM_CANDIDATES = ["system.ram", "system.mem", "netdata.memory", "system.memory"];
let ND_CHART_RAM = "system.ram";

// Fallback defaults (used only until auto-detect runs)
let ND_CHART_DISK = "disk_space./";
let ND_CHART_NET = "system.net";
let ND_UNIT_RAM = "MiB";
let ND_UNIT_DISK = "GiB";
let ND_DISK_MOUNT = "/";
let ND_DISK_OPTIONS = [];
let ND_SELECTED_DISKS = [];

// Per-container stats, from Netdata's cgroup charts (cgroup_NAME.cpu is a
// percentage, cgroup_NAME.mem_usage is MiB). Polled far more slowly than the
// host metrics — a mapped card costs two extra queries per tick.
let ND_CONTAINERS = [];
const CONTAINER_POLL_MS = 10000;
const CONTAINER_STORAGE_KEY = "serviceContainers";
let SERVICE_CONTAINERS = loadServiceContainers();

// Accent presets (persisted)
const ACCENTS = [
    "aurora",
    "sunset",
    "ocean",
    "cyber",
    "forest",
    "candy",
    "royal",
    "midnight",
    "deepocean",
    "neonnoir",
    "ember",
    "evergreen",
    "plum",
];

// Category detection keywords
const KEYWORDS = [
    {
        regex: /plex|jellyfin|emby|sonarr|radarr|overseerr|bazarr|lidarr/i,
        category: "media",
    },
    {
        regex: /kuma|grafana|tautulli|prometheus|uptime|monitor|loki|alertmanager/i,
        category: "monitoring",
    },
    {
        regex: /nas|zima|casa|storage|nextcloud|synology|truenas|minio|s3/i,
        category: "storage",
    },
    {
        regex: /home assistant|automation|mqtt|zigbee|zwave|nodered|node-red/i,
        category: "automation",
    },
    {
        regex: /wiki|docs|bookstack|docusaurus|mkdocs|outline/i,
        category: "docs",
    },
    { regex: /pdf|tools|util|toolbox|it-tools/i, category: "tools" },
    {
        regex: /request|ombi|jellyseerr|overseerr/i,
        category: "requests",
    },
    {
        regex: /stream|rtmp|restream|nginx|proxy|traefik|caddy/i,
        category: "network",
    },
    { regex: /backup|borg|restic|syncthing/i, category: "backup" },
];

// Real app icons from https://github.com/selfhst/icons, matched by service name.
// Anything unmatched (or any host without internet) keeps the category emoji.
const SERVICE_ICON_BASE = "https://cdn.jsdelivr.net/gh/selfhst/icons/png";
// Shipped inside the image, so the last-resort icon can never itself fail to
// load — that is the whole point of a fallback.
const FALLBACK_ICON = "assets/img/service-dash-icon.png";
// Brand mark in the top bar. Defaults to the bundled Service Dash icon, so it
// needs no internet access; point it at any image URL to use your own. Falls
// back to the ⚡ glyph if the image cannot be loaded.
const BRAND_LOGO = FALLBACK_ICON;
const SERVICE_ICONS = [
    { regex: /zimaos/i, slug: "zimaos" },
    { regex: /casaos/i, slug: "casaos" },
    { regex: /home\s*assistant|hass/i, slug: "home-assistant" },
    { regex: /jellyseerr/i, slug: "jellyseerr" },
    { regex: /overseerr/i, slug: "overseerr" },
    { regex: /jellyfin/i, slug: "jellyfin" },
    { regex: /\bemby\b/i, slug: "emby" },
    { regex: /\bplex\b/i, slug: "plex" },
    { regex: /tautulli/i, slug: "tautulli" },
    { regex: /prowlarr/i, slug: "prowlarr" },
    { regex: /radarr/i, slug: "radarr" },
    { regex: /sonarr/i, slug: "sonarr" },
    { regex: /lidarr/i, slug: "lidarr" },
    { regex: /readarr/i, slug: "readarr" },
    { regex: /bazarr/i, slug: "bazarr" },
    { regex: /\bombi\b/i, slug: "ombi" },
    { regex: /sabnzbd/i, slug: "sabnzbd" },
    { regex: /qbittorrent/i, slug: "qbittorrent" },
    { regex: /otter\s*wiki/i, slug: "an-otter-wiki" },
    { regex: /bookstack/i, slug: "bookstack" },
    { regex: /stirling/i, slug: "stirling-pdf" },
    { regex: /mealie/i, slug: "mealie" },
    { regex: /grafana/i, slug: "grafana" },
    { regex: /prometheus/i, slug: "prometheus" },
    { regex: /uptime\s*kuma/i, slug: "uptime-kuma" },
    { regex: /netdata/i, slug: "netdata" },
    { regex: /portainer/i, slug: "portainer" },
    { regex: /nextcloud/i, slug: "nextcloud" },
    { regex: /syncthing/i, slug: "syncthing" },
    { regex: /minio/i, slug: "minio" },
    { regex: /synology/i, slug: "synology" },
    { regex: /node[-\s]?red/i, slug: "node-red" },
    { regex: /mosquitto|mqtt/i, slug: "mosquitto" },
    { regex: /zigbee2mqtt/i, slug: "zigbee2mqtt" },
    { regex: /esphome/i, slug: "esphome" },
    { regex: /it[-\s]?tools/i, slug: "it-tools" },
    { regex: /vaultwarden|bitwarden/i, slug: "vaultwarden" },
    { regex: /adguard/i, slug: "adguard-home" },
    { regex: /traefik/i, slug: "traefik" },
    { regex: /nginx\s*proxy\s*manager|\bnpm\b/i, slug: "nginx-proxy-manager" },
    { regex: /immich/i, slug: "immich" },
    { regex: /paperless/i, slug: "paperless-ngx" },
    { regex: /audiobookshelf/i, slug: "audiobookshelf" },
    { regex: /navidrome/i, slug: "navidrome" },
    { regex: /duplicati/i, slug: "duplicati" },
    { regex: /restic/i, slug: "restic" },
    { regex: /homarr/i, slug: "homarr" },
    { regex: /heimdall/i, slug: "heimdall" },
];

const CATEGORY_META = {
    media: { icon: "🎬", label: "Media" },
    monitoring: { icon: "📡", label: "Monitoring" },
    storage: { icon: "🗄️", label: "Storage" },
    automation: { icon: "🤖", label: "Automation" },
    docs: { icon: "📚", label: "Docs" },
    tools: { icon: "🧰", label: "Tools" },
    requests: { icon: "📬", label: "Requests" },
    network: { icon: "🧭", label: "Network" },
    backup: { icon: "🛟", label: "Backup" },
    other: { icon: "✨", label: "Other" },
};

const STATUS_MAP = {
    0: "offline",
    1: "online",
    2: "pending",
    3: "maintenance",
};

/* =========================
               STATE
               ========================= */
const state = {
    theme: "dark",
    accent: "aurora", // ✅ NEW: persisted accent
    linkMode: "local",
    statusFilter: "all",
    categoryFilter: "all",
    query: "",

    pageData: null,
    heartbeat: null,
    kumaConnected: false,
    lastSync: null,

    // socket auth/urls
    socket: null,
    socketReady: false,
    socketAuthed: false,
    monitorById: {},

    // derived
    services: [],

    // render caching
    domBuilt: false,
    cardElById: new Map(),
};

const els = {
    root: document.documentElement,
    btnTheme: document.getElementById("btnTheme"),
    btnLinkMode: document.getElementById("btnLinkMode"),
    linkModeToggle: document.getElementById("linkModeToggle"),
    btnRefresh: document.getElementById("btnRefresh"),
    btnAuth: document.getElementById("btnAuth"),
    btnLogout: document.getElementById("btnLogout"),

    overlay: document.getElementById("overlay"),
    iconOverlay: document.getElementById("iconOverlay"),
    iconServiceName: document.getElementById("iconServiceName"),
    iconUrlInput: document.getElementById("iconUrlInput"),
    iconPreviewImg: document.getElementById("iconPreviewImg"),
    iconPreviewEmoji: document.getElementById("iconPreviewEmoji"),
    iconPreview: document.getElementById("iconPreview"),
    iconStatus: document.getElementById("iconStatus"),
    containerSelect: document.getElementById("containerSelect"),
    containerHint: document.getElementById("containerHint"),
    btnIconSave: document.getElementById("btnIconSave"),
    btnIconCancel: document.getElementById("btnIconCancel"),
    btnIconDefault: document.getElementById("btnIconDefault"),
    btnCancel: document.getElementById("btnCancel"),
    btnConnect: document.getElementById("btnConnect"),

    authUser: document.getElementById("authUser"),
    authPass: document.getElementById("authPass"),
    authTfa: document.getElementById("authTfa"),
    authRemember: document.getElementById("authRemember"),
    authConn: document.getElementById("authConn"),

    q: document.getElementById("q"),
    groups: document.getElementById("groups"),
    statusChips: document.getElementById("statusChips"),
    categoryChips: document.getElementById("categoryChips"),
    lastSync: document.getElementById("lastSync"),
    kumaConn: document.getElementById("kumaConn"),
    urlState: document.getElementById("urlState"),
    pollDot: document.getElementById("pollDot"),

    notes: document.getElementById("notes"),
    cpuVal: document.getElementById("cpuVal"),
    cpuWatts: document.getElementById("cpuWatts"),
    cpuTemp: document.getElementById("cpuTemp"),
    memVal: document.getElementById("memVal"),
    memTotal: document.getElementById("memTotal"),
    diskVal: document.getElementById("diskVal"),
    diskUsed: document.getElementById("diskUsed"),
    diskFree: document.getElementById("diskFree"),
    diskTotal: document.getElementById("diskTotal"),
    diskMount: document.getElementById("diskMount"),
    diskSourcePicker: document.getElementById("diskSourcePicker"),
    diskMountOptions: document.getElementById("diskMountOptions"),
    cpuBar: document.getElementById("cpuBar"),
    memBar: document.getElementById("memBar"),
    diskBar: document.getElementById("diskBar"),

    // Network panel
    lan: document.getElementById("lan"),
    wan: document.getElementById("wan"),
    loadVal: document.getElementById("loadVal"),
    loadBar: document.getElementById("loadBar"),
    netIface: document.getElementById("netIface"),
    netSpark: document.getElementById("netSpark"),
    netSparkMeta: document.getElementById("netSparkMeta"),

    toast: document.getElementById("toast"),
    toastMsg: document.getElementById("toastMsg"),
    toastClose: document.getElementById("toastClose"),

    logo: document.querySelector(".logo"),

    // Collapsible metrics sidebar
    metricsSidebar: document.getElementById("metricsSidebar"),
};

window.__dataSource = window.__dataSource || { netdataOk: false, lastNetdataAt: 0 };
window.__kuma = window.__kuma || { ok: false, status: "boot", at: null, error: null };

// Feed names as the tooltip should read them, in dashboard order.
const NETDATA_FEED_LABELS = {
    cpu: "CPU",
    ram: "RAM",
    disk: "Storage",
    network: "Network",
    load: "Load",
    power: "CPU power",
    temperature: "CPU temperature",
};

function setDataSource(isRealtime, { feeds = [], allCoreFeedsLive = false } = {}) {
    window.__dataSource.netdataOk = !!isRealtime;
    window.__dataSource.lastNetdataAt = isRealtime ? Date.now() : window.__dataSource.lastNetdataAt;

    // Log once per switch (helps debugging)
    if (setDataSource._prev !== window.__dataSource.netdataOk) {
        setDataSource._prev = window.__dataSource.netdataOk;
        console.info(`[data] source = ${window.__dataSource.netdataOk ? "REALTIME (Netdata)" : "OFFLINE"}`);
    }

    const el = document.querySelector("[data-role='dataSourceBadge']");
    if (!el) return;

    el.textContent = window.__dataSource.netdataOk ? "REALTIME" : "OFFLINE";
    el.dataset.state = !window.__dataSource.netdataOk ? "offline" : allCoreFeedsLive ? "healthy" : "partial";
    // Hovering the badge should say which feed is doing what, not just x/5.
    el.title = feeds.length
        ? feeds.join("\n")
        : window.__netdata?.last?.error || window.__netdata?.last?.status || "Netdata metrics status";
}

/* =========================
               UTIL
========================= */

// --- Haptics (mobile) ---------------------------------------------------------
const HAPTICS = {
    enabled: true,
    // Keep it short; 8–15ms feels like a light tap
    tapMs: 10,
    // Only trigger on coarse pointers (phones/tablets)
    coarseOnly: true,
};

function isCoarsePointer() {
    return window.matchMedia && window.matchMedia("(pointer: coarse)").matches;
}

function isIOS() {
    return /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;
}

function hapticTap(ms = HAPTICS.tapMs) {
    if (!HAPTICS.enabled) return;
    if (HAPTICS.coarseOnly && !isCoarsePointer()) return;

    // iOS: no vibration support on the web
    if (isIOS()) return;

    if (navigator.vibrate) navigator.vibrate(ms);
}

/**
 * Global haptics for "button-like" UI.
 * - Uses event delegation (no per-button wiring)
 * - Uses pointerdown so it feels instant
 * - Avoids firing for disabled controls or opt-out elements
 */
function initGlobalHaptics() {
    const selector = [
        "button",
        "[role='button']",
        "input[type='button']",
        "input[type='submit']",
        ".btn",
        ".icon-btn",
        ".chip",
        ".tag",
        ".pill",
        ".action",
        ".clickable",
        "[data-action]",
    ].join(",");

    const TAP_SLOP_PX = 10; // movement threshold to treat as scroll
    let active = null;

    function isPrimaryTouchOrPen(e) {
        return (e.pointerType === "touch" || e.pointerType === "pen") && (e.button == null || e.button === 0);
    }

    function eligible(el) {
        if (!el) return false;
        if (el.matches(":disabled") || el.getAttribute("aria-disabled") === "true") return false;
        if (el.closest("[data-no-haptics='true']")) return false;
        return true;
    }

    document.addEventListener(
        "pointerdown",
        (e) => {
            if (!isPrimaryTouchOrPen(e)) return;

            const el = e.target.closest(selector);
            if (!eligible(el)) return;

            active = {
                id: e.pointerId,
                x: e.clientX,
                y: e.clientY,
                el,
                moved: false,
            };
        },
        { passive: true }
    );

    document.addEventListener(
        "pointermove",
        (e) => {
            if (!active || e.pointerId !== active.id) return;

            const dx = e.clientX - active.x;
            const dy = e.clientY - active.y;

            // Once we cross the slop threshold, consider it a scroll/drag
            if (dx * dx + dy * dy > TAP_SLOP_PX * TAP_SLOP_PX) {
                active.moved = true;
            }
        },
        { passive: true }
    );

    document.addEventListener(
        "pointerup",
        (e) => {
            if (!active || e.pointerId !== active.id) return;

            // Only vibrate if it was a tap (no meaningful movement)
            if (!active.moved) {
                // still on an eligible control at release time
                const upEl = e.target.closest(selector);
                if (upEl && (upEl === active.el || active.el.contains(upEl)) && eligible(upEl)) {
                    hapticTap();
                }
            }

            active = null;
        },
        { passive: true }
    );

    document.addEventListener(
        "pointercancel",
        (e) => {
            if (active && e.pointerId === active.id) active = null;
        },
        { passive: true }
    );
}

function openUrlNow(url) {
    if (!url) return false;
    const u = normalizeMaybeUrl(url);
    // Use location.assign for same-tab reliability on mobile
    // but keep new tab on desktop.
    if (isTouch) {
        window.location.assign(u);
        return true;
    } else {
        window.open(u, "_blank", "noopener,noreferrer");
        return true;
    }
}
function isLocalishName(name) {
    // Accept: "Plex local", "Plex (local)", "Plex - local", "Plex.local"
    const n = safeStr(name).trim().toLowerCase();

    // strip trailing punctuation/brackets/spaces
    const cleaned = n.replace(/[\s\)\]\}]+$/g, "");

    return /(\.local|local)$/.test(cleaned);
}

function baseServiceKey(name) {
    let n = safeStr(name).trim().toLowerCase();

    // Normalize whitespace
    n = n.replace(/\s+/g, " ").trim();

    // Remove trailing ".local"
    n = n.replace(/\.local\s*$/i, "");

    // Remove trailing variations of "local"
    // Handles: " local", " - local", " — local", "(local)", "[local]" etc.
    n = n.replace(/\s*[\(\[\{]?\s*(?:-|\u2013|\u2014|:|_)?\s*local\s*[\)\]\}]?\s*$/i, "");

    // Re-trim
    n = n.replace(/\s+/g, " ").trim();

    return n;
}

const clamp = (n, a, b) => Math.max(a, Math.min(b, n));

function formatRateKbps(kbps) {
    const v = Number(kbps);
    if (!Number.isFinite(v)) return "—";
    const abs = Math.abs(v);
    if (abs >= 1_000_000) return `${(v / 1_000_000).toFixed(2)} Gb/s`;
    if (abs >= 1_000) return `${(v / 1_000).toFixed(2)} Mb/s`;
    return `${v.toFixed(0)} Kb/s`;
}

function netdataUrl(path) {
    const base = String(NETDATA_BASE || "").replace(/\/$/, "");
    return `${base}${path.startsWith("/") ? "" : "/"}${path}`;
}

const _netInterfaceAliases = new Map();

async function loadDockerNetworkInterfaceAliases() {
    _netInterfaceAliases.clear();

    try {
        const res = await fetch("/docker-metadata/networks", { cache: "no-store" });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const networks = await res.json();
        if (!Array.isArray(networks)) return;

        for (const network of networks) {
            const networkName = String(network?.Name || "Docker network");
            const networkId = String(network?.Id || "");
            const bridgeInterface = networkName === "bridge" ? "docker0" : networkId ? `br-${networkId.slice(0, 12)}` : "";
            if (bridgeInterface) _netInterfaceAliases.set(bridgeInterface, `Docker Network: ${networkName}`);

            let containers = network?.Containers || {};
            if (!Object.keys(containers).length && networkId) {
                try {
                    const detailRes = await fetch(`/docker-metadata/networks/${encodeURIComponent(networkId)}`, {
                        cache: "no-store",
                    });
                    if (detailRes.ok) containers = (await detailRes.json())?.Containers || {};
                } catch {}
            }

            for (const endpoint of Object.values(containers)) {
                const endpointId = String(endpoint?.EndpointID || "");
                const containerName = String(endpoint?.Name || "").replace(/^\//, "");
                if (!endpointId || !containerName) continue;
                _netInterfaceAliases.set(`veth${endpointId.slice(0, 7)}`, `Container: ${containerName}`);
            }
        }
    } catch (error) {
        console.info("Docker interface-name mapping unavailable", error);
    }
}

function friendlyNetworkInterfaceName(chartId) {
    if (chartId === "system.net") return "All Interfaces (combined)";

    const iface = String(chartId || "").replace(/^net\./, "");
    const discoveredAlias = _netInterfaceAliases.get(iface);
    if (discoveredAlias) return `${discoveredAlias} (${iface})`;

    let label = "Network Interface";
    const legacyEthernet = iface.match(/^eth(\d+)$/i);

    if (legacyEthernet) label = `Ethernet Port ${Number(legacyEthernet[1]) + 1}`;
    else if (/^(enp|ens|eno|enx)/i.test(iface)) label = "Ethernet Port";
    else if (/^(wlan|wlp|wlx)/i.test(iface)) label = "Wi-Fi";
    else if (/^docker0$/i.test(iface)) label = "Docker Bridge";
    else if (/^br-/i.test(iface)) label = "Docker Network";
    else if (/^(tun|tap)\d*$/i.test(iface)) label = "VPN Tunnel";
    else if (/^(wg\d*|tailscale\d*)$/i.test(iface)) label = "VPN Interface";
    else if (/^bond\d*$/i.test(iface)) label = "Bonded Network";
    else if (/^veth/i.test(iface)) label = "Container Interface";
    else if (/^(virbr|vmnet)/i.test(iface)) label = "Virtual Machine Bridge";
    else if (/^lo$/i.test(iface)) label = "Loopback";

    return `${label} (${iface})`;
}

function isIpAddress(value) {
    const text = String(value || "").trim();
    if (/^(?:\d{1,3}\.){3}\d{1,3}$/.test(text)) {
        return text.split(".").every((part) => Number(part) >= 0 && Number(part) <= 255);
    }
    return /^[0-9a-f:]+$/i.test(text) && text.includes(":");
}

async function copyNetworkAddress(element, label) {
    const address = String(element?.dataset.copyIp || "").trim();
    if (!isIpAddress(address)) {
        toast(`⚠️ <b>${label} IP is unavailable.</b>`, 2200);
        return;
    }

    try {
        if (navigator.clipboard?.writeText) {
            await navigator.clipboard.writeText(address);
        } else {
            throw new Error("Clipboard API unavailable");
        }
    } catch {
        const input = document.createElement("textarea");
        input.value = address;
        input.setAttribute("readonly", "");
        input.style.position = "fixed";
        input.style.opacity = "0";
        document.body.appendChild(input);
        input.select();
        const copied = document.execCommand("copy");
        input.remove();
        if (!copied) {
            toast(`⚠️ <b>Could not copy ${label} IP.</b>`, 2200);
            return;
        }
    }

    toast(`📋 <b>${label} IP copied:</b> ${escapeHtml(address)}`, 1800);
}

async function updateNetworkAddresses() {
    if (els.lan) {
        els.lan.textContent = "detecting…";
        delete els.lan.dataset.copyIp;
        els.lan.title = "Reading the ZimaOS host network";
    }
    if (els.wan) {
        els.wan.textContent = "detecting…";
        delete els.wan.dataset.copyIp;
        els.wan.title = "Looking up the ZimaOS public IP";
    }

    try {
        const res = await fetch("/network-info/status", { cache: "no-store" });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const payload = await res.json();

        const lanAddress = String(payload?.lan?.address || "").trim();
        const prefix = Number(payload?.lan?.prefix);
        const lanInterface = String(payload?.lan?.interface || "").trim();
        const gateway = String(payload?.lan?.gateway || "").trim();
        if (els.lan) {
            if (isIpAddress(lanAddress)) {
                els.lan.textContent = lanAddress;
                els.lan.dataset.copyIp = lanAddress;
                const interfaceLabel = lanInterface
                    ? friendlyNetworkInterfaceName(`net.${lanInterface}`)
                    : "Default host interface";
                els.lan.title = `${interfaceLabel}${Number.isInteger(prefix) ? ` • Subnet /${prefix}` : ""}${gateway ? ` • Gateway ${gateway}` : ""} • Click to copy`;
            } else {
                els.lan.textContent = "unavailable";
                delete els.lan.dataset.copyIp;
                els.lan.title = "No IPv4 address was found on the ZimaOS default route";
            }
        }

        const publicIp = String(payload?.wan?.address || "").trim();
        if (els.wan) {
            if (isIpAddress(publicIp)) {
                els.wan.textContent = publicIp;
                els.wan.dataset.copyIp = publicIp;
                els.wan.title = `Public IP • detected ${new Date().toLocaleTimeString()} • Click to copy`;
            } else {
                els.wan.textContent = "unavailable";
                delete els.wan.dataset.copyIp;
                els.wan.title = "Public IP lookup unavailable";
            }
        }
    } catch (error) {
        const message = String(error?.message || error);
        if (els.lan) {
            els.lan.textContent = "unavailable";
            delete els.lan.dataset.copyIp;
            els.lan.title = `Host LAN detection failed: ${message}`;
        }
        if (els.wan) {
            els.wan.textContent = "unavailable";
            delete els.wan.dataset.copyIp;
            els.wan.title = `Public IP lookup failed: ${message}`;
        }
    }
}

let _netdataChartsReady = false;
async function initNetdataCharts() {
    if (_netdataChartsReady) return;

    // Auto-detect the right disk mount + primary network interface.
    // This avoids hard-coding ids like `disk_space./` or `net.eth0`.
    let chartsRes;
    try {
        chartsRes = await fetchJsonNetdata(netdataUrl("/api/v1/charts"));
    } catch (e) {
        window.__netdata.last = {
            ok: false,
            status: "charts fetch failed",
            at: new Date().toISOString(),
            error: String(e?.message || e),
        };
        console.warn("Netdata charts fetch failed", e);
        throw e;
    }
    const charts = chartsRes?.charts && typeof chartsRes.charts === "object" ? chartsRes.charts : chartsRes;
    if (!charts || typeof charts !== "object") {
        _netdataChartsReady = true;
        return;
    }

    // ---- RAM ----
    for (const id of ND_CHART_RAM_CANDIDATES) {
        if (charts[id]) {
            ND_CHART_RAM = id;
            break;
        }
    }
    ND_UNIT_RAM = String(charts[ND_CHART_RAM]?.units || ND_UNIT_RAM);

    // ---- Disk ----
    const diskIds = Object.keys(charts).filter((id) => id.startsWith("disk_space."));
    if (diskIds.length) {
        const mountPathForChart = (id) => {
            const chart = charts[id] || {};
            return String(chart?.chart_labels?.mount_point || chart.family || id.slice("disk_space.".length));
        };

        const scoreDisk = (id) => {
            const chart = charts[id] || {};
            const mount = mountPathForChart(id);
            const normalizedMount = mount.toLowerCase();
            const filesystem = String(chart?.chart_labels?.filesystem || "").toLowerCase();
            let score = 0;

            // Named data disks are the most useful storage sources on ZimaOS.
            if (/^\/media\//.test(normalizedMount)) score += 600;
            else if (/^\/data(?:\/|$)/.test(normalizedMount)) score += 580;
            else if (/casaos_data/.test(normalizedMount)) score += 560;
            else if (/^\/mnt\//.test(normalizedMount)) score += 420;
            else if (normalizedMount === "/") score += 350;

            if (/^(btrfs|zfs|xfs|ext4)$/.test(filesystem)) score += 40;
            if (/\b\d+(?:tb|gb)|ssd|hdd|storage|data/i.test(mount)) score += 35;

            if (/overlay|docker|container/.test(normalizedMount)) score -= 1000;
            if (/^\/(run|tmp|proc|sys|dev)(?:\/|$)/.test(normalizedMount)) score -= 900;
            if (/^\/(etc|usr|var)(?:\/|$)/.test(normalizedMount) && !/casaos_data/.test(normalizedMount)) {
                score -= 500;
            }
            if (/boot/.test(normalizedMount)) score -= 500;
            return score;
        };

        const configuredDisk =
            STORAGE_MOUNT !== "auto" ? diskIds.find((id) => mountPathForChart(id) === STORAGE_MOUNT) : null;

        if (configuredDisk) {
            ND_CHART_DISK = configuredDisk;
        } else {
            ND_CHART_DISK = [...diskIds].sort((a, b) => scoreDisk(b) - scoreDisk(a))[0];
        }

        ND_DISK_MOUNT = mountPathForChart(ND_CHART_DISK);

        ND_DISK_OPTIONS = diskIds
            .map((id) => {
                const chart = charts[id] || {};
                return {
                    id,
                    mount: mountPathForChart(id),
                    units: String(chart.units || "GiB"),
                    filesystem: String(chart?.chart_labels?.filesystem || ""),
                    score: scoreDisk(id),
                };
            })
            .filter((option) => option.score >= 300)
            .sort((a, b) => b.score - a.score || a.mount.localeCompare(b.mount));

        let savedMounts = [];
        try {
            const saved = JSON.parse(localStorage.getItem("storageMounts") || "[]");
            if (Array.isArray(saved)) savedMounts = saved.map(String);
        } catch {}

        const initialMounts = savedMounts.length
            ? savedMounts
            : STORAGE_MOUNT !== "auto"
              ? [STORAGE_MOUNT]
              : [ND_DISK_MOUNT];
        ND_SELECTED_DISKS = ND_DISK_OPTIONS.filter((option) => initialMounts.includes(option.mount));
        if (!ND_SELECTED_DISKS.length && ND_DISK_OPTIONS.length) ND_SELECTED_DISKS = [ND_DISK_OPTIONS[0]];
        if (!ND_SELECTED_DISKS.length) {
            ND_SELECTED_DISKS = [
                {
                    id: ND_CHART_DISK,
                    mount: ND_DISK_MOUNT,
                    units: String(charts[ND_CHART_DISK]?.units || "GiB"),
                    filesystem: String(charts[ND_CHART_DISK]?.chart_labels?.filesystem || ""),
                    score: 0,
                },
            ];
        }

        ND_CHART_DISK = ND_SELECTED_DISKS[0].id;
        ND_DISK_MOUNT = ND_SELECTED_DISKS[0].mount;
        populateDiskMountOptions();
    }
    ND_UNIT_DISK = String(charts[ND_CHART_DISK]?.units || ND_UNIT_DISK);
    updateDiskMountSummary();

    // ---- CPU package power ----
    // Prefer the complete Intel RAPL package zone over individual subzones.
    const chartEntries = Object.entries(charts);

    // ---- Logical CPU count ----
    // Netdata's frequency chart exposes one dimension per logical CPU.
    const cpuFrequencyChart = charts["cpu.cpufreq"] || chartEntries.find(([, chart]) => chart?.context === "cpufreq.cpufreq")?.[1];
    const frequencyDimensions = Object.keys(cpuFrequencyChart?.dimensions || {}).filter((name) => /^cpu\d+$/i.test(name));
    if (frequencyDimensions.length) {
        ND_CPU_COUNT = frequencyDimensions.length;
    } else {
        const perCpuCharts = Object.keys(charts).filter((id) => /^cpu\.cpu\d+$/i.test(id));
        ND_CPU_COUNT = perCpuCharts.length || null;
    }

    const powerCandidates = chartEntries
        .filter(([id, chart]) => {
            const context = String(chart?.context || "").toLowerCase();
            const units = String(chart?.units || "").toLowerCase();
            return context === "cpu.powercap_intel_rapl_zone" || (units.includes("watt") && /cpu|power/i.test(id));
        })
        .sort(([aId, aChart], [bId, bChart]) => {
            const score = (id, chart) => {
                let value = 0;
                if (String(chart?.context || "") === "cpu.powercap_intel_rapl_zone") value += 20;
                if (/package-?0/i.test(id)) value += 10;
                if (/subzone/i.test(id)) value -= 20;
                return value;
            };
            return score(bId, bChart) - score(aId, aChart);
        });
    ND_CHART_CPU_POWER = powerCandidates[0]?.[0] || null;

    // ---- CPU package temperature ----
    // Prefer the package sensor; fall back to a core or ACPI temperature sensor.
    const temperatureCandidates = chartEntries
        .filter(([, chart]) => String(chart?.context || "").toLowerCase() === "system.hw.sensor.temperature.input")
        .sort(([aId, aChart], [bId, bChart]) => {
            const score = (id, chart) => {
                const labels = chart?.chart_labels || {};
                const label = String(labels.label || "");
                let value = 0;
                if (/package/i.test(label)) value += 30;
                if (/coretemp/i.test(id) || /coretemp/i.test(String(labels.driver || ""))) value += 15;
                if (/temp1/i.test(id)) value += 5;
                if (/acpitz/i.test(id)) value -= 5;
                return value;
            };
            return score(bId, bChart) - score(aId, aChart);
        });
    ND_CHART_CPU_TEMP = temperatureCandidates[0]?.[0] || null;

    // Debug helper (useful in DevTools) — do NOT overwrite the object
    window.__netdata.base = NETDATA_BASE;
    window.__netdata.charts.cpu = ND_CHART_CPU;
    window.__netdata.charts.ram = ND_CHART_RAM;
    window.__netdata.charts.disk = ND_CHART_DISK;
    // net is set later after detection

    // ---- Containers ----
    // A container is usable only if it publishes both charts we need.
    ND_CONTAINERS = Object.keys(charts)
        .filter((id) => /^cgroup_.+\.cpu$/.test(id))
        .map((id) => id.slice("cgroup_".length, -".cpu".length))
        .filter((name) => charts[`cgroup_${name}.mem_usage`])
        .sort((a, b) => a.localeCompare(b));

    // ---- Network ----
    const netIds = Object.keys(charts)
        .filter((id) => id.startsWith("net."))
        .filter((id) => !id.startsWith("net_packets."))
        .filter((id) => !id.startsWith("net_dropped."))
        .filter((id) => !id.startsWith("net_errors."))
        .filter((id) => !/\.lo($|\.)/.test(id));

    // Always build choices
    await loadDockerNetworkInterfaceAliases();
    _netChartChoices = [];
    if (charts["system.net"]) {
        _netChartChoices.push({ id: "system.net", label: friendlyNetworkInterfaceName("system.net") });
    }
    for (const id of netIds) _netChartChoices.push({ id, label: friendlyNetworkInterfaceName(id) });

    // Pick ND_CHART_NET
    if (charts["system.net"]) {
        ND_CHART_NET = "system.net";
    } else if (netIds.length) {
        // score + pick
        const scoreNet = (id) => {
            const iface = id.slice(4);
            if (/^(eth0|en0|enp|ens|eno)/.test(iface)) return 0;
            if (/^(wlan0|wl)/.test(iface)) return 1;
            return 2;
        };
        netIds.sort((a, b) => scoreNet(a) - scoreNet(b));
        ND_CHART_NET = netIds[0];
    }

    _netdataChartsReady = true;

    // Update debug handle with chosen charts
    window.__netdata.charts = {
        cpu: ND_CHART_CPU,
        ram: ND_CHART_RAM,
        disk: ND_CHART_DISK,
        diskMount: ND_DISK_MOUNT,
        net: ND_CHART_NET,
        load: ND_CHART_LOAD,
        cpuPower: ND_CHART_CPU_POWER,
        cpuTemperature: ND_CHART_CPU_TEMP,
        logicalCpuCount: ND_CPU_COUNT,
    };

    window.__netdata.last = {
        ok: true,
        status: "charts ready",
        at: new Date().toISOString(),
        error: null,
    };

    populateNetIfaceSelect();
    ensureNetSparkBars();
}

function diskMountLabel(mount) {
    return String(mount || "/").split("/").filter(Boolean).pop() || "/";
}

function updateDiskMountSummary() {
    if (!els.diskMount) return;
    if (!ND_SELECTED_DISKS.length) {
        els.diskMount.textContent = "none";
        els.diskMount.title = "No storage source selected";
        return;
    }

    els.diskMount.textContent =
        ND_SELECTED_DISKS.length === 1 ? diskMountLabel(ND_SELECTED_DISKS[0].mount) : `${ND_SELECTED_DISKS.length} selected`;
    els.diskMount.title = ND_SELECTED_DISKS.map((option) => option.mount).join(" • ");
}

function populateDiskMountOptions() {
    if (!els.diskMountOptions) return;
    const selectedIds = new Set(ND_SELECTED_DISKS.map((option) => option.id));

    els.diskMountOptions.innerHTML = ND_DISK_OPTIONS.map((option) => {
        const checked = selectedIds.has(option.id) ? " checked" : "";
        const details = [option.mount, option.filesystem].filter(Boolean).join(" • ");
        return `
            <label class="storage-source-option">
                <input type="checkbox" data-disk-chart="${escapeAttr(option.id)}"${checked} />
                <span>${escapeHtml(diskMountLabel(option.mount))}<small>${escapeHtml(details)}</small></span>
            </label>`;
    }).join("");

    els.diskMountOptions.onchange = (event) => {
        const input = event.target.closest('input[data-disk-chart]');
        if (!input) return;

        const checkedIds = new Set(
            [...els.diskMountOptions.querySelectorAll('input[data-disk-chart]:checked')].map(
                (checkbox) => checkbox.dataset.diskChart
            )
        );
        if (!checkedIds.size) {
            input.checked = true;
            toast("⚠️ <b>Keep one storage source selected.</b>", 2600);
            return;
        }

        ND_SELECTED_DISKS = ND_DISK_OPTIONS.filter((option) => checkedIds.has(option.id));
        ND_CHART_DISK = ND_SELECTED_DISKS[0].id;
        ND_DISK_MOUNT = ND_SELECTED_DISKS[0].mount;
        ND_UNIT_DISK = ND_SELECTED_DISKS[0].units;
        try {
            localStorage.setItem("storageMounts", JSON.stringify(ND_SELECTED_DISKS.map((option) => option.mount)));
        } catch {}
        updateDiskMountSummary();
        tickNetdata();
    };
}

async function fetchNetdataChartOnce(chartId) {
    // Use a wider recent window to avoid an empty row during an update boundary.
    const q = new URLSearchParams({
        chart: chartId,
        after: "-10",
        points: "1",
        format: "json",
    });
    return await fetchJsonNetdata(netdataUrl(`/api/v1/data?${q.toString()}`));
}

async function fetchSelectedDiskBundle() {
    const selected = ND_SELECTED_DISKS.length
        ? ND_SELECTED_DISKS
        : [{ id: ND_CHART_DISK, mount: ND_DISK_MOUNT, units: ND_UNIT_DISK, filesystem: "" }];
    const results = await Promise.allSettled(selected.map((option) => fetchNetdataChartOnce(option.id)));
    const samples = [];
    const errors = [];

    results.forEach((result, index) => {
        const option = selected[index];
        if (result.status === "fulfilled") {
            const detail = inspectNetdataSample(result.value);
            if (detail.usable) samples.push({ ...option, nd: result.value, detail });
            else errors.push(`${option.mount}: stale or empty`);
        } else {
            errors.push(`${option.mount}: ${String(result.reason?.message || result.reason)}`);
        }
    });

    if (!samples.length) throw new Error(errors.join("; ") || "No selected storage source returned fresh data");
    return { kind: "diskBundle", samples, selectedCount: selected.length, errors };
}

function getNdDimIndex(nd, dimName) {
    const labels = nd?.labels || nd?.result?.labels;
    if (!Array.isArray(labels)) return -1;
    return labels.findIndex((x) => String(x).toLowerCase() === String(dimName).toLowerCase());
}

function getNdValue(nd, dimName) {
    const data = nd?.data || nd?.result?.data;
    if (!Array.isArray(data) || !data.length) return null;
    const row = data[data.length - 1];
    if (!Array.isArray(row)) return null;
    const idx = getNdDimIndex(nd, dimName);
    if (idx < 0 || idx >= row.length) return null;
    const v = Number(row[idx]);
    return Number.isFinite(v) ? v : null;
}

function setMetric(elVal, elBar, pct, label) {
    const p = clamp(Number(pct) || 0, 0, 100);
    if (elVal) elVal.textContent = label ?? (Number.isFinite(pct) ? `${p.toFixed(0)}%` : "—");
    if (elBar) elBar.style.width = `${p.toFixed(0)}%`;
}

function sumNdRowExcluding(nd, exclude = ["time"]) {
    const labels = nd?.labels || nd?.result?.labels;
    const data = nd?.data || nd?.result?.data;
    if (!Array.isArray(labels) || !Array.isArray(data) || !data.length) return null;
    const row = data[data.length - 1];
    if (!Array.isArray(row)) return null;
    const ex = new Set(exclude.map((x) => String(x).toLowerCase()));
    let sum = 0;
    for (let i = 0; i < row.length; i++) {
        const k = String(labels[i] ?? "").toLowerCase();
        if (ex.has(k)) continue;
        const v = Number(row[i]);
        if (Number.isFinite(v)) sum += v;
    }
    return sum;
}

function netdataValueToBytes(value, units) {
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) return null;

    const normalized = String(units || "").trim().toLowerCase();
    const binaryScale = {
        kib: 1024,
        mib: 1024 ** 2,
        gib: 1024 ** 3,
        tib: 1024 ** 4,
    };
    const decimalScale = {
        kb: 1000,
        mb: 1000 ** 2,
        gb: 1000 ** 3,
        tb: 1000 ** 4,
    };

    if (normalized === "bytes" || normalized === "byte" || normalized === "b") return numeric;
    if (binaryScale[normalized]) return numeric * binaryScale[normalized];
    if (decimalScale[normalized]) return numeric * decimalScale[normalized];
    return null;
}

function formatStorageBytes(bytes) {
    const numeric = Number(bytes);
    if (!Number.isFinite(numeric)) return "—";

    const units = [
        { label: "TB", size: 1024 ** 4 },
        { label: "GB", size: 1024 ** 3 },
        { label: "MB", size: 1024 ** 2 },
    ];
    const selected = units.find((unit) => Math.abs(numeric) >= unit.size) || units[units.length - 1];
    const scaled = numeric / selected.size;
    const digits = Math.abs(scaled) >= 100 ? 0 : Math.abs(scaled) >= 10 ? 1 : 2;
    return `${scaled.toFixed(digits)} ${selected.label}`;
}

function formatRamTotal(bytes) {
    const numeric = Number(bytes);
    if (!Number.isFinite(numeric)) return "—";
    const gigabytes = numeric / 1024 ** 3;
    return `${gigabytes.toFixed(gigabytes >= 10 ? 1 : 2)} GB`;
}

function inspectNetdataSample(nd) {
    if (nd?.kind === "diskBundle") {
        const details = Array.isArray(nd.samples) ? nd.samples.map((sample) => sample.detail) : [];
        const usable = details.length > 0;
        const numericValues = details.reduce((sum, detail) => sum + (detail.numericValues || 0), 0);
        const ageValues = details.map((detail) => detail.ageSeconds).filter(Number.isFinite);
        const ageSeconds = ageValues.length ? Math.max(...ageValues) : null;
        return {
            usable,
            fresh: usable,
            numericValues,
            timestamp: null,
            ageSeconds,
            selectedCount: nd.selectedCount,
            liveCount: details.length,
        };
    }

    const labels = nd?.labels || nd?.result?.labels;
    const data = nd?.data || nd?.result?.data;
    if (!Array.isArray(labels) || !Array.isArray(data) || !data.length) {
        return { usable: false, fresh: false, numericValues: 0, timestamp: null, ageSeconds: null };
    }

    const row = data[data.length - 1];
    if (!Array.isArray(row)) {
        return { usable: false, fresh: false, numericValues: 0, timestamp: null, ageSeconds: null };
    }

    const foundTimeIndex = labels.findIndex((label) => String(label).toLowerCase() === "time");
    const timeIndex = foundTimeIndex >= 0 ? foundTimeIndex : 0;
    const rawTimestamp = Number(row[timeIndex]);
    const timestamp = Number.isFinite(rawTimestamp) ? rawTimestamp : null;
    const ageSeconds = timestamp == null ? null : Math.max(0, Date.now() / 1000 - timestamp);
    let numericValues = 0;

    for (let i = 0; i < row.length; i++) {
        if (i === timeIndex) continue;
        if (row[i] != null && row[i] !== "" && Number.isFinite(Number(row[i]))) numericValues++;
    }

    const fresh = ageSeconds != null && ageSeconds <= 30;
    return { usable: numericValues > 0 && fresh, fresh, numericValues, timestamp, ageSeconds };
}

function applyHostMetricsFromNetdata(cpuNd, ramNd, diskNd, loadNd, powerNd, temperatureNd) {
    // -------------------
    // CPU
    // -------------------
    // Your system.cpu chart is "busy-only" (no idle). So CPU% is the sum of all dims excluding time.
    const cpuBusyRaw = sumNdRowExcluding(cpuNd, ["time"]);
    let cpuUsed = null;

    if (cpuBusyRaw != null && Number.isFinite(cpuBusyRaw)) {
        // On your data, this is already percent-like (e.g. ~63.6), so just clamp.
        // If it ever comes back as 0..1 fraction, scale it.
        cpuUsed = cpuBusyRaw <= 1.5 ? cpuBusyRaw * 100 : cpuBusyRaw;
        cpuUsed = clamp(cpuUsed, 0, 100);
    }

    setMetric(els.cpuVal, els.cpuBar, cpuUsed, cpuUsed == null ? "—" : `${cpuUsed.toFixed(0)}%`);

    const cpuWatts = getNdValue(powerNd, "power") ?? sumNdRowExcluding(powerNd, ["time"]);
    if (els.cpuWatts) {
        els.cpuWatts.textContent = Number.isFinite(cpuWatts) ? `${Math.max(0, cpuWatts).toFixed(1)} W` : "—";
    }

    const cpuTemperature = getNdValue(temperatureNd, "input");
    if (els.cpuTemp) {
        els.cpuTemp.textContent = Number.isFinite(cpuTemperature) ? `${cpuTemperature.toFixed(1)} °C` : "—";
    }

    // -------------------
    // RAM
    // -------------------
    // system.ram commonly includes: used, free, cached, buffers (and sometimes available).
    // What humans expect as "used %" usually excludes cache/buffers:
    // used_human = total - free - cached - buffers
    const rFree = getNdValue(ramNd, "free");
    const rCached = getNdValue(ramNd, "cached");
    const rBuffers = getNdValue(ramNd, "buffers");
    const rAvail = getNdValue(ramNd, "available");
    const rUsedDim = getNdValue(ramNd, "used");

    // Total = sum of all dims except time
    const rTotal = sumNdRowExcluding(ramNd, ["time"]);
    let ramPct = null;

    if (rTotal != null && rTotal > 0) {
        let usedHuman = null;

        if (rFree != null && rCached != null && rBuffers != null) {
            usedHuman = rTotal - rFree - rCached - rBuffers;
        } else if (rAvail != null) {
            usedHuman = rTotal - rAvail;
        } else if (rUsedDim != null && rFree != null) {
            // fallback: classic used/(used+free)
            usedHuman = rUsedDim;
            const denom = rUsedDim + rFree;
            if (denom > 0) ramPct = (rUsedDim / denom) * 100;
        }

        if (ramPct == null && usedHuman != null) {
            ramPct = (usedHuman / rTotal) * 100;
        }
    }

    setMetric(els.memVal, els.memBar, ramPct, ramPct == null ? "—" : `${ramPct.toFixed(0)}%`);
    if (els.memTotal) els.memTotal.textContent = formatRamTotal(netdataValueToBytes(rTotal, ND_UNIT_RAM));

    // -------------------
    // Disk
    // -------------------
    // A disk bundle contains every user-selected mount. Convert each chart's
    // declared units to bytes before adding them together.
    const diskSamples =
        diskNd?.kind === "diskBundle"
            ? diskNd.samples
            : [{ nd: diskNd, units: ND_UNIT_DISK, mount: ND_DISK_MOUNT, id: ND_CHART_DISK }];
    let usedBytes = 0;
    let freeBytes = 0;
    let totalBytes = 0;
    let validDiskSamples = 0;

    for (const sample of diskSamples) {
        const dUsed = getNdValue(sample.nd, "used");
        const dAvail = getNdValue(sample.nd, "avail") ?? getNdValue(sample.nd, "available");
        const dRes =
            getNdValue(sample.nd, "reserved_for_root") ??
            getNdValue(sample.nd, "reserved for root") ??
            getNdValue(sample.nd, "reserved");
        if (dUsed == null) continue;

        const reserved = dRes != null && Number.isFinite(dRes) && dRes > 0 ? dRes : 0;
        const dFree = dAvail != null ? dAvail + reserved : null;
        const dTotal = dFree != null ? dUsed + dFree : sumNdRowExcluding(sample.nd, ["time"]);
        const sampleUsedBytes = netdataValueToBytes(dUsed, sample.units);
        const sampleTotalBytes = netdataValueToBytes(dTotal, sample.units);
        const sampleFreeBytes =
            dFree != null
                ? netdataValueToBytes(dFree, sample.units)
                : Number.isFinite(sampleTotalBytes) && Number.isFinite(sampleUsedBytes)
                  ? sampleTotalBytes - sampleUsedBytes
                  : null;

        if (!Number.isFinite(sampleUsedBytes) || !Number.isFinite(sampleFreeBytes) || !Number.isFinite(sampleTotalBytes)) {
            continue;
        }
        usedBytes += sampleUsedBytes;
        freeBytes += sampleFreeBytes;
        totalBytes += sampleTotalBytes;
        validDiskSamples++;
    }

    const diskPct = validDiskSamples && totalBytes > 0 ? (usedBytes / totalBytes) * 100 : null;
    // The used figure lives in the details line, so the headline value stays a
    // bare percentage like the other two metrics.
    setMetric(els.diskVal, els.diskBar, diskPct, diskPct == null ? "—" : `${diskPct.toFixed(0)}%`);
    if (els.diskUsed) els.diskUsed.textContent = formatStorageBytes(validDiskSamples ? usedBytes : null);
    if (els.diskFree) els.diskFree.textContent = formatStorageBytes(validDiskSamples ? freeBytes : null);
    if (els.diskTotal) els.diskTotal.textContent = formatStorageBytes(validDiskSamples ? totalBytes : null);
    if (els.diskMount && diskNd?.kind === "diskBundle" && diskNd.errors?.length) {
        els.diskMount.title = `${ND_SELECTED_DISKS.map((option) => option.mount).join(" • ")} • Unavailable: ${diskNd.errors.join("; ")}`;
    }

    // ---- Load (1m) ----
    if (els.loadVal) {
        // Netdata system.load dims are typically: load1, load5, load15
        const load1 = getNdValue(loadNd, "load1");
        let normalizedLoadPercent = null;

        if (Number.isFinite(load1) && Number.isFinite(ND_CPU_COUNT) && ND_CPU_COUNT > 0) {
            normalizedLoadPercent = (load1 / ND_CPU_COUNT) * 100;
            els.loadVal.textContent = `${normalizedLoadPercent.toFixed(0)}% (${load1.toFixed(2)} / ${ND_CPU_COUNT})`;
            els.loadVal.title = `1-minute load average ${load1.toFixed(2)} divided by ${ND_CPU_COUNT} logical CPUs`;
            els.loadVal.style.color =
                normalizedLoadPercent > 100
                    ? "var(--offline)"
                    : normalizedLoadPercent >= 70
                      ? "var(--pending)"
                      : "var(--online)";
        } else if (Number.isFinite(load1)) {
            els.loadVal.textContent = `${load1.toFixed(2)} load`;
            els.loadVal.title = "Raw 1-minute system load; logical CPU count was unavailable";
            els.loadVal.style.color = "var(--text)";
        } else {
            els.loadVal.textContent = "—";
            els.loadVal.title = "Load data unavailable";
            els.loadVal.style.color = "var(--text)";
        }

        // A full bar means all logical CPUs are demanded. Values above 100%
        // remain visible in the label while the bar stays capped at full.
        const loadPct = Number.isFinite(normalizedLoadPercent) ? Math.min(100, normalizedLoadPercent) : 0;
        if (els.loadBar) els.loadBar.style.width = `${loadPct}%`;
    }
}

function lerp(a, b, t) {
    return a + (b - a) * t;
}

function easeOutCubic(t) {
    return 1 - Math.pow(1 - t, 3);
}

/**
 * Smoothly animate the Peak text values (Kb/s) and apply a subtle bump.
 * Stores previous values on the element so updates are continuous.
 */
function animateNetPeak(peakEl, nextTotal, nextRx, nextTx) {
    if (!peakEl) return;

    const next = {
        t: Number.isFinite(nextTotal) ? nextTotal : 0,
        rx: Number.isFinite(nextRx) ? nextRx : 0,
        tx: Number.isFinite(nextTx) ? nextTx : 0,
    };

    const prev = peakEl.__peakVals || { t: next.t, rx: next.rx, tx: next.tx };
    peakEl.__peakVals = next;

    // Cancel any in-flight animation
    if (peakEl.__peakRaf) cancelAnimationFrame(peakEl.__peakRaf);

    // Trigger bump animation (restart)
    peakEl.classList.remove("peak-bump");
    void peakEl.offsetWidth;
    peakEl.classList.add("peak-bump");

    const start = performance.now();
    const dur = 420;

    const tick = (now) => {
        const p = Math.min(1, (now - start) / dur);
        const e = easeOutCubic(p);

        const curT = lerp(prev.t, next.t, e);
        const curRx = lerp(prev.rx, next.rx, e);
        const curTx = lerp(prev.tx, next.tx, e);

        peakEl.textContent = `Peak T: ${formatRateKbps(curT)}  •  RX: ${formatRateKbps(curRx)}  •  TX: ${formatRateKbps(curTx)}`;

        if (p < 1) peakEl.__peakRaf = requestAnimationFrame(tick);
        else peakEl.__peakRaf = 0;
    };

    peakEl.__peakRaf = requestAnimationFrame(tick);
}

function applyNetworkFromNetdata(netNd) {
    ensureNetSparkBars();

    const rxRaw = getNdValue(netNd, "received") ?? getNdValue(netNd, "in") ?? getNdValue(netNd, "rx") ?? null;

    const txRaw = getNdValue(netNd, "sent") ?? getNdValue(netNd, "out") ?? getNdValue(netNd, "tx") ?? null;

    const rxNum = rxRaw == null ? NaN : Number(rxRaw);
    const txNum = txRaw == null ? NaN : Math.abs(Number(txRaw)); // ✅ normalize TX to positive

    const hasRx = Number.isFinite(rxNum);
    const hasTx = Number.isFinite(txNum);
    const hasAny = hasRx || hasTx;

    const total = (hasRx ? rxNum : 0) + (hasTx ? txNum : 0);


    // Legend values (NO optional-chaining assignment)
    const meta = els.netSparkMeta;
    if (meta) {
        const rxEl = meta.querySelector('[data-role="netLegendRxVal"]');
        const txEl = meta.querySelector('[data-role="netLegendTxVal"]');
        const ttEl = meta.querySelector('[data-role="netLegendTotalVal"]');

        if (rxEl) rxEl.textContent = hasRx ? formatRateKbps(rxNum) : "—";
        if (txEl) txEl.textContent = hasTx ? formatRateKbps(txNum) : "—";
        if (ttEl) ttEl.textContent = hasAny ? formatRateKbps(total) : "—";
    }

    // Push into spark history (TX stored positive so total/peaks are correct)
    if (hasAny) {
        _netSparkRx.push(Math.max(0, hasRx ? rxNum : 0));
        _netSparkTx.push(Math.max(0, hasTx ? txNum : 0));
        _netSpark.push(Math.max(0, total));

        const over = _netSpark.length - NET_SPARK_N;
        if (over > 0) {
            _netSpark.splice(0, over);
            _netSparkRx.splice(0, over);
            _netSparkTx.splice(0, over);
        }
    }

    // Render spark bars (your existing logic)
    if (els.netSpark && els.netSpark.childElementCount) {
        const bars = els.netSpark.querySelectorAll("i");

        const peakTotal = Math.max(0, ..._netSpark);
        const peakRx = Math.max(0, ..._netSparkRx);
        const peakTx = Math.max(0, ..._netSparkTx);

        const peakEl =
            (els.netSparkMeta && els.netSparkMeta.querySelector('[data-role="netSparkPeak"]')) ||
            (els.netSpark && els.netSpark.querySelector('[data-role="netSparkPeak"]'));

        animateNetPeak(peakEl, peakTotal, peakRx, peakTx);

        const now = Date.now();
        if (now - _netSparkLastPulseAt > 400) {
            _netSparkLastPulseAt = now;
            const lastIdx = Math.max(0, _netSpark.length - 1);
            const lastBar = bars[lastIdx];
            if (lastBar) {
                lastBar.classList.remove("spark-pulse");
                void lastBar.offsetWidth;
                lastBar.classList.add("spark-pulse");
            }
        }

        const max = Math.max(1, ..._netSpark);
        for (let i = 0; i < bars.length; i++) {
            const v = _netSpark[i] ?? 0;
            const pct = Math.max(6, Math.min(100, (v / max) * 100));
            bars[i].style.height = `${pct}%`;
            bars[i].style.opacity = v > 0 ? "0.9" : "0.55";
        }

        const latest = _netSpark[_netSpark.length - 1] ?? 0;
        const ratio = latest / max;

        const sec = document.getElementById("secNetwork");
        if (sec) {
            const warmAt = 0.7;
            const hotAt = 0.88;
            const state = ratio >= hotAt ? "hot" : ratio >= warmAt ? "warm" : "cool";
            sec.setAttribute("data-net-state", state);
        }
    }
}

let _netChartChoices = []; // [{ id, label }]
let _netSelectedChart = "auto"; // "auto" or chart id
const NET_SPARK_N = 30;
const _netSpark = []; // last N totals
const _netSparkRx = []; // rx history (Kb/s)
const _netSparkTx = []; // tx history (Kb/s)

let _netSparkHoverIdx = -1;
let _netSparkLastPulseAt = 0;

function describeNetdataFeeds(results, sampleDetails) {
    const optionalCharts = { power: ND_CHART_CPU_POWER, temperature: ND_CHART_CPU_TEMP };

    return Object.keys(NETDATA_FEED_LABELS).map((key, index) => {
        const detail = sampleDetails[index] || {};
        const rejected = results[index]?.status === "rejected";
        let status;

        if (key in optionalCharts && !optionalCharts[key]) status = "no sensor on this host";
        else if (detail.usable) {
            status = Number.isFinite(detail.ageSeconds) ? `live (${detail.ageSeconds.toFixed(0)}s ago)` : "live";
        } else if (rejected) status = "unavailable";
        else status = "no fresh sample";

        return `${NETDATA_FEED_LABELS[key]}: ${status}`;
    });
}

// A slow host can take longer than NETDATA_POLL_MS to answer. Without this guard
// the interval stacks overlapping ticks that all race to write the same elements.
let _netdataTickInFlight = false;

async function tickNetdata() {
    if (_netdataTickInFlight) return;
    _netdataTickInFlight = true;
    try {
        await initNetdataCharts();

        const results = await Promise.allSettled([
            fetchNetdataChartOnce(ND_CHART_CPU),
            fetchNetdataChartOnce(ND_CHART_RAM),
            fetchSelectedDiskBundle(),
            fetchNetdataChartOnce(_netSelectedChart === "auto" ? ND_CHART_NET : _netSelectedChart),
            fetchNetdataChartOnce(ND_CHART_LOAD),
            ND_CHART_CPU_POWER ? fetchNetdataChartOnce(ND_CHART_CPU_POWER) : Promise.resolve(null),
            ND_CHART_CPU_TEMP ? fetchNetdataChartOnce(ND_CHART_CPU_TEMP) : Promise.resolve(null),
        ]);

        const rawValues = results.map((result) => (result.status === "fulfilled" ? result.value : null));
        const sampleDetails = rawValues.map(inspectNetdataSample);
        const values = rawValues.map((value, index) => (sampleDetails[index].usable ? value : null));
        const [cpuNd, ramNd, diskNd, netNd, loadNd, powerNd, temperatureNd] = values;
        // Power and temperature are optional sensor feeds. Keep the established
        // REALTIME x/5 status based on the five core dashboard feeds.
        const liveCount = values.slice(0, 5).filter(Boolean).length;

        if (!liveCount) {
            const messages = results
                .filter((result) => result.status === "rejected")
                .map((result) => String(result.reason?.message || result.reason));
            const staleSummary = sampleDetails
                .map(
                    (sample, index) =>
                        `${["cpu", "ram", "disk", "network", "load", "power", "temperature"][index]}=${sample.ageSeconds == null ? "empty" : `${sample.ageSeconds.toFixed(1)}s old`}`
                )
                .join(", ");
            throw new Error(messages.join("; ") || `No fresh Netdata samples: ${staleSummary}`);
        }

        results.forEach((result, index) => {
            if (result.status === "rejected") {
                console.warn(
                    "Netdata metric unavailable",
                    ["cpu", "ram", "disk", "network", "load", "power", "temperature"][index],
                    result.reason
                );
            }
        });

        applyHostMetricsFromNetdata(cpuNd, ramNd, diskNd, loadNd, powerNd, temperatureNd);
        if (netNd) applyNetworkFromNetdata(netNd);

        window.__netdata.last = {
            ok: true,
            status: `${liveCount}/5 fresh metric feeds`,
            at: new Date().toISOString(),
            error: null,
            samples: Object.fromEntries(
                ["cpu", "ram", "disk", "network", "load", "power", "temperature"].map((name, index) => [
                    name,
                    sampleDetails[index],
                ])
            ),
        };
        setDataSource(true, {
            feeds: describeNetdataFeeds(results, sampleDetails),
            allCoreFeedsLive: liveCount === 5,
        });
    } catch (e) {
        window.__netdata.last = {
            ok: false,
            status: "tick failed",
            at: new Date().toISOString(),
            error: String(e?.message || e),
        };

        console.warn("Netdata tick failed:", e);

        const isLocal =
            location.protocol === "file:" || location.hostname === "localhost" || location.hostname === "127.0.0.1";

        if (isLocal) {
            tickMockMetrics();
            tickMockNetwork();
        } else {
            // PROD behavior:
            // - keep last known values
            // - OR explicitly show unavailable
            // (no fake data in prod)
        }

        if (els.loadVal) {
            els.loadVal.textContent = "—";
            els.loadVal.title = "Load data unavailable";
            els.loadVal.style.color = "var(--text)";
        }
        if (els.loadBar) els.loadBar.style.width = "0%";

        document.getElementById("secNetwork")?.setAttribute("data-net-state", "cool");

        // Only reset spark *bars*, not overlay/tooltip
        if (els.netSpark) {
            els.netSpark.querySelectorAll("i").forEach((b) => (b.style.height = "6%"));
            const tip = els.netSpark.querySelector('[data-role="netSparkTip"]');
            if (tip) tip.classList.remove("show");
        }
        setDataSource(false, { feeds: [`Netdata: unreachable — ${String(e?.message || e)}`] });
    } finally {
        _netdataTickInFlight = false;
    }
}

let _containerTickInFlight = false;

async function tickContainerStats() {
    if (_containerTickInFlight || document.visibilityState === "hidden") return;
    if (!_netdataChartsReady || !ND_CONTAINERS.length) return;

    _containerTickInFlight = true;
    try {
        // One request pair per mapped card, and only for cards actually mapped.
        const targets = state.services
            .map((service) => ({ service, container: containerForService(service.name).container }))
            .filter((target) => target.container && ND_CONTAINERS.includes(target.container));

        await Promise.allSettled(
            targets.map(async ({ service, container }) => {
                const [cpu, mem] = await Promise.allSettled([
                    fetchNetdataChartOnce(`cgroup_${container}.cpu`),
                    fetchNetdataChartOnce(`cgroup_${container}.mem_usage`),
                ]);

                const cpuNd = cpu.status === "fulfilled" ? cpu.value : null;
                const memNd = mem.status === "fulfilled" ? mem.value : null;

                // cgroup.cpu is split across user/system; mem_usage across ram/swap.
                const cpuPct = sumNdRowExcluding(cpuNd, ["time"]);
                const ramMib = getNdValue(memNd, "ram");

                applyContainerStats(service, {
                    container,
                    cpuPct: Number.isFinite(cpuPct) ? cpuPct : null,
                    ramMib: Number.isFinite(ramMib) ? ramMib : null,
                });
            })
        );
    } catch (error) {
        console.warn("Container stats tick failed", error);
    } finally {
        _containerTickInFlight = false;
    }
}

function applyContainerStats(service, stats) {
    const card = state.cardElById.get(String(service.id));
    const row = card?.querySelector('[data-role="containerStats"]');
    if (!row) return;

    if (stats.cpuPct == null && stats.ramMib == null) {
        row.hidden = true;
        return;
    }

    const cpuEl = row.querySelector('[data-role="containerCpu"]');
    const ramEl = row.querySelector('[data-role="containerRam"]');
    if (cpuEl) cpuEl.textContent = stats.cpuPct == null ? "—" : `${stats.cpuPct.toFixed(1)}%`;
    if (ramEl) ramEl.textContent = stats.ramMib == null ? "—" : `${Math.round(stats.ramMib)} MB`;

    row.hidden = false;
    row.title = `Docker container: ${stats.container}`;
}

const pad2 = (x) => String(x).padStart(2, "0"); // (can keep; used elsewhere or safe to leave)
const fmtTime = (d) =>
    d
        ? d.toLocaleTimeString(undefined, {
              hour: "numeric",
              minute: "2-digit",
              second: "2-digit",
              hour12: true,
          })
        : "—";

const isTouch = window.matchMedia("(pointer: coarse)").matches;

function toast(html, ms = 2600) {
    els.toastMsg.innerHTML = html;
    els.toast.classList.add("show");
    clearTimeout(toast._t);
    toast._t = setTimeout(() => els.toast.classList.remove("show"), ms);
}

function normalizeAccent(a) {
    const v = String(a || "")
        .trim()
        .toLowerCase();
    // ✅ IMPORTANT: map legacy "none" to aurora
    if (!v || v === "none") return "aurora";
    return ACCENTS.includes(v) ? v : "aurora";
}

function savePrefs() {
    const prefs = {
        theme: state.theme,
        accent: state.accent, // ✅ NEW
        linkMode: state.linkMode,
        statusFilter: state.statusFilter,
        categoryFilter: state.categoryFilter,
        query: state.query,
        notes: els.notes.value || "",
        calendarOpen: document.getElementById("secCalendar")?.getAttribute("data-open") === "true",

        // Whole metrics sidebar collapse state (Metrics + Network + Notes)
        metricsWrapOpen: document.getElementById("metricsSidebar")?.getAttribute("data-open") === "true",
    };
    localStorage.setItem("serviceDashPrefs", JSON.stringify(prefs));
}

function loadPrefs() {
    try {
        const raw = localStorage.getItem("serviceDashPrefs");
        if (!raw) return;
        const p = JSON.parse(raw);
        if (p.theme) state.theme = p.theme;
        if (p.accent) state.accent = normalizeAccent(p.accent); // ✅ NEW + legacy fix
        if (p.linkMode === "local" || p.linkMode === "external") state.linkMode = p.linkMode;
        if (p.statusFilter) state.statusFilter = p.statusFilter;
        if (p.categoryFilter) state.categoryFilter = p.categoryFilter;
        if (typeof p.query === "string") state.query = p.query;
        if (typeof p.notes === "string") els.notes.value = p.notes;
        if (typeof p.calendarOpen === "boolean") {
            const cal = document.getElementById("secCalendar");
            if (cal) cal.setAttribute("data-open", String(p.calendarOpen));
        }

        if (typeof p.metricsWrapOpen === "boolean") {
            const wrap = document.getElementById("metricsSidebar");
            if (wrap) wrap.setAttribute("data-open", String(p.metricsWrapOpen));
        }
    } catch (e) {}
}

function setTheme(theme) {
    state.theme = theme;
    els.root.setAttribute("data-theme", theme);
    els.btnTheme.textContent = theme === "dark" ? "🌙" : "☀️";
    savePrefs();
}

function setAccent(accent) {
    state.accent = normalizeAccent(accent);
    els.root.setAttribute("data-accent", state.accent);
    savePrefs();
}

function setLinkMode(mode) {
    state.linkMode = mode === "external" ? "external" : "local";
    savePrefs();
    updateLinkModeUI();
}

// Which endpoint a click will open is shown on the row itself, rather than as a
// separate line of text repeating what the toggle already says.
function markActiveEndpoint(card) {
    const hasLocal = !!card.dataset.localId;
    const hasExternal = !!card.dataset.externalId;
    const preferred = state.linkMode === "external" ? "external" : "local";

    let active = "";
    if (preferred === "local") active = hasLocal ? "local" : hasExternal ? "external" : "";
    else active = hasExternal ? "external" : hasLocal ? "local" : "";

    for (const kind of ["local", "external"]) {
        const row = card.querySelector(`[data-role="${kind}Line"]`);
        if (!row) continue;
        row.dataset.active = String(active === kind);
        row.title = active === kind ? "Clicking the card opens this link" : "";
    }
}

function updateCardHintsInPlace() {
    for (const s of state.services) {
        const card = state.cardElById.get(String(s.id));
        if (card) markActiveEndpoint(card);
    }
}

function updateLinkModeUI() {
    if (!els.linkModeToggle) return;

    const isExternal = state.linkMode === "external";
    els.linkModeToggle.checked = isExternal;

    const icon = els.linkModeToggle.closest(".link-toggle")?.querySelector(".modeIcon");

    if (icon) {
        icon.textContent = isExternal ? "🌐" : "🏠";
    }

    updateCardHintsInPlace();
}

function ensureNetSparkBars() {
    if (!els.netSpark) return;

    // Meta (legend + peak) BELOW sparkline
    const metaHost = els.netSparkMeta || null;

    // If an old overlay exists inside the sparkline, remove it (prevents duplicates)
    const oldOverlay = els.netSpark.querySelector(".net-spark-overlay");
    if (oldOverlay) oldOverlay.remove();

    // Build meta UI once (preferred path: indexv2.html has #netSparkMeta)
    if (metaHost) {
        if (!metaHost.querySelector(".net-spark-legend")) {
            const legend = document.createElement("div");
            legend.className = "net-spark-legend";

            // IMPORTANT:
            // - use data-role hooks only
            legend.innerHTML = `

            <span class="rx">
              <span class="ms-icon material-symbols-rounded" aria-hidden="true">arrow_downward</span>
                <b data-role="netLegendRxVal">—</b>
            </span>
            <span class="tx">
              <span class="ms-icon material-symbols-rounded" aria-hidden="true">arrow_upward</span>
                <b data-role="netLegendTxVal">—</b>
            </span>
            <span class="unit">
              <span class="ms-icon material-symbols-rounded" aria-hidden="true">swap_vert</span>
                <b data-role="netLegendTotalVal">—</b>
            </span>
            `;

            const peak = document.createElement("div");
            peak.className = "net-spark-peak";
            peak.setAttribute("data-role", "netSparkPeak");
            peak.textContent = "Peak: —";

            metaHost.appendChild(legend);
            metaHost.appendChild(peak);
        }
    } else {
        // Fallback (older HTML): keep overlay inside sparkline if meta container is missing
        if (!els.netSpark.querySelector(".net-spark-overlay")) {
            const overlay = document.createElement("div");
            overlay.className = "net-spark-overlay";

            const legend = document.createElement("div");
            legend.className = "net-spark-legend";
            legend.innerHTML = `
                <span class="rx">
              <span class="ms-icon material-symbols-rounded" aria-hidden="true">arrow_downward</span>
                <b data-role="netLegendRxVal">—</b>
            </span>
            <span class="tx">
              <span class="ms-icon material-symbols-rounded" aria-hidden="true">arrow_upward</span>
                <b data-role="netLegendTxVal">—</b>
            </span>
            <span class="unit">
              <span class="ms-icon material-symbols-rounded" aria-hidden="true">swap_vert</span>
                <b data-role="netLegendTotalVal">—</b>
            </span>
            `;

            const peak = document.createElement("div");
            peak.className = "net-spark-peak";
            peak.setAttribute("data-role", "netSparkPeak");
            peak.textContent = "Peak: —";

            overlay.appendChild(legend);
            overlay.appendChild(peak);
            els.netSpark.appendChild(overlay);
        }
    }

    // Tooltip stays inside sparkline
    if (!els.netSpark.querySelector('[data-role="netSparkTip"]')) {
        const tip = document.createElement("div");
        tip.className = "net-spark-tip";
        tip.setAttribute("data-role", "netSparkTip");
        tip.setAttribute("aria-hidden", "false");
        els.netSpark.appendChild(tip);
    }

    // Bars
    if (!els.netSpark.querySelector("i")) {
        const frag = document.createDocumentFragment();
        for (let i = 0; i < NET_SPARK_N; i++) frag.appendChild(document.createElement("i"));
        els.netSpark.appendChild(frag);
    }

    // Interactions (hover labels)
    if (els.netSpark.dataset.bound === "1") return;
    els.netSpark.dataset.bound = "1";

    // keep your existing hover/tap binding code below this point as-is
}

const tip = () => els.netSpark.querySelector('[data-role="netSparkTip"]');
const bars = () => els.netSpark.querySelectorAll("i");

function idxFromX(x) {
    const rect = els.netSpark.getBoundingClientRect();
    const n = NET_SPARK_N;
    const rel = clamp(x - rect.left, 0, rect.width - 0.001);
    return clamp(Math.floor((rel / rect.width) * n), 0, n - 1);
}

function labelForIdx(idx) {
    const last = Math.max(0, _netSpark.length - 1);
    if (idx >= last) return "Now";
    const ago = last - idx;
    return `${ago} ago`;
}

function showAt(idx, clientX) {
    _netSparkHoverIdx = idx;
    idx = Math.min(idx, _netSpark.length - 1);
    if (idx < 0) return;

    // highlight bar
    const all = bars();
    all.forEach((b, i) => b.classList.toggle("is-hover", i === idx));

    const t = tip();
    if (!t) return;

    const rx = _netSparkRx[idx];
    const tx = _netSparkTx[idx];
    const total = _netSpark[idx];

    t.innerHTML = `
            <div class="t-title">${labelForIdx(idx)}</div>
            <div class="t-row"><span class="rx">⬇</span><b>${rx == null ? "—" : formatRateKbps(rx)}</b></div>
            <div class="t-row"><span class="tx">⬆</span><b>${tx == null ? "—" : formatRateKbps(tx)}</b></div>
            <div class="t-row"><span class="tt">Σ</span><b>${total == null ? "—" : formatRateKbps(total)}</b></div>
        `;

    const rect = els.netSpark.getBoundingClientRect();

    // measure tooltip width after content is set
    const tipW = t.offsetWidth || 128;
    const pad = 10;
    const half = tipW / 2;

    // clamp so the tooltip never hangs off the spark edges
    const left = clamp(clientX - rect.left, half + pad, rect.width - half - pad);

    t.style.left = `${left}px`;

    t.classList.add("show");
    t.setAttribute("aria-hidden", "false");
}

function hide() {
    _netSparkHoverIdx = -1;
    const t = tip();
    if (t) {
        t.classList.remove("show");
        t.setAttribute("aria-hidden", "true");
    }
    bars().forEach((b) => b.classList.remove("is-hover"));
}

// These run at module scope, so an absent #netSpark would throw before
// initialLoad() is ever reached and take the whole dashboard down with it.
if (els.netSpark) {
    const showFromPointer = (e) => {
        if (!_netSpark.length) return;
        const idx = idxFromX(e.clientX);
        showAt(idx, e.clientX);
    };

    els.netSpark.addEventListener("pointermove", showFromPointer, { passive: true });
    els.netSpark.addEventListener("pointerleave", hide, { passive: true });
    // Tap to show (mobile)
    els.netSpark.addEventListener("pointerdown", showFromPointer, { passive: true });
}

function populateNetIfaceSelect() {
    if (!els.netIface) return;

    // Load persisted choice
    try {
        _netSelectedChart = localStorage.getItem("netIface") || "auto";
    } catch {}

    // Reset options: keep "Auto"
    els.netIface.innerHTML = `<option value="auto">Auto (recommended)</option>`;

    for (const c of _netChartChoices) {
        const opt = document.createElement("option");
        opt.value = c.id;
        opt.textContent = c.label;
        els.netIface.appendChild(opt);
    }

    // Apply saved value if it exists in list
    const exists = _netSelectedChart === "auto" || _netChartChoices.some((c) => c.id === _netSelectedChart);
    els.netIface.value = exists ? _netSelectedChart : "auto";

    els.netIface.addEventListener(
        "change",
        () => {
            _netSelectedChart = els.netIface.value || "auto";
            try {
                localStorage.setItem("netIface", _netSelectedChart);
            } catch {}
        },
        { passive: true }
    );
}

function cycleAccent() {
    const cur = normalizeAccent(els.root.getAttribute("data-accent"));
    const i = ACCENTS.indexOf(cur);
    const next = ACCENTS[(i + 1) % ACCENTS.length];
    setAccent(next);
    toast(`🎨 Accent: <b>${next}</b>`, 1600);
}

function safeStr(v) {
    if (v == null) return "";
    if (typeof v === "string") return v;
    return String(v);
}

function escapeHtml(str) {
    return String(str).replace(
        /[&<>"']/g,
        (s) =>
            ({
                "&": "&amp;",
                "<": "&lt;",
                ">": "&gt;",
                '"': "&quot;",
                "'": "&#39;",
            })[s]
    );
}
function escapeAttr(str) {
    return escapeHtml(str).replace(/"/g, "&quot;");
}

function detectCategory(name) {
    const n = safeStr(name);
    for (const k of KEYWORDS) {
        if (k.regex.test(n)) return k.category;
    }
    return "other";
}

function iconFor(category) {
    return CATEGORY_META[category]?.icon || "✨";
}

function parseIconOverrides(raw) {
    const overrides = new Map();
    let source = raw;

    if (typeof source === "string") {
        try {
            source = JSON.parse(source || "{}");
        } catch (error) {
            // Never let a typo in Compose take the dashboard down with it.
            console.warn("SERVICE_ICONS is not valid JSON; ignoring icon overrides", error);
            return overrides;
        }
    }

    if (source && typeof source === "object") {
        for (const [service, url] of Object.entries(source)) {
            overrides.set(safeStr(service).trim().toLowerCase(), safeStr(url).trim());
        }
    }

    return overrides;
}

function loadBrowserIconOverrides() {
    try {
        const stored = JSON.parse(localStorage.getItem(ICON_STORAGE_KEY) || "{}");
        return parseIconOverrides(stored);
    } catch {
        return new Map();
    }
}

function saveBrowserIconOverrides() {
    try {
        localStorage.setItem(ICON_STORAGE_KEY, JSON.stringify(Object.fromEntries(BROWSER_ICON_OVERRIDES)));
    } catch {}
}

// The icon this service would get with no override at all.
function autoServiceIconUrl(name) {
    const match = SERVICE_ICONS.find((entry) => entry.regex.test(safeStr(name)));
    return match ? `${SERVICE_ICON_BASE}/${match.slug}.png` : "";
}

function iconOverrideFor(name) {
    const key = safeStr(name).trim().toLowerCase();
    const baseKey = baseServiceKey(name);

    // Browser first, then the Compose default. An empty string is a real value
    // here — it is how a card is pinned back to its category emoji.
    const browser = BROWSER_ICON_OVERRIDES.get(key) ?? BROWSER_ICON_OVERRIDES.get(baseKey);
    if (browser !== undefined) return { source: "browser", url: browser };

    const configured = ICON_OVERRIDES.get(key) ?? ICON_OVERRIDES.get(baseKey);
    if (configured !== undefined) return { source: "compose", url: configured };

    return { source: "auto", url: autoServiceIconUrl(name) };
}

function loadServiceContainers() {
    try {
        const stored = JSON.parse(localStorage.getItem(CONTAINER_STORAGE_KEY) || "{}");
        const map = new Map();
        for (const [service, container] of Object.entries(stored)) {
            map.set(safeStr(service).trim().toLowerCase(), safeStr(container).trim());
        }
        return map;
    } catch {
        return new Map();
    }
}

function saveServiceContainers() {
    try {
        localStorage.setItem(CONTAINER_STORAGE_KEY, JSON.stringify(Object.fromEntries(SERVICE_CONTAINERS)));
    } catch {}
}

const normalizeForMatch = (value) => safeStr(value).toLowerCase().replace(/[^a-z0-9]/g, "");

// Kuma monitor names and container names are different vocabularies, so this
// only claims a match when they genuinely agree. Everything else is left to the
// per-card picker.
function autoContainerFor(name) {
    const wanted = normalizeForMatch(baseServiceKey(name));
    if (!wanted) return "";
    return (
        ND_CONTAINERS.find((container) => normalizeForMatch(container) === wanted) ||
        ND_CONTAINERS.find((container) => normalizeForMatch(container).includes(wanted)) ||
        ""
    );
}

function containerForService(name) {
    // "" is a real choice here: it means "show no stats for this card".
    const chosen = SERVICE_CONTAINERS.get(baseServiceKey(name));
    if (chosen !== undefined) return { source: "chosen", container: chosen };
    return { source: "auto", container: autoContainerFor(name) };
}

function serviceIconUrl(name) {
    return iconOverrideFor(name).url;
}

// Used at build time and again after an edit, so both paths behave identically.
// Every card shows an image: the resolved icon if there is one, otherwise the
// bundled Service Dash mark. A broken link falls back to the same mark.
function renderCardIcon(card, name) {
    const tile = card.querySelector(".svcIcon");
    if (!tile) return;

    const url = serviceIconUrl(name) || FALLBACK_ICON;
    tile.innerHTML = "";

    const img = document.createElement("img");
    img.className = "svcIconImg";
    img.alt = "";
    img.decoding = "async";

    img.addEventListener("error", () => {
        // One retry with the bundled mark, then stop — no infinite loop if the
        // fallback itself is somehow missing.
        if (img.dataset.fallbackApplied === "true") return;
        img.dataset.fallbackApplied = "true";
        img.src = FALLBACK_ICON;
    });

    tile.appendChild(img);
    img.src = url;
    if (url === FALLBACK_ICON) img.dataset.fallbackApplied = "true";
}

function statusForIdFromHeartbeat(id) {
    const hb = state.heartbeat;
    if (!hb) return "pending";
    const map = hb.heartbeatList || hb.heartbeat || hb.heartbeats || hb;
    const entry = map?.[String(id)];
    const statusVal =
        entry && typeof entry === "object" && entry.status != null
            ? entry.status
            : Array.isArray(entry) && entry.length && entry[entry.length - 1]?.status != null
              ? entry[entry.length - 1].status
              : Array.isArray(entry) && entry.length && entry[entry.length - 1]?.heartbeat?.status != null
                ? entry[entry.length - 1].heartbeat.status
                : entry && entry.heartbeat && entry.heartbeat.status != null
                  ? entry.heartbeat.status
                  : entry;
    const s = STATUS_MAP[Number(statusVal)];
    return s || "pending";
}

function uptimeForId(id) {
    const hb = state.heartbeat;
    if (!hb) return null;

    // Kuma status-page heartbeat uptimeList uses keys like "12_24"
    let u = hb.uptimeList?.[`${String(id)}_24`];

    if (u == null) return null;

    let n = Number(u);
    if (!Number.isFinite(n)) return null;

    // Your uptimeList values are 0..1, so scale to percent
    if (n >= 0 && n <= 1) n = n * 100;

    return n;
}

function urlForMonitor(id) {
    const m = state.monitorById[String(id)];
    if (!m) return null;

    let url = m.url || "";
    if (!url && m.hostname) {
        const port = m.port ? `:${m.port}` : "";
        url = `http://${m.hostname}${port}`;
    }
    url = normalizeMaybeUrl(url);
    return url || null;
}

function normalizeMaybeUrl(u) {
    const s = safeStr(u).trim();
    if (!s) return "";
    if (/^https?:\/\//i.test(s)) return s;
    if (/^[a-z0-9.-]+(:\d+)?(\/.*)?$/i.test(s)) return `http://${s}`;
    return s;
}

function autoResizeTextarea(el) {
    if (!el) return;
    el.style.height = "auto";
    el.style.height = el.scrollHeight + "px";
}

function setUrlState(label) {
    els.urlState.textContent = label;
    const normalizedLabel = String(label || "").toLowerCase();
    if (normalizedLabel.includes("authenticated") || normalizedLabel.includes("loaded")) {
        els.urlState.style.color = "var(--online)";
    } else if (
        normalizedLabel.includes("failed") ||
        normalizedLabel.includes("blocked") ||
        normalizedLabel.includes("locked")
    ) {
        els.urlState.style.color = "var(--offline)";
    } else {
        els.urlState.style.color = "var(--muted)";
    }
}

function updateAuthButtons() {
    const authed = !!state.socketAuthed;

    // Show Logout only when authenticated
    els.btnLogout.style.display = authed ? "flex" : "none";

    // Hide Unlock URLs once authenticated
    els.btnAuth.style.display = authed ? "none" : "flex";
}

/* =========================
         KUMA FETCH
========================= */
async function fetchJson(url) {
    const res = await fetch(url, { cache: "no-store" });
    const txt = await res.text();
    if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText}: ${txt.slice(0, 120)}`);
    let json;
    try {
        json = JSON.parse(txt);
    } catch (e) {
        console.error("Bad JSON from", url, res.status, txt.slice(0, 240));
        throw new Error(`Bad JSON from ${url}`);
    }
    return json;
}

/* =========================
        NETDATA FETCH
========================= */
async function fetchJsonNetdata(url) {
    const headers = NETDATA_TOKEN
        ? {
              "X-Auth-Token": NETDATA_TOKEN,
              "X-Netdata-Token": NETDATA_TOKEN,
          }
        : {};
    const res = await fetch(url, {
        cache: "no-store",
        headers,
        credentials: "include",
    });
    const txt = await res.text();
    if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText}: ${txt.slice(0, 120)}`);
    let json;
    try {
        json = JSON.parse(txt);
    } catch (e) {
        console.error("Bad JSON from", url, res.status, txt.slice(0, 240));
        throw new Error(`Bad JSON from ${url}`);
    }
    return json;
}

async function fetchStatusPage() {
    const data = await fetchJson(EP_STATUS);
    if (data?.status === "fail") throw new Error(data.msg || `Uptime Kuma rejected status-page slug "${STATUS_SLUG}"`);
    if (!Array.isArray(data?.publicGroupList)) throw new Error("Uptime Kuma returned no publicGroupList");
    return data;
}
async function fetchHeartbeat() {
    return fetchJson(EP_HEART);
}

/* =========================
               SOCKET.IO (optional)
               ========================= */
function loadSocketIoClient() {
    if (window.io) return Promise.resolve(true);
    return new Promise((resolve) => {
        const s = document.createElement("script");
        s.src = `${KUMA_BASE}/socket.io/socket.io.js`;
        s.async = true;
        s.onload = () => resolve(!!window.io);
        s.onerror = () => resolve(false);
        document.head.appendChild(s);
    });
}

async function ensureSocket() {
    if (state.socketReady && state.socket) return true;

    els.authConn.textContent = `Loading ${KUMA_BASE}/socket.io/socket.io.js …`;
    const ok = await loadSocketIoClient();
    if (!ok) {
        els.authConn.textContent = "Blocked by client (extension?)";
        setUrlState("blocked");
        toast(`⚠️ <b>Socket.IO blocked.</b> Allow <b>${escapeHtml(KUMA_BASE)}/socket.io</b> in blockers.`, 5200);
        return false;
    }

    els.authConn.textContent = "Connecting…";

    state.socket = window.io(window.location.origin, {
        path: `${KUMA_BASE}/socket.io`,
        transports: ["polling"],
        upgrade: false,
        forceNew: true,
        timeout: 20000,
        reconnection: true,
        reconnectionAttempts: Infinity,
        reconnectionDelay: 800,
        reconnectionDelayMax: 4000,
        withCredentials: true,
    });

    state.socket.on("connect", async () => {
        els.authConn.textContent = "Connected";
        await autoReauthAndLoadUrls("reconnect");
    });

    state.socket.on("disconnect", () => {
        els.authConn.textContent = "Disconnected";
        state.socketAuthed = false;
        updateAuthButtons();
        setUrlState("LOCKED");
    });

    state.socket.on("connect_error", (e) => {
        const msg = e?.message || "connect_error";
        els.authConn.textContent = `Connect error: ${msg}`;
        state.socketAuthed = false;
        updateAuthButtons();
        setUrlState("failed");
        console.warn("socket connect_error", e);
    });

    state.socket.on("monitorList", (payload) => {
        const map = {};
        if (Array.isArray(payload)) {
            for (const m of payload) if (m?.id != null) map[String(m.id)] = m;
        } else if (payload && typeof payload === "object") {
            for (const [id, m] of Object.entries(payload)) {
                const mm = m || {};
                if (mm && mm.id == null) mm.id = Number(id);
                map[String(mm?.id ?? id)] = mm;
            }
        }
        if (Object.keys(map).length) {
            state.monitorById = map;
            const loadedUrlCount = Object.values(map).filter((monitor) => monitor?.url || monitor?.hostname).length;
            updateAuthButtons();
            setUrlState(loadedUrlCount ? `${loadedUrlCount} loaded` : "none returned");
            updateCardUrlsInPlace();
            applyFiltersAndCounts();
        }
    });

    state.socketReady = true;
    return true;
}

async function autoReauthAndLoadUrls(reason) {
    if (!state.socket) return;
    const token = localStorage.getItem("ml_token") || "";
    if (token) {
        setUrlState("authenticating…");
        try {
            await new Promise((resolve) => {
                state.socket.emit("loginByToken", token, (res) => {
                    if (res?.ok) {
                        state.socketAuthed = true;
                        updateAuthButtons();
                        setUrlState("authenticated");
                        try {
                            state.socket.emit("getMonitorList");
                        } catch {}
                        resolve(true);
                    } else {
                        localStorage.removeItem("ml_token");
                        state.socketAuthed = false;
                        updateAuthButtons();
                        setUrlState("LOCKED");
                        resolve(false);
                    }
                });
            });
            return;
        } catch (e) {
            console.warn("autoReauth failed", reason, e);
        }
    }

    try {
        state.socket.emit("getMonitorList");
    } catch {}
    setUrlState("LOCKED");
}

async function doLogin({ username, password, token2fa, remember }) {
    const ok = await ensureSocket();
    if (!ok) return;

    localStorage.setItem("ml_user", username);
    localStorage.setItem("ml_remember", remember ? "yes" : "no");

    setUrlState("signing in…");

    return new Promise((resolve) => {
        state.socket.emit(
            "login",
            {
                username,
                password,
                token: token2fa || undefined,
                remember,
            },
            (res) => {
                if (!res?.ok) {
                    setUrlState("login failed");
                    resolve({ ok: false, msg: res?.msg || "Login failed" });
                    return;
                }

                if (remember && res.token) {
                    localStorage.setItem("ml_token", res.token);
                } else if (!remember) {
                    localStorage.removeItem("ml_token");
                }

                state.socketAuthed = true;
                updateAuthButtons();
                setUrlState("authenticated");
                try {
                    state.socket.emit("getMonitorList");
                } catch {}
                resolve({ ok: true });
            }
        );
    });
}

function doLogout() {
    try {
        if (state.socket) {
            try {
                state.socket.emit("logout");
            } catch {}
            state.socket.disconnect();
        }
    } catch {}
    state.socket = null;
    state.socketReady = false;
    state.socketAuthed = false;
    updateAuthButtons();

    localStorage.removeItem("ml_token");
    setUrlState("LOCKED");

    toast(`👋 <b>Logged out.</b> Private URLs will hide (status still works).`, 3200);
    // Refresh page after logout
    setTimeout(() => location.reload(), 300);
}

/* =========================
               BUILD SERVICES
               ========================= */
function buildServicesFromKuma() {
    const groups = state.pageData?.publicGroupList || [];

    // Flatten monitors
    const flat = [];
    for (const g of groups) {
        const monitors = Array.isArray(g?.monitorList) ? g.monitorList : [];
        for (const m of monitors) {
            const id = String(m?.id ?? "");
            if (!id) continue;
            const name = m?.name || `Monitor #${id}`;
            flat.push({
                id,
                name,
                type: m?.type || "unknown",
            });
        }
    }

    // Pair local + external by normalized name key
    const byKey = new Map();
    for (const m of flat) {
        const key = baseServiceKey(m.name);
        const isLocal = isLocalishName(m.name);

        if (!byKey.has(key)) {
            byKey.set(key, {
                key,
                nameBase: m.name, // will be refined below
                local: null,
                external: null,
            });
        }
        const slot = byKey.get(key);

        // Prefer the "clean" (non-local) name for display if available
        if (!isLocal) slot.nameBase = m.name;

        const entry = {
            id: m.id,
            name: m.name,
            type: m.type,
        };

        if (isLocal) {
            // If duplicates, last wins (fine)
            slot.local = entry;
        } else {
            slot.external = entry;
        }
    }

    // Build combined services list, grouped by CATEGORY (not Kuma groups)
    const services = [];
    for (const [, slot] of byKey.entries()) {
        const displayName = slot.nameBase || slot.local?.name || slot.external?.name || "Service";
        const category = detectCategory(displayName);
        const icon = iconFor(category);

        const localId = slot.local?.id || null;
        const extId = slot.external?.id || null;

        const localStatus = localId ? statusForIdFromHeartbeat(localId) : "unknown";
        const extStatus = extId ? statusForIdFromHeartbeat(extId) : "unknown";

        const localUptime = localId ? uptimeForId(localId) : null;
        const extUptime = extId ? uptimeForId(extId) : null;

        // Overall status for filtering/counts (prefer external, else local)
        const overallStatus = (extId ? extStatus : null) || (localId ? localStatus : null) || "pending";

        const overallUptime = (extId ? extUptime : null) ?? (localId ? localUptime : null) ?? null;

        services.push({
            id: slot.key, // combined ID
            name: displayName,
            type: slot.external?.type || slot.local?.type || "unknown",
            group: (CATEGORY_META[category] || CATEGORY_META.other).label, // UI section
            category,
            status: overallStatus,
            uptime: overallUptime,
            icon,

            // endpoints
            local: {
                id: localId,
                status: localStatus,
                uptime: localUptime,
            },
            external: {
                id: extId,
                status: extStatus,
                uptime: extUptime,
            },
        });
    }

    state.services = services;
}

/* =========================
     FILTERING + COUNTS
========================= */
function serviceMatchesFilters(s, queryLower, statusFilter, categoryFilter) {
    const statusOk = statusFilter === "all" ? true : s.status === statusFilter;
    const catOk = categoryFilter === "all" ? true : s.category === categoryFilter;
    if (!statusOk || !catOk) return false;
    if (!queryLower) return true;

    const hay = [s.name, s.category, s.group, s.type, s.id, s._localUrl || "", s._externalUrl || ""]
        .join(" ")
        .toLowerCase();

    return hay.includes(queryLower);
}

function computeCounts(visibleServices) {
    const byStatus = {
        all: visibleServices.length,
        online: 0,
        offline: 0,
        pending: 0,
        maintenance: 0,
        unknown: 0,
    };
    const byCategory = new Map();
    for (const s of visibleServices) {
        byStatus[s.status] = (byStatus[s.status] || 0) + 1;
        const c = s.category || "other";
        byCategory.set(c, (byCategory.get(c) || 0) + 1);
    }
    return { byStatus, byCategory };
}

function renderChipsWithCounts() {
    const qLower = safeStr(state.query).trim().toLowerCase();
    // Must use the same haystack as serviceMatchesFilters(), otherwise the chip
    // counts and the visible cards disagree — most visibly when searching a URL.
    const servicesBySearch = state.services.filter((s) => serviceMatchesFilters(s, qLower, "all", "all"));
    const counts = computeCounts(servicesBySearch);

    const statuses = ["all", "online", "offline", "pending", "maintenance"];
    els.statusChips.innerHTML = statuses
        .map((st) => {
            const label = st === "all" ? "All" : st[0].toUpperCase() + st.slice(1);
            const emoji =
                st === "all" ? "🧩" : st === "online" ? "🟢" : st === "offline" ? "🔴" : st === "pending" ? "🟡" : "🟠";
            const n = counts.byStatus[st] ?? 0;
            return `<div class="chip" data-kind="status" data-value="${st}" data-active="${state.statusFilter === st}">
                    <span>${emoji}</span><span>${label}</span><span class="cnum">${n}</span>
                  </div>`;
        })
        .join("");

    const cats = Array.from(new Set(state.services.map((s) => s.category))).sort((a, b) => a.localeCompare(b));
    const list = ["all", ...cats];
    const allCatsCount = servicesBySearch.length;

    els.categoryChips.innerHTML = list
        .map((c) => {
            const meta = CATEGORY_META[c] || CATEGORY_META.other;
            const label = c === "all" ? "All Categories" : meta.label;
            const icon = c === "all" ? "🌈" : meta.icon;
            const n = c === "all" ? allCatsCount : counts.byCategory.get(c) || 0;
            return `<div class="chip" data-kind="category" data-value="${c}" data-active="${state.categoryFilter === c}">
                    <span>${icon}</span><span>${label}</span><span class="cnum">${n}</span>
                  </div>`;
        })
        .join("");

    [...els.statusChips.querySelectorAll(".chip"), ...els.categoryChips.querySelectorAll(".chip")].forEach((ch) => {
        ch.addEventListener("click", () => {
            const kind = ch.getAttribute("data-kind");
            const val = ch.getAttribute("data-value");
            if (kind === "status") state.statusFilter = val;
            if (kind === "category") state.categoryFilter = val;
            savePrefs();
            applyFiltersAndCounts();
            updateChipActiveStates();
        });
    });

    updateChipActiveStates();
}

function updateChipActiveStates() {
    document.querySelectorAll(".chip[data-kind='status']").forEach((el) => {
        el.setAttribute("data-active", String(el.getAttribute("data-value") === state.statusFilter));
    });
    document.querySelectorAll(".chip[data-kind='category']").forEach((el) => {
        el.setAttribute("data-active", String(el.getAttribute("data-value") === state.categoryFilter));
    });
}

/* =========================
               RENDER (NO VISUAL REFRESH ON POLL)
               ========================= */
function buildDomOnceIfNeeded() {
    if (state.domBuilt) return;
    els.groups.innerHTML = "";
    state.cardElById.clear();

    // Flat grid (no category/group sections)
    const cardsEl = document.createElement("div");
    cardsEl.className = "cards";
    cardsEl.setAttribute("data-role", "cardsGrid");
    els.groups.appendChild(cardsEl);

    // Stable ordering: by service name
    const list = [...state.services].sort((a, b) => a.name.localeCompare(b.name));

    for (const s of list) {
        const category = s.category;
        const icon = s.icon;
        const name = s.name;

        // The card clips its own decorative wash with overflow:hidden, so the
        // settings button lives in an unclipped wrapper alongside it.
        const wrap = document.createElement("div");
        wrap.className = "cardWrap";

        const card = document.createElement("article");
        card.className = "card";
        card.setAttribute("role", "button");
        card.setAttribute("tabindex", "0");

        // combined key
        card.dataset.id = s.id;
        card.dataset.name = name;
        card.dataset.group = s.group || "";
        card.dataset.category = category;
        card.dataset.type = s.type;

        // endpoint ids
        card.dataset.localId = s.local?.id || "";
        card.dataset.externalId = s.external?.id || "";

        card.innerHTML = `
              <div class="cardTop">
                <div class="svcIcon" aria-hidden="true"></div>
                <div class="svcName">
                  <b title="${escapeAttr(name)}">${escapeHtml(name)}</b>
                  <div class="svcMeta">${escapeHtml((CATEGORY_META[category] || CATEGORY_META.other).label)}</div>
                </div>
                <div class="statusDot" data-role="statusDot" data-status="pending" title="Pending"></div>
              </div>

              <div class="linkLines">
                <div class="linkLine" data-role="localLine">
                  <span class="miniDot" data-role="localDot" data-status="pending"></span>
                  <span class="linkBadge">Local</span>
                  <span class="linkUrl" data-role="localUrlText">URL locked 🔒</span>
                  <span class="linkMeta" data-role="localUp">—</span>
                </div>
                <div class="linkLine" data-role="externalLine">
                  <span class="miniDot" data-role="externalDot" data-status="pending"></span>
                  <span class="linkBadge">External</span>
                  <span class="linkUrl" data-role="externalUrlText">URL locked 🔒</span>
                  <span class="linkMeta" data-role="externalUp">—</span>
                </div>
              </div>

              <div class="cardBottom">
                <div class="containerStats" data-role="containerStats" hidden>
                  <span class="containerStat"><small>CPU</small><b data-role="containerCpu">—</b></span>
                  <span class="containerStat"><small>RAM</small><b data-role="containerRam">—</b></span>
                </div>
              </div>
            `;

        card.addEventListener("click", () => {
            const localUrl = card.dataset.localUrl || "";
            const extUrl = card.dataset.externalUrl || "";

            const localHidden = card.dataset.localUrlHidden === "true";
            const extHidden = card.dataset.externalUrlHidden === "true";

            const usableLocal = !localHidden && !!localUrl;
            const usableExt = !extHidden && !!extUrl;

            // If URLs aren't unlocked/available
            if (!usableLocal && !usableExt) {
                toast(
                    `🔒 <b>${escapeHtml(name)}</b> • URLs hidden. Use <b>Unlock URLs</b> to load them (optional).`,
                    2600
                );
                return;
            }

            // Decide based on toggle
            let chosenUrl = "";
            let chosenLabel = "";

            if (state.linkMode === "local") {
                if (usableLocal) {
                    chosenUrl = localUrl;
                    chosenLabel = "Local";
                } else if (usableExt) {
                    chosenUrl = extUrl; // fallback if local not available
                    chosenLabel = "External";
                }
            } else {
                if (usableExt) {
                    chosenUrl = extUrl;
                    chosenLabel = "External";
                } else if (usableLocal) {
                    chosenUrl = localUrl; // fallback if external not available
                    chosenLabel = "Local";
                }
            }

            const ok = openUrlNow(chosenUrl);
            if (!ok) {
                toast(`⚠️ <b>${escapeHtml(name)}</b> • No URL to open`, 2200);
                return;
            }

            toast(
                chosenLabel === "Local"
                    ? `🏠 <b>${escapeHtml(name)}</b> • Opening <b>Local</b>`
                    : `🌐 <b>${escapeHtml(name)}</b> • Opening <b>External</b>`,
                1600
            );
        });

        if (isTouch) {
            let pressTimer = null;
            let didLongPress = false;

            const start = (event) => {
                if (event.target.closest?.('[data-role="iconEdit"]')) return;
                didLongPress = false;
                pressTimer = setTimeout(() => {
                    didLongPress = true;

                    const localUrl = card.dataset.localUrl || "";
                    const localHidden = card.dataset.localUrlHidden === "true";
                    const usableLocal = !localHidden && !!localUrl;

                    if (!usableLocal) {
                        toast(`🔒 <b>${escapeHtml(name)}</b> • Local URL unavailable`, 2200);
                        return;
                    }

                    console.log("SMART OPEN RESULT", {
                        choice: "local-forced-mobile",
                        url: localUrl,
                    });

                    openUrlNow(localUrl);
                    toast(`🏠 <b>${escapeHtml(name)}</b> • Opening <b>Local</b> (long-press)`, 1800);
                }, 520);
            };

            const cancel = () => {
                if (pressTimer) clearTimeout(pressTimer);
                pressTimer = null;
            };

            card.addEventListener("touchstart", start, {
                passive: true,
            });
            card.addEventListener("touchend", cancel, {
                passive: true,
            });
            card.addEventListener("touchcancel", cancel, {
                passive: true,
            });

            // Prevent the normal click from firing after a long-press
            card.addEventListener(
                "click",
                (e) => {
                    if (didLongPress) {
                        e.preventDefault();
                        e.stopPropagation();
                        didLongPress = false;
                    }
                },
                true
            );
        }

        renderCardIcon(card, name);


        // A service with only a local (or only an external) monitor should not
        // show an empty row for the endpoint it does not have.
        if (!card.dataset.localId) card.querySelector('[data-role="localLine"]')?.remove();
        if (!card.dataset.externalId) card.querySelector('[data-role="externalLine"]')?.remove();
        markActiveEndpoint(card);

        const editButton = document.createElement("button");
        editButton.className = "svcIconEdit";
        editButton.type = "button";
        editButton.dataset.role = "iconEdit";
        editButton.title = "Card settings";
        editButton.setAttribute("aria-label", `Card settings for ${name}`);
        editButton.innerHTML = '<span class="material-symbols-rounded" aria-hidden="true">edit</span>';
        editButton.addEventListener("click", (event) => {
            event.preventDefault();
            event.stopPropagation();
            openIconEditor(s);
        });

        wrap.appendChild(card);
        wrap.appendChild(editButton);
        cardsEl.appendChild(wrap);
        state.cardElById.set(s.id, card);
    }

    state.domBuilt = true;
}

function updateCardUrlsInPlace() {
    for (const s of state.services) {
        const card = state.cardElById.get(String(s.id));
        if (!card) continue;

        const localId = card.dataset.localId || "";
        const extId = card.dataset.externalId || "";

        const localUrl = localId ? urlForMonitor(localId) : null;
        const extUrl = extId ? urlForMonitor(extId) : null;

        // Store on card dataset (used by click + filtering)
        card.dataset.localUrl = localUrl || "";
        card.dataset.externalUrl = extUrl || "";

        // Hidden flags
        card.dataset.localUrlHidden = localUrl ? "false" : "true";
        card.dataset.externalUrlHidden = extUrl ? "false" : "true";

        // Also attach to service (for searching)
        s._localUrl = localUrl || "";
        s._externalUrl = extUrl || "";

        const localText = card.querySelector('[data-role="localUrlText"]');
        const extText = card.querySelector('[data-role="externalUrlText"]');

        if (localText) localText.textContent = localUrl ? localUrl : "URL locked 🔒";
        if (extText) extText.textContent = extUrl ? extUrl : "URL locked 🔒";

        markActiveEndpoint(card);
    }
}

function updateStatusesInPlace() {
    for (const s of state.services) {
        const card = state.cardElById.get(String(s.id));
        if (!card) continue;

        const localId = card.dataset.localId || "";
        const extId = card.dataset.externalId || "";

        const localStatus = localId ? statusForIdFromHeartbeat(localId) : "unknown";
        const extStatus = extId ? statusForIdFromHeartbeat(extId) : "unknown";

        const localUp = localId ? uptimeForId(localId) : null;
        const extUp = extId ? uptimeForId(extId) : null;

        // Update service model
        s.local.status = localStatus;
        s.external.status = extStatus;
        s.local.uptime = localUp;
        s.external.uptime = extUp;

        // Overall status/uptime (for chips/filter + big dot)
        s.status = (extId ? extStatus : null) || (localId ? localStatus : null) || "pending";
        s.uptime = (extId ? extUp : null) ?? (localId ? localUp : null) ?? null;

        // Big dot (overall)
        const dot = card.querySelector('[data-role="statusDot"]');
        if (dot) {
            dot.dataset.status = s.status;
            dot.title = s.status[0].toUpperCase() + s.status.slice(1);
        }

        // Local row
        const ldot = card.querySelector('[data-role="localDot"]');
        if (ldot) ldot.dataset.status = localStatus;

        const lup = card.querySelector('[data-role="localUp"]');
        if (lup) lup.textContent = localUp == null ? "—" : `${Number(localUp).toFixed(1)}%`;

        // External row
        const edot = card.querySelector('[data-role="externalDot"]');
        if (edot) edot.dataset.status = extStatus;

        const eup = card.querySelector('[data-role="externalUp"]');
        if (eup) eup.textContent = extUp == null ? "—" : `${Number(extUp).toFixed(1)}%`;


    }
}

function applyFiltersAndCounts() {
    const qLower = safeStr(state.query).trim().toLowerCase();
    const statusFilter = state.statusFilter;
    const categoryFilter = state.categoryFilter;

    for (const s of state.services) {
        const card = state.cardElById.get(String(s.id));
        if (!card) continue;

        const matches = serviceMatchesFilters(s, qLower, statusFilter, categoryFilter);

        card.classList.toggle("is-filtered-out", !matches);
    }

    renderChipsWithCounts();
}

/* =========================
               SIDEBAR (mock metrics)
               ========================= */
function tickMockMetrics() {
    const t = Date.now() / 1000;
    const cpu = clamp(35 + 18 * Math.sin(t / 3.3) + 8 * Math.sin(t / 1.7), 4, 92);
    const mem = clamp(52 + 12 * Math.sin(t / 4.2) + 6 * Math.cos(t / 2.6), 10, 94);
    const disk = clamp(41 + 6 * Math.sin(t / 7.8), 8, 96);

    // A friendly, slightly “bursty” 1m load signal (visual only).
    // Keeps the bar moving even with no Netdata.
    const load1 = clamp(0.55 + 0.65 * Math.sin(t / 4.8) + 0.25 * Math.sin(t / 1.9), 0, 3.9);

    els.cpuVal.textContent = `${cpu.toFixed(0)}%`;
    els.memVal.textContent = `${mem.toFixed(0)}%`;
    const mockDiskTotal = 1024 ** 4;
    const mockDiskUsed = mockDiskTotal * (disk / 100);
    const mockDiskFree = mockDiskTotal - mockDiskUsed;
    els.diskVal.textContent = `${disk.toFixed(0)}%`;
    if (els.diskUsed) els.diskUsed.textContent = formatStorageBytes(mockDiskUsed);
    if (els.cpuWatts) els.cpuWatts.textContent = `${(10 + cpu / 8).toFixed(1)} W`;
    if (els.cpuTemp) els.cpuTemp.textContent = `${(38 + cpu / 4).toFixed(1)} °C`;
    if (els.memTotal) els.memTotal.textContent = "8.00 GB";
    if (els.diskFree) els.diskFree.textContent = formatStorageBytes(mockDiskFree);
    if (els.diskTotal) els.diskTotal.textContent = formatStorageBytes(mockDiskTotal);

    if (els.loadVal) {
        const mockCpuCount = 4;
        const mockLoadPercent = (load1 / mockCpuCount) * 100;
        els.loadVal.textContent = `${mockLoadPercent.toFixed(0)}% (${load1.toFixed(2)} / ${mockCpuCount})`;
        els.loadVal.title = `1-minute load average ${load1.toFixed(2)} divided by ${mockCpuCount} logical CPUs`;
        els.loadVal.style.color =
            mockLoadPercent > 100 ? "var(--offline)" : mockLoadPercent >= 70 ? "var(--pending)" : "var(--online)";
    }

    els.cpuBar.style.width = `${cpu.toFixed(0)}%`;
    els.memBar.style.width = `${mem.toFixed(0)}%`;
    els.diskBar.style.width = `${disk.toFixed(0)}%`;

    if (els.loadBar) {
        const loadPct = Math.min(100, (load1 / 4) * 100);
        els.loadBar.style.width = `${loadPct}%`;
    }

    // -------------------
    // Network mock (feeds the same renderer as Netdata so all fields + sparkline populate)
    // Values are in Kb/s to match Netdata's `system.net` chart units.
    // -------------------
    const rx = clamp(1400 + 1200 * Math.sin(t / 2.6) + 700 * Math.sin(t / 0.95), 0, 90000);
    const tx = clamp(900 + 900 * Math.cos(t / 3.1) + 500 * Math.sin(t / 1.2), 0, 70000);

    // Create a tiny Netdata-shaped payload so we can reuse applyNetworkFromNetdata
    // (which also updates spark + saturation state).
    const mockNetNd = {
        labels: ["time", "received", "sent"],
        data: [[0, rx, tx]],
    };
    applyNetworkFromNetdata(mockNetNd);
}

function tickMockNetwork() {
    ensureNetSparkBars();

    const t = Date.now() / 1000;

    // Kb/s (matches formatRateKbps usage elsewhere)
    const rx = clamp(220 + 180 * Math.sin(t / 2.2) + 120 * Math.sin(t / 0.9), 5, 2200);
    const tx = clamp(140 + 120 * Math.cos(t / 2.6) + 90 * Math.sin(t / 1.1), 3, 1600);
    const total = rx + tx;


    // Update legend values
    if (els.netSparkMeta) {
        const rxEl = els.netSparkMeta.querySelector('[data-role="netLegendRxVal"]');
        const txEl = els.netSparkMeta.querySelector('[data-role="netLegendTxVal"]');
        const ttEl = els.netSparkMeta.querySelector('[data-role="netLegendTotalVal"]');
        if (rxEl) rxEl.textContent = formatRateKbps(rx);
        if (txEl) txEl.textContent = formatRateKbps(tx);
        if (ttEl) ttEl.textContent = formatRateKbps(total);
    }

    // Push into spark history
    _netSparkRx.push(rx);
    _netSparkTx.push(tx);
    _netSpark.push(total);

    const over = _netSpark.length - NET_SPARK_N;
    if (over > 0) {
        _netSpark.splice(0, over);
        _netSparkRx.splice(0, over);
        _netSparkTx.splice(0, over);
    }

    // Render bars similar to the real path
    if (els.netSpark && els.netSpark.childElementCount) {
        const bars = els.netSpark.querySelectorAll("i");
        const max = Math.max(1, ..._netSpark);
        for (let i = 0; i < bars.length; i++) {
            const v = _netSpark[i] ?? 0;
            const pct = Math.max(6, Math.min(100, (v / max) * 100));
            bars[i].style.height = `${pct}%`;
            bars[i].style.opacity = v > 0 ? "0.9" : "0.55";
        }
    }
}

function wireSections() {
    document.querySelectorAll(".section .sec-head").forEach((h) => {
        h.addEventListener("click", () => {
            // Haptic on section toggle (mobile)
            if (typeof hapticTap === "function") hapticTap();

            const sec = h.closest(".section");
            const open = sec.getAttribute("data-open") !== "true";
            sec.setAttribute("data-open", String(open));

            // Persist only the wrapper + calendar (so we don't change behavior elsewhere)
            if (sec && (sec.id === "secCalendar" || sec.id === "metricsSidebar")) savePrefs();
        });
    });

    const wrapHead = document.querySelector("#metricsSidebar > .sec-head");
    if (wrapHead && els.metricsSidebar) {
        wrapHead.addEventListener("click", () => {
            if (typeof hapticTap === "function") hapticTap();

            const open = els.metricsSidebar.getAttribute("data-open") !== "true";
            els.metricsSidebar.setAttribute("data-open", String(open));
            savePrefs();
        });
    }
}

/* =========================
               ICON EDITOR
               ========================= */
let _iconEditTarget = null;
// null = nothing to check, true = image loaded, false = it failed.
let _iconPreviewOk = null;

function setIconStatus(state, message) {
    if (!els.iconStatus) return;
    els.iconStatus.dataset.state = state;
    els.iconStatus.textContent = message;
}

function updateIconPreview() {
    if (!els.iconPreviewImg) return;

    const url = safeStr(els.iconUrlInput?.value).trim();
    els.iconPreviewImg.style.display = "none";
    els.iconPreview?.classList.remove("has-image");

    if (!url) {
        _iconPreviewOk = null;
        setIconStatus("idle", "No link — this card will show the default Service Dash icon.");
        els.iconPreviewImg.src = FALLBACK_ICON;
        return;
    }

    _iconPreviewOk = null;
    setIconStatus("checking", "Loading image…");
    els.iconPreviewImg.src = url;
}

function openIconEditor(service) {
    if (!els.iconOverlay) return;

    _iconEditTarget = service;
    const current = iconOverrideFor(service.name);

    if (els.iconServiceName) els.iconServiceName.textContent = service.name;
    if (els.iconUrlInput) els.iconUrlInput.value = current.url;
    updateIconPreview();
    populateContainerSelect(service);

    els.iconOverlay.classList.add("show");
    els.iconOverlay.setAttribute("aria-hidden", "false");
    setTimeout(() => els.iconUrlInput?.focus(), 60);
}

function populateContainerSelect(service) {
    const select = els.containerSelect;
    if (!select) return;

    const resolved = containerForService(service.name);
    const auto = autoContainerFor(service.name);

    select.innerHTML = "";
    const autoOption = document.createElement("option");
    autoOption.value = "__auto__";
    autoOption.textContent = auto ? `Auto — ${auto}` : "Auto — no match found";
    select.appendChild(autoOption);

    const noneOption = document.createElement("option");
    noneOption.value = "";
    noneOption.textContent = "None (hide stats)";
    select.appendChild(noneOption);

    for (const container of ND_CONTAINERS) {
        const option = document.createElement("option");
        option.value = container;
        option.textContent = container;
        select.appendChild(option);
    }

    select.value = resolved.source === "auto" ? "__auto__" : resolved.container;
    select.disabled = ND_CONTAINERS.length === 0;

    if (els.containerHint) {
        els.containerHint.textContent = ND_CONTAINERS.length
            ? "Shows this container\u2019s CPU and RAM on the card."
            : "No containers reported by Netdata on this host.";
    }
}

function closeIconEditor() {
    if (!els.iconOverlay) return;
    _iconEditTarget = null;
    els.iconOverlay.classList.remove("show");
    els.iconOverlay.setAttribute("aria-hidden", "true");
}

function applyContainerChoice(service) {
    const select = els.containerSelect;
    if (!select) return;

    const key = baseServiceKey(service.name);
    if (select.value === "__auto__") SERVICE_CONTAINERS.delete(key);
    else SERVICE_CONTAINERS.set(key, select.value);
    saveServiceContainers();

    // Hide immediately if the card no longer maps anywhere; otherwise the next
    // tick fills it in.
    if (!containerForService(service.name).container) {
        const row = state.cardElById.get(String(service.id))?.querySelector('[data-role="containerStats"]');
        if (row) row.hidden = true;
    }
    tickContainerStats();
}

function applyIconEdit(url) {
    const service = _iconEditTarget;
    if (!service) return;

    applyContainerChoice(service);

    const key = baseServiceKey(service.name);
    if (url === null) BROWSER_ICON_OVERRIDES.delete(key);
    else BROWSER_ICON_OVERRIDES.set(key, safeStr(url).trim());
    // Also clear any entry stored under the full display name.
    if (url === null) BROWSER_ICON_OVERRIDES.delete(safeStr(service.name).trim().toLowerCase());

    saveBrowserIconOverrides();

    const card = state.cardElById.get(String(service.id));
    if (card) renderCardIcon(card, service.name);

    const failed = url !== null && safeStr(url).trim() !== "" && _iconPreviewOk === false;
    closeIconEditor();

    if (url === null) toast(`↩️ <b>${escapeHtml(service.name)}</b> • Icon reset to default`, 2000);
    else if (failed) {
        toast(`⚠️ <b>${escapeHtml(service.name)}</b> • Saved, but that image would not load — the card shows the default icon.`, 4200);
    } else toast(`🖼️ <b>${escapeHtml(service.name)}</b> • Icon updated`, 2000);
}

els.iconUrlInput?.addEventListener("input", updateIconPreview);
els.iconPreviewImg?.addEventListener("load", () => {
    els.iconPreviewImg.style.display = "block";

    // With an empty field the preview is showing the bundled default, so keep
    // the "will use the default icon" message rather than claiming a load.
    if (!safeStr(els.iconUrlInput?.value).trim()) return;

    _iconPreviewOk = true;
    setIconStatus("ok", "Image loaded.");
});
els.iconPreviewImg?.addEventListener("error", () => {
    _iconPreviewOk = false;
    els.iconPreviewImg.style.display = "none";
    // Saying so beats silently falling back to the emoji and leaving the user
    // wondering why nothing happened.
    setIconStatus("error", "Could not load that image. Check the link, or that the host allows hotlinking. The card will show the default icon.");
});
els.btnIconSave?.addEventListener("click", () => applyIconEdit(els.iconUrlInput?.value ?? ""));
els.btnIconDefault?.addEventListener("click", () => applyIconEdit(null));
els.btnIconCancel?.addEventListener("click", closeIconEditor);
els.iconOverlay?.addEventListener("click", (event) => {
    if (event.target === els.iconOverlay) closeIconEditor();
});
els.iconUrlInput?.addEventListener("keydown", (event) => {
    if (event.key === "Enter") applyIconEdit(els.iconUrlInput.value);
});

/* =========================
               AUTH OVERLAY
               ========================= */
function openAuth() {
    els.overlay.classList.add("show");
    els.overlay.setAttribute("aria-hidden", "false");
    setTimeout(() => els.authUser.focus(), 60);
}
function closeAuth() {
    els.overlay.classList.remove("show");
    els.overlay.setAttribute("aria-hidden", "true");
}

els.btnCancel.addEventListener("click", closeAuth);
els.overlay.addEventListener("click", (e) => {
    if (e.target === els.overlay) closeAuth();
});

/* =========================
               LOAD + POLL (no flicker)
               ========================= */
async function loadKumaOrMock() {
    try {
        state.pageData = await fetchStatusPage();
        state.kumaConnected = true;
        els.kumaConn.textContent = "CONNECTED";
        els.kumaConn.style.color = "var(--online)";
        window.__kuma = { ok: true, status: "status page ready", at: new Date().toISOString(), error: null };
    } catch (e) {
        state.pageData = { publicGroupList: [] };
        state.kumaConnected = false;
        els.kumaConn.textContent = "OFFLINE";
        els.kumaConn.style.color = "var(--pending)";
        window.__kuma = {
            ok: false,
            status: "status page fetch failed",
            at: new Date().toISOString(),
            error: String(e?.message || e),
        };
        toast(`⚠️ <b>Uptime Kuma offline.</b> Could not reach <b>${escapeHtml(EP_STATUS)}</b>. Retrying automatically.`, 5200);
    }

    await pollOnce(true);
}

async function pollOnce(showToast) {
    els.pollDot.style.animationDuration = "1.2s";
    try {
        if (!state.kumaConnected) {
            state.pageData = await fetchStatusPage();
            state.kumaConnected = true;
            state.domBuilt = false;
            state.cardElById.clear();
                    els.groups.innerHTML = "";
            els.kumaConn.textContent = "CONNECTED";
            els.kumaConn.style.color = "var(--online)";
        }

        const hb = await fetchHeartbeat();

        state.heartbeat = hb;
        window.__kuma = { ok: true, status: "heartbeat ready", at: new Date().toISOString(), error: null };
        state.lastSync = new Date();
        els.lastSync.textContent = fmtTime(state.lastSync);

        buildServicesFromKuma();
        buildDomOnceIfNeeded();

        updateCardUrlsInPlace();
        updateStatusesInPlace();
        applyFiltersAndCounts();

        if (showToast) {
            toast(`🔄 <b>Synced.</b> Heartbeats updated at <b>${fmtTime(state.lastSync)}</b>.`, 2200);
        }
    } catch (e) {
        state.kumaConnected = false;
        els.kumaConn.textContent = "OFFLINE";
        els.kumaConn.style.color = "var(--pending)";
        window.__kuma = {
            ok: false,
            status: "poll failed",
            at: new Date().toISOString(),
            error: String(e?.message || e),
        };
        state.lastSync = new Date();
        els.lastSync.textContent = fmtTime(state.lastSync);
        if (showToast) {
            toast(`⚠️ <b>Sync failed.</b> ${escapeHtml(String(e.message || e))}`, 5200);
        }
    } finally {
        setTimeout(() => {
            els.pollDot.style.animationDuration = "1.6s";
        }, 300);
    }
}

/* =========================
               BOOT
               ========================= */
async function initialLoad() {
    // Sticky layout helpers (desktop): compute topbar height so the pinned left column can
    // sit neatly below it without guessing a hard-coded value.
    const syncStickyOffsets = () => {
        const topbar = document.querySelector(".topbar");
        if (!topbar) return;
        const h = Math.round(topbar.getBoundingClientRect().height || 0);
        document.documentElement.style.setProperty("--topbar-h", `${h}px`);
    };
    syncStickyOffsets();

    window.addEventListener(
        "resize",
        (() => {
            let t;
            return () => {
                clearTimeout(t);
                t = setTimeout(syncStickyOffsets, 120);
            };
        })(),
        { passive: true }
    );

    loadPrefs();
    updateLinkModeUI();

    els.lan?.addEventListener("click", () => copyNetworkAddress(els.lan, "LAN"));
    els.wan?.addEventListener("click", () => copyNetworkAddress(els.wan, "WAN"));

    els.linkModeToggle?.addEventListener("change", () => {
        setLinkMode(els.linkModeToggle.checked ? "external" : "local");

        toast(state.linkMode === "local" ? `🏠 Link mode: <b>Local</b>` : `🌐 Link mode: <b>External</b>`, 1400);
    });

    // ✅ Apply persisted theme + accent (and fix legacy data-accent="none")
    setTheme(state.theme);
    setAccent(state.accent || els.root.getAttribute("data-accent") || "aurora");

    updateLinkModeUI();

    els.btnLinkMode?.addEventListener("click", () => {
        setLinkMode(state.linkMode === "local" ? "external" : "local");
        toast(state.linkMode === "local" ? `🏠 Link mode: <b>Local</b>` : `🌐 Link mode: <b>External</b>`, 1600);
    });

    wireSections();
    els.notes.addEventListener("input", savePrefs);
    els.notes.addEventListener("input", () => autoResizeTextarea(els.notes));
    autoResizeTextarea(els.notes); // fit saved notes on load

    // Sidebar metrics: Netdata (preferred) with graceful fallback to mock animation.
    // A hidden tab cannot show the values, so skip the 2s poll while backgrounded
    // and take one fresh sample the moment the tab is looked at again.
    tickNetdata();
    setInterval(() => {
        if (document.visibilityState === "hidden") return;
        tickNetdata();
    }, NETDATA_POLL_MS);

    document.addEventListener(
        "visibilitychange",
        () => {
            if (document.visibilityState === "visible") tickNetdata();
        },
        { passive: true }
    );

    // Container stats move slowly and cost a request pair per mapped card.
    setInterval(tickContainerStats, CONTAINER_POLL_MS);

    // Network addresses change far less often than performance metrics.
    updateNetworkAddresses();
    setInterval(updateNetworkAddresses, 10 * 60 * 1000);

    // Accent cycler: click logo to switch
    els.logo?.addEventListener("click", cycleAccent);

    // Brand mark: only replace the glyph once the image has actually loaded.
    const logoImg = els.logo?.querySelector(".logoImg");
    if (logoImg && BRAND_LOGO) {
        logoImg.addEventListener("load", () => els.logo.classList.add("has-image"), { once: true });
        logoImg.addEventListener("error", () => logoImg.remove(), { once: true });
        logoImg.src = BRAND_LOGO;
        if (logoImg.complete && logoImg.naturalWidth > 0) els.logo.classList.add("has-image");
    }

    // keyboard shortcuts
    window.addEventListener("keydown", (e) => {
        if (e.key === "/" && document.activeElement !== els.q) {
            e.preventDefault();
            els.q.focus();
        }
        if (e.key.toLowerCase() === "a" && !e.metaKey && !e.ctrlKey && !e.altKey) {
            if (document.activeElement && ["INPUT", "TEXTAREA"].includes(document.activeElement.tagName)) return;
            openAuth();
        }
        if (e.key === "Escape") {
            closeAuth();
            closeIconEditor();
        }
        // ✅ Optional: press "T" to cycle accents
        if (e.key.toLowerCase() === "t" && !e.metaKey && !e.ctrlKey && !e.altKey) {
            if (document.activeElement && ["INPUT", "TEXTAREA"].includes(document.activeElement.tagName)) return;
            cycleAccent();
        }
        if (e.key.toLowerCase() === "l" && !e.metaKey && !e.ctrlKey) {
            setLinkMode(state.linkMode === "local" ? "external" : "local");
            toast(state.linkMode === "local" ? `🏠 Local links` : `🌐 External links`, 1200);
        }
    });

    // search
    els.q.value = state.query || "";
    els.q.addEventListener("input", () => {
        state.query = els.q.value || "";
        savePrefs();
        applyFiltersAndCounts();
    });

    // buttons
    els.btnTheme.addEventListener("click", () => setTheme(state.theme === "dark" ? "light" : "dark"));
    els.btnAuth.addEventListener("click", openAuth);
    els.btnLogout.addEventListener("click", doLogout);
    els.toastClose.addEventListener("click", () => els.toast.classList.remove("show"));
    // One handler only — a second listener here made every click poll twice.
    els.btnRefresh.addEventListener("click", () => {
        els.btnRefresh.classList.add("spinning");
        pollOnce(true);
        setTimeout(() => els.btnRefresh.classList.remove("spinning"), 500);
    });

    // auth modal defaults
    els.authUser.value = localStorage.getItem("ml_user") || "";
    els.authRemember.checked = (localStorage.getItem("ml_remember") || "no") === "yes";

    setUrlState("LOCKED");
    updateAuthButtons();

    // load Kuma
    await loadKumaOrMock();

    // start polling
    setInterval(() => pollOnce(false), POLL_MS);

    // socket keepalive
    setInterval(
        () => {
            if (state.socket && state.socket.connected && state.socketAuthed) {
                try {
                    state.socket.emit("getMonitorList");
                } catch {}
            }
        },
        5 * 60 * 1000
    );

    toast(
        isTouch
            ? `<span class="status-dot"></span><b>Service Dash online.</b> <br> <b>Tip:</b> Tap ⚡ to change accent`
            : `<span class="status-dot"></span><b>Service Dash online.</b> Tip: press <span class="kbd">/</span> to search. Click ⚡ to change accent.`,
        3600
    );

    // try token login in background (no modal)
    const token = localStorage.getItem("ml_token") || "";
    if (token) {
        const ok = await ensureSocket();
        if (ok) {
            await autoReauthAndLoadUrls("boot-token");
        }
    }
}

/* =========================
               AUTH SUBMIT
               ========================= */
els.btnConnect.addEventListener("click", async () => {
    const username = els.authUser.value.trim();
    const password = els.authPass.value;
    const token2fa = els.authTfa.value.trim();
    const remember = !!els.authRemember.checked;

    if (!username || !password) {
        toast(`⚠️ <b>Missing fields.</b> Enter username and password.`, 3200);
        return;
    }

    toast(`🔐 <b>Connecting…</b> Attempting Kuma login`, 2600);

    try {
        const res = await doLogin({
            username,
            password,
            token2fa,
            remember,
        });
        if (!res?.ok) {
            toast(`⚠️ <b>Login failed.</b> ${escapeHtml(res?.msg || "Check credentials / 2FA token")}`, 5200);
            return;
        }
        closeAuth();
        toast(`✨ <b>Authenticated.</b> Loading private URLs…`, 3200);
        try {
            state.socket.emit("getMonitorList");
        } catch {}
    } catch (e) {
        toast(`⚠️ <b>Socket.IO failed.</b> ${escapeHtml(String(e.message || e))}`, 5200);
    }
});

/* =========================
               GO!
               ========================= */
initialLoad();
const scrollBtn = document.getElementById("scrollTopBtn");

window.addEventListener("scroll", () => {
    if (window.scrollY > 240) {
        scrollBtn.classList.add("show");
    } else {
        scrollBtn.classList.remove("show");
    }
});

scrollBtn.addEventListener("click", () => {
    window.scrollTo({ top: 0, behavior: "smooth" });
});
// Date & Time Panel
(() => {
    const clockEl = document.getElementById("liveClock");
    const dateEl = document.getElementById("currentDate");
    const gridEl = document.getElementById("calendarGrid");
    const monthEl = document.getElementById("calendarMonth");

    const prevBtn = document.getElementById("prevMonth");
    const nextBtn = document.getElementById("nextMonth");

    let viewDate = new Date();

    const clockTimeEl = document.getElementById("clockTime");
    const clockMeridiemEl = document.getElementById("clockMeridiem");

    let lastMinuteKey = null;

    const calendarMonthEl = document.getElementById("calendarMonth");

    calendarMonthEl?.addEventListener("click", () => {
        viewDate = new Date();
        renderCalendar(viewDate);
    });

    function updateClock() {
        const now = new Date();

        // Build localized parts so AM/PM works and hides in 24h locales
        const parts = new Intl.DateTimeFormat(undefined, {
            hour: "numeric",
            minute: "2-digit",
        }).formatToParts(now);

        const hour = parts.find((p) => p.type === "hour")?.value ?? "";
        const minute = parts.find((p) => p.type === "minute")?.value ?? "";
        const dayPeriod = parts.find((p) => p.type === "dayPeriod")?.value ?? "";

        const timeStr = `${hour}:${minute}`;

        // Detect minute change for animation
        const minuteKey = `${now.getFullYear()}-${now.getMonth()}-${now.getDate()}-${hour}-${minute}`;
        const minuteChanged = lastMinuteKey !== null && minuteKey !== lastMinuteKey;
        lastMinuteKey = minuteKey;

        // Set time
        if (clockTimeEl) {
            if (minuteChanged) {
                // restart animation reliably
                clockTimeEl.classList.remove("minute-changed");
                void clockTimeEl.offsetWidth; // reflow to restart keyframes
            }
            clockTimeEl.textContent = timeStr;
            if (minuteChanged) clockTimeEl.classList.add("minute-changed");
        } else if (clockEl) {
            // fallback if you still reference clockEl somewhere
            clockEl.textContent = timeStr;
        }

        // Set AM/PM (hide if not provided, e.g., 24h locale)
        if (clockMeridiemEl) {
            if (!dayPeriod) {
                clockMeridiemEl.textContent = "";
                clockMeridiemEl.classList.add("is-hidden");
            } else {
                clockMeridiemEl.textContent = dayPeriod;
                clockMeridiemEl.classList.remove("is-hidden");
            }
        }

        // Current date (unchanged)
        dateEl.textContent = now.toLocaleDateString(undefined, {
            weekday: "long",
            year: "numeric",
            month: "long",
            day: "numeric",
        });
    }

    function renderCalendar(date) {
        gridEl.innerHTML = "";

        const year = date.getFullYear();
        const month = date.getMonth();
        const today = new Date();

        monthEl.textContent = date.toLocaleDateString(undefined, {
            month: "long",
            year: "numeric",
        });

        const firstDay = new Date(year, month, 1).getDay();
        const daysInMonth = new Date(year, month + 1, 0).getDate();

        // Empty cells
        for (let i = 0; i < firstDay; i++) {
            gridEl.appendChild(document.createElement("span"));
        }

        for (let d = 1; d <= daysInMonth; d++) {
            const cell = document.createElement("span");
            cell.textContent = d;

            if (d === today.getDate() && month === today.getMonth() && year === today.getFullYear()) {
                cell.classList.add("today");
            }

            gridEl.appendChild(cell);
        }
    }

    prevBtn.addEventListener("click", () => {
        viewDate.setMonth(viewDate.getMonth() - 1);
        renderCalendar(viewDate);
    });

    nextBtn.addEventListener("click", () => {
        viewDate.setMonth(viewDate.getMonth() + 1);
        renderCalendar(viewDate);
    });

    updateClock();
    renderCalendar(viewDate);
    setInterval(updateClock, 1000);
})();

function initMobileTopbarToggle() {
    const topbar = document.getElementById("topbar");
    const btn = document.querySelector(".mobile-menu-btn");
    if (!topbar || !btn) return;

    const OPEN_CLASS = "mobile-topbar-open";

    const setExpanded = (isOpen) => {
        btn.setAttribute("aria-expanded", isOpen ? "true" : "false");
    };

    const isOpen = () => document.body.classList.contains(OPEN_CLASS);

    const open = () => {
        document.body.classList.add(OPEN_CLASS);
        setExpanded(true);
    };

    const close = () => {
        document.body.classList.remove(OPEN_CLASS);
        setExpanded(false);
    };

    const toggle = () => {
        if (isOpen()) close();
        else open();
    };

    // Tap hamburger toggles the topbar
    const tapHaptic = () => {
        // Visual pulse (works everywhere)
        btn.classList.add("is-tapping");
        window.setTimeout(() => btn.classList.remove("is-tapping"), 110);

        // Physical haptic (Android/Chrome). Safely ignored elsewhere.
        if (navigator.vibrate) navigator.vibrate(10);
    };

    btn.addEventListener(
        "click",
        (e) => {
            e.preventDefault();
            tapHaptic();
            toggle();
        },
        { passive: false }
    );

    // Any vertical scroll action hides the topbar immediately (if visible)
    // Using passive listeners for perf.
    const hideOnScroll = () => {
        if (isOpen()) close();
    };

    window.addEventListener("scroll", hideOnScroll, { passive: true });
    window.addEventListener("touchmove", hideOnScroll, { passive: true });
}

// Call this wherever you already initialize your UI
document.addEventListener("DOMContentLoaded", () => {
    initMobileTopbarToggle();
    initGlobalHaptics();
});
