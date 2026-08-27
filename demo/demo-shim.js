/* Stand-in backends for the Service Dash preview.
 *
 * The real page is served by nginx, which proxies Uptime Kuma, Netdata, a
 * Docker metadata guard, the network-info sidecar and the shared settings
 * document. None of those exist on a static host, so this file answers each of
 * those endpoints with plausible data of the same shape.
 *
 * It serves two targets: the public demo on GitHub Pages, and a Claude artifact
 * used for review. They differ in one way -- the artifact runs under a CSP that
 * blocks every external host, so the icon catalogue is embedded there and
 * fetched for real here.
 *
 * Demo credentials: test / Test (the 2FA field is ignored).
 *
 * It replaces backends only. The dashboard's own HTML, CSS and JavaScript are
 * inlined verbatim from the repository, so what you interact with here is the
 * real thing.
 */
(function () {
    "use strict";

    /* ---------- services ---------- */
    var SERVICES = [
        { id: 1, name: "AdGuard Home", slug: "adguard-home", cat: "other" },
        { id: 2, name: "Duplicati", slug: "duplicati", cat: "backup" },
        { id: 3, name: "Grafana", slug: "grafana", cat: "other" },
        { id: 4, name: "Home Assistant", slug: "home-assistant", cat: "automation" },
        { id: 5, name: "Nextcloud", slug: "nextcloud", cat: "storage" },
        { id: 6, name: "Plex", slug: "plex", cat: "media" },
        { id: 7, name: "Immich", slug: "immich", cat: "media" },
        { id: 8, name: "Portainer", slug: "portainer", cat: "other" },
        { id: 9, name: "Uptime Kuma", slug: "uptime-kuma", cat: "other" },
        { id: 10, name: "Jellyfin", slug: "jellyfin", cat: "media" },
        { id: 11, name: "Sonarr", slug: "sonarr", cat: "media" },
        { id: 12, name: "Radarr", slug: "radarr", cat: "media" },
        { id: 13, name: "qBittorrent", slug: "qbittorrent", cat: "other" },
        { id: 14, name: "Vaultwarden", slug: "vaultwarden", cat: "other" },
        { id: 15, name: "Pi-hole", slug: "pi-hole", cat: "other" },
        { id: 16, name: "Frigate", slug: "frigate", cat: "automation" },
        { id: 17, name: "Paperless", slug: "paperless-ngx", cat: "other" },
        { id: 18, name: "Syncthing", slug: "syncthing", cat: "storage" },
        { id: 19, name: "Traefik", slug: "traefik", cat: "other" },
        { id: 20, name: "Netdata", slug: "netdata", cat: "other" },
        { id: 21, name: "Gitea", slug: "gitea", cat: "other" },
        { id: 22, name: "Nginx Proxy Manager", slug: "nginx-proxy-manager", cat: "other" },
        { id: 23, name: "Audiobookshelf", slug: "audiobookshelf", cat: "media" }
    ];

    // A stable spread of states so the chips have something to count.
    var OFFLINE = [13];
    var PENDING = [17];
    var MAINT = [19];

    function statusFor(id) {
        if (OFFLINE.indexOf(id) >= 0) return 0;
        if (PENDING.indexOf(id) >= 0) return 2;
        if (MAINT.indexOf(id) >= 0) return 3;
        return 1;
    }

    function slugFor(id) {
        for (var i = 0; i < SERVICES.length; i++) if (SERVICES[i].id === id) return SERVICES[i].slug;
        return "";
    }

    /* ---------- Uptime Kuma status page + heartbeat ---------- */
    function statusPage() {
        return {
            config: { slug: "homelab", title: "Homelab" },
            publicGroupList: [
                {
                    id: 1,
                    name: "Services",
                    monitorList: SERVICES.map(function (s) {
                        return { id: s.id, name: s.name, type: "http" };
                    })
                }
            ]
        };
    }

    function heartbeat() {
        var list = {}, uptime = {}, now = Date.now();
        SERVICES.forEach(function (s) {
            var beats = [];
            for (var i = 19; i >= 0; i--) {
                beats.push({
                    status: i === 0 ? statusFor(s.id) : 1,
                    time: new Date(now - i * 60000).toISOString(),
                    msg: "",
                    ping: 20 + ((s.id * 7 + i) % 90)
                });
            }
            list[String(s.id)] = beats;
            var up = statusFor(s.id) === 1 ? 99.4 + ((s.id % 6) / 10) : 87.1 + (s.id % 5);
            uptime[String(s.id) + "_24"] = Math.min(100, up) / 100;
        });
        return { heartbeatList: list, uptimeList: uptime };
    }

    /* ---------- Netdata ---------- */
    function ndCharts() {
        var charts = {
            "system.cpu": { id: "system.cpu", name: "system.cpu" },
            "system.ram": { id: "system.ram", name: "system.ram" },
            "system.load": { id: "system.load", name: "system.load" },
            "system.net": { id: "system.net", name: "system.net" },
            // A plausible ZimaOS-ish set of mounts. The dashboard enumerates every
            // disk_space.* chart and scores them, so a host reporting only "/"
            // gives a picker with one entry -- which is not what a real box
            // looks like. These exercise the scoring both ways: the data disks
            // rank, and boot and the docker overlay are excluded by design.
            "disk_space./": {
                id: "disk_space./", name: "disk_space./", family: "/", units: "GiB",
                chart_labels: { mount_point: "/", filesystem: "ext4" }
            },
            "disk_space._DATA": {
                id: "disk_space._DATA", name: "disk_space._DATA", family: "/DATA", units: "GiB",
                chart_labels: { mount_point: "/DATA", filesystem: "ext4" }
            },
            "disk_space._media_Storage_4TB": {
                id: "disk_space._media_Storage_4TB", name: "disk_space._media_Storage_4TB",
                family: "/media/Storage_4TB", units: "GiB",
                chart_labels: { mount_point: "/media/Storage_4TB", filesystem: "btrfs" }
            },
            "disk_space._mnt_backup": {
                id: "disk_space._mnt_backup", name: "disk_space._mnt_backup",
                family: "/mnt/backup", units: "GiB",
                chart_labels: { mount_point: "/mnt/backup", filesystem: "xfs" }
            },
            "disk_space._boot_efi": {
                id: "disk_space._boot_efi", name: "disk_space._boot_efi",
                family: "/boot/efi", units: "GiB",
                chart_labels: { mount_point: "/boot/efi", filesystem: "vfat" }
            },
            "disk_space._var_lib_docker_overlay2": {
                id: "disk_space._var_lib_docker_overlay2", name: "disk_space._var_lib_docker_overlay2",
                family: "/var/lib/docker/overlay2", units: "GiB",
                chart_labels: { mount_point: "/var/lib/docker/overlay2", filesystem: "overlay" }
            },
            "net.eth0": { id: "net.eth0", name: "net.eth0", family: "eth0" }
        };
        SERVICES.slice(0, 8).forEach(function (s) {
            var c = "cgroup_" + s.slug.replace(/-/g, "_");
            charts[c + ".cpu"] = { id: c + ".cpu", name: c + ".cpu", family: "cpu" };
            charts[c + ".mem_usage"] = { id: c + ".mem_usage", name: c + ".mem_usage", family: "mem" };
        });
        return { charts: charts, hostname: "zima-board", cpus: 12 };
    }

    function wave(period, lo, hi) {
        var t = Date.now() / 1000;
        return lo + ((hi - lo) * (0.5 + 0.5 * Math.sin(t / period)));
    }

    function ndData(chart) {
        var now = Math.floor(Date.now() / 1000);
        function frame(labels, values) {
            return { labels: ["time"].concat(labels), data: [[now].concat(values)] };
        }
        if (chart === "system.cpu") return frame(["user", "system", "iowait"], [wave(11, 6, 26), wave(7, 3, 12), wave(5, 0.2, 2)]);
        if (chart === "system.load") return frame(["load1", "load5", "load15"], [wave(19, 0.6, 2.4), 1.1, 0.9]);
        if (chart === "system.ram") return frame(["free", "used", "cached", "buffers"], [9000, wave(23, 5200, 8200), 3400, 700]);
        if (chart.indexOf("disk_space.") === 0) {
            // Sizes differ per mount, so combining several is visibly different
            // from picking one.
            const sizes = {
                "disk_space./": [72, 38, 4],
                "disk_space._DATA": [1790, 1850, 60],
                "disk_space._media_Storage_4TB": [2410, 1290, 80],
                "disk_space._mnt_backup": [640, 1180, 20],
                "disk_space._boot_efi": [0.4, 0.1, 0],
                "disk_space._var_lib_docker_overlay2": [72, 38, 4]
            };
            return frame(["avail", "used", "reserved_for_root"], sizes[chart] || [100, 50, 2]);
        }
        if (chart.indexOf("net.") === 0 || chart === "system.net") return frame(["received", "sent"], [wave(6, 900, 4200), -wave(9, 200, 1100)]);
        if (chart.indexOf(".cpu") > 0) return frame(["user", "system"], [wave(8, 0.4, 4), wave(6, 0.1, 1.6)]);
        if (chart.indexOf(".mem_usage") > 0) return frame(["ram"], [wave(13, 60, 480)]);
        return frame(["value"], [0]);
    }

    /* ---------- shared settings, kept in localStorage ---------- */
    var SETTINGS_KEY = "__preview_settings_doc";
    var KUMA_USERS = [{ username: "test", password: "Test", token: "demo-kuma-jwt" }];

    function readSettings() {
        try {
            var raw = localStorage.getItem(SETTINGS_KEY);
            return raw ? JSON.parse(raw) : null;
        } catch (e) { return null; }
    }

    /* ---------- fetch interception ---------- */
    var realFetch = window.fetch.bind(window);

    function json(body, status) {
        return Promise.resolve(new Response(JSON.stringify(body), {
            status: status || 200,
            headers: { "Content-Type": "application/json" }
        }));
    }

    window.fetch = function (input, init) {
        var url = typeof input === "string" ? input : (input && input.url) || "";
        var method = ((init && init.method) || (input && input.method) || "GET").toUpperCase();
        var path = url.replace(/^https?:\/\/[^/]+/, "");

        if (path.indexOf("/kuma/api/status-page/heartbeat/") === 0) return json(heartbeat());
        if (path.indexOf("/kuma/api/status-page/") === 0) return json(statusPage());

        if (path.indexOf("/netdata/api/v1/charts") === 0) return json(ndCharts());
        if (path.indexOf("/netdata/api/v1/data") === 0) {
            var m = /[?&]chart=([^&]+)/.exec(path);
            return json(ndData(m ? decodeURIComponent(m[1]) : ""));
        }

        if (path.indexOf("/network-info/status") === 0) {
            return json({
                lan: { address: "192.168.1.42", prefix: 24, interface: "eth0", gateway: "192.168.1.1" },
                wan: { address: "203.0.113.87" },
                updatedAt: new Date().toISOString()
            });
        }

        if (path.indexOf("/docker-metadata/networks") === 0) {
            return json([{ Id: "br0", Name: "service-dash-network", Containers: {} }]);
        }

        if (path.indexOf("/icon-index") === 0) {
            // Embedded only where the CSP blocks the CDN. On the public demo,
            // fetch the very file nginx proxies, so the picker searches the
            // real catalogue rather than a trimmed copy of it.
            if (window.__PREVIEW_ICON_INDEX__) return json(window.__PREVIEW_ICON_INDEX__);
            return realFetch("https://cdn.jsdelivr.net/gh/selfhst/icons/index.json");
        }

        if (path.indexOf("/settings/state.json") === 0) {
            if (method === "PUT") {
                // Writes are gated on a Kuma session, the same as the real
                // deployment, where nginx asks the validator before allowing it.
                var token = "";
                var h = (init && init.headers) || {};
                if (h && typeof h === "object") token = h["X-Kuma-Token"] || h["x-kuma-token"] || "";
                var known = KUMA_USERS.some(function (u) { return u.token === token; });
                if (!known) return Promise.resolve(new Response("", { status: 401 }));
                try { localStorage.setItem(SETTINGS_KEY, String((init && init.body) || "")); } catch (e) {}
                return Promise.resolve(new Response("", { status: 204 }));
            }
            var doc = readSettings();
            if (!doc) return Promise.resolve(new Response("", { status: 404 }));
            return json(doc);
        }

        return realFetch(input, init);
    };

    /* ---------- Socket.IO stand-in ---------- */
    // The dashboard injects a <script> for the Kuma client and then calls
    // window.io(). Both are answered here: the script never loads, so io() is
    // provided up front and the injected tag is neutralised.
    var realCreate = document.createElement.bind(document);
    document.createElement = function (tag) {
        var el = realCreate(tag);
        if (String(tag).toLowerCase() === "script") {
            var setSrc = Object.getOwnPropertyDescriptor(HTMLScriptElement.prototype, "src");
            Object.defineProperty(el, "src", {
                configurable: true,
                get: function () { return setSrc.get.call(el); },
                set: function (value) {
                    if (String(value).indexOf("socket.io") >= 0) {
                        setTimeout(function () { el.dispatchEvent(new Event("load")); }, 10);
                        return;
                    }
                    setSrc.set.call(el, value);
                }
            });
        }
        return el;
    };

    window.io = function () {
        var handlers = {};
        // Real Kuma only emits the monitor list to an authenticated socket.
        // Without tracking that, a failed sign-in would still hand the cards
        // their URLs and the preview would misrepresent the signed-out state.
        var authed = false;

        var socket = {
            connected: true,
            on: function (event, fn) { (handlers[event] = handlers[event] || []).push(fn); },
            off: function (event) { delete handlers[event]; },
            disconnect: function () { socket.connected = false; authed = false; },
            emit: function (event, a, b) {
                var cb = typeof b === "function" ? b : (typeof a === "function" ? a : null);

                if (event === "login") {
                    var who = KUMA_USERS.filter(function (u) {
                        return u.username === a.username && u.password === a.password;
                    })[0];
                    authed = !!who;
                    if (cb) cb(who ? { ok: true, token: who.token } : { ok: false, msg: "Incorrect username or password." });
                    return;
                }

                if (event === "loginByToken") {
                    var known = KUMA_USERS.some(function (u) { return u.token === a; });
                    authed = known;
                    if (cb) cb(known ? { ok: true } : { ok: false, msg: "authInvalidToken" });
                    return;
                }

                if (event === "logout") { authed = false; return; }

                if (event === "getMonitorList") {
                    if (!authed) return;
                    var list = {};
                    SERVICES.forEach(function (s) {
                        list[String(s.id)] = {
                            id: s.id,
                            name: s.name,
                            url: "https://" + s.slug + ".example.lan"
                        };
                    });
                    (handlers.monitorList || []).forEach(function (fn) { fn(list); });
                    return;
                }
            }
        };

        setTimeout(function () {
            (handlers.connect || []).forEach(function (fn) { fn(); });
        }, 30);

        return socket;
    };

    /* ---------- runtime config, normally written by the entrypoint ---------- */
    window.__DASHBOARD_CONFIG__ = { statusSlug: "homelab", storageMount: "auto" };
})();
