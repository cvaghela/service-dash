#!/usr/bin/env node
// Regression tests for automatic categorisation.
//
// Why this exists. The categoriser used to be nine regexes, first match wins,
// and on a real install of 22 services it filed 12 under Other -- eight of them
// well-known apps the regexes simply did not list. It is now three layers (the
// user's pick, a table of known apps, generic keywords), and each layer has a
// way of going quietly wrong that nothing else would notice:
//
//   * a typo'd category in the table files apps under a chip with no label;
//   * an app listed twice silently takes whichever entry came last;
//   * an ordinary word that is also an app ("Flood", "Garage") hijacks any
//     monitor whose name happens to contain it;
//   * an unanchored keyword ("nas", "s3") fires inside unrelated words.
//
// The code under test is read straight out of assets/js/app.js and run, not
// copied here, so this cannot drift from what ships.
//
//     node scripts/test-categories.mjs

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import vm from "node:vm";

const APP = fileURLToPath(new URL("../assets/js/app.js", import.meta.url));
const src = readFileSync(APP, "utf8");

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

// --- extract the real code -------------------------------------------------
function between(startMarker, endMarker) {
    const i = src.indexOf(startMarker);
    if (i < 0) throw new Error(`app.js: cannot find ${startMarker}`);
    const j = src.indexOf(endMarker, i);
    if (j < 0) throw new Error(`app.js: cannot find the end of ${startMarker}`);
    return src.slice(i, j + endMarker.length);
}
const fn = (name) => between(`function ${name}(`, "\n}");

const code = [
    "function safeStr(v) { return v == null ? '' : String(v); }",
    between("// <category-detection>", "// </category-detection>"),
    between("const CATEGORY_META = {", "\n};"),
    between("const SERVICE_ICONS = [", "\n];"),
    // The catalogue loads over the network; with it absent the icon matcher
    // falls back to its curated list, which is exactly the offline behaviour.
    "const ICON_INDEX = []; function indexIconEntryFor() { return null; }",
    "let SERVICE_CATEGORIES = new Map();",
    // Storage is stubbed rather than skipped: the custom-category code reads and
    // writes it, and a save that throws would hide a real failure.
    "const __store = new Map(); const localStorage = { getItem: (k) => __store.has(k) ? __store.get(k) : null, setItem: (k, v) => __store.set(k, String(v)) };",
    "function scheduleSharedSettingsSave() {} const state = { categoryFilter: 'all' };",
    between("const CUSTOM_CATEGORY_STORAGE_KEY", "registerCustomCategories();"),
    fn("loadCustomCategories"),
    fn("saveCustomCategories"),
    fn("registerCustomCategories"),
    fn("addCustomCategory"),
    fn("removeCustomCategory"),
    fn("saveServiceCategories"),
    between("const AMBIGUOUS_APP_WORDS = new Set(", "\n);"),
    fn("baseServiceKey"),
    fn("serviceIconEntryFor"),
    fn("autoCategoryFor"),
    fn("detectCategory"),
    fn("categoryOverrideFor"),
    "globalThis.__t = { APP_CATEGORY_GROUPS, APP_CATEGORIES, KEYWORDS, CATEGORY_META, detectCategory, addCustomCategory, removeCustomCategory, state, overrides: () => SERVICE_CATEGORIES, reloadCustom: () => { CUSTOM_CATEGORIES = loadCustomCategories(); registerCustomCategories(); }, wipeCustom: () => { __store.delete(CUSTOM_CATEGORY_STORAGE_KEY); CUSTOM_CATEGORIES = new Map(); registerCustomCategories(); }, setOverride: (k, v) => SERVICE_CATEGORIES.set(k, v), clearOverrides: () => SERVICE_CATEGORIES.clear() };",
].join("\n");

const ctx = vm.createContext({ Object, Map, Set, String, Math, console });
vm.runInContext(code, ctx);
const T = ctx.__t;

// --- the data is consistent -------------------------------------------------
console.log("\ndata");

const known = new Set(Object.keys(T.CATEGORY_META));
const usedByTable = new Set(Object.keys(T.APP_CATEGORY_GROUPS));
const usedByKeywords = new Set(T.KEYWORDS.map((k) => k.category));
const unknown = [...usedByTable, ...usedByKeywords].filter((c) => !known.has(c));
unknown.length
    ? bad("every category the matcher can return has a chip", `no CATEGORY_META entry for: ${[...new Set(unknown)].join(", ")}`)
    : ok("every category the matcher can return has a chip");

// The Map would silently keep the last entry, so collisions are counted from
// the source groups, after the same normalisation the matcher applies.
const seen = new Map();
const collisions = [];
for (const [category, apps] of Object.entries(T.APP_CATEGORY_GROUPS)) {
    for (const app of apps) {
        const key = app.toLowerCase().replace(/[^a-z0-9]/g, "");
        if (seen.has(key) && seen.get(key).category !== category) {
            collisions.push(`${app} is in both ${seen.get(key).category} and ${category}`);
        }
        seen.set(key, { category, app });
    }
}
collisions.length
    ? bad("no app is filed under two categories", collisions.join("; "))
    : ok("no app is filed under two categories");

// --- known apps --------------------------------------------------------------
console.log("\nknown apps");

const expect = (name, want, label = `${name} -> ${want}`) => {
    const got = T.detectCategory(name);
    got === want ? ok(label) : bad(label, `got ${got}`);
};

// The eight that used to land in Other on a real install.
expect("Prowlarr", "downloads");
expect("qBittorrent", "downloads");
expect("SABnzbd", "downloads");
expect("Homebridge", "automation");
expect("Mealie", "home");
expect("ArchiveBox", "docs");
expect("ConvertX", "tools");
expect("Mini QR", "tools");

// Overseerr and Jellyseerr are the same kind of app, and the old table filed
// them under two different chips.
const ov = T.detectCategory("Overseerr");
const je = T.detectCategory("Jellyseerr");
ov === je && ov === "media"
    ? ok("Overseerr and Jellyseerr share a chip (media)")
    : bad("Overseerr and Jellyseerr share a chip (media)", `Overseerr=${ov} Jellyseerr=${je}`);

expect("Sonarr", "downloads");
expect("Plex", "media");
expect("Tautulli", "media");
expect("Home Assistant", "automation");
expect("IT Tools", "tools");
expect("Stirling PDF", "tools");
expect("ZimaOS", "storage");
expect("Vaultwarden", "security");
expect("Gitea", "dev");
expect("Uptime Kuma", "monitoring");

// --- names that are more than the app ---------------------------------------
console.log("\nlonger names");

expect("Radarr 4K", "downloads", "a suffix is ignored: Radarr 4K -> downloads");
expect("Plex Media Server", "media", "a word run is found: Plex Media Server -> media");
expect("Home Assistant Prod", "automation", "a two-word app inside a longer name");
expect("Sonarr local", "downloads", "the Local suffix is stripped first");
expect("HASS", "automation", "an icon alias the table does not list (HASS)");

// --- words that only look like apps -----------------------------------------
console.log("\nambiguous words");

expect("Flood", "downloads", "a card called just Flood is the torrent client");
const sensor = T.detectCategory("Flood Sensor");
sensor !== "downloads"
    ? ok("Flood Sensor is not a download client")
    : bad("Flood Sensor is not a download client", "an ordinary word was picked out of a longer name");
const door = T.detectCategory("Garage Door");
door !== "storage"
    ? ok("Garage Door is not the Garage storage server")
    : bad("Garage Door is not the Garage storage server", "an ordinary word was picked out of a longer name");

// --- generic keywords, on word boundaries -----------------------------------
console.log("\nkeywords");

expect("Team Wiki", "docs");
expect("Office NAS", "storage");
expect("Nightly Backup", "backup");
// The old patterns had no boundaries, so "nas" fired inside longer words.
expect("Bananas", "other", "nas inside a word does not mean storage");
expect("Canasta Night", "other", "nas inside a word does not mean storage (Canasta)");
expect("Tony", "other", "a name with no signal stays in Other");

// --- the user's own pick ------------------------------------------------------
console.log("\noverrides");

T.clearOverrides();
T.setOverride("tony", "home");
expect("Tony", "home", "a pick beats the automatic result");
T.setOverride("prowlarr", "media");
expect("Prowlarr", "media", "a pick beats even a known app");
// From a newer dashboard sharing the settings document, say.
T.setOverride("sonarr", "no-such-category");
expect("Sonarr", "downloads", "a pick naming an unknown category is ignored");
T.clearOverrides();

// --- categories the user made up -------------------------------------------
console.log("\ncustom categories");

T.clearOverrides();
const lab = T.addCustomCategory("  Home   Lab ");
lab && T.CATEGORY_META[lab]?.label === "Home Lab"
    ? ok("a custom category is created, with its name tidied")
    : bad("a custom category is created, with its name tidied", `got key ${lab}, label ${T.CATEGORY_META[lab]?.label}`);
lab && !Object.hasOwn({ media: 1, downloads: 1, monitoring: 1, storage: 1, automation: 1, home: 1, docs: 1, tools: 1, network: 1, security: 1, dev: 1, backup: 1, other: 1 }, lab)
    ? ok("its key cannot collide with a built-in one")
    : bad("its key cannot collide with a built-in one", `key ${lab}`);

const media = T.addCustomCategory("media");
media === "media"
    ? ok("typing a built-in name picks that category instead of making a twin")
    : bad("typing a built-in name picks that category instead of making a twin", `got ${media}`);
const again = T.addCustomCategory("HOME LAB");
again === lab
    ? ok("typing an existing custom name, in any case, picks it")
    : bad("typing an existing custom name, in any case, picks it", `got ${again}`);

T.setOverride("tony", lab);
expect("Tony", lab, "a card can be filed under a custom category");

// It must survive a reload, which is what another device sharing the settings
// document amounts to.
T.reloadCustom();
expect("Tony", lab, "the custom category survives a reload");

T.state.categoryFilter = lab;
T.removeCustomCategory(lab);
expect("Tony", "other", "removing it sends its cards back to automatic");
!T.overrides().has("tony")
    ? ok("removing it drops the picks that named it")
    : bad("removing it drops the picks that named it", "a pick survived and would revive if the name came back");
// Removed on another device arrives as a reload with the entry gone, so this
// is what keeps a dead chip label from lingering until the page is reopened.
!Object.hasOwn(T.CATEGORY_META, lab)
    ? ok("removing it takes it out of the chip table")
    : bad("removing it takes it out of the chip table", "the category is still registered and still selectable");
T.state.categoryFilter === "all"
    ? ok("removing the category being filtered on falls back to All")
    : bad("removing the category being filtered on falls back to All", `filter left on ${T.state.categoryFilter}`);

// A newer or older dashboard, or a hand-edited document, can hold anything.
T.wipeCustom();
T.clearOverrides();
T.setOverride("tony", "custom:ghost");
expect("Tony", "other", "a pick naming a custom category that does not exist is ignored");
T.clearOverrides();

// The chip and the summary print what someone typed, so it must be escaped.
const chips = src.match(/function renderChipsWithCounts\(\)[\s\S]*?\n\}/)?.[0] ?? "";
/escapeHtml\(label\)/.test(chips) && /escapeAttr\(c\)/.test(chips)
    ? ok("category chips escape the name and the key")
    : bad("category chips escape the name and the key", "a custom category named <img onerror=...> would run in every viewer's browser");

// --- coverage: popular apps must not fall through to Other -------------------
console.log("\ncoverage");

const popular = [
    "Jellyfin", "Emby", "Immich", "Audiobookshelf", "Navidrome", "Lidarr", "Bazarr",
    "Jackett", "Transmission", "Deluge", "NZBGet", "Grafana", "Prometheus", "Netdata",
    "Nextcloud", "Seafile", "Syncthing", "Node-RED", "Zigbee2MQTT", "ESPHome",
    "Paperless-ngx", "BookStack", "Linkwarden", "FreshRSS", "Pi-hole", "AdGuard Home",
    "Traefik", "Nginx Proxy Manager", "WireGuard", "Authentik", "Authelia", "Portainer",
    "Forgejo", "Duplicati", "Kopia", "Firefly III", "Grocy", "Tandoor", "Frigate",
    "SearXNG", "Open WebUI", "Ollama",
];
const fellThrough = popular.filter((name) => T.detectCategory(name) === "other");
fellThrough.length
    ? bad(`${popular.length} popular apps all get a category`, `landed in Other: ${fellThrough.join(", ")}`)
    : ok(`${popular.length} popular apps all get a category`);

// --- the saved filter survives a removed category ---------------------------
console.log("\nupgrade");

// restorePrefs() is not separable from the rest of startup, so this one is
// read rather than run -- and it was mutation-tested, so it does fail.
const restore = src.match(/if \(p\.categoryFilter\) \{[\s\S]*?\n {8}\}/);
restore && /CATEGORY_META/.test(restore[0]) && /"all"/.test(restore[0])
    ? ok("a saved filter for a removed category falls back to All")
    : bad(
          "a saved filter for a removed category falls back to All",
          "restorePrefs() takes categoryFilter on trust -- anyone with Requests selected would reopen to an empty grid",
      );

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
