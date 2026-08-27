/*
 * Service Dash — Uptime Kuma session validator.
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

/*
 * The dashboard has no accounts of its own. Writing the shared settings is
 * gated on being logged into Uptime Kuma, and this is the only piece that can
 * actually check that: nginx cannot verify a Kuma token, and the browser
 * claiming to be logged in proves nothing. Kuma's `loginByToken` verifies the
 * JWT against its own secret, confirms the user is still active, and rejects
 * tokens issued before a password change — so asking Kuma is a real check.
 *
 * nginx calls GET /validate through auth_request. 204 means yes, 401 means no.
 * Everything that is not an explicit yes is a no.
 */

const http = require("node:http");
const crypto = require("node:crypto");
const { io } = require("socket.io-client");

const KUMA_URL = process.env.KUMA_URL || "";
const PORT = Number(process.env.PORT || 2371);
// Kuma runs `afterLogin` on every successful check, which is real work on its
// side, so an answer is reused briefly rather than asked per keystroke.
const CACHE_TTL_MS = Math.max(0, Number(process.env.CACHE_TTL_SECONDS || 60)) * 1000;
const VALIDATE_TIMEOUT_MS = Math.max(1000, Number(process.env.VALIDATE_TIMEOUT_MS || 5000));
const TOKEN_HEADER = "x-kuma-token";
// nginx checks every request to the settings document, because auth_request
// cannot be made conditional. It forwards the caller's real method here so
// reads stay open and only writes have to prove anything.
const METHOD_HEADER = "x-original-method";
const OPEN_METHODS = new Set(["GET", "HEAD"]);

if (!KUMA_URL) {
    console.error("KUMA_URL is required, for example http://host.docker.internal:3001");
    process.exit(1);
}

// Keyed by a hash: the token itself is never stored, logged, or echoed.
const cache = new Map();
const inFlight = new Map();

const fingerprint = (token) => crypto.createHash("sha256").update(token).digest("hex");

function cached(key) {
    const hit = cache.get(key);
    if (!hit) return null;
    if (Date.now() > hit.expiresAt) {
        cache.delete(key);
        return null;
    }
    return hit.ok;
}

function remember(key, ok) {
    if (!CACHE_TTL_MS) return;
    // A rejection is cached too, so a bad token cannot be used to hammer Kuma.
    cache.set(key, { ok, expiresAt: Date.now() + CACHE_TTL_MS });
}

function askKuma(token) {
    return new Promise((resolve) => {
        let settled = false;
        const socket = io(KUMA_URL, {
            transports: ["websocket", "polling"],
            reconnection: false,
            timeout: VALIDATE_TIMEOUT_MS,
            forceNew: true,
        });

        const finish = (ok) => {
            if (settled) return;
            settled = true;
            clearTimeout(timer);
            try {
                socket.close();
            } catch {}
            resolve(ok);
        };

        // Fail closed: an unreachable or slow Kuma is not an authorisation.
        const timer = setTimeout(() => finish(false), VALIDATE_TIMEOUT_MS);

        socket.on("connect_error", () => finish(false));
        socket.on("error", () => finish(false));

        socket.on("connect", () => {
            try {
                socket.emit("loginByToken", token, (res) => finish(res?.ok === true));
            } catch {
                finish(false);
            }
        });
    });
}

async function validate(token) {
    const key = fingerprint(token);

    const known = cached(key);
    if (known !== null) return known;

    // Collapse a burst of identical checks into one question for Kuma.
    if (inFlight.has(key)) return inFlight.get(key);

    const pending = askKuma(token)
        .then((ok) => {
            remember(key, ok);
            return ok;
        })
        .finally(() => inFlight.delete(key));

    inFlight.set(key, pending);
    return pending;
}

const server = http.createServer(async (req, res) => {
    if (req.method !== "GET" && req.method !== "HEAD") {
        res.writeHead(405).end();
        return;
    }

    const path = (req.url || "").split("?")[0];

    if (path === "/healthz") {
        res.writeHead(200, { "Content-Type": "text/plain" }).end("ok\n");
        return;
    }

    if (path !== "/validate") {
        res.writeHead(404).end();
        return;
    }

    // Reading the settings is open, exactly as reading the dashboard is.
    const originalMethod = String(req.headers[METHOD_HEADER] || "").toUpperCase();
    if (OPEN_METHODS.has(originalMethod)) {
        res.writeHead(204).end();
        return;
    }

    const token = String(req.headers[TOKEN_HEADER] || "").trim();
    if (!token) {
        res.writeHead(401).end();
        return;
    }

    let ok = false;
    try {
        ok = await validate(token);
    } catch {
        ok = false;
    }

    res.writeHead(ok ? 204 : 401).end();
});

server.listen(PORT, () => {
    // The URL is logged; no token ever is.
    console.log(`kuma-auth listening on :${PORT}, validating against ${KUMA_URL}`);
});
