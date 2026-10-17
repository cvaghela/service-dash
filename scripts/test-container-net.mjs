#!/usr/bin/env node
// Regression tests for the per-container traffic wave on the cards.
//
// Why this exists. Each piece has a way of going quietly wrong that the
// dashboard would draw without complaint:
//
//   * Netdata publishes nine cgroup_NAME.net_* charts per interface and only one
//     is traffic. Matching on the prefix would draw packets/s, drops or the
//     link's MTU as if it were bandwidth.
//   * Netdata answers newest row first, and stores "sent" as negative numbers.
//     Either one unhandled draws the wave backwards or upside down.
//   * A container with two interfaces, or a card mapped to two containers,
//     must add up point by point, not concatenate.
//   * A failed fetch must leave the wave alone, not flatten it to zero.
//
// The code under test is read straight out of assets/js/app.js and run, so this
// cannot drift from what ships.
//
//     node scripts/test-container-net.mjs

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import vm from "node:vm";

const APP = fileURLToPath(new URL("../assets/js/app.js", import.meta.url));
const CSS = fileURLToPath(new URL("../assets/css/styles.css", import.meta.url));
const src = readFileSync(APP, "utf8");
const css = readFileSync(CSS, "utf8");

let pass = 0;
let fail = 0;
const ok = (name) => {
    pass++;
    console.log(`  ok    ${name}`);
};
const bad = (name, why) => {
    fail++;
    console.log(`  FAIL  ${name}\n     ${why}`);
};
const check = (cond, name, why) => (cond ? ok(name) : bad(name, why));

function between(startMarker, endMarker) {
    const i = src.indexOf(startMarker);
    if (i < 0) throw new Error(`app.js: cannot find ${startMarker}`);
    const j = src.indexOf(endMarker, i);
    if (j < 0) throw new Error(`app.js: cannot find the end of ${startMarker}`);
    return src.slice(i, j + endMarker.length);
}
const fn = (name) => between(`function ${name}(`, "\n}");
const constLine = (name) => between(`const ${name} =`, ";");

const code = [
    constLine("NET_WAVE_SECONDS"),
    constLine("NET_WAVE_POINTS"),
    constLine("NET_WAVE_MID"),
    constLine("NET_WAVE_UP"),
    constLine("NET_WAVE_DOWN"),
    constLine("NET_WAVE_FLOOR_KBPS"),
    fn("netWaveScale"),
    fn("containerNetCharts"),
    fn("combineNetHistory"),
    fn("netWavePaths"),
    "globalThis.__t = { containerNetCharts, combineNetHistory, netWavePaths, netWaveScale, NET_WAVE_MID, NET_WAVE_UP, NET_WAVE_DOWN, NET_WAVE_POINTS };",
].join("\n");

const ctx = vm.createContext({ Map, Set, Math, Number, String, Array, Object });
vm.runInContext(code, ctx);
const T = ctx.__t;

// --- finding the traffic charts --------------------------------------------
console.log("\ndiscovery");

// The real shape, from a live Netdata: one traffic chart among its siblings.
const siblings = ["net_operstate", "net_carrier", "net_mtu", "net_packets", "net_errors", "net_drops", "net_fifo", "net_events"];
const charts = {};
const add = (name, iface) => {
    charts[`cgroup_${name}.net_${iface}`] = { context: "cgroup.net_net", units: "kilobits/s" };
    for (const s of siblings) charts[`cgroup_${name}.${s}_${iface}`] = { context: `cgroup.${s}`, units: "x" };
};
add("plex", "eth0");
add("multi", "eth0");
add("multi", "eth1");
// cloudflared runs on the host's network: CPU and RAM, no traffic of its own.

const found = T.containerNetCharts(charts, ["plex", "multi", "cloudflared"]);
check(
    JSON.stringify(found.get("plex")) === JSON.stringify(["cgroup_plex.net_eth0"]),
    "only the traffic chart is picked, not its eight siblings",
    `got ${JSON.stringify(found.get("plex"))}`,
);
check(found.get("multi")?.length === 2, "a container with two interfaces gets both", `got ${JSON.stringify(found.get("multi"))}`);
check(!found.has("cloudflared"), "a host-network container gets no wave rather than a flat zero", "it was given charts it does not have");

// A Netdata that sends no context: units decide.
const legacy = T.containerNetCharts(
    { "cgroup_a.net_eth0": { units: "kilobits/s" }, "cgroup_a.net_packets_eth0": { units: "packets/s" } },
    ["a"],
);
check(
    JSON.stringify(legacy.get("a")) === JSON.stringify(["cgroup_a.net_eth0"]),
    "without a context, the units tell traffic apart",
    `got ${JSON.stringify(legacy.get("a"))}`,
);

// --- reading the history ----------------------------------------------------
console.log("\nhistory");

// Newest first, sent negative -- exactly as Netdata answers without "abs".
const nd = (rows) => ({ labels: ["time", "received", "sent"], data: rows });
const one = T.combineNetHistory([nd([[30, 3, -30], [20, 2, -20], [10, 1, -10]])]);
check(
    JSON.stringify(one.rx) === "[1,2,3]",
    "rows come out oldest first, so the wave scrolls the right way",
    `rx ${JSON.stringify(one.rx)}`,
);
check(JSON.stringify(one.tx) === "[10,20,30]", "upload is made positive", `tx ${JSON.stringify(one.tx)}`);
check(one.rxNow === 3 && one.txNow === 30, "the figures are the newest point", `now ${one.rxNow}/${one.txNow}`);

const two = T.combineNetHistory([nd([[20, 2, 0], [10, 1, 0]]), nd([[20, 5, 0], [10, 4, 0]])]);
check(JSON.stringify(two.rx) === "[5,7]", "two interfaces add up point by point", `rx ${JSON.stringify(two.rx)}`);

const ragged = T.combineNetHistory([nd([[20, 2, 0], [10, 1, 0]]), nd([[20, 5, 0]])]);
check(
    ragged.rx.length === 2 && ragged.rx[1] === 7,
    "a chart missing a row still lines up by timestamp",
    `rx ${JSON.stringify(ragged.rx)}`,
);

check(T.combineNetHistory([]) === null, "no data at all is null, not an empty wave", "got something");
check(T.combineNetHistory([{ labels: ["time", "foo"], data: [[1, 2]] }]) === null, "a chart with neither direction is ignored", "it was read");

const long = T.combineNetHistory([nd(Array.from({ length: 90 }, (_, i) => [1000 - i, 1, 0]))]);
check(long.rx.length === T.NET_WAVE_POINTS, `the window is held to ${T.NET_WAVE_POINTS} points`, `got ${long.rx.length}`);

// --- drawing ----------------------------------------------------------------
console.log("\ndrawing");

const ys = (d) => [...d.matchAll(/[ML](-?[\d.]+),(-?[\d.]+)|Q(-?[\d.]+),(-?[\d.]+) (-?[\d.]+),(-?[\d.]+)/g)].flatMap((m) =>
    m[1] !== undefined ? [Number(m[2])] : [Number(m[4]), Number(m[6])],
);
const down = T.netWavePaths([0, 50, 400, 100], 100, 1, T.NET_WAVE_UP);
const downY = ys(down.line);
check(
    Math.min(...downY) >= T.NET_WAVE_MID - T.NET_WAVE_UP - 1e-9 && Math.max(...downY) <= T.NET_WAVE_MID,
    "download stays between the centre line and its ceiling, even past the peak",
    `y range ${Math.min(...downY)}..${Math.max(...downY)}`,
);
const up = T.netWavePaths([0, 50, 400, 100], 100, -1, T.NET_WAVE_DOWN);
const upY = ys(up.line);
check(
    Math.min(...upY) >= T.NET_WAVE_MID && Math.max(...upY) <= T.NET_WAVE_MID + T.NET_WAVE_DOWN + 1e-9,
    "upload stays below the centre line",
    `y range ${Math.min(...upY)}..${Math.max(...upY)}`,
);
check(
    T.NET_WAVE_MID - T.NET_WAVE_UP >= 0 && T.NET_WAVE_MID + T.NET_WAVE_DOWN <= 100,
    "the wave fits the card at full scale",
    `spans ${T.NET_WAVE_MID - T.NET_WAVE_UP}..${T.NET_WAVE_MID + T.NET_WAVE_DOWN} of 0..100`,
);
check(down.fill.endsWith("Z") && down.fill.startsWith(down.line), "the fill closes on the centre line", down.fill.slice(-40));
// Measured on the smoke host: an idle container's chatter is under 1 Kb/s.
const idle = { rx: [0.5, 0.9, 0.6, 1.0], tx: [0, 0, 0.2, 0] };
const idleY = ys(T.netWavePaths(idle.rx, T.netWaveScale(idle), 1, T.NET_WAVE_UP).line);
check(
    T.NET_WAVE_MID - Math.min(...idleY) < 2,
    "an idle container stays near the line instead of filling the card",
    `idle traffic rose ${(T.NET_WAVE_MID - Math.min(...idleY)).toFixed(1)} of ${T.NET_WAVE_UP} units`,
);
const busy = { rx: [200, 5000, 3000], tx: [10, 400, 90] };
check(T.netWaveScale(busy) === 5000, "a busy container scales to its own peak", `scale ${T.netWaveScale(busy)}`);
check(T.netWavePaths([5], 10, 1, 10).line === "", "one point draws nothing rather than a broken path", "drew something");

// --- the parts that are read, not run ---------------------------------------
console.log("\nwiring");

// tickContainerStats() is not separable from the poll; these were each
// mutation-tested, so they do fail.
const tick = src.match(/async function tickContainerStats\(\)[\s\S]*?\n\}/)?.[0] ?? "";
check(
    /netOk\.length === netCharts\.length[\s\S]{0,80}:\s*undefined/.test(tick),
    "a failed traffic fetch keeps the wave as it was",
    "a partial or failed fetch is drawn -- a dropped request would show as traffic falling to zero",
);
check(/options:\s*"abs"/.test(src), "history is asked for with options=abs", "sent traffic arrives negative");

// Readability: the wave is cut back behind everything that carries text.
const sel = src.match(/const NET_WAVE_TEXT_SELECTOR = "([^"]+)"/)?.[1] ?? "";
const missing = [".svcName", ".linkLine", ".containerStat", ".netFigures"].filter((s) => !sel.includes(s));
check(!missing.length, "the wave dims behind the name, the link rows, the pills and the figures", `not masked: ${missing.join(", ")}`);

// The wave must not move anything. The rule lifting the content above it once
// made each row position: relative, which made the top row the status dot's
// containing block -- the dot sat in a different spot on every wave card.
const lift = css.match(/\.card\[data-netwave\] > :not\(\.netWave\)\s*\{[^}]*\}/)?.[0] ?? "";
check(
    lift && !/position\s*:/.test(lift),
    "the wave leaves the status dot where every other card has it",
    lift ? "the rows above the wave are positioned, so the dot is placed inside the top row" : "the lifting rule is missing",
);

// Every theme: light mode carries its own, deeper colours. The neon pair that
// works on a dark ground measured 3.2:1 on the light one.
const light = css.match(/\[data-theme="light"\]\s*\{[^}]*--nw-rx:[^}]*\}/)?.[0] ?? "";
check(
    /--nw-rx:\s*21 128 61/.test(light) && /--nw-tx:/.test(light),
    "light mode has its own wave colours",
    "light mode inherits the neon colours tuned for dark",
);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
