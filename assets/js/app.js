/*
 * Service Dash — a framework-free dashboard for Uptime Kuma.
 * Copyright (C) 2026 Chintan Vaghela
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with this program.  If not, see <https://www.gnu.org/licenses/>.
 *
 * Attribution notice (GPLv3 section 7b): the attribution shown in this
 * program's interface must be preserved in modified versions.
 */

/* =========================
CONFIG (edit for your setup)
========================= */

// Uptime Kuma Setup
// The release this page was served from. index.html cache-busts its assets with
// ?v=<version>, and scripts/check-release.py fails the build if that disagrees
// with the changelog -- so the running version can be read straight off the tag
// rather than plumbed through another environment variable. Empty when the page
// is served without one, and the About line simply omits it.
const APP_VERSION = (() => {
    try {
        const src = document.querySelector('script[src*="app.js"]')?.getAttribute("src") || "";
        return /[?&]v=([\w.-]+)/.exec(src)?.[1] || "";
    } catch {
        return "";
    }
})();

const RUNTIME_CONFIG = window.__DASHBOARD_CONFIG__ || {};
const KUMA_BASE = "/kuma";
const STATUS_SLUG = String(RUNTIME_CONFIG.statusSlug || "homelab");
// Only ever used to build the empty state's diagnostic command. A command
// naming the wrong port is worse than offering no command at all.
const KUMA_PORT = String(RUNTIME_CONFIG.kumaPort || "3001");
const STORAGE_MOUNT = String(RUNTIME_CONFIG.storageMount || "auto").trim();
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
// Anything unmatched (or any host without internet) falls back to the bundled mark.
// `label` is what the card-settings icon picker lists, so it doubles as the
// human name for the slug — keep one entry per icon.
const SERVICE_ICON_BASE = "https://cdn.jsdelivr.net/gh/selfhst/icons/png";
// Brand mark in the top bar. Defaults to the bundled Service Dash icon, so it
// needs no internet access; point it at any image URL to use your own. Falls
// back to the ⚡ glyph if the image cannot be loaded.
const BRAND_LOGO = "assets/img/service-dash-icon.png";
const SERVICE_ICONS = [
    { regex: /zimaos/i, slug: "zimaos", label: "ZimaOS" },
    { regex: /casaos/i, slug: "casaos", label: "CasaOS" },
    { regex: /home\s*assistant|hass/i, slug: "home-assistant", label: "Home Assistant" },
    { regex: /jellyseerr/i, slug: "jellyseerr", label: "Jellyseerr" },
    { regex: /overseerr/i, slug: "overseerr", label: "Overseerr" },
    { regex: /jellyfin/i, slug: "jellyfin", label: "Jellyfin" },
    { regex: /\bemby\b/i, slug: "emby", label: "Emby" },
    { regex: /\bplex\b/i, slug: "plex", label: "Plex" },
    { regex: /tautulli/i, slug: "tautulli", label: "Tautulli" },
    { regex: /prowlarr/i, slug: "prowlarr", label: "Prowlarr" },
    { regex: /radarr/i, slug: "radarr", label: "Radarr" },
    { regex: /sonarr/i, slug: "sonarr", label: "Sonarr" },
    { regex: /lidarr/i, slug: "lidarr", label: "Lidarr" },
    { regex: /readarr/i, slug: "readarr", label: "Readarr" },
    { regex: /bazarr/i, slug: "bazarr", label: "Bazarr" },
    { regex: /\bombi\b/i, slug: "ombi", label: "Ombi" },
    { regex: /sabnzbd/i, slug: "sabnzbd", label: "SABnzbd" },
    { regex: /qbittorrent/i, slug: "qbittorrent", label: "qBittorrent" },
    { regex: /otter\s*wiki/i, slug: "an-otter-wiki", label: "An Otter Wiki" },
    { regex: /bookstack/i, slug: "bookstack", label: "BookStack" },
    { regex: /stirling/i, slug: "stirling-pdf", label: "Stirling PDF" },
    { regex: /mealie/i, slug: "mealie", label: "Mealie" },
    { regex: /grafana/i, slug: "grafana", label: "Grafana" },
    { regex: /prometheus/i, slug: "prometheus", label: "Prometheus" },
    { regex: /uptime\s*kuma/i, slug: "uptime-kuma", label: "Uptime Kuma" },
    { regex: /netdata/i, slug: "netdata", label: "Netdata" },
    { regex: /portainer/i, slug: "portainer", label: "Portainer" },
    { regex: /nextcloud/i, slug: "nextcloud", label: "Nextcloud" },
    { regex: /syncthing/i, slug: "syncthing", label: "Syncthing" },
    { regex: /minio/i, slug: "minio", label: "MinIO" },
    { regex: /synology/i, slug: "synology", label: "Synology" },
    { regex: /node[-\s]?red/i, slug: "node-red", label: "Node-RED" },
    { regex: /mosquitto|mqtt/i, slug: "mosquitto", label: "Mosquitto" },
    { regex: /zigbee2mqtt/i, slug: "zigbee2mqtt", label: "Zigbee2MQTT" },
    { regex: /esphome/i, slug: "esphome", label: "ESPHome" },
    { regex: /it[-\s]?tools/i, slug: "it-tools", label: "IT-Tools" },
    { regex: /vaultwarden|bitwarden/i, slug: "vaultwarden", label: "Vaultwarden" },
    { regex: /adguard/i, slug: "adguard-home", label: "AdGuard Home" },
    { regex: /traefik/i, slug: "traefik", label: "Traefik" },
    { regex: /nginx\s*proxy\s*manager|\bnpm\b/i, slug: "nginx-proxy-manager", label: "Nginx Proxy Manager" },
    { regex: /immich/i, slug: "immich", label: "Immich" },
    { regex: /paperless/i, slug: "paperless-ngx", label: "Paperless-ngx" },
    { regex: /audiobookshelf/i, slug: "audiobookshelf", label: "Audiobookshelf" },
    { regex: /navidrome/i, slug: "navidrome", label: "Navidrome" },
    { regex: /duplicati/i, slug: "duplicati", label: "Duplicati" },
    { regex: /restic/i, slug: "restic", label: "Restic" },
    { regex: /homarr/i, slug: "homarr", label: "Homarr" },
    { regex: /heimdall/i, slug: "heimdall", label: "Heimdall" },
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
    // "auto" works out Local or External per card; "local" and "external"
    // force one. A document written before auto existed carries "local" or
    // "external" and is left exactly as it is -- an upgrade must not silently
    // start sending clicks somewhere else.
    linkMode: "auto",
    // Overrides remembered against the address they were made at. See
    // rememberLinkModeForOrigin().
    linkModeByOrigin: {},
    statusFilter: "all",
    categoryFilter: "all",
    query: "",

    pageData: null,
    heartbeat: null,
    // How many cards survive the current filters. Drives the empty state.
    visibleCount: 0,
    kumaConnected: false,
    lastSync: null,

    // socket auth/urls
    socket: null,
    socketReady: false,
    socketAuthed: false,
    // Seconds between network-address reads. The sidecar's own default applies
    // until somebody sets one here.
    networkRefreshSeconds: 600,
    // The Uptime Kuma session token, held in memory unless the user asked to be
    // remembered. It is what proves a settings write is allowed.
    kumaToken: "",
    monitorById: {},

    // derived
    services: [],

    // Whether a value is left unreadable until pointed at or tabbed to. Both
    // default on, which is what the dashboard did before the setting existed.
    //
    // The keys keep their original names on purpose: they are what is written
    // into the shared settings document, and renaming them would make every
    // saved document look like it had never set them. The labels in the dialog
    // say what actually happens; these say where the value is stored.
    blurCardLinks: true,
    blurNetworkAddresses: true,

    // The notes text, held here rather than read back out of the textarea:
    // while signed out the textarea is empty on purpose, and the stored notes
    // must survive that.
    notes: "",

    // render caching
    domBuilt: false,
    cardElById: new Map(),
};

const els = {
    root: document.documentElement,
    btnTheme: document.getElementById("btnTheme"),
    btnLinkMode: document.getElementById("btnLinkMode"),
    linkModeToggle: document.getElementById("linkModeToggle"),
    emptyState: document.getElementById("emptyState"),
    secAiUsage: document.getElementById("secAiUsage"),
    secAiDetail: document.getElementById("secAiDetail"),
    aiRows: document.getElementById("aiRows"),
    aiDetailGrid: document.getElementById("aiDetailGrid"),
    btnAuth: document.getElementById("btnAuth"),
    btnLogout: document.getElementById("btnLogout"),

    overlay: document.getElementById("overlay"),
    sideStack: document.querySelector(".side-stack"),
    iconOverlay: document.getElementById("iconOverlay"),
    iconServiceName: document.getElementById("iconServiceName"),
    iconUrlInput: document.getElementById("iconUrlInput"),
    iconPreviewImg: document.getElementById("iconPreviewImg"),
    iconPreviewEmoji: document.getElementById("iconPreviewEmoji"),
    iconPreview: document.getElementById("iconPreview"),
    iconStatus: document.getElementById("iconStatus"),
    iconSuggest: document.getElementById("iconSuggest"),
    settingsOverlay: document.getElementById("settingsOverlay"),
    aiSetupList: document.getElementById("aiSetupList"),
    setNetworkRefresh: document.getElementById("setNetworkRefresh"),
    setNetworkRefreshValue: document.getElementById("setNetworkRefreshValue"),
    setFixedSlug: document.getElementById("setFixedSlug"),
    setFixedMount: document.getElementById("setFixedMount"),
    aboutVersion: document.getElementById("aboutVersion"),
    setBlurCardLinks: document.getElementById("setBlurCardLinks"),
    setBlurNetworkAddresses: document.getElementById("setBlurNetworkAddresses"),
    settingsStatus: document.getElementById("settingsStatus"),
    btnSettings: document.getElementById("btnSettings"),
    btnSettingsSave: document.getElementById("btnSettingsSave"),
    btnSettingsClose: document.getElementById("btnSettingsClose"),
    containerPicker: document.getElementById("containerPicker"),
    containerSummary: document.getElementById("containerSummary"),
    containerOptions: document.getElementById("containerOptions"),
    containerHint: document.getElementById("containerHint"),
    btnIconSave: document.getElementById("btnIconSave"),
    btnIconCancel: document.getElementById("btnIconCancel"),
    btnIconDefault: document.getElementById("btnIconDefault"),
    btnCancel: document.getElementById("btnCancel"),
    btnConnect: document.getElementById("btnConnect"),

    authUser: document.getElementById("authUser"),
    authPass: document.getElementById("authPass"),
    authPassReveal: document.getElementById("authPassReveal"),
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
    notesLocked: document.getElementById("notesLocked"),
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
    // A few interactions a plain tap under-serves. Anything button-like is
    // already covered by initGlobalHaptics() below, which delegates on
    // pointerdown -- so only call hapticPattern() from somewhere that
    // delegation does not reach, or the element buzzes twice.
    patterns: {
        press: 18, // the long-press peek, which should feel heavier than a tap
        success: [10, 40, 10],
        warn: [20, 50, 20],
    },
};

function isCoarsePointer() {
    return window.matchMedia && window.matchMedia("(pointer: coarse)").matches;
}

function isIOS() {
    return /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;
}

function hapticTap(ms = HAPTICS.tapMs) {
    hapticFire(ms);
}

// Same gates as hapticTap, for the named patterns above.
function hapticPattern(name) {
    const pattern = HAPTICS.patterns[name];
    if (pattern !== undefined) hapticFire(pattern);
}

function hapticFire(pattern) {
    if (!HAPTICS.enabled) return;
    if (HAPTICS.coarseOnly && !isCoarsePointer()) return;

    // iOS: no vibration support on the web
    if (isIOS()) return;

    try {
        if (navigator.vibrate) navigator.vibrate(pattern);
    } catch {
        // A browser can expose vibrate() and still refuse the call -- a
        // backgrounded tab, a permissions policy. Feedback is a nicety and must
        // never be the thing that throws.
    }
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

// No single-key shortcut may fire while somebody is typing. Each one of them
// has been a bug at least once: "l" cycled the link mode from inside the search
// box, whose own placeholder suggests typing "plex", and "/" jumped focus out
// of the notes mid-sentence -- and because it calls preventDefault(), it ate
// the character on the way out. Checking it in one place is what stops the
// next shortcut from having to remember.
function isTypingTarget() {
    const el = document.activeElement;
    if (!el) return false;
    if (el.isContentEditable) return true;
    return ["INPUT", "TEXTAREA", "SELECT"].includes(el.tagName);
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

// baseServiceKey lowercases, because it is a matching key. The card title needs
// the same suffix removed but the author's capitalisation kept: a service with
// only a LAN monitor would otherwise be titled "Duplicati local", turning a
// pairing hint into part of the name.
function stripLocalSuffix(name) {
    let n = safeStr(name).trim().replace(/\s+/g, " ");
    n = n.replace(/\.local\s*$/i, "");
    n = n.replace(/\s*[\(\[\{]?\s*(?:-|\u2013|\u2014|:|_)?\s*local\s*[\)\]\}]?\s*$/i, "");
    return n.replace(/\s+/g, " ").trim() || safeStr(name).trim();
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

// The async Clipboard API needs a secure context, and most people reach this
// dashboard over plain HTTP on their LAN. The execCommand path is not legacy
// politeness -- it is the one that actually runs for them.
async function writeClipboard(text) {
    try {
        if (navigator.clipboard?.writeText) {
            await navigator.clipboard.writeText(text);
            return true;
        }
    } catch {
        // Denied or unavailable; fall through rather than give up.
    }
    const input = document.createElement("textarea");
    input.value = text;
    input.setAttribute("readonly", "");
    input.style.position = "fixed";
    input.style.opacity = "0";
    document.body.appendChild(input);
    input.select();
    const copied = document.execCommand("copy");
    input.remove();
    return copied;
}

async function copyNetworkAddress(element, label) {
    const address = String(element?.dataset.copyIp || "").trim();
    if (!isIpAddress(address)) {
        // Locked and unavailable are different problems, and only one of them
        // is something the reader can act on.
        if (!state.socketAuthed) {
            toast(`🔒 <b>${label} IP is hidden.</b> Sign in to Uptime Kuma to reveal it.`, 2600);
        } else {
            toast(`⚠️ <b>${label} IP is unavailable.</b>`, 2200);
        }
        return;
    }

    if (!(await writeClipboard(address))) {
        toast(`⚠️ <b>Could not copy ${label} IP.</b>`, 2200);
        return;
    }

    toast(`📋 <b>${label} IP copied:</b> ${escapeHtml(address)}`, 1800);
}

// LAN and WAN share the locked/private states with the card URLs. A real
// address is blurred until pointed at; "detecting…" and "unavailable" are not
// values worth hiding, so they show plainly.
function setNetworkAddressText(el, text, isRealAddress) {
    if (!el) return;
    setTextIfChanged(el, text);
    if (el.classList.contains("is-locked")) el.classList.remove("is-locked");
    const covered = isRealAddress && state.blurNetworkAddresses;
    if (el.classList.contains("is-private") !== covered) el.classList.toggle("is-private", covered);
    setAttrIfChanged(el, "aria-label", isRealAddress ? String(text) : `${text}`);
}

async function updateNetworkAddresses() {
    // Locked like the service URLs: the request is not made at all until you
    // are signed in, so the addresses never reach this browser to be read out
    // of the page.
    if (!state.socketAuthed) {
        applyLockedValue(els.lan, null, "Sign in to Uptime Kuma to reveal the LAN address", null, "IP Locked");
        applyLockedValue(els.wan, null, "Sign in to Uptime Kuma to reveal the public IP", null, "IP Locked");
        delete els.lan?.dataset.copyIp;
        delete els.wan?.dataset.copyIp;
        return;
    }

    if (els.lan) {
        setNetworkAddressText(els.lan, "detecting…", false);
        delete els.lan.dataset.copyIp;
        els.lan.title = "Reading the ZimaOS host network";
    }
    if (els.wan) {
        setNetworkAddressText(els.wan, "detecting…", false);
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
                setNetworkAddressText(els.lan, lanAddress, true);
                els.lan.dataset.copyIp = lanAddress;
                const interfaceLabel = lanInterface
                    ? friendlyNetworkInterfaceName(`net.${lanInterface}`)
                    : "Default host interface";
                els.lan.title = `${interfaceLabel}${Number.isInteger(prefix) ? ` • Subnet /${prefix}` : ""}${gateway ? ` • Gateway ${gateway}` : ""} • Click to copy`;
            } else {
                setNetworkAddressText(els.lan, "unavailable", false);
                delete els.lan.dataset.copyIp;
                els.lan.title = "No IPv4 address was found on the ZimaOS default route";
            }
        }

        const publicIp = String(payload?.wan?.address || "").trim();
        if (els.wan) {
            if (isIpAddress(publicIp)) {
                setNetworkAddressText(els.wan, publicIp, true);
                els.wan.dataset.copyIp = publicIp;
                els.wan.title = `Public IP • detected ${new Date().toLocaleTimeString()} • Click to copy`;
            } else {
                setNetworkAddressText(els.wan, "unavailable", false);
                delete els.wan.dataset.copyIp;
                els.wan.title = "Public IP lookup unavailable";
            }
        }
    } catch (error) {
        const message = String(error?.message || error);
        if (els.lan) {
            setNetworkAddressText(els.lan, "unavailable", false);
            delete els.lan.dataset.copyIp;
            els.lan.title = `Host LAN detection failed: ${message}`;
        }
        if (els.wan) {
            setNetworkAddressText(els.wan, "unavailable", false);
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
            scheduleSharedSettingsSave();
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

// One missed sample should not blank a reading. Netdata is polled every two
// seconds and any single fetch can fail or arrive stale -- a dropped packet, a
// busy host, a chart that momentarily has no fresh row. Blanking on the first
// miss is what makes CPU and RAM vanish and come back a few seconds later.
// The last good reading is held instead, and only gives way to "—" once the
// feed has genuinely been missing for this long.
const METRIC_GRACE_MS = 20000;
const _metricLastGood = new Map();

// Records that a reading arrived, starting the grace window for it.
// The per-poll update paths used to re-query the same handful of elements on
// every card, every time: the status dot, both endpoint dots, both uptime
// cells, both link rows and both URL spans. That is a tree walk per card per
// poll for nodes that never move. They are resolved once, when the card is
// built, and read from here afterwards.
const _cardRefs = new Map();

function cacheCardRefs(id, card) {
    _cardRefs.set(String(id), {
        card,
        statusDot: card.querySelector('[data-role="statusDot"]'),
        localDot: card.querySelector('[data-role="localDot"]'),
        externalDot: card.querySelector('[data-role="externalDot"]'),
        localUp: card.querySelector('[data-role="localUp"]'),
        externalUp: card.querySelector('[data-role="externalUp"]'),
        localLine: card.querySelector('[data-role="localLine"]'),
        externalLine: card.querySelector('[data-role="externalLine"]'),
        localUrlText: card.querySelector('[data-role="localUrlText"]'),
        externalUrlText: card.querySelector('[data-role="externalUrlText"]'),
        containerStats: card.querySelector('[data-role="containerStats"]'),
        containerCpu: card.querySelector('[data-role="containerCpu"]'),
        containerRam: card.querySelector('[data-role="containerRam"]'),
    });
}

// Falls back to resolving on demand, so a card built by any path still works
// rather than silently losing its updates.
function cardRefs(id, card) {
    const hit = _cardRefs.get(String(id));
    if (hit && hit.card === card) return hit;
    if (!card) return null;
    cacheCardRefs(id, card);
    return _cardRefs.get(String(id));
}

// A wheel delta can arrive in pixels, lines or pages depending on the device
// and platform; normalising it keeps one notch feeling the same everywhere.
function wheelDeltaPixels(event) {
    if (event.deltaMode === 1) return event.deltaY * 16; // lines
    if (event.deltaMode === 2) return event.deltaY * window.innerHeight; // pages
    return event.deltaY;
}

function markMetricGood(elVal) {
    const key = elVal?.id || elVal?.dataset?.role || null;
    if (key) _metricLastGood.set(key, { at: Date.now() });
}

// True when a reading has been missing long enough to be worth showing as
// unavailable, rather than holding the last good value a moment longer.
function setMetricShouldBlank(elVal) {
    if (!elVal) return false;
    const key = elVal.id || elVal.dataset?.role || null;
    if (!key) return true;
    const held = _metricLastGood.get(key);
    return !held || Date.now() - held.at >= METRIC_GRACE_MS;
}

function setMetric(elVal, elBar, pct, label) {
    const key = elVal?.id || elVal?.dataset?.role || null;
    const hasReading = Number.isFinite(Number(pct));
    const now = Date.now();

    if (!hasReading && key) {
        const held = _metricLastGood.get(key);
        // Inside the grace window, leave whatever is on screen exactly as it
        // is: no write, no repaint, no flicker.
        if (held && now - held.at < METRIC_GRACE_MS) return;
    }
    if (hasReading && key) _metricLastGood.set(key, { at: now });

    const p = clamp(Number(pct) || 0, 0, 100);
    const text = label ?? (hasReading ? `${p.toFixed(0)}%` : "—");
    const width = `${p.toFixed(0)}%`;

    // Writing an identical value still costs a style recalculation, and these
    // run every two seconds.
    if (elVal && elVal.textContent !== text) elVal.textContent = text;
    if (elBar && elBar.style.width !== width) elBar.style.width = width;
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

// One scale for every byte figure on the dashboard, so a 40 MB container and a
// 4 TB disk are written the same way and nothing is stuck reading "0.04 GB" or
// "3800000 MB". Sizes are 1024-based, matching what Netdata reports; the
// shorter KB/MB/GB labels are the ones the rest of the UI already uses.
function formatBytes(bytes) {
    // The disk readouts pass null to mean "no sample", and Number(null) is 0 —
    // which would report an unread volume as empty rather than unknown.
    if (bytes == null) return "—";

    const numeric = Number(bytes);
    if (!Number.isFinite(numeric)) return "—";

    const units = [
        { label: "TB", size: 1024 ** 4 },
        { label: "GB", size: 1024 ** 3 },
        { label: "MB", size: 1024 ** 2 },
        { label: "KB", size: 1024 },
        { label: "B", size: 1 },
    ];
    const selected = units.find((unit) => Math.abs(numeric) >= unit.size) || units[units.length - 1];
    const scaled = numeric / selected.size;
    // Whole bytes never need decimals; everything else keeps three significant
    // figures so the column width stays steady as values move between units.
    const digits = selected.size === 1 ? 0 : Math.abs(scaled) >= 100 ? 0 : Math.abs(scaled) >= 10 ? 1 : 2;
    return `${scaled.toFixed(digits)} ${selected.label}`;
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
    if (els.memTotal) els.memTotal.textContent = formatBytes(netdataValueToBytes(rTotal, ND_UNIT_RAM));

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
    if (els.diskUsed) els.diskUsed.textContent = formatBytes(validDiskSamples ? usedBytes : null);
    if (els.diskFree) els.diskFree.textContent = formatBytes(validDiskSamples ? freeBytes : null);
    if (els.diskTotal) els.diskTotal.textContent = formatBytes(validDiskSamples ? totalBytes : null);
    if (els.diskMount && diskNd?.kind === "diskBundle" && diskNd.errors?.length) {
        els.diskMount.title = `${ND_SELECTED_DISKS.map((option) => option.mount).join(" • ")} • Unavailable: ${diskNd.errors.join("; ")}`;
    }

    // ---- Load (1m) ----
    if (els.loadVal) {
        // Netdata system.load dims are typically: load1, load5, load15
        const load1 = getNdValue(loadNd, "load1");
        let normalizedLoadPercent = null;

        if (Number.isFinite(load1) && Number.isFinite(ND_CPU_COUNT) && ND_CPU_COUNT > 0) {
            markMetricGood(els.loadVal);
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
            markMetricGood(els.loadVal);
            els.loadVal.textContent = `${load1.toFixed(2)} load`;
            els.loadVal.title = "Raw 1-minute system load; logical CPU count was unavailable";
            els.loadVal.style.color = "var(--text)";
        } else if (setMetricShouldBlank(els.loadVal)) {
            els.loadVal.textContent = "—";
            els.loadVal.title = "Load data unavailable";
            els.loadVal.style.color = "var(--text)";
        }

        // A full bar means all logical CPUs are demanded. Values above 100%
        // remain visible in the label while the bar stays capped at full.
        // While a reading is being held through the grace window the bar is
        // left where it is, so it cannot empty out under a figure that stayed.
        if (Number.isFinite(normalizedLoadPercent)) {
            const width = `${Math.min(100, normalizedLoadPercent)}%`;
            if (els.loadBar && els.loadBar.style.width !== width) els.loadBar.style.width = width;
        } else if (setMetricShouldBlank(els.loadVal)) {
            if (els.loadBar && els.loadBar.style.width !== "0%") els.loadBar.style.width = "0%";
        }
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
        // Discovery reads the host's whole chart list, which on a busy host is
        // slow — and it runs again on every page load. CPU, RAM and load do not
        // depend on it: their chart ids are right by default. So start discovery
        // without waiting for it, and paint those three on the first tick
        // instead of leaving the panel blank until the list arrives.
        const discovery = initNetdataCharts().catch(() => {});
        if (_netdataChartsReady) await discovery;

        // Storage, network and the optional sensors DO depend on discovery —
        // reading them early would show the wrong volume or interface for a
        // moment. They fill in on the next tick.
        const discovered = _netdataChartsReady;

        const results = await Promise.allSettled([
            fetchNetdataChartOnce(ND_CHART_CPU),
            fetchNetdataChartOnce(ND_CHART_RAM),
            discovered ? fetchSelectedDiskBundle() : Promise.resolve(null),
            discovered
                ? fetchNetdataChartOnce(_netSelectedChart === "auto" ? ND_CHART_NET : _netSelectedChart)
                : Promise.resolve(null),
            fetchNetdataChartOnce(ND_CHART_LOAD),
            discovered && ND_CHART_CPU_POWER ? fetchNetdataChartOnce(ND_CHART_CPU_POWER) : Promise.resolve(null),
            discovered && ND_CHART_CPU_TEMP ? fetchNetdataChartOnce(ND_CHART_CPU_TEMP) : Promise.resolve(null),
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
            status: _netdataChartsReady
                ? `${liveCount}/5 fresh metric feeds`
                : `${liveCount}/5 fresh metric feeds (discovering charts)`,
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

        // Held through the same grace window as the other readings: a single
        // failed tick on a busy host should not empty the panel and refill it.
        if (setMetricShouldBlank(els.loadVal)) {
            els.loadVal.textContent = "—";
            els.loadVal.title = "Load data unavailable";
            els.loadVal.style.color = "var(--text)";
            if (els.loadBar) els.loadBar.style.width = "0%";
        }

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
        // One request pair per mapped container, and only for cards actually
        // mapped — a card mapped to three containers costs six queries a tick.
        const targets = state.services
            .map((service) => ({
                service,
                containers: containerForService(service.name).containers.filter((container) =>
                    ND_CONTAINERS.includes(container)
                ),
            }))
            .filter((target) => target.containers.length);

        await Promise.allSettled(
            targets.map(async ({ service, containers }) => {
                const samples = await Promise.all(
                    containers.map(async (container) => {
                        const [cpu, mem] = await Promise.allSettled([
                            fetchNetdataChartOnce(`cgroup_${container}.cpu`),
                            fetchNetdataChartOnce(`cgroup_${container}.mem_usage`),
                        ]);

                        const cpuNd = cpu.status === "fulfilled" ? cpu.value : null;
                        const memNd = mem.status === "fulfilled" ? mem.value : null;

                        // cgroup.cpu is split across user/system; mem_usage
                        // across ram/swap.
                        const cpuPct = sumNdRowExcluding(cpuNd, ["time"]);
                        const ramMib = getNdValue(memNd, "ram");

                        return {
                            container,
                            cpuPct: Number.isFinite(cpuPct) ? cpuPct : null,
                            ramMib: Number.isFinite(ramMib) ? ramMib : null,
                        };
                    })
                );

                // Containers that answered are summed; ones that did not are
                // reported instead of being silently counted as zero.
                const live = samples.filter((sample) => sample.cpuPct != null || sample.ramMib != null);
                const total = (key) =>
                    live.some((sample) => sample[key] != null)
                        ? live.reduce((sum, sample) => sum + (sample[key] ?? 0), 0)
                        : null;

                applyContainerStats(service, {
                    containers,
                    liveCount: live.length,
                    cpuPct: total("cpuPct"),
                    ramMib: total("ramMib"),
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
    const refs = card ? cardRefs(service.id, card) : null;
    const row = refs?.containerStats;
    if (!row) return;

    if (stats.cpuPct == null && stats.ramMib == null) {
        if (!row.hidden) row.hidden = true;
        return;
    }

    // These land every ten seconds on every card that maps to a container.
    // Rewriting an unchanged figure costs a style recalculation on a card that
    // carries a backdrop-filter, which is the periodic shimmer across the grid.
    const cpuEl = refs.containerCpu;
    const ramEl = refs.containerRam;
    if (cpuEl) setTextIfChanged(cpuEl, stats.cpuPct == null ? "—" : `${stats.cpuPct.toFixed(1)}%`);
    // cgroup mem_usage is reported in MiB; scale it like every other figure.
    if (ramEl) setTextIfChanged(ramEl, stats.ramMib == null ? "—" : formatBytes(stats.ramMib * 1024 ** 2));

    if (row.hidden) row.hidden = false;

    const containers = stats.containers ?? [];
    const missing = containers.length - (stats.liveCount ?? containers.length);
    setTitleIfChanged(
        row,
        containers.length > 1
            ? `Combined across ${containers.length} containers: ${containers.join(", ")}` +
              (missing > 0 ? ` — ${missing} not reporting` : "")
            : `Docker container: ${containers[0] ?? "—"}`
    );
    setDataIfChanged(row, "containerCount", String(containers.length));
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
        linkModeByOrigin: state.linkModeByOrigin,
        statusFilter: state.statusFilter,
        categoryFilter: state.categoryFilter,
        query: state.query,
        // Read by the network-info sidecar straight from the shared document,
        // so changing it here takes effect without recreating a container.
        networkRefreshSeconds: state.networkRefreshSeconds,
        blurCardLinks: state.blurCardLinks,
        blurNetworkAddresses: state.blurNetworkAddresses,
        // Never read from the textarea while it is locked: it is deliberately
        // empty then, and saving that would wipe the notes for every device.
        notes: (state.socketAuthed ? els.notes.value : state.notes) || "",
        calendarOpen: document.getElementById("secCalendar")?.getAttribute("data-open") === "true",

        // Whole metrics sidebar collapse state (Metrics + Network + Notes)
        metricsWrapOpen: document.getElementById("metricsSidebar")?.getAttribute("data-open") === "true",
    };
    localStorage.setItem("serviceDashPrefs", JSON.stringify(prefs));
    scheduleSharedSettingsSave();
}

function loadPrefs() {
    try {
        const raw = localStorage.getItem("serviceDashPrefs");
        if (!raw) return;
        const p = JSON.parse(raw);
        if (p.theme) state.theme = p.theme;
        if (p.accent) state.accent = normalizeAccent(p.accent); // ✅ NEW + legacy fix
        if (p.linkModeByOrigin && typeof p.linkModeByOrigin === "object") {
            for (const [origin, mode] of Object.entries(p.linkModeByOrigin)) {
                if (mode === "local" || mode === "external") state.linkModeByOrigin[origin] = mode;
            }
        }
        // An override made at this address wins outright. Otherwise the
        // document-wide mode is honoured only while no override has ever been
        // recorded -- which is exactly a document written before auto existed,
        // so upgrading changes nothing for anybody who already had a
        // preference. Once overrides exist, an address without one falls to
        // auto rather than inheriting a choice made somewhere it cannot work:
        // "Local", picked at http://192.168.1.50:8888, would otherwise still
        // be in force at https://dash.example.com and open a dead link.
        const forOrigin = state.linkModeByOrigin[location.origin];
        if (forOrigin) {
            state.linkMode = forOrigin;
        } else if (
            !Object.keys(state.linkModeByOrigin).length &&
            (p.linkMode === "local" || p.linkMode === "external")
        ) {
            state.linkMode = p.linkMode;
        }
        if (p.statusFilter) state.statusFilter = p.statusFilter;
        if (p.categoryFilter) state.categoryFilter = p.categoryFilter;
        if (typeof p.query === "string") state.query = p.query;
        if (Number.isFinite(Number(p.networkRefreshSeconds))) {
            state.networkRefreshSeconds = clampNetworkRefresh(p.networkRefreshSeconds);
        }
        // Absent means a document written before these existed, which should
        // keep behaving the way it did: covered.
        if (typeof p.blurCardLinks === "boolean") state.blurCardLinks = p.blurCardLinks;
        if (typeof p.blurNetworkAddresses === "boolean") state.blurNetworkAddresses = p.blurNetworkAddresses;
        if (typeof p.notes === "string") {
            state.notes = p.notes;
            // Only mirrored into the textarea when signed in; updateNotesLock()
            // puts it there on sign-in.
            if (state.socketAuthed) els.notes.value = p.notes;
        }
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

/* =========================
               WHERE THE VIEWER IS
               ========================= */

// Auto link mode answers one question: can this browser reach a LAN address?
//
// It is answered from the address bar rather than by testing the service,
// because the dashboard's own CSP ("connect-src 'self'", see
// nginx.conf.template) blocks a fetch to any service URL, and an unreachable
// LAN address would stall every card for the TCP timeout even if it did not.
// Reaching the dashboard at http://192.168.1.50:8888 is already proof that
// this browser routes to 192.168.1.50, so nothing has to be probed.
//
// The two possible mistakes cost very different amounts. Opening the public
// URL while sitting on the LAN still works -- the traffic just leaves the
// house and comes back. Opening the LAN URL from a cafe is a dead link. So
// "local" is only chosen on evidence, and anything unproven falls to
// "external".

function ipv4ToInt(host) {
    const parts = safeStr(host).split(".");
    if (parts.length !== 4) return null;
    let value = 0;
    for (const part of parts) {
        if (!/^\d{1,3}$/.test(part)) return null;
        const octet = Number(part);
        if (octet > 255) return null;
        value = value * 256 + octet;
    }
    return value;
}

// RFC1918, plus loopback and link-local. 100.64.0.0/10 is deliberately absent:
// carrier-grade NAT and Tailscale both live there, and an address in that
// range says nothing about whether the LAN is reachable.
const PRIVATE_V4_BLOCKS = [
    ["10.0.0.0", 8],
    ["172.16.0.0", 12],
    ["192.168.0.0", 16],
    ["169.254.0.0", 16],
    ["127.0.0.0", 8],
];

function isPrivateV4(host) {
    const value = ipv4ToInt(host);
    if (value === null) return false;
    return PRIVATE_V4_BLOCKS.some(([base, bits]) => {
        const mask = (-1 << (32 - bits)) >>> 0;
        return ((value & mask) >>> 0) === ((ipv4ToInt(base) & mask) >>> 0);
    });
}

function isPrivateV6(host) {
    const h = safeStr(host).toLowerCase();
    if (!h.includes(":")) return false;
    if (h === "::1") return true; // loopback
    if (/^fe[89ab]/.test(h)) return true; // fe80::/10 link-local
    if (/^f[cd]/.test(h)) return true; // fc00::/7 unique local
    return false;
}

// Suffixes a LAN hands out. A name with no dot at all is the same thing: a
// single-label host only resolves through a local resolver or mDNS.
const LOCAL_HOST_SUFFIXES = [
    ".local",
    ".lan",
    ".home",
    ".home.arpa",
    ".internal",
    ".localdomain",
    ".intranet",
];

function classifyHost(rawHost) {
    const host = safeStr(rawHost)
        .trim()
        .toLowerCase()
        .replace(/^\[|\]$/g, "")
        .replace(/\.$/, "");
    if (!host) return "unknown";
    if (host === "localhost" || host.endsWith(".localhost")) return "local";
    if (isPrivateV6(host)) return "local";
    if (ipv4ToInt(host) !== null) return isPrivateV4(host) ? "local" : "external";
    if (host.includes(":")) return "external"; // a public IPv6 literal
    if (LOCAL_HOST_SUFFIXES.some((suffix) => host.endsWith(suffix))) return "local";
    if (!host.includes(".")) return "local";
    return "external";
}

// The address bar cannot change without a reload, so this is settled once.
let _viewerLocality = null;

function viewerLocality() {
    if (!_viewerLocality) _viewerLocality = classifyHost(location.hostname);
    return _viewerLocality;
}

function urlHost(url) {
    const normalized = normalizeMaybeUrl(url);
    if (!normalized) return "";
    try {
        return new URL(normalized).hostname;
    } catch {
        return "";
    }
}

// Availability is decided by the caller, because the two callers disagree on
// purpose: the row hints go by which monitors exist, a click goes by which
// URLs are actually usable, and those differ while signed out.
function autoEndpointKind(card, hasLocal, hasExternal) {
    if (!hasLocal) return hasExternal ? "external" : "";
    if (!hasExternal) return "local";

    if (viewerLocality() !== "local") return "external";

    // On the LAN, but a "local" URL that is really a public name is still the
    // wrong link to prefer. This cannot catch a private address the browser
    // has no route to -- a Docker bridge address looks exactly like a LAN one
    // from here -- which is what the remembered override is for. Empty while
    // signed out, so this only ever narrows.
    const target = urlHost(card.dataset.localUrl || "");
    if (target && classifyHost(target) !== "local") return "external";

    // Kuma probes from the host rather than from here, so this cannot confirm
    // the link works -- only that it is already known not to.
    if (card.dataset.localId && card.dataset.externalId) {
        const localDown = statusForIdFromHeartbeat(card.dataset.localId) === "offline";
        const externalUp = statusForIdFromHeartbeat(card.dataset.externalId) === "online";
        if (localDown && externalUp) return "external";
    }

    return "local";
}

// The single place that turns the mode plus a card into "local" or "external".
// Both the row hint and the click go through here, so they cannot disagree.
function endpointKindFor(card, hasLocal, hasExternal) {
    if (state.linkMode === "local") return hasLocal ? "local" : hasExternal ? "external" : "";
    if (state.linkMode === "external") return hasExternal ? "external" : hasLocal ? "local" : "";
    return autoEndpointKind(card, hasLocal, hasExternal);
}

function normalizeLinkMode(mode) {
    return mode === "local" || mode === "external" ? mode : "auto";
}

const LINK_MODE_CYCLE = ["auto", "local", "external"];

const LINK_MODE_LABELS = {
    auto: {
        icon: "✨",
        title: "Auto — each card opens its Local or External address, whichever this browser can reach",
        aria: "Link mode: automatic",
    },
    local: { icon: "🏠", title: "Always open the Local (LAN) address", aria: "Link mode: local" },
    external: { icon: "🌐", title: "Always open the External (public) address", aria: "Link mode: external" },
};

function nextLinkMode() {
    const index = LINK_MODE_CYCLE.indexOf(state.linkMode);
    return LINK_MODE_CYCLE[(index + 1) % LINK_MODE_CYCLE.length];
}

function toastLinkMode() {
    if (state.linkMode === "auto") {
        toast(
            // No leading emoji: the toast already carries a static ✨ of its
            // own, so one here reads as a stutter -- "✨ ✨ Link mode".
            viewerLocality() === "local"
                ? `Link mode: <b>Auto</b> • this browser looks like it is <b>on the LAN</b>`
                : `Link mode: <b>Auto</b> • this browser looks like it is <b>away from the LAN</b>`,
            1800
        );
        return;
    }
    toast(state.linkMode === "local" ? `🏠 Link mode: <b>Local</b>` : `🌐 Link mode: <b>External</b>`, 1400);
}

// An override is remembered against the address it was made at. Choosing
// "Local" at http://192.168.1.50:8888 should not still be in force at
// https://dash.example.com, where a LAN link cannot resolve -- which is the
// one way a manual choice can strand somebody.
function rememberLinkModeForOrigin() {
    const origin = safeStr(location.origin);
    if (!origin || origin === "null") return;

    if (state.linkMode === "auto") delete state.linkModeByOrigin[origin];
    else state.linkModeByOrigin[origin] = state.linkMode;

    // Bounded, because this rides along in the shared settings document.
    // String keys keep insertion order, so this drops the oldest.
    const origins = Object.keys(state.linkModeByOrigin);
    for (const stale of origins.slice(0, Math.max(0, origins.length - 12))) {
        delete state.linkModeByOrigin[stale];
    }
}

function setLinkMode(mode) {
    state.linkMode = normalizeLinkMode(mode);
    rememberLinkModeForOrigin();
    savePrefs();
    updateLinkModeUI();
}

// Which endpoint a click will open is shown on the row itself, rather than as a
// separate line of text repeating what the toggle already says.
function markActiveEndpoint(card) {
    const hasLocal = !!card.dataset.localId;
    const hasExternal = !!card.dataset.externalId;
    const active = endpointKindFor(card, hasLocal, hasExternal);
    const activeTitle = activeEndpointTitle();

    const refs = cardRefs(card.dataset.id, card);
    for (const kind of ["local", "external"]) {
        const row = kind === "local" ? refs.localLine : refs.externalLine;
        if (!row) continue;
        setDataIfChanged(row, "active", String(active === kind));
        setTitleIfChanged(row, active === kind ? activeTitle : "");
    }
}

// Auto that guesses silently is worse than the manual toggle it replaces, so
// the row says what it decided on.
function activeEndpointTitle() {
    if (state.linkMode !== "auto") return "Clicking the card opens this link";
    return viewerLocality() === "local"
        ? `Clicking the card opens this link — auto, because ${location.hostname} is a LAN address`
        : `Clicking the card opens this link — auto, because ${location.hostname} is not a LAN address`;
}

function updateCardHintsInPlace() {
    for (const s of state.services) {
        const card = state.cardElById.get(String(s.id));
        if (card) markActiveEndpoint(card);
    }
}

function updateLinkModeUI() {
    if (!els.linkModeToggle) return;

    const mode = state.linkMode;
    const labels = LINK_MODE_LABELS[mode] || LINK_MODE_LABELS.auto;

    els.linkModeToggle.checked = mode === "external";
    // The third position rides on the checkbox's own indeterminate flag, so
    // the markup, the label and the tab order stay exactly as they were.
    els.linkModeToggle.indeterminate = mode === "auto";
    els.linkModeToggle.setAttribute("aria-label", labels.aria);

    const pill = els.linkModeToggle.closest(".linkModePill");
    if (pill) {
        setDataIfChanged(pill, "mode", mode);
        setTitleIfChanged(pill, labels.title);
    }

    const icon = els.linkModeToggle.closest(".link-toggle")?.querySelector(".modeIcon");
    if (icon) setTextIfChanged(icon, labels.icon);

    updateCardHintsInPlace();
}

/* =========================
   AI USAGE
   ========================= */

// Provider-agnostic on purpose. `windows` arrives as a labelled array rather
// than an object keyed by Claude's own window names, because those names are
// Claude's vocabulary -- Gemini reports daily quotas, Codex reports its own.
// Keyed to Claude, every new provider would need a UI change; as a labelled
// array the panel renders whatever a provider sends and a new one is backend
// work only.
//
// Reporters send absolute `resets_at` epochs, never countdowns, so every
// device renders its own clock and a figure pushed an hour ago still shows the
// right time remaining.

// One document per reporter. Two sidecars cannot share a file without a lock
// between containers, and a fetch that 404s already means exactly what an
// absent provider means, so the split costs nothing and removes the shared
// writer entirely.
const aiStatusUrl = (id) => `/ai-usage/${id}.json`;
const AI_POLL_MS = 60000;
const AI_STALE_MS = 15 * 60 * 1000;
const AI_DEAD_MS = 60 * 60 * 1000;

// Marks we ship. Anything else falls back to a monogram, so adding a provider
// never requires shipping an asset first.
const AI_PROVIDER_ICONS = {
    claude: "#ico-claude",
    codex: "#ico-codex",
    openai: "#ico-openai",
    gemini: "#ico-gemini",
};

let aiProviders = [];
// The panel only ever cares about connected providers, so it can treat "no
// reporter" and "reporter with nobody signed in" the same way. Settings cannot:
// those two need different instructions, and only the endpoint answering at
// all tells them apart.
// Keyed by provider id: with several reporters, "reachable" and "why not" are
// per-provider facts. One shared object would have let Codex being down
// describe Claude.
const AI_STATUS_UNKNOWN = { reachable: false, note: "", diagnostic: "", action: "sign-in" };
const aiStatusById = new Map();
const aiStatusFor = (id) => aiStatusById.get(id) || AI_STATUS_UNKNOWN;
// Providers whose sign-out command is currently revealed. Kept out of the
// status object because it is a UI state, not something the reporter knows --
// and it has to survive the poll, which re-renders this section every minute.
const aiSetupRevealed = new Set();

// One entry per provider the reporter can actually speak to. Codex and Gemini
// get a row here the day their sidecar lands, not before -- a row promising a
// sign-in that goes nowhere is worse than no row.
const AI_SETUP_PROVIDERS = [
    {
        id: "claude",
        label: "Claude",
        blurb: "Session and weekly plan limits, read from your Claude account.",
        // Both commands run from ANY directory, and neither needs anything
        // installed on the host beyond Docker itself.
        //
        // No --profile any more. The reporters ship as ordinary services that
        // idle until signed in, because profile gating never reached anyone
        // upgrading: a CasaOS app update rewrites image tags and does not add
        // services a release introduced. So "Not running" now means the
        // Compose file predates them, and a plain `up -d` is the fix once it
        // does not.
        //
        // A bare `docker compose` only works from the folder holding the
        // Compose file, and nobody remembers where that is six months later.
        // Compose stamps the file's path onto every container it creates, so
        // the dashboard's own container knows the answer and can be asked. If
        // it is not running the substitution is empty, `-f ""` fails cleanly,
        // and nothing is started in the wrong directory -- which a `cd` into an
        // empty string would happily do.
        //
        // `sudo` on both, verified against a real ZimaOS host rather than
        // assumed. Two separate things need it there and both are invisible
        // until you hit them: CasaOS writes that Compose file 0600 root:root
        // (it lives at /var/lib/casaos/apps/service-dash/docker-compose.yml,
        // which is also exactly the path nobody would have guessed), and a
        // ZimaOS user is not in the `docker` group by default, so even the
        // inner `docker inspect` is denied. Unprivileged, this fails with a
        // bare "permission denied" naming a file the reader has never heard
        // of. Harmless where it is not needed; the alternative is a dead end.
        enable:
            'sudo docker compose -f "$(sudo docker inspect service-dash --format ' +
            "'{{index .Config.Labels \"com.docker.compose.project.config_files\"}}')\" up -d",
        // Claude Code lives INSIDE the reporter image. This runs the container's
        // copy, so nothing has to be installed on the host, and addressing the
        // container by name means no Compose file is needed either.
        signIn: "sudo docker exec -it service-dash-claude-usage claude auth login",
        signOut: "sudo docker exec -it service-dash-claude-usage claude auth logout",
    },
    {
        id: "codex",
        label: "Codex",
        blurb: "Session and weekly plan limits, read from your ChatGPT account.",
        enable:
            'sudo docker compose -f "$(sudo docker inspect service-dash --format ' +
            "'{{index .Config.Labels \"com.docker.compose.project.config_files\"}}')\" up -d",
        // --device-auth, not a bare `codex login`. The default flow starts a
        // callback server on the container's own localhost and opens a browser
        // at it, which nothing outside the container can reach -- and it fails
        // by hanging rather than by saying so. Verified the hard way.
        signIn: "sudo docker exec -it service-dash-codex-usage codex login --device-auth",
        signOut: "sudo docker exec -it service-dash-codex-usage codex logout",
    },
    {
        // Listed, but with nothing to run. Gemini's usage endpoint exists and
        // is reachable; what is not solved is signing in to it from a headless
        // container, so there is no reporter to enable yet. Saying "coming
        // soon" is honest; offering a sign-in command that goes nowhere is not.
        id: "gemini",
        label: "Gemini",
        blurb: "Plan limits from your Google account.",
        comingSoon: true,
    },
];

function formatCountdown(epochSeconds) {
    // A window nobody has used yet has no reset time at all. Guard null
    // explicitly: Number(null) is 0, which is finite, so it survived the check
    // below and rendered as "now" -- a window that has never started claiming
    // it resets this second.
    if (epochSeconds === null || epochSeconds === undefined || epochSeconds === "") return "—";
    const ms = Number(epochSeconds) * 1000 - Date.now();
    if (!Number.isFinite(ms)) return "—";
    if (ms <= 0) return "now";

    const minutes = Math.floor(ms / 60000);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);

    // One unit below the leading one: "4d 6h" is useful, "4d 6h 12m" is noise
    // on a panel you glance at.
    if (days > 0) return `${days}d ${hours % 24}h`;
    if (hours > 0) return `${hours}h ${minutes % 60}m`;
    return `${minutes}m`;
}

function formatAgo(ms) {
    const minutes = Math.round(ms / 60000);
    if (minutes < 1) return "just now";
    if (minutes < 60) return `${minutes}m ago`;
    const hours = Math.round(minutes / 60);
    if (hours < 24) return `${hours}h ago`;
    return `${Math.round(hours / 24)}d ago`;
}

function aiAgeLabel(generatedAt) {
    const age = Date.now() - Number(generatedAt) * 1000;
    if (!Number.isFinite(age) || age < 0) return { text: "Updated just now", state: "fresh" };
    if (age > AI_DEAD_MS) return { text: `No report since ${formatAgo(age)} — figures may be behind`, state: "dead" };
    if (age > AI_STALE_MS) return { text: `Updated ${formatAgo(age)}`, state: "stale" };
    return { text: `Updated ${formatAgo(age)}`, state: "fresh" };
}

function usageLevel(percent) {
    return percent >= 90 ? "critical" : percent >= 75 ? "warn" : "ok";
}

function setBarWidth(el, percent) {
    if (!el) return;
    const width = `${clamp(Number(percent) || 0, 0, 100)}%`;
    if (el.style.width !== width) el.style.width = width;
    setDataIfChanged(el, "level", usageLevel(percent));
}

function usableWindows(provider) {
    const windows = Array.isArray(provider?.windows) ? provider.windows : [];
    return windows.filter((w) => Number.isFinite(Number(w?.used_percentage)));
}

function connectedProviders() {
    return aiProviders.filter((p) => p?.connected && usableWindows(p).length > 0);
}

function providerIconMarkup(provider) {
    const href = AI_PROVIDER_ICONS[String(provider.id || "").toLowerCase()];
    if (href) return `<svg viewBox="0 0 512 512" aria-hidden="true"><use href="${href}" /></svg>`;
    const initial = escapeHtml(String(provider.label || provider.id || "?").trim().charAt(0).toUpperCase());
    return `<b class="ai-monogram" aria-hidden="true">${initial}</b>`;
}

/* ---------- sidebar: one summary row per provider ---------- */

function renderAiRows(providers) {
    const host = els.aiRows;
    if (!host) return;

    const key = providers.map((p) => p.id).join("|");
    if (host.dataset.key !== key) {
        host.dataset.key = key;
        host.innerHTML = providers
            .map(
                (p) => `
            <button type="button" class="ai-row" data-provider="${escapeHtml(p.id)}">
                <span class="ai-row-icon">${providerIconMarkup(p)}</span>
                <span class="ai-row-name">${escapeHtml(p.label || p.id)}</span>
                <span class="ai-row-figure" data-role="figure">—</span>
            </button>`
            )
            .join("");
    }

    for (const provider of providers) {
        const row = host.querySelector(`[data-provider="${CSS.escape(provider.id)}"]`);
        if (!row) continue;
        const worst = tightestMeasure(provider);
        const pct = Math.round(Number(worst.used_percentage));
        setTextIfChanged(
            row.querySelector('[data-role="figure"]'),
            `${pct}% ${String(worst.label || "").toLowerCase()} · ${formatCountdown(worst.resets_at)}`
        );
        // Severity on the row itself, so a provider near its limit reads
        // without opening anything.
        setDataIfChanged(row, "level", usageLevel(pct));
    }
}

/* ---------- main column: the full picture, side by side ---------- */

function allMeasures(provider) {
    const models = Array.isArray(provider?.models) ? provider.models : [];
    return [...usableWindows(provider), ...models.filter((m) => Number.isFinite(Number(m?.used_percentage)))];
}

// The sidebar row is one line, so it has to choose: it reports whichever measure
// is closest to its limit, across windows and per-model limits alike. A 20%
// session is not the story when Opus sits at 81%. The detail card shows all of
// them and therefore chooses nothing.
function tightestMeasure(provider) {
    return allMeasures(provider).reduce(
        (worst, m) => (!worst || Number(m.used_percentage) > Number(worst.used_percentage) ? m : worst),
        null
    );
}

// Circumference of a dial arc: r=20 -> 2*pi*20.
const AI_DIAL_CIRCUMFERENCE = 125.66;

function renderAiDetail(providers) {
    const host = els.aiDetailGrid;
    if (!host) return;

    // Measures are drawn in the order the reporter sends them -- windows, then
    // per-model -- and never re-sorted. A fixed order means a row keeps its
    // position as the numbers move, so where a measure sits is something you
    // learn once. It also keeps ordering out of the urgency business: sorting
    // by depletion and sorting by time to reset genuinely disagree (a window
    // can have more left and still reset sooner), and neither can be computed
    // honestly from a snapshot. Severity colour carries urgency on its own.
    const key = providers.map((p) => `${p.id}:${allMeasures(p).map((m) => m.id).join(",")}`).join("|");

    if (host.dataset.key !== key) {
        host.dataset.key = key;
        host.innerHTML = providers
            .map(
                (p) => `
            <article class="ai-card" data-provider="${escapeHtml(p.id)}">
                <header class="ai-card-head">
                    <span class="ai-row-icon">${providerIconMarkup(p)}</span>
                    <h4>${escapeHtml(p.label || p.id)}</h4>
                    <span class="ai-plan" data-role="plan"></span>
                </header>

                <span class="ai-dials-label">Used</span>
                <div class="ai-dials">
                    ${allMeasures(p)
                        .map(
                            (m) => `
                    <div class="ai-dial" data-measure="${escapeHtml(String(m.id))}">
                        <div class="ai-dial-ring">
                            <svg viewBox="0 0 48 48" aria-hidden="true">
                                <circle class="ai-dial-track" cx="24" cy="24" r="20" />
                                <circle class="ai-dial-arc" cx="24" cy="24" r="20"
                                    stroke-dasharray="${AI_DIAL_CIRCUMFERENCE}" data-role="arc" />
                            </svg>
                            <b data-role="pct">—</b>
                        </div>
                        <span class="ai-dial-name">${escapeHtml(m.label || m.id)}</span>
                        <span class="ai-dial-reset" data-role="reset">—</span>
                    </div>`
                        )
                        .join("")}
                </div>

                <p class="subtle claude-age" data-role="age">—</p>
            </article>`
            )
            .join("");
    }

    for (const provider of providers) {
        const card = host.querySelector(`.ai-card[data-provider="${CSS.escape(provider.id)}"]`);
        if (!card) continue;

        const plan = card.querySelector('[data-role="plan"]');
        if (plan) {
            const hasPlan = Boolean(provider.plan);
            if (hasPlan) setTextIfChanged(plan, provider.plan);
            if (plan.hidden === hasPlan) plan.hidden = !hasPlan;
        }

        for (const measure of allMeasures(provider)) {
            const node = card.querySelector(`[data-measure="${CSS.escape(String(measure.id))}"]`);
            if (!node) continue;

            // The figure the provider itself reports: used, not remaining. A
            // dashboard that inverts it would leave you translating between two
            // numbers for the same fact.
            const pct = Math.round(Number(measure.used_percentage));
            setTextIfChanged(node.querySelector('[data-role="pct"]'), `${pct}%`);
            setTextIfChanged(node.querySelector('[data-role="reset"]'), formatCountdown(measure.resets_at));
            setDataIfChanged(node, "level", usageLevel(pct));

            const arc = node.querySelector('[data-role="arc"]');
            if (arc) {
                const offset = (AI_DIAL_CIRCUMFERENCE * (100 - clamp(pct, 0, 100))) / 100;
                const next = String(Math.round(offset * 100) / 100);
                if (arc.getAttribute("stroke-dashoffset") !== next) arc.setAttribute("stroke-dashoffset", next);
            }
        }

        const age = aiAgeLabel(provider.generatedAt);
        const ageEl = card.querySelector('[data-role="age"]');
        setTextIfChanged(ageEl, age.text);
        setDataIfChanged(ageEl, "state", age.state);
    }
}

function renderAiUsage() {
    const providers = connectedProviders();
    // Hidden while signed out, for the same reason the LAN and WAN addresses
    // and the card URLs are: how much of your plan you have spent, and which
    // plan you are on, is nobody else's business when this is on a wall.
    //
    // This is a screen-level control, not an access control -- the documents
    // stay fetchable by anyone who can reach the dashboard, exactly as
    // /network-info/status does. nginx cannot verify a Kuma session by itself,
    // and the one validator it does consult passes every read by design.
    const show = providers.length > 0 && !!state.socketAuthed;

    for (const section of [els.secAiUsage, els.secAiDetail]) {
        if (section && section.hidden === show) section.hidden = !show;
    }
    if (!show) return;

    renderAiRows(providers);
    renderAiDetail(providers);
}

/* ---------- settings: connecting a provider ---------- */

// Three states, and the difference between the first two is the whole point of
// this section: "not running" is a Compose change, "sign-in needed" is a one-off
// command in a container that is already up. Telling someone to run the second
// when they needed the first is how a five-minute setup becomes an evening.
// Opens GitHub's new-issue FORM, prefilled -- it does not file anything. The
// reader sees exactly what is being sent and presses the button themselves,
// which is the only sensible place to put that decision.
function aiIssueUrl(entry) {
    const aiStatus = aiStatusFor(entry.id);
    const body = [
        `The ${entry.label} usage reporter reached the API but could not read the response.`,
        "",
        `- Service Dash: ${APP_VERSION || "unknown"}`,
        `- Provider: ${entry.label} (\`${entry.id}\`)`,
        `- Reporter said: ${aiStatus.note || "(nothing)"}`,
        "",
        "Field names and window ids the reporter saw. No usage figures, no",
        "account details and no part of the login are included:",
        "",
        "```json",
        aiStatus.diagnostic || "(none — this reporter predates the diagnostic field)",
        "```",
    ].join("\n");

    const query = new URLSearchParams({
        title: `${entry.label} usage: unrecognised response shape`,
        labels: "ai-usage",
        body,
    });
    return `https://github.com/cvaghela/service-dash/issues/new?${query}`;
}

function aiSetupStateFor(entry) {
    if (entry.comingSoon) {
        return {
            state: "soon",
            label: "Coming soon",
            note: "",
            command: "",
            report: "",
        };
    }

    const aiStatus = aiStatusFor(entry.id);
    if (!aiStatus.reachable) {
        return {
            state: "off",
            label: "Not running",
            note: "This reporter is not in your stack. On a current install it should already be running, so your Compose file most likely predates it — take the latest one, then run this.",
            command: entry.enable,
        };
    }

    const provider = aiProviders.find((p) => p?.id === entry.id);
    if (provider?.connected) {
        const revealed = aiSetupRevealed.has(entry.id);
        return {
            state: "on",
            label: "Connected",
            plan: provider.plan || "",
            // Deliberately silent. The pill has said it, the panel is on the
            // dashboard behind this dialog, and a reassuring sentence under a
            // green badge is just something else to read. The way out is one
            // quiet button rather than a command sitting there permanently --
            // signing out is rare, and a connected account should not look
            // like it is asking to be disconnected.
            note: revealed
                ? "Signs out inside the container, and the panel disappears. The reporter keeps running, so signing back in is one command away. Swapping \u201cup -d\u201d for \u201cdown\u201d on the enable command removes it entirely."
                : "",
            command: revealed ? entry.signOut : "",
            signOut: revealed ? "Cancel" : "Sign out",
        };
    }

    // The reporter knows why better than we do -- an expired login and a login
    // that never happened read the same from here -- and it also says what,
    // if anything, the reader can do about it.
    const LABELS = { "sign-in": "Sign-in needed", report: "Needs attention", none: "Unavailable" };
    return {
        state: "wait",
        label: LABELS[aiStatus.action] || LABELS["sign-in"],
        note: aiStatus.note || "Sign in once, in the container. The login is kept in a volume, so it survives restarts.",
        command: aiStatus.action === "sign-in" ? entry.signIn : "",
        // Only for a response we could not read. A network blip is nobody's
        // bug, and an issue filed for one wastes the reporter's time and ours.
        report: aiStatus.action === "report" ? aiIssueUrl(entry) : "",
    };
}

function ensureAiSetupRows() {
    const host = els.aiSetupList;
    if (!host || host.childElementCount) return;

    host.innerHTML = AI_SETUP_PROVIDERS.map(
        (entry) => `
        <div class="setRow aiSetup" data-provider="${escapeHtml(entry.id)}">
            <div class="setRowText">
                <b>${escapeHtml(entry.label)}<span class="aiSetupPlan" hidden></span></b>
                <div class="subtle">${escapeHtml(entry.blurb)}</div>
            </div>
            <span class="aiSetupState" data-state="off">Not running</span>
            <div class="aiSetupAction" hidden>
                <div class="subtle aiSetupNote"></div>
                <div class="aiSetupCmd">
                    <!-- Sits ON the command rather than in the section footnote: it is only
                         true when there is a command, and it answers the two questions people
                         actually stall on -- where do I run this, and do I need to install
                         anything. -->
                    <span class="aiSetupCmdHint">Run on the host &middot; any folder &middot; nothing to install</span>
                    <code></code>
                    <button class="pill aiSetupCopy" type="button">Copy</button>
                </div>
                <a class="pill aiSetupReport" href="#" target="_blank" rel="noopener noreferrer" hidden>
                    Report this on GitHub
                </a>
                <button class="pill aiSetupSignOut" type="button" hidden></button>
            </div>
        </div>`,
    ).join("");

    host.addEventListener("click", (event) => {
        const toggle = event.target.closest(".aiSetupSignOut");
        if (!toggle) return;
        const id = toggle.closest(".aiSetup")?.dataset.provider;
        if (!id) return;
        if (aiSetupRevealed.has(id)) aiSetupRevealed.delete(id);
        else aiSetupRevealed.add(id);
        renderAiSettings();
    });

    host.addEventListener("click", async (event) => {
        const button = event.target.closest(".aiSetupCopy");
        if (!button) return;
        const command = button.closest(".aiSetupCmd")?.querySelector("code")?.textContent || "";
        if (!command) return;
        if (await writeClipboard(command)) toast("📋 <b>Command copied.</b> Run it on the host.", 2000);
        else toast("⚠️ <b>Could not copy the command.</b>", 2200);
    });
}

// Runs on every poll while settings is open, so nothing here may write
// unconditionally -- see the note on idempotence in the panel renderer.
function renderAiSettings() {
    if (!els.aiSetupList) return;
    ensureAiSetupRows();

    for (const entry of AI_SETUP_PROVIDERS) {
        const row = els.aiSetupList.querySelector(`.aiSetup[data-provider="${CSS.escape(entry.id)}"]`);
        if (!row) continue;

        const status = aiSetupStateFor(entry);
        const pill = row.querySelector(".aiSetupState");
        setTextIfChanged(pill, status.label);
        setDataIfChanged(pill, "state", status.state);

        const plan = row.querySelector(".aiSetupPlan");
        if (plan) {
            const hidePlan = !status.plan;
            if (plan.hidden !== hidePlan) plan.hidden = hidePlan;
            if (status.plan) setTextIfChanged(plan, status.plan);
        }

        const note = row.querySelector(".aiSetupNote");
        setTextIfChanged(note, status.note);

        // Connected has nothing to run, so the command block goes away rather
        // than sitting there inviting a pointless second sign-in.
        const cmd = row.querySelector(".aiSetupCmd");
        const hideCmd = !status.command;
        if (cmd && cmd.hidden !== hideCmd) cmd.hidden = hideCmd;
        if (status.command) setTextIfChanged(cmd?.querySelector("code"), status.command);

        // Nothing to say and nothing to run collapses the whole block.
        const report = row.querySelector(".aiSetupReport");
        if (report) {
            const hideReport = !status.report;
            if (report.hidden !== hideReport) report.hidden = hideReport;
            if (status.report && report.getAttribute("href") !== status.report) {
                report.setAttribute("href", status.report);
            }
        }

        const signOut = row.querySelector(".aiSetupSignOut");
        if (signOut) {
            const hideSignOut = !status.signOut;
            if (signOut.hidden !== hideSignOut) signOut.hidden = hideSignOut;
            if (status.signOut) setTextIfChanged(signOut, status.signOut);
        }

        const action = row.querySelector(".aiSetupAction");
        const hideAction = !status.note && !status.command && !status.report && !status.signOut;
        if (action && action.hidden !== hideAction) action.hidden = hideAction;
    }
}

async function refreshOneProvider(entry) {
    if (entry.comingSoon) return [];
    try {
        const response = await fetch(aiStatusUrl(entry.id), { cache: "no-store" });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const data = await response.json();
        aiStatusById.set(entry.id, {
            reachable: true,
            note: typeof data?.note === "string" ? data.note : "",
            diagnostic: typeof data?.diagnostic === "string" ? data.diagnostic : "",
            // "sign-in" the login command fixes it; "report" nothing you can
            // run fixes it; "none" wait, it is transient. A reporter too old to
            // send the field only ever meant sign-in.
            action: ["none", "report"].includes(data?.action) ? data.action : "sign-in",
        });
        return Array.isArray(data?.providers) ? data.providers : [];
    } catch {
        // Every reporter is optional, and its absence is the normal case for
        // anyone who has not enabled it. It must never surface as an error.
        aiStatusById.set(entry.id, { ...AI_STATUS_UNKNOWN });
        return [];
    }
}

async function refreshAiUsage() {
    // In parallel: one slow or absent reporter must not hold up the others.
    const results = await Promise.all(AI_SETUP_PROVIDERS.map(refreshOneProvider));
    aiProviders = results.flat();
    renderAiUsage();
    renderAiSettings();
}

function startAiUsage() {
    if (!els.secAiUsage && !els.secAiDetail) return;

    // A summary row opens the detail for that provider and takes you to it --
    // which is why the sidebar does not expand in place.
    els.aiRows?.addEventListener("click", (event) => {
        const row = event.target.closest(".ai-row");
        if (!row || !els.secAiDetail) return;
        // Re-opens it if it was collapsed by hand; a no-op otherwise.
        els.secAiDetail.setAttribute("data-open", "true");
        const card = els.aiDetailGrid?.querySelector(`.ai-card[data-provider="${CSS.escape(row.dataset.provider)}"]`);
        (card || els.secAiDetail).scrollIntoView({ behavior: "smooth", block: "center" });
    });

    refreshAiUsage();
    setInterval(refreshAiUsage, AI_POLL_MS);
    // The countdowns have to move without a new document.
    setInterval(renderAiUsage, 1000);
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
    // A saved interface can vanish — a container's veth goes away with it. The
    // dropdown used to fall back to Auto while the poller kept requesting the
    // dead chart, so the panel sat broken and Netdata logged a 404 every tick.
    const exists = _netSelectedChart === "auto" || _netChartChoices.some((c) => c.id === _netSelectedChart);
    if (!exists) {
        _netSelectedChart = "auto";
        // Corrected locally only: a passive viewer should not be asked to sign
        // in just because an interface disappeared.
        try {
            localStorage.setItem("netIface", "auto");
        } catch {}
    }
    els.netIface.value = _netSelectedChart;

    els.netIface.addEventListener(
        "change",
        () => {
            _netSelectedChart = els.netIface.value || "auto";
            try {
                localStorage.setItem("netIface", _netSelectedChart);
                scheduleSharedSettingsSave();
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

function loadBrowserIconOverrides() {
    const overrides = new Map();

    try {
        const stored = JSON.parse(localStorage.getItem(ICON_STORAGE_KEY) || "{}");
        if (!stored || typeof stored !== "object") return overrides;

        for (const [service, url] of Object.entries(stored)) {
            // "" is a real value: it pins a card to its monogram.
            overrides.set(safeStr(service).trim().toLowerCase(), safeStr(url).trim());
        }
    } catch {
        return new Map();
    }

    return overrides;
}

function saveBrowserIconOverrides() {
    try {
        localStorage.setItem(ICON_STORAGE_KEY, JSON.stringify(Object.fromEntries(BROWSER_ICON_OVERRIDES)));
        scheduleSharedSettingsSave();
    } catch {}
}

function iconUrlForSlug(slug) {
    return `${SERVICE_ICON_BASE}/${slug}.png`;
}

/* =========================
        ICON CATALOGUE
========================= */
// The list above is a curated head: it carries the aliases automatic matching
// needs ("hass", "npm") and decides precedence. The full selfh.st catalogue is
// ~2,900 icons, far more than any list worth hand-maintaining, so it is fetched
// at runtime and searched alongside. nginx proxies it at /icon-index, which is
// what keeps the page's connect-src on 'self'.
const ICON_INDEX_URL = "/icon-index";
const ICON_INDEX_CACHE_KEY = "iconIndex";
const ICON_INDEX_TTL_MS = 24 * 60 * 60 * 1000;

let ICON_INDEX = [];
let _iconIndexPromise = null;

function readCachedIconIndex() {
    try {
        const cached = JSON.parse(localStorage.getItem(ICON_INDEX_CACHE_KEY) || "null");
        if (!cached || !Array.isArray(cached.entries)) return null;
        if (!(Date.now() - Number(cached.savedAt) < ICON_INDEX_TTL_MS)) return null;
        return cached.entries;
    } catch {
        return null;
    }
}

function adoptIconIndex(entries) {
    // Anything already in the curated list keeps its entry, so its aliases and
    // ordering win over the generic catalogue row for the same icon.
    const curated = new Set(SERVICE_ICONS.map((entry) => entry.slug));
    ICON_INDEX = entries.filter((entry) => entry.slug && entry.label && !curated.has(entry.slug));
    return ICON_INDEX;
}

// Called when the icon editor opens and once at startup. Never blocks anything:
// a host with no internet keeps the curated list and the monograms.
function loadIconIndex() {
    if (_iconIndexPromise) return _iconIndexPromise;

    const cached = readCachedIconIndex();
    if (cached) {
        adoptIconIndex(cached);
        _iconIndexPromise = Promise.resolve(ICON_INDEX);
        return _iconIndexPromise;
    }

    _iconIndexPromise = (async () => {
        try {
            const res = await fetch(ICON_INDEX_URL, { cache: "no-store" });
            if (!res.ok) throw new Error(`HTTP ${res.status}`);

            const payload = await res.json();
            if (!Array.isArray(payload)) throw new Error("icon index is not a list");

            const entries = payload
                .filter((row) => row && row.PNG === "Yes")
                .map((row) => ({ label: safeStr(row.Name).trim(), slug: safeStr(row.Reference).trim() }))
                .filter((entry) => entry.label && entry.slug);

            adoptIconIndex(entries);
            try {
                localStorage.setItem(
                    ICON_INDEX_CACHE_KEY,
                    JSON.stringify({ savedAt: Date.now(), entries })
                );
            } catch {}

            return ICON_INDEX;
        } catch (error) {
            console.info("Icon catalogue unavailable; using the built-in list", error);
            return [];
        }
    })();

    return _iconIndexPromise;
}

// Cards render before the catalogue arrives, so any that fell back to a
// monogram get another chance once it does. Cards with a real icon are left
// alone — re-rendering them would flicker for no reason.
function refreshMonogramCards() {
    if (!ICON_INDEX.length || !state.services?.length) return;

    for (const service of state.services) {
        const card = state.cardElById.get(String(service.id));
        const img = card?.querySelector(".svcIconImg");
        if (!img || img.dataset.fallbackApplied !== "true") continue;
        if (!serviceIconUrl(service.name)) continue;
        renderCardIcon(card, service.name);
    }
}

function indexIconEntryFor(name) {
    if (!ICON_INDEX.length) return null;
    const wanted = normalizeForMatch(baseServiceKey(name));
    if (!wanted) return null;
    return ICON_INDEX.find((entry) => normalizeForMatch(entry.label) === wanted) || null;
}

/* =========================
        MONOGRAM ICONS
========================= */
// The last-resort icon for a card, drawn rather than fetched: the service's
// initials over a gradient keyed to its name. Beats a single shared mark —
// every card stays distinguishable when an icon is missing or a host is
// offline — and being a data URI it can never itself fail to load.
const _monogramCache = new Map();

function monogramInitials(name) {
    const words = safeStr(name)
        .replace(/\s*[([{][^)\]}]*[)\]}]\s*$/, "") // drop a trailing "(Local)"
        .split(/[\s\-_.]+/)
        .filter(Boolean);

    const letters = words
        .slice(0, 2)
        .map((word) => word[0])
        .join("")
        .toUpperCase();

    return letters || "?";
}

function monogramHue(name) {
    const text = safeStr(name).toLowerCase();
    let hash = 0;
    for (let i = 0; i < text.length; i++) hash = (hash * 31 + text.charCodeAt(i)) % 360;
    return hash;
}

function monogramIcon(name) {
    const key = safeStr(name).trim().toLowerCase();
    const cached = _monogramCache.get(key);
    if (cached) return cached;

    const letters = monogramInitials(name);
    const hue = monogramHue(key);
    const svg =
        `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" role="img">` +
        `<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1">` +
        `<stop offset="0" stop-color="hsl(${hue},82%,62%)"/>` +
        `<stop offset="1" stop-color="hsl(${(hue + 48) % 360},78%,48%)"/>` +
        `</linearGradient></defs>` +
        `<rect width="64" height="64" rx="16" fill="url(#g)"/>` +
        `<text x="32" y="41" text-anchor="middle" fill="#fff" fill-opacity=".95" ` +
        `font-family="Outfit, Inter, system-ui, sans-serif" ` +
        `font-size="${letters.length > 1 ? 25 : 32}" font-weight="700" letter-spacing="-.5">` +
        `${escapeHtml(letters)}</text></svg>`;

    const uri = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
    _monogramCache.set(key, uri);
    return uri;
}

// The catalogue entry a name matches on its own, before any override. The
// curated list is checked first because its patterns encode aliases the plain
// catalogue name cannot ("hass", "npm"); the full catalogue then covers
// everything else, which is most of what a homelab actually runs.
function serviceIconEntryFor(name) {
    return SERVICE_ICONS.find((entry) => entry.regex.test(safeStr(name))) || indexIconEntryFor(name) || null;
}

// The icon this service would get with no override at all.
function autoServiceIconUrl(name) {
    const match = serviceIconEntryFor(name);
    return match ? iconUrlForSlug(match.slug) : "";
}

// A pasted link is a link, not a search — the picker stays out of its way.
function looksLikeImageLink(text) {
    return /^(?:https?:|data:|blob:|\/|\.{1,2}\/)/i.test(safeStr(text).trim());
}

// Typed text matches an icon by its human label, its slug, or the same keyword
// pattern auto-matching uses — so "hass" finds Home Assistant.
function searchIconCatalog(query) {
    const q = safeStr(query).trim().toLowerCase();
    if (!q) return [];

    const scored = [];
    for (const entry of [...SERVICE_ICONS, ...ICON_INDEX]) {
        const label = entry.label.toLowerCase();
        const slug = entry.slug.toLowerCase();

        let score;
        if (label === q || slug === q) score = 100;
        else if (label.startsWith(q) || slug.startsWith(q)) score = 80;
        else if (label.includes(q) || slug.includes(q)) score = 60;
        else if (entry.regex && entry.regex.test(q)) score = 40;
        else continue;

        // A curated entry outranks the catalogue row it duplicates.
        scored.push({ entry, score: entry.regex ? score + 5 : score });
    }

    return scored
        .sort((a, b) => b.score - a.score || a.entry.label.localeCompare(b.entry.label))
        .slice(0, ICON_SUGGEST_LIMIT)
        .map((item) => item.entry);
}

// Whatever is in the field, turned into something storable: a link is kept as
// typed, a service name resolves to the icon it matches, and anything with no
// match becomes "" so the card falls back to its monogram.
function resolveIconInput(value) {
    const raw = safeStr(value).trim();
    if (!raw) return "";
    if (looksLikeImageLink(raw)) return raw;

    const match = searchIconCatalog(raw)[0];
    return match ? iconUrlForSlug(match.slug) : "";
}

function iconOverrideFor(name) {
    const key = safeStr(name).trim().toLowerCase();
    const baseKey = baseServiceKey(name);

    // Browser first, then the Compose default. An empty string is a real value
    // here — it is how a card is pinned back to its category emoji.
    const browser = BROWSER_ICON_OVERRIDES.get(key) ?? BROWSER_ICON_OVERRIDES.get(baseKey);
    if (browser !== undefined) return { source: "browser", url: browser };

    return { source: "auto", url: autoServiceIconUrl(name) };
}

// A card can be mapped to several containers, whose stats are added together.
// Entries written by 1.1.1 and earlier hold a single string; they are read as a
// one-item list, and "" still means "show no stats for this card".
function normalizeContainerList(value) {
    const list = Array.isArray(value) ? value : [value];
    const seen = new Set();

    for (const entry of list) {
        const name = safeStr(entry).trim();
        if (name) seen.add(name);
    }

    return [...seen];
}

function loadServiceContainers() {
    try {
        const stored = JSON.parse(localStorage.getItem(CONTAINER_STORAGE_KEY) || "{}");
        const map = new Map();
        for (const [service, containers] of Object.entries(stored)) {
            map.set(safeStr(service).trim().toLowerCase(), normalizeContainerList(containers));
        }
        return map;
    } catch {
        return new Map();
    }
}

function saveServiceContainers() {
    try {
        localStorage.setItem(CONTAINER_STORAGE_KEY, JSON.stringify(Object.fromEntries(SERVICE_CONTAINERS)));
        scheduleSharedSettingsSave();
    } catch {}
}

/* =========================
        SHARED SETTINGS
========================= */
// Customisations normally live in this browser's localStorage, which means a
// second browser or a phone starts from scratch. When the deployment enables
// SHARED_SETTINGS, the same values are mirrored to a JSON document the
// dashboard serves and accepts over WebDAV, so every browser and device sees
// the same dashboard.
const SHARED_SETTINGS_URL = "/settings/state.json";
// Everything a person customises, and nothing that identifies them: the Uptime
// Kuma token, username and remember flag stay in the browser that entered
// them and are never written to a document other devices can read.
const SHARED_KEYS = ["serviceDashPrefs", "serviceIcons", "serviceContainers", "storageMounts", "netIface"];
const SHARED_SAVE_DEBOUNCE_MS = 1200;
// Writing the shared document is authenticated; reading it is not. There is no
// separate password: the Uptime Kuma session already proves who you are, and
// nginx checks the token with Kuma before allowing the write. The token stays
// in this browser and is never written into the document every device reads.
const SETTINGS_TOKEN_HEADER = "X-Kuma-Token";

// Whether the deployment serves a settings document at all.
let _sharedSettingsAvailable = false;
// A failed write warns once, not once per keystroke.
let _sharedSettingsWarned = false;
let _sharedSaveTimer = null;
// Likewise for the nudge to sign in.
let _settingsAuthPrompted = false;
// Boot replays stored state and calls the same save paths; nothing is written
// back until it has finished, so a read-only visitor is never nudged to sign in
// merely for opening the page.
let _sharedSettingsReady = false;

function collectSharedSettings() {
    const values = {};
    for (const key of SHARED_KEYS) {
        const value = localStorage.getItem(key);
        if (value !== null) values[key] = value;
    }
    return { version: 1, savedAt: new Date().toISOString(), values };
}

function applySharedSettings(payload) {
    const values = payload?.values;
    if (!values || typeof values !== "object") return false;

    let applied = 0;
    for (const key of SHARED_KEYS) {
        // Values are stored as the same strings localStorage holds, so a
        // document written by a newer version cannot corrupt an older one.
        if (typeof values[key] !== "string") continue;
        try {
            localStorage.setItem(key, values[key]);
            applied++;
        } catch {}
    }
    return applied > 0;
}

async function loadSharedSettings() {
    try {
        const res = await fetch(SHARED_SETTINGS_URL, { cache: "no-store" });

        // Enabled but nothing saved yet — the first change here creates it.
        if (res.status === 404) {
            _sharedSettingsAvailable = true;
            return false;
        }
        if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText}`);

        const payload = await res.json();
        _sharedSettingsAvailable = true;
        if (!applySharedSettings(payload)) return false;

        // These were parsed from localStorage when the script loaded, before
        // the shared document arrived, so re-read them.
        BROWSER_ICON_OVERRIDES = loadBrowserIconOverrides();
        SERVICE_CONTAINERS = loadServiceContainers();
        return true;
    } catch (error) {
        console.info("Shared settings unavailable; using this browser's own copy", error);
        return false;
    }
}

// Called from every save path. Debounced, because typing in the notes field
// would otherwise mean one request per keystroke.
function scheduleSharedSettingsSave() {
    if (!_sharedSettingsAvailable || !_sharedSettingsReady) return;
    clearTimeout(_sharedSaveTimer);
    _sharedSaveTimer = setTimeout(saveSharedSettings, SHARED_SAVE_DEBOUNCE_MS);
}

async function saveSharedSettings() {
    if (!_sharedSettingsAvailable) return;

    const headers = { "Content-Type": "application/json" };
    if (state.kumaToken) headers[SETTINGS_TOKEN_HEADER] = state.kumaToken;

    try {
        const res = await fetch(SHARED_SETTINGS_URL, {
            method: "PUT",
            headers,
            body: JSON.stringify(collectSharedSettings()),
        });

        // Not signed in, or Kuma no longer accepts the token: point at the
        // Kuma login rather than silently dropping the change.
        if (res.status === 401) {
            promptKumaSignIn();
            return;
        }
        if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText}`);

        _sharedSettingsWarned = false;
    } catch (error) {
        // Once only: a read-only volume should not produce a toast on every
        // keystroke. This browser keeps working from its own storage.
        if (!_sharedSettingsWarned) {
            _sharedSettingsWarned = true;
            toast("⚠️ <b>Shared settings could not be saved.</b> This browser keeps its own copy.", 4600);
        }
        console.warn("Shared settings save failed", error);
    }
}

/* =========================
          SETTINGS
========================= */
// Bounded here and again in the sidecar. The floor keeps the public-IP lookup
// from being hammered; the ceiling keeps a typo from parking it for a year.
const NETWORK_REFRESH_MIN = 30;
const NETWORK_REFRESH_MAX = 86400;

function clampNetworkRefresh(value) {
    const seconds = Math.round(Number(value));
    if (!Number.isFinite(seconds)) return 600;
    return clamp(seconds, NETWORK_REFRESH_MIN, NETWORK_REFRESH_MAX);
}

function openSettings() {
    if (!els.settingsOverlay) return;
    // Guarded as well as hidden: the gear is the only way in today, and this
    // keeps that true if another one is ever added.
    if (!state.socketAuthed) {
        toast("🔒 <b>Settings are locked.</b> Sign in to Uptime Kuma to change them.", 2600);
        return;
    }

    if (els.setNetworkRefresh) {
        const steps = networkRefreshSteps();
        els.setNetworkRefresh.max = String(steps.length - 1);
        els.setNetworkRefresh.value = String(steps.indexOf(clampNetworkRefresh(state.networkRefreshSeconds)));
        showRefreshInterval(state.networkRefreshSeconds);
    }
    if (els.setBlurCardLinks) els.setBlurCardLinks.checked = !!state.blurCardLinks;
    if (els.setBlurNetworkAddresses) els.setBlurNetworkAddresses.checked = !!state.blurNetworkAddresses;
    // Now that Save closes the dialog, the previous visit's "Saved." would
    // still be sitting there when it is reopened.
    setSettingsStatus("idle", "");
    // These are read-only here, but worth showing rather than merely naming:
    // knowing the status page is "homelab" is the reason to look.
    if (els.setFixedSlug) setTextIfChanged(els.setFixedSlug, STATUS_SLUG);
    if (els.setFixedMount) setTextIfChanged(els.setFixedMount, STORAGE_MOUNT || "auto");

    // Shown only when it is actually known, rather than printing "unknown" at
    // someone who came here to find out.
    if (els.aboutVersion) {
        els.aboutVersion.hidden = !APP_VERSION;
        if (APP_VERSION) setTextIfChanged(els.aboutVersion, APP_VERSION);
    }

    // Opens quiet. The line under the dialog title already says these apply
    // everywhere, and a status that repeats it has nothing left to say when it
    // actually matters.
    setSettingsStatus("idle", "");

    // The reporter poll is a minute wide, and someone opening settings has
    // usually just run the sign-in command. Re-read rather than repaint state
    // that could be a minute old.
    refreshAiUsage();

    els.settingsOverlay.classList.add("show");
    els.settingsOverlay.setAttribute("aria-hidden", "false");
    setTimeout(() => els.setNetworkRefresh?.focus(), 60);
}

function closeSettings() {
    if (!els.settingsOverlay) return;
    els.settingsOverlay.classList.remove("show");
    els.settingsOverlay.setAttribute("aria-hidden", "true");
}

function setSettingsStatus(state_, message) {
    if (!els.settingsStatus) return;
    els.settingsStatus.dataset.state = state_;
    els.settingsStatus.textContent = message;
}

// Reapplies the cover to the addresses already on screen. updateNetworkAddresses()
// refetches, and its schedule is measured in minutes, so it is the wrong tool
// for a setting that should take effect the moment it is saved.
// The interval runs from 30 seconds to 24 hours -- a span of nearly 3,000x.
// A slider over that range linearly would spend half its travel between twelve
// and twenty-four hours and squeeze everything under five minutes into a few
// pixels, which is worse than typing a number. These are the intervals someone
// would actually pick, evenly spaced along the track, so every position on it
// is a sensible answer.
const NETWORK_REFRESH_STEPS = [30, 60, 120, 300, 600, 900, 1800, 3600, 7200, 21600, 43200, 86400];

// The steps for this session, which include whatever is currently stored even
// when it is not one of the presets -- a value set in Compose or edited into
// the document by hand still lands the handle exactly on itself, so opening
// the dialog and saving cannot quietly move it.
function networkRefreshSteps() {
    const current = clampNetworkRefresh(state.networkRefreshSeconds);
    const steps = NETWORK_REFRESH_STEPS.includes(current)
        ? NETWORK_REFRESH_STEPS.slice()
        : NETWORK_REFRESH_STEPS.concat(current);
    return steps.sort((a, b) => a - b);
}

function formatRefreshInterval(seconds) {
    const n = Number(seconds);
    if (!Number.isFinite(n)) return "—";
    if (n < 60) return `${n} second${n === 1 ? "" : "s"}`;
    if (n < 3600) {
        const m = n / 60;
        return Number.isInteger(m) ? `${m} minute${m === 1 ? "" : "s"}` : `${Math.round(n)} seconds`;
    }
    const h = n / 3600;
    return Number.isInteger(h) ? `${h} hour${h === 1 ? "" : "s"}` : `${(n / 60).toFixed(0)} minutes`;
}

// Reads the seconds the handle is currently sitting on.
function selectedRefreshSeconds() {
    const steps = networkRefreshSteps();
    const index = clamp(Number(els.setNetworkRefresh?.value ?? 0), 0, steps.length - 1);
    return steps[Math.round(index)];
}

function showRefreshInterval(seconds) {
    const label = formatRefreshInterval(seconds);
    if (els.setNetworkRefreshValue) setTextIfChanged(els.setNetworkRefreshValue, label);
    // The handle's position means nothing to a screen reader on its own.
    if (els.setNetworkRefresh) setAttrIfChanged(els.setNetworkRefresh, "aria-valuetext", label);
}

function applyNetworkAddressCover() {
    for (const el of [els.lan, els.wan]) {
        if (!el) continue;
        const isRealAddress = !!el.dataset.copyIp;
        const covered = isRealAddress && state.blurNetworkAddresses;
        if (el.classList.contains("is-private") !== covered) el.classList.toggle("is-private", covered);
    }
}

function saveSettings() {
    // A slider cannot be empty or out of range, so the parse and clamp errors
    // the number field needed are gone with it.
    const seconds = clampNetworkRefresh(selectedRefreshSeconds());

    state.networkRefreshSeconds = seconds;
    showRefreshInterval(seconds);
    if (els.setBlurCardLinks) state.blurCardLinks = !!els.setBlurCardLinks.checked;
    if (els.setBlurNetworkAddresses) state.blurNetworkAddresses = !!els.setBlurNetworkAddresses.checked;
    savePrefs();

    // Repaint straight away: waiting for the next poll to show a setting you
    // just changed reads as the change not having taken.
    if (state.domBuilt) updateCardUrlsInPlace();
    applyNetworkAddressCover();

    const notes = [];
    // savePrefs still keeps it in this browser; the save path raises the Kuma
    // sign-in itself.
    if (!state.socketAuthed) notes.push("Saved in this browser. Sign in to Uptime Kuma to share it.");

    // Saving closes the dialog, so the status line beside Save is gone before
    // it can be read. The feedback moves to a toast, which outlives the close --
    // dropping the signed-out caveat entirely would be the one message worth
    // keeping, since that save only reached this browser.
    if (notes.length) {
        hapticPattern("warn");
        setSettingsStatus("error", notes.join(" "));
        toast(`⚠️ ${notes.join(" ")}`, 5200);
    } else {
        hapticPattern("success");
        setSettingsStatus("ok", "Saved.");
        toast("✅ <b>Settings saved.</b>", 2400);
    }

    closeSettings();
}

els.btnSettings?.addEventListener("click", openSettings);
els.btnSettingsClose?.addEventListener("click", closeSettings);
els.btnSettingsSave?.addEventListener("click", saveSettings);
els.settingsOverlay?.addEventListener("click", (event) => {
    if (event.target === els.settingsOverlay) closeSettings();
});
els.setNetworkRefresh?.addEventListener("input", () => showRefreshInterval(selectedRefreshSeconds()));
els.setNetworkRefresh?.addEventListener("keydown", (event) => {
    // Arrow keys move the handle; Enter still means "save", as it did in the
    // field this replaced.
    if (event.key === "Enter") saveSettings();
});

/* ---- shared settings unlock ---- */

// One nudge per session: a change made while signed out should say so once,
// not reopen a dialog on every keystroke in the notes field.
function promptKumaSignIn() {
    if (_settingsAuthPrompted) return;
    _settingsAuthPrompted = true;

    toast(
        "🔒 <b>Sign in to Uptime Kuma to save settings.</b> Changes stay in this browser until you do.",
        5200
    );
    openAuth();
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
    // An empty list is a real choice here: it means "show no stats for this
    // card", as distinct from having made no choice at all.
    const chosen = SERVICE_CONTAINERS.get(baseServiceKey(name));
    if (chosen !== undefined) return { source: "chosen", containers: chosen };

    const auto = autoContainerFor(name);
    return { source: "auto", containers: auto ? [auto] : [] };
}

function serviceIconUrl(name) {
    return iconOverrideFor(name).url;
}

// Used at build time and again after an edit, so both paths behave identically.
// Every card shows an image: the resolved icon if there is one, otherwise a
// monogram drawn from the service name. A broken link falls back to the same
// monogram.
function renderCardIcon(card, name) {
    const tile = card.querySelector(".svcIcon");
    if (!tile) return;

    const fallback = monogramIcon(name);
    const url = serviceIconUrl(name) || fallback;
    tile.innerHTML = "";

    const img = document.createElement("img");
    img.className = "svcIconImg";
    img.alt = "";
    img.decoding = "async";

    img.addEventListener("error", () => {
        // One retry with the monogram, then stop — no infinite loop if the
        // fallback itself is somehow missing.
        if (img.dataset.fallbackApplied === "true") return;
        img.dataset.fallbackApplied = "true";
        img.src = fallback;
    });

    tile.appendChild(img);
    img.src = url;
    if (url === fallback) img.dataset.fallbackApplied = "true";
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

// Notes follow the same rule as the service URLs: readable and editable once
// signed in, covered before that. The textarea is emptied rather than merely
// disabled, so the text is not sitting in the DOM for anyone to read off the
// page, and state.notes keeps the real value so saving cannot lose it.
//
// Worth being precise about what this is: the shared settings document is
// readable without signing in, by design, so this hides the notes from the
// page -- it is not a secret store. Anything that must not be read by a
// visitor does not belong in it.
function updateNotesLock() {
    if (!els.notes) return;
    const authed = !!state.socketAuthed;

    els.notes.hidden = !authed;
    els.notes.disabled = !authed;
    if (els.notesLocked) els.notesLocked.hidden = authed;

    if (authed) {
        if (els.notes.value !== (state.notes || "")) els.notes.value = state.notes || "";
        autoResizeTextarea(els.notes);
    } else if (els.notes.value !== "") {
        els.notes.value = "";
    }
}

// Showing a button clears the inline display rather than setting one, so the
// stylesheet decides how it lays out. The two kinds here disagree: .pill is
// display:flex, but .iconbtn centres its glyph with display:grid and
// place-items:center, so forcing "flex" on the gear left it aligned to the
// start of its own circle instead of the middle of it.
function setButtonShown(el, shown) {
    if (!el) return;
    if (shown) el.style.removeProperty("display");
    else el.style.display = "none";
}

function updateAuthButtons() {
    const authed = !!state.socketAuthed;

    // Signing in reveals the addresses; signing out hides them again, without
    // waiting for the next poll.
    updateNetworkAddresses();
    updateNotesLock();
    renderAiUsage();
    if (state.domBuilt) updateCardUrlsInPlace();

    // Show Logout only when authenticated
    setButtonShown(els.btnLogout, authed);

    // Hide Unlock URLs once authenticated
    setButtonShown(els.btnAuth, !authed);

    // Settings are only changeable while signed in -- the write is refused
    // otherwise -- so offering the gear to a signed-out visitor only leads to a
    // dialog whose Save cannot work. Hidden rather than disabled: there is
    // nothing here for them to come back to until they sign in.
    setButtonShown(els.btnSettings, authed);
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
                        state.kumaToken = token;
                        state.socketAuthed = true;
                        updateAuthButtons();
                        setUrlState("authenticated");
                        try {
                            state.socket.emit("getMonitorList");
                        } catch {}
                        resolve(true);
                    } else {
                        localStorage.removeItem("ml_token");
                        state.kumaToken = "";
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

                // Held for this session either way: saving settings needs
                // it, and asking for a Kuma login on every save would defeat
                // the point of using that login. "Remember me" still decides
                // whether it outlives the tab.
                state.kumaToken = res.token || "";
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
    state.kumaToken = "";
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
                // A local monitor's name carries a suffix that is not part of
                // the service's name. An external one, seen later, still wins.
                nameBase: isLocal ? stripLocalSuffix(m.name) : m.name,
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

// The markup last written, so an unchanged chip row is not rebuilt.
let _lastStatusChipMarkup = null;
let _lastCategoryChipMarkup = null;

function renderChipsWithCounts() {
    const qLower = safeStr(state.query).trim().toLowerCase();
    // Must use the same haystack as serviceMatchesFilters(), otherwise the chip
    // counts and the visible cards disagree — most visibly when searching a URL.
    const servicesBySearch = state.services.filter((s) => serviceMatchesFilters(s, qLower, "all", "all"));
    const counts = computeCounts(servicesBySearch);

    const statuses = ["all", "online", "offline", "pending", "maintenance"];
    const statusMarkup = statuses
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

    const categoryMarkup = list
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

    // Rebuilding these every poll is what makes the whole header flicker and
    // the layout settle again a moment later. The counts usually have not
    // moved, so the markup is compared first and the DOM left alone when it
    // matches -- which also keeps the existing chip listeners alive.
    const statusChanged = _lastStatusChipMarkup !== statusMarkup;
    const categoryChanged = _lastCategoryChipMarkup !== categoryMarkup;
    if (!statusChanged && !categoryChanged) {
        // Still reconcile the active chip: a filter can change without moving
        // any count.
        updateChipActiveStates();
        return;
    }

    if (statusChanged) {
        _lastStatusChipMarkup = statusMarkup;
        els.statusChips.innerHTML = statusMarkup;
    }
    if (categoryChanged) {
        _lastCategoryChipMarkup = categoryMarkup;
        els.categoryChips.innerHTML = categoryMarkup;
    }

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
    _cardRefs.clear();

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
                  <span class="linkUrl is-locked" data-role="localUrlText" aria-label="Hidden until you sign in to Uptime Kuma">URL Locked</span>
                  <span class="linkMeta" data-role="localUp">—</span>
                </div>
                <div class="linkLine" data-role="externalLine">
                  <span class="miniDot" data-role="externalDot" data-status="pending"></span>
                  <span class="linkBadge">External</span>
                  <span class="linkUrl is-locked" data-role="externalUrlText" aria-label="Hidden until you sign in to Uptime Kuma">URL Locked</span>
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
                hapticPattern("warn");
                toast(
                    `🔒 <b>${escapeHtml(name)}</b> • URLs are hidden. Sign in to Uptime Kuma to reveal them.`,
                    2600
                );
                return;
            }

            // Same decision the row hint shows, from the same function, so
            // the card cannot advertise one endpoint and open the other.
            const kind = endpointKindFor(card, usableLocal, usableExt);
            const chosenUrl = kind === "local" ? localUrl : kind === "external" ? extUrl : "";
            const chosenLabel = kind === "local" ? "Local" : "External";

            const ok = openUrlNow(chosenUrl);
            if (!ok) {
                hapticPattern("warn");
                toast(`⚠️ <b>${escapeHtml(name)}</b> • No URL to open`, 2200);
                return;
            }
            hapticTap();

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
                        hapticPattern("warn");
                        toast(`🔒 <b>${escapeHtml(name)}</b> • Local URL unavailable`, 2200);
                        return;
                    }

                    hapticPattern("press");
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
        // Cached after the unused endpoint rows are removed just above, so the
        // cache never holds a detached node.
        cacheCardRefs(s.id, card);
    }

    state.domBuilt = true;
}

// Anything only a signed-in user should read — service URLs, and the host's
// LAN and WAN addresses — has two states, and they protect against different
// things.
//
// Signed out, there is no value to show: the request is never made, so nothing
// reaches this browser to be read out of the page. That state says so in words
// rather than hiding an empty string behind a blur, which would only look like
// there was something to reveal.
//
// Signed in, the real value is present and is blurred until pointed at. That is
// shoulder-surfing cover for a screen someone else can see, not a security
// boundary — anyone signed in can reveal it, and that is the point.
const LOCKED_LABEL = "URL Locked";

// Writing to the DOM when nothing changed still costs a style recalculation and
// a repaint, and these run for every card on every poll. Blurred text repaints
// expensively, so an unchanged card is left completely untouched.
function setTextIfChanged(el, text) {
    if (el.textContent !== text) el.textContent = text;
}

function setAttrIfChanged(el, name, value) {
    if (el.getAttribute(name) !== value) el.setAttribute(name, value);
}

function setDataIfChanged(el, key, value) {
    if (!el) return;
    const next = String(value);
    if (el.dataset[key] !== next) el.dataset[key] = next;
}

function setTitleIfChanged(el, title) {
    if (el && el.title !== title) el.title = title;
}

function applyLockedValue(el, value, lockedTitle, unlockedTitle, lockedLabel) {
    if (!el) return;

    const locked = !value;
    const label = lockedLabel || LOCKED_LABEL;

    setTextIfChanged(el, locked ? label : String(value));
    // Two distinct looks: a plain "locked" label, or the real value under a
    // blur that lifts on hover and on keyboard focus.
    // The lock is not negotiable -- there is nothing to show. The cover over a
    // revealed value is, and is what the setting turns off.
    const covered = !locked && state.blurCardLinks;
    if (el.classList.contains("is-locked") !== locked) el.classList.toggle("is-locked", locked);
    if (el.classList.contains("is-private") !== covered) el.classList.toggle("is-private", covered);

    // A blur says nothing to a screen reader, and neither state should force
    // one to guess: locked states say so, revealed ones read out the value.
    setAttrIfChanged(el, "aria-label", locked ? "Hidden until you sign in to Uptime Kuma" : String(value));

    const title = locked ? lockedTitle : unlockedTitle || String(value);
    if (el.title !== title) el.title = title;
    return !locked;
}

function updateCardUrlsInPlace() {
    // Gated on the session, not merely on whether a URL happens to be known --
    // the same test updateNetworkAddresses() applies to the LAN and WAN
    // addresses. In practice Uptime Kuma only sends the monitor list to an
    // authenticated socket, so this was equivalent; relying on the server not
    // to send something is a weaker guarantee than not displaying it, and the
    // two locked surfaces should not disagree about what locked means.
    const authed = !!state.socketAuthed;

    for (const s of state.services) {
        const card = state.cardElById.get(String(s.id));
        if (!card) continue;

        const localId = card.dataset.localId || "";
        const extId = card.dataset.externalId || "";

        const localUrl = authed && localId ? urlForMonitor(localId) : null;
        const extUrl = authed && extId ? urlForMonitor(extId) : null;

        // Store on card dataset (used by click + filtering)
        setDataIfChanged(card, "localUrl", localUrl || "");
        setDataIfChanged(card, "externalUrl", extUrl || "");

        // Hidden flags
        setDataIfChanged(card, "localUrlHidden", localUrl ? "false" : "true");
        setDataIfChanged(card, "externalUrlHidden", extUrl ? "false" : "true");

        // Also attach to service (for searching)
        s._localUrl = localUrl || "";
        s._externalUrl = extUrl || "";

        const refs = cardRefs(s.id, card);
        const localText = refs.localUrlText;
        const extText = refs.externalUrlText;

        // Signed in with nothing to show is not the same as locked: the monitor
        // simply has no URL, and saying "locked" would send someone looking for
        // a sign-in that would not help.
        const emptyLabel = state.socketAuthed ? "No URL" : LOCKED_LABEL;
        const emptyTitle = state.socketAuthed
            ? "This monitor has no URL in Uptime Kuma"
            : "Sign in to Uptime Kuma to reveal this URL";

        applyLockedValue(localText, localUrl, emptyTitle, null, emptyLabel);
        applyLockedValue(extText, extUrl, emptyTitle, null, emptyLabel);

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

        // Every write below is guarded. A status or uptime that has not moved
        // since the last poll -- the usual case -- leaves the card completely
        // untouched. Writing the same value back still invalidates style for
        // the card, and .card carries a backdrop-filter, so a whole grid of
        // pointless writes is seen as every card flickering at once.

        const refs = cardRefs(s.id, card);

        // Big dot (overall)
        if (refs.statusDot) {
            setDataIfChanged(refs.statusDot, "status", s.status);
            setTitleIfChanged(refs.statusDot, s.status[0].toUpperCase() + s.status.slice(1));
        }

        // Local row
        setDataIfChanged(refs.localDot, "status", localStatus);
        if (refs.localUp) setTextIfChanged(refs.localUp, localUp == null ? "—" : `${Number(localUp).toFixed(1)}%`);

        // External row
        setDataIfChanged(refs.externalDot, "status", extStatus);
        if (refs.externalUp) setTextIfChanged(refs.externalUp, extUp == null ? "—" : `${Number(extUp).toFixed(1)}%`);


    }
}

/* =========================
               EMPTY STATE
               ========================= */
// A blank grid is the screen every new install starts on, and until this existed
// it explained nothing. The only signals were the word OFFLINE in small type in
// the topbar and a toast that cleared itself after 5.2 seconds. IceWhale's
// maintainer hit exactly that while reviewing the app for their store, checked
// that every container was healthy, and reasonably concluded Service Dash was
// broken. It was not: Uptime Kuma simply was not there to read. An empty grid
// has three quite different causes and the reader cannot tell them apart, so
// the panel names which one it is and what to do about it.

// Runs from any folder with nothing installed on the host but Docker, and
// prints a different, unmistakable first line for each cause: "HTTP/1.1 200 OK"
// (both fine), "HTTP/1.1 404 Not Found" (Kuma up, wrong slug), or "can't connect
// to remote host" (nothing on that port). `service-dash` is a fixed
// container_name in all three Compose files, so this needs neither a Compose
// file nor a particular working directory. The sudo is not decoration -- on
// ZimaOS the user is not in the `docker` group by default.
//
// Both values are interpolated into a single-quoted shell string, and both are
// validated by entrypoint.sh before they reach the browser (STATUS_SLUG is
// [A-Za-z0-9_-] only, KUMA_PORT is 1-65535), so neither can close the quote.
function kumaDiagnosticCommand() {
    return `sudo docker exec service-dash sh -c 'wget -S -O/dev/null --timeout=5 "http://host.docker.internal:${KUMA_PORT}/api/status-page/${STATUS_SLUG}" 2>&1 | head -3'`;
}

// The stored error can be nginx's own 502 page: five hundred characters of
// markup wrapped around four useful words. Strip the tags, collapse the
// whitespace and cap it -- the panel summarises, it is not a log viewer.
function tidyKumaError(raw) {
    const text = safeStr(raw)
        .replace(/<[^>]*>/g, " ")
        .replace(/\s+/g, " ")
        .trim();
    return text.length > 180 ? `${text.slice(0, 180)}\u2026` : text;
}

function emptyStateModel() {
    // Order matters: an unreachable Kuma also has zero services and zero
    // visible cards, so the most specific cause has to be tested first.
    if (!state.kumaConnected) {
        return {
            kind: "offline",
            title: "Waiting for Uptime Kuma",
            lead: `Service Dash builds its cards from an Uptime Kuma status page on this host. Nothing usable answered at <code>${escapeHtml(EP_STATUS)}</code>.`,
            checks: [
                `<b>Uptime Kuma is running on this host</b> and reachable on port <b>${escapeHtml(KUMA_PORT)}</b>.`,
                `<b>A status page exists</b> with the slug <b>${escapeHtml(STATUS_SLUG)}</b>, and it is published.`,
                `If Kuma uses a different port or slug, change <code>KUMA_PORT</code> or <code>STATUS_SLUG</code> in the Compose file to match.`,
            ],
            command: kumaDiagnosticCommand(),
            detail: tidyKumaError(window.__kuma?.error || ""),
        };
    }

    if (!state.services.length) {
        return {
            kind: "no-monitors",
            title: "Connected, but that status page is empty",
            lead: `Uptime Kuma answered at <code>${escapeHtml(EP_STATUS)}</code>. The status page has no monitors on it yet.`,
            checks: [
                `Add the monitors you want here to the <b>${escapeHtml(STATUS_SLUG)}</b> status page in Uptime Kuma.`,
                `Name two of them <code>Plex</code> and <code>Plex local</code> to get a single card carrying both a public and a LAN address.`,
            ],
            command: "",
            detail: "",
        };
    }

    if (state.visibleCount === 0) {
        return {
            kind: "no-matches",
            title: "Nothing matches",
            lead: `${state.services.length} service${state.services.length === 1 ? "" : "s"} loaded, but none match the current search and filters.`,
            checks: [],
            command: "",
            detail: "",
            clear: true,
        };
    }

    return null;
}

function renderEmptyState() {
    const host = els.emptyState;
    if (!host) return;

    const model = emptyStateModel();
    if (!model) {
        // Compare before writing: this runs on every poll, and clearing an
        // already-empty node is a layout write for nothing.
        if (!host.hidden) {
            host.hidden = true;
            host.removeAttribute("data-kind");
            host.removeAttribute("data-signature");
            host.innerHTML = "";
        }
        return;
    }

    // The signature is what makes this idempotent. Without it the panel would
    // be torn down and rebuilt under the reader every fifteen seconds, which
    // loses text selection and restarts the entrance transition.
    const signature = [model.kind, model.detail, model.lead].join("|");
    if (host.dataset.signature === signature) {
        host.hidden = false;
        return;
    }

    const checks = model.checks.length
        ? `<ul class="emptyChecks">${model.checks.map((c) => `<li>${c}</li>`).join("")}</ul>`
        : "";

    // The command is offered the same way the AI panel offers its sign-in: with
    // the two things people stall on answered on the command itself, rather
    // than in a footnote they have to go and find.
    const command = model.command
        ? `<div class="emptyCmd">
               <span class="emptyCmdHint">Run on the host &middot; any folder &middot; nothing to install</span>
               <code>${escapeHtml(model.command)}</code>
               <button class="pill emptyCopy" type="button">Copy</button>
           </div>`
        : "";

    // The raw fetch error, folded away. It is the fastest route to an answer
    // for anyone who reads it, and noise for everyone else.
    const detail = model.detail
        ? `<details class="emptyDetail"><summary>What the browser reported</summary><code>${escapeHtml(model.detail)}</code></details>`
        : "";

    const clear = model.clear
        ? `<button class="pill emptyClear" type="button">Clear search and filters</button>`
        : "";

    host.dataset.signature = signature;
    host.dataset.kind = model.kind;
    host.innerHTML = `
        <div class="emptyInner">
            <h2 class="emptyTitle">${escapeHtml(model.title)}</h2>
            <p class="emptyLead">${model.lead}</p>
            ${checks}
            ${command}
            ${clear}
            ${detail}
        </div>`;
    host.hidden = false;
}

// One delegated listener for the panel's whole life, attached once. The panel's
// innerHTML is rewritten whenever its cause changes, so per-render listeners
// would leak and per-button lookups would go stale.
if (els.emptyState) {
    els.emptyState.addEventListener("click", async (event) => {
        const copy = event.target.closest(".emptyCopy");
        if (copy) {
            const command = copy.closest(".emptyCmd")?.querySelector("code")?.textContent || "";
            if (!command) return;
            if (await writeClipboard(command)) toast("📋 <b>Command copied.</b> Run it on the host.", 2000);
            else toast("⚠️ <b>Could not copy the command.</b>", 2200);
            return;
        }

        if (event.target.closest(".emptyClear")) {
            // Reset through the same state the chips and the search box write,
            // so the controls agree with the grid afterwards.
            state.query = "";
            state.statusFilter = "all";
            state.categoryFilter = "all";
            if (els.q) els.q.value = "";
            savePrefs();
            applyFiltersAndCounts();
            updateChipActiveStates();
        }
    });
}


function applyFiltersAndCounts() {
    const qLower = safeStr(state.query).trim().toLowerCase();
    const statusFilter = state.statusFilter;
    const categoryFilter = state.categoryFilter;

    let visible = 0;
    for (const s of state.services) {
        const card = state.cardElById.get(String(s.id));
        if (!card) continue;

        const matches = serviceMatchesFilters(s, qLower, statusFilter, categoryFilter);
        if (matches) visible += 1;

        card.classList.toggle("is-filtered-out", !matches);
    }
    state.visibleCount = visible;

    renderChipsWithCounts();
    renderEmptyState();
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
    if (els.diskUsed) els.diskUsed.textContent = formatBytes(mockDiskUsed);
    if (els.cpuWatts) els.cpuWatts.textContent = `${(10 + cpu / 8).toFixed(1)} W`;
    if (els.cpuTemp) els.cpuTemp.textContent = `${(38 + cpu / 4).toFixed(1)} °C`;
    if (els.memTotal) els.memTotal.textContent = "8.00 GB";
    if (els.diskFree) els.diskFree.textContent = formatBytes(mockDiskFree);
    if (els.diskTotal) els.diskTotal.textContent = formatBytes(mockDiskTotal);

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
// What the preview is actually showing, after resolving a typed name.
let _iconPreviewUrl = "";
// Label of the icon picked from the list, so the status line can name it.
let _iconPickedLabel = null;
// The name the field was pre-filled with for an auto-matched card. Saving it
// untouched keeps the card automatic instead of freezing today's URL into an
// override.
let _iconEditAutoLabel = null;

const ICON_SUGGEST_LIMIT = 6;
let _iconSuggestions = [];
let _iconSuggestIndex = -1;

function setIconStatus(state, message) {
    if (!els.iconStatus) return;
    els.iconStatus.dataset.state = state;
    els.iconStatus.textContent = message;
}

function updateIconPreview() {
    if (!els.iconPreviewImg) return;

    const raw = safeStr(els.iconUrlInput?.value).trim();
    const resolved = resolveIconInput(raw);
    _iconPreviewUrl = resolved;
    els.iconPreviewImg.style.display = "none";
    els.iconPreview?.classList.remove("has-image");

    if (!resolved) {
        _iconPreviewOk = null;
        setIconStatus(
            "idle",
            raw
                ? `No icon matches “${raw}” — this card will show its initials instead.`
                : "No icon — this card will show its initials instead."
        );
        els.iconPreviewImg.src = monogramIcon(_iconEditTarget?.name ?? "");
        return;
    }

    _iconPreviewOk = null;
    setIconStatus("checking", _iconPickedLabel ? `Loading the ${_iconPickedLabel} icon…` : "Loading image…");
    els.iconPreviewImg.src = resolved;
}

/* ---- icon picker ---- */

function closeIconSuggest() {
    _iconSuggestions = [];
    _iconSuggestIndex = -1;
    if (!els.iconSuggest) return;
    els.iconSuggest.hidden = true;
    els.iconSuggest.innerHTML = "";
    els.iconUrlInput?.setAttribute("aria-expanded", "false");
    els.iconUrlInput?.removeAttribute("aria-activedescendant");
}

function highlightIconSuggestion(index) {
    const options = els.iconSuggest ? [...els.iconSuggest.children] : [];
    if (!options.length) return;

    _iconSuggestIndex = ((index % options.length) + options.length) % options.length;

    options.forEach((option, i) => {
        const active = i === _iconSuggestIndex;
        option.classList.toggle("is-active", active);
        option.setAttribute("aria-selected", String(active));
    });

    const active = options[_iconSuggestIndex];
    els.iconUrlInput?.setAttribute("aria-activedescendant", active.id);
    active.scrollIntoView({ block: "nearest" });
}

function openIconSuggest(query) {
    if (!els.iconSuggest) return;

    const matches = searchIconCatalog(query);
    if (!matches.length) {
        closeIconSuggest();
        return;
    }

    _iconSuggestions = matches;
    els.iconSuggest.innerHTML = "";

    matches.forEach((entry, i) => {
        const option = document.createElement("li");
        option.className = "iconSuggestItem";
        option.id = `iconSuggest-${i}`;
        option.setAttribute("role", "option");
        option.setAttribute("aria-selected", "false");

        const img = document.createElement("img");
        img.alt = "";
        img.decoding = "async";
        img.addEventListener("error", () => {
            img.src = monogramIcon(entry.label);
        }, { once: true });
        img.src = iconUrlForSlug(entry.slug);

        const label = document.createElement("span");
        label.textContent = entry.label;

        option.append(img, label);
        // mousedown, not click: the input losing focus would close the list
        // before a click ever landed.
        option.addEventListener("mousedown", (event) => {
            event.preventDefault();
            chooseIconSuggestion(i);
        });

        els.iconSuggest.appendChild(option);
    });

    els.iconSuggest.hidden = false;
    els.iconUrlInput?.setAttribute("aria-expanded", "true");
    highlightIconSuggestion(0);
}

function chooseIconSuggestion(index) {
    const entry = _iconSuggestions[index];
    if (!entry || !els.iconUrlInput) return;

    _iconPickedLabel = entry.label;
    els.iconUrlInput.value = entry.label;
    closeIconSuggest();
    updateIconPreview();
    els.iconUrlInput.focus();
}

// What Save should store: null keeps the card on automatic matching.
function iconEditValue() {
    const raw = safeStr(els.iconUrlInput?.value).trim();
    if (_iconEditAutoLabel !== null && raw === _iconEditAutoLabel) return null;
    return raw;
}

function openIconEditor(service) {
    if (!els.iconOverlay) return;

    _iconEditTarget = service;
    const current = iconOverrideFor(service.name);

    // An automatic match is shown by name rather than by URL: that is what the
    // picker reads, and it resolves back to the same icon on save.
    loadIconIndex();
    _iconEditAutoLabel = current.source === "auto" ? (serviceIconEntryFor(service.name)?.label ?? "") : null;
    _iconPickedLabel = null;
    closeIconSuggest();

    if (els.iconServiceName) els.iconServiceName.textContent = service.name;
    if (els.iconUrlInput) els.iconUrlInput.value = _iconEditAutoLabel ?? current.url;
    updateIconPreview();
    populateContainerSelect(service);

    els.iconOverlay.classList.add("show");
    els.iconOverlay.setAttribute("aria-hidden", "false");
    setTimeout(() => els.iconUrlInput?.focus(), 60);
}

// Editor state for the container picker: which containers are ticked, and
// whether the card is still following the automatic match.
let _containerEditAuto = true;
let _containerEditSelection = [];

function containerSelectionSummary() {
    if (_containerEditAuto) {
        const auto = autoContainerFor(_iconEditTarget?.name ?? "");
        return auto ? `Auto — ${auto}` : "Auto — no match";
    }
    if (!_containerEditSelection.length) return "None";
    if (_containerEditSelection.length === 1) return _containerEditSelection[0];
    return `${_containerEditSelection.length} containers`;
}

function renderContainerOptions() {
    if (!els.containerOptions) return;

    const selected = new Set(_containerEditSelection);
    const auto = autoContainerFor(_iconEditTarget?.name ?? "");

    const autoRow = `
        <label class="storage-source-option">
            <input type="checkbox" data-container-auto${_containerEditAuto ? " checked" : ""} />
            <span>Match automatically<small>${escapeHtml(auto ? `Currently ${auto}` : "No container matches this card name")}</small></span>
        </label>`;

    const rows = ND_CONTAINERS.map((container) => {
        const checked = selected.has(container) ? " checked" : "";
        const disabled = _containerEditAuto ? " disabled" : "";
        return `
            <label class="storage-source-option${_containerEditAuto ? " is-disabled" : ""}">
                <input type="checkbox" data-container="${escapeAttr(container)}"${checked}${disabled} />
                <span>${escapeHtml(container)}</span>
            </label>`;
    }).join("");

    // Every tick re-renders the list, so hold the scroll position — otherwise
    // ticking a container near the bottom throws the list back to the top.
    const scroll = els.containerOptions.scrollTop;
    els.containerOptions.innerHTML = autoRow + rows;
    els.containerOptions.scrollTop = scroll;

    if (els.containerSummary) els.containerSummary.textContent = containerSelectionSummary();

    if (els.containerHint) {
        els.containerHint.textContent = !ND_CONTAINERS.length
            ? "No containers reported by Netdata on this host."
            : _containerEditSelection.length > 1 && !_containerEditAuto
              ? `Adding up CPU and RAM across ${_containerEditSelection.length} containers.`
              : "Shows this container\u2019s CPU and RAM on the card. Pick several to add them together.";
    }
}

function populateContainerSelect(service) {
    if (!els.containerOptions) return;

    const resolved = containerForService(service.name);
    _containerEditAuto = resolved.source === "auto";
    // Unticking Auto starts from whatever the card is showing right now, so the
    // list never jumps to empty the moment the mode changes.
    _containerEditSelection = [...resolved.containers];

    if (els.containerPicker) els.containerPicker.open = false;
    renderContainerOptions();
}

function closeIconEditor() {
    if (!els.iconOverlay) return;
    _iconEditTarget = null;
    _iconEditAutoLabel = null;
    _iconPickedLabel = null;
    closeIconSuggest();
    els.iconOverlay.classList.remove("show");
    els.iconOverlay.setAttribute("aria-hidden", "true");
}

function applyContainerChoice(service) {
    if (!els.containerOptions) return;

    const key = baseServiceKey(service.name);
    if (_containerEditAuto) SERVICE_CONTAINERS.delete(key);
    else SERVICE_CONTAINERS.set(key, normalizeContainerList(_containerEditSelection));
    saveServiceContainers();

    // Hide immediately if the card no longer maps anywhere; otherwise the next
    // tick fills it in.
    if (!containerForService(service.name).containers.length) {
        const row = state.cardElById.get(String(service.id))?.querySelector('[data-role="containerStats"]');
        if (row) row.hidden = true;
    }
    tickContainerStats();
}

function applyIconEdit(value) {
    const service = _iconEditTarget;
    if (!service) return;

    applyContainerChoice(service);

    // null means "no override"; anything else is resolved the same way the
    // preview resolved it, so what was shown is what gets saved.
    const url = value === null ? null : resolveIconInput(value);
    const key = baseServiceKey(service.name);
    if (url === null) BROWSER_ICON_OVERRIDES.delete(key);
    else BROWSER_ICON_OVERRIDES.set(key, url);
    // Also clear any entry stored under the full display name.
    if (url === null) BROWSER_ICON_OVERRIDES.delete(safeStr(service.name).trim().toLowerCase());

    saveBrowserIconOverrides();

    const card = state.cardElById.get(String(service.id));
    if (card) renderCardIcon(card, service.name);

    const failed = url !== null && url !== "" && _iconPreviewOk === false;
    closeIconEditor();

    if (url === null) toast(`↩️ <b>${escapeHtml(service.name)}</b> • Icon reset to default`, 2000);
    else if (failed) {
        toast(`⚠️ <b>${escapeHtml(service.name)}</b> • Saved, but that image would not load — the card shows its initials.`, 4200);
    } else toast(`🖼️ <b>${escapeHtml(service.name)}</b> • Icon updated`, 2000);
}

els.iconUrlInput?.addEventListener("input", () => {
    _iconPickedLabel = null;
    updateIconPreview();

    const value = els.iconUrlInput.value;
    if (looksLikeImageLink(value)) closeIconSuggest();
    else openIconSuggest(value);
});
els.iconPreviewImg?.addEventListener("load", () => {
    els.iconPreviewImg.style.display = "block";

    // With nothing resolved the preview is showing the monogram, so keep
    // the "will use its initials" message rather than claiming a load.
    if (!_iconPreviewUrl) return;

    _iconPreviewOk = true;
    setIconStatus("ok", _iconPickedLabel ? `${_iconPickedLabel} icon loaded.` : "Image loaded.");
});
els.iconPreviewImg?.addEventListener("error", () => {
    _iconPreviewOk = false;
    els.iconPreviewImg.style.display = "none";
    // Saying so beats silently falling back to the emoji and leaving the user
    // wondering why nothing happened.
    setIconStatus("error", "Could not load that image. Check the link, or that the host allows hotlinking. The card will show its initials.");
});
els.containerOptions?.addEventListener("change", (event) => {
    const input = event.target.closest("input[type=checkbox]");
    if (!input) return;

    if (input.hasAttribute("data-container-auto")) {
        _containerEditAuto = input.checked;
        if (_containerEditAuto) {
            // Back to following the card name; the list shows what that resolves to.
            const auto = autoContainerFor(_iconEditTarget?.name ?? "");
            _containerEditSelection = auto ? [auto] : [];
        }
        renderContainerOptions();
        return;
    }

    const container = input.dataset.container;
    if (!container) return;

    const selected = new Set(_containerEditSelection);
    if (input.checked) selected.add(container);
    else selected.delete(container);
    // Keep the order Netdata reports, so the summary and tooltip stay stable.
    _containerEditSelection = ND_CONTAINERS.filter((name) => selected.has(name));
    renderContainerOptions();
});

els.btnIconSave?.addEventListener("click", () => applyIconEdit(iconEditValue()));
els.btnIconDefault?.addEventListener("click", () => applyIconEdit(null));
els.btnIconCancel?.addEventListener("click", closeIconEditor);
els.iconOverlay?.addEventListener("click", (event) => {
    if (event.target === els.iconOverlay) closeIconEditor();
});
els.iconUrlInput?.addEventListener("keydown", (event) => {
    const listOpen = !!els.iconSuggest && !els.iconSuggest.hidden;

    if (event.key === "ArrowDown") {
        event.preventDefault();
        if (listOpen) highlightIconSuggestion(_iconSuggestIndex + 1);
        else openIconSuggest(els.iconUrlInput.value || _iconEditTarget?.name || "");
        return;
    }

    if (event.key === "ArrowUp" && listOpen) {
        event.preventDefault();
        highlightIconSuggestion(_iconSuggestIndex - 1);
        return;
    }

    if (event.key === "Escape" && listOpen) {
        // Dismiss the list only — the dialog stays open.
        event.preventDefault();
        event.stopPropagation();
        closeIconSuggest();
        return;
    }

    if (event.key === "Enter") {
        if (listOpen && _iconSuggestIndex >= 0) {
            event.preventDefault();
            chooseIconSuggestion(_iconSuggestIndex);
            return;
        }
        applyIconEdit(iconEditValue());
    }
});

// Anywhere else in the dialog dismisses the list.
document.addEventListener("mousedown", (event) => {
    if (!els.iconSuggest || els.iconSuggest.hidden) return;
    if (event.target instanceof Node && els.iconSuggest.parentElement?.contains(event.target)) return;
    closeIconSuggest();
});

/* =========================
               AUTH OVERLAY
               ========================= */
// The password field can be unmasked to check a typo. It always opens masked:
// a reveal left on from a previous visit would put the password on screen
// before anyone asked for it.
function setPasswordRevealed(revealed) {
    if (!els.authPass || !els.authPassReveal) return;
    els.authPass.type = revealed ? "text" : "password";
    els.authPassReveal.setAttribute("aria-pressed", String(revealed));
    const label = revealed ? "Hide password" : "Show password";
    els.authPassReveal.setAttribute("aria-label", label);
    els.authPassReveal.title = label;
}

function openAuth() {
    setPasswordRevealed(false);
    els.overlay.classList.add("show");
    els.overlay.setAttribute("aria-hidden", "false");
    setTimeout(() => els.authUser.focus(), 60);
}
function closeAuth() {
    els.overlay.classList.remove("show");
    els.overlay.setAttribute("aria-hidden", "true");
    setPasswordRevealed(false);
}

els.authPassReveal?.addEventListener("click", () => {
    const revealed = els.authPassReveal.getAttribute("aria-pressed") === "true";
    setPasswordRevealed(!revealed);
    // Focus goes back to the field, with the caret at the end, so checking a
    // typo does not cost you your place.
    els.authPass.focus();
    const end = els.authPass.value.length;
    try {
        els.authPass.setSelectionRange(end, end);
    } catch {}
});

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
        // The toast clears itself after five seconds; the panel is what is still
        // on screen when somebody comes back to the tab and wonders what broke.
        renderEmptyState();
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
            _cardRefs.clear();
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
        renderEmptyState();
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
    // First, before anything reads a preference or builds a card: a shared
    // document, where the deployment serves one, replaces what this browser
    // has stored.
    await loadSharedSettings();

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
        // Driven off the mode rather than off checked, because a checkbox has
        // two states and this has three. updateLinkModeUI() puts the control
        // back in step immediately afterwards.
        setLinkMode(nextLinkMode());
        toastLinkMode();
    });

    // ✅ Apply persisted theme + accent (and fix legacy data-accent="none")
    setTheme(state.theme);
    setAccent(state.accent || els.root.getAttribute("data-accent") || "aurora");

    updateLinkModeUI();

    els.btnLinkMode?.addEventListener("click", () => {
        setLinkMode(nextLinkMode());
        toastLinkMode();
    });

    wireSections();
    startAiUsage();
    els.notesLocked?.addEventListener("click", () => {
        toast("🔒 <b>Notes are locked.</b> Sign in to Uptime Kuma to read and edit them.", 2600);
    });

    // Keep the authoritative copy in step before saving, since savePrefs reads
    // state.notes rather than the field.
    els.notes.addEventListener("input", () => {
        state.notes = els.notes.value;
        savePrefs();
        autoResizeTextarea(els.notes);
    });
    autoResizeTextarea(els.notes); // fit saved notes on load
    updateNotesLock();

    // Everything above replayed stored state; from here on, a save means
    // somebody changed something.
    _sharedSettingsReady = true;

    // Fetched in the background: cards are already on screen, and any showing a
    // monogram are re-checked once the catalogue lands.
    loadIconIndex().then(refreshMonogramCards);

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
        // Escape is the one shortcut that must work from inside a field: it is
        // how you get out of the dialog you are typing in.
        if (e.key === "Escape") {
            closeAuth();
            closeIconEditor();
            closeSettings();
            return;
        }

        if (isTypingTarget()) return;

        if (e.key === "/") {
            e.preventDefault();
            els.q.focus();
        }
        if (e.key.toLowerCase() === "a" && !e.metaKey && !e.ctrlKey && !e.altKey) {
            openAuth();
        }
        // ✅ Optional: press "T" to cycle accents
        if (e.key.toLowerCase() === "t" && !e.metaKey && !e.ctrlKey && !e.altKey) {
            cycleAccent();
        }
        if (e.key.toLowerCase() === "l" && !e.metaKey && !e.ctrlKey && !e.altKey) {
            setLinkMode(nextLinkMode());
            toastLinkMode();
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

// Passive: without it the browser must wait to see whether this handler calls
// preventDefault() before it can scroll, which is felt directly as stutter.
// The class is only touched when it actually changes -- toggling it on every
// scroll event invalidates style for the whole subtree each frame.
let _scrollBtnShown = false;
window.addEventListener(
    "scroll",
    () => {
        const shouldShow = window.scrollY > 240;
        if (shouldShow === _scrollBtnShown) return;
        _scrollBtnShown = shouldShow;
        scrollBtn.classList.toggle("show", shouldShow);
    },
    { passive: true }
);

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

    // Built once. Constructing an Intl formatter loads locale data, and this
    // runs once a second for a string that changes once a minute.
    const clockFormat = new Intl.DateTimeFormat(undefined, {
        hour: "numeric",
        minute: "2-digit",
    });
    const dateFormat = new Intl.DateTimeFormat(undefined, {
        weekday: "long",
        year: "numeric",
        month: "long",
        day: "numeric",
    });

    function updateClock() {
        const now = new Date();

        // Build localized parts so AM/PM works and hides in 24h locales
        const parts = clockFormat.formatToParts(now);

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
            if (clockTimeEl.textContent !== timeStr) clockTimeEl.textContent = timeStr;
            if (minuteChanged) clockTimeEl.classList.add("minute-changed");
        } else if (clockEl) {
            // fallback if you still reference clockEl somewhere
            if (clockEl.textContent !== timeStr) clockEl.textContent = timeStr;
        }

        // Set AM/PM (hide if not provided, e.g., 24h locale). Guarded like the
        // time itself: this ran every second for a value that changes twice a
        // day at most.
        if (clockMeridiemEl) {
            const meridiem = dayPeriod || "";
            if (clockMeridiemEl.textContent !== meridiem) clockMeridiemEl.textContent = meridiem;
            clockMeridiemEl.classList.toggle("is-hidden", !dayPeriod);
        }

        // Current date. Same treatment: one formatter, and only written when
        // the day actually turns over.
        const dateStr = dateFormat.format(now);
        if (dateEl.textContent !== dateStr) dateEl.textContent = dateStr;
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
    // Scroll chaining from the page into the pinned left column.
    //
    // The left column already chains outward: it scrolls its own content, and
    // once it has nothing left the wheel carries on to the page. That is why it
    // deliberately has no overscroll-behavior. The other direction did not
    // exist -- with the pointer over the cards, the page scrolled to its end
    // and simply stopped, leaving the rest of the left column unreachable
    // without moving the pointer onto it.
    //
    // The listener is passive on purpose. It only acts once the page cannot
    // move any further, and at that point the wheel would do nothing anyway, so
    // there is never anything to preventDefault. Ordinary scrolling stays
    // entirely native -- a non-passive wheel handler here would make the
    // browser wait on this code before every scroll, which is exactly the
    // stutter worth avoiding.
    window.addEventListener(
        "wheel",
        (event) => {
            const side = els.sideStack;
            if (!side) return;

            // The column's own scroll comes first; the browser already does that.
            if (side.contains(event.target)) return;
            // A modal owns the wheel while it is open.
            if (els.overlay?.classList.contains("show")) return;

            // Below the desktop breakpoint the column is not a scroll container
            // at all, so there is nothing to chain into.
            const room = side.scrollHeight - side.clientHeight;
            if (room <= 0) return;

            const delta = wheelDeltaPixels(event);
            if (!delta) return;

            // Only once the page itself has run out of room in this direction.
            const pageMax = document.documentElement.scrollHeight - window.innerHeight;
            const pageStillHasRoom = delta > 0 ? window.scrollY < pageMax - 1 : window.scrollY > 1;
            if (pageStillHasRoom) return;

            const next = clamp(side.scrollTop + delta, 0, room);
            if (next !== side.scrollTop) side.scrollTop = next;
        },
        { passive: true }
    );

    setInterval(updateClock, 1000);

    // A homelab box with no route to fonts.gstatic.com would otherwise show
    // every icon as its ligature word: "stacked_line_chart" in the middle of a
    // heading. document.fonts.check() is no use here -- it reports true as soon
    // as the text can be rendered in *some* font, which a fallback always can.
    //
    // Measure the ligature instead. With the icon font active, "settings"
    // collapses to one glyph and is narrow; without it, eight characters are
    // laid out in the fallback and the width matches the fallback exactly.
    (async () => {
        try {
            if (!document.fonts) return;
            await document.fonts.ready;

            const measure = (family) => {
                const probe = document.createElement("span");
                probe.textContent = "settings";
                probe.setAttribute("aria-hidden", "true");
                probe.style.cssText =
                    "position:absolute;left:-9999px;top:-9999px;visibility:hidden;" +
                    "white-space:nowrap;font-size:48px;font-feature-settings:'liga';";
                probe.style.fontFamily = family;
                document.body.appendChild(probe);
                const width = probe.getBoundingClientRect().width;
                probe.remove();
                return width;
            };

            // Same fallback in both, so any difference is the icon face itself.
            const withIcons = measure('"Material Symbols Rounded", monospace');
            const fallbackOnly = measure("monospace");

            // A rendered ligature is dramatically narrower than eight glyphs.
            // Identical widths mean the icon face never applied.
            if (Math.abs(withIcons - fallbackOnly) > 1) return;

            document.documentElement.classList.add("icons-unavailable");
        } catch {
            // Leave the icons alone: unchanged behaviour is the safe default.
        }
    })();
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
