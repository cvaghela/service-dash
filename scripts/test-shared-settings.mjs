#!/usr/bin/env node
// Regression tests for saving the shared settings document.
//
// Why this exists. A save sends the whole document and the server replaces it.
// Until 1.6.1 the document was built from this version's own keys only, so a
// dashboard that did not know a setting deleted it the moment it saved
// anything. That is what 1.5.6 did to 1.6.0's categories and renewal dates: an
// old tab left open on another device was enough. Each newer release would
// have been exposed to the one before it the same way.
//
// The code under test is read straight out of assets/js/app.js and run, so this
// cannot drift from what ships.
//
//     node scripts/test-shared-settings.mjs

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import vm from "node:vm";

const APP = fileURLToPath(new URL("../assets/js/app.js", import.meta.url));
const src = readFileSync(APP, "utf8");

let pass = 0;
let fail = 0;
const check = (cond, name, why) => {
    if (cond) {
        pass++;
        console.log(`  ok    ${name}`);
    } else {
        fail++;
        console.log(`  FAIL  ${name}\n     ${why}`);
    }
};

function between(startMarker, endMarker) {
    const i = src.indexOf(startMarker);
    if (i < 0) throw new Error(`app.js: cannot find ${startMarker}`);
    const j = src.indexOf(endMarker, i);
    if (j < 0) throw new Error(`app.js: cannot find the end of ${startMarker}`);
    return src.slice(i, j + endMarker.length);
}
const fn = (name) => between(`function ${name}(`, "\n}");

const store = new Map();
const localStorage = {
    getItem: (k) => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => store.set(k, String(v)),
};

const code = [
    between("const SHARED_KEYS = [", "];"),
    fn("foreignSharedValues"),
    fn("collectSharedSettings"),
    "globalThis.__t = { SHARED_KEYS, foreignSharedValues, collectSharedSettings };",
].join("\n");
const ctx = vm.createContext({ localStorage, Object, Date, JSON });
vm.runInContext(code, ctx);
const T = ctx.__t;

// A document a newer dashboard wrote: one key this version owns, one it does
// not know, and some junk that is not a setting at all.
const remote = {
    serviceIcons: '{"plex":"old"}',
    futureSetting: '{"from":"a newer release"}',
    notAString: 42,
};
store.set("serviceIcons", '{"plex":"new"}');

console.log("\nmerging");
const foreign = T.foreignSharedValues(remote);
const doc = T.collectSharedSettings(foreign);
check(
    doc.values.futureSetting === remote.futureSetting,
    "a setting from a newer version survives this version's save",
    "it was dropped, so the server copy loses it",
);
check(doc.values.serviceIcons === '{"plex":"new"}', "this version's own settings win over the server's older copy", `got ${doc.values.serviceIcons}`);
check(!("notAString" in doc.values), "only string values are carried, as everywhere else in the document", "a non-string value was passed through");

// A known key this browser does not hold must not come back from the server.
const known = T.SHARED_KEYS.find((k) => k !== "serviceIcons");
const withKnown = T.foreignSharedValues({ [known]: '"stale"', futureSetting: "x" });
check(!(known in withKnown), "a setting this version owns is never taken from the server's copy", `${known} would be resurrected`);
check(T.foreignSharedValues(null) && Object.keys(T.foreignSharedValues(null)).length === 0, "an empty or missing document carries nothing", "it threw or invented keys");

console.log("\nwiring");
const save = fn("saveSharedSettings");
const getAt = save.search(/fetch\(SHARED_SETTINGS_URL, \{ cache: "no-store" \}\)/);
const putAt = save.indexOf('method: "PUT"');
check(getAt >= 0 && getAt < putAt, "a save re-reads the document before replacing it", "it writes without looking, so a newer device's settings are lost");
check(/collectSharedSettings\(_sharedForeignValues\)/.test(save), "the save sends what it re-read", "the re-read is thrown away");
check(/_sharedForeignValues = foreignSharedValues\(payload\?\.values\)/.test(fn("loadSharedSettings")), "the copy from load is the fallback when the re-read fails", "a failed re-read deletes them");

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
