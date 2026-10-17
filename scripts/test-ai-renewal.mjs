#!/usr/bin/env node
// Regression tests for the AI plan renewal date.
//
// Why this exists. Neither provider reports a renewal date, so it is entered by
// hand once and rolled forward from then on. Date arithmetic goes wrong
// quietly, and every way it can is a date that looks plausible on the card:
//
//   * Stepping from the previous renewal instead of the entered one turns a
//     renewal on the 31st into the 28th after February, for good.
//   * Date accepts 2026-02-30 and silently means 2 March.
//   * A renewal due today must say today, not jump a cycle ahead.
//   * Days are counted between local midnights; a day across a clock change is
//     23 or 25 hours long.
//
// The code under test is read straight out of assets/js/app.js and run, so this
// cannot drift from what ships.
//
//     node scripts/test-ai-renewal.mjs

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
const constLine = (name) => between(`const ${name} =`, ";");

const code = [
    constLine("AI_RENEWAL_CYCLES"),
    constLine("AI_RENEWAL_KINDS"),
    constLine("AI_RENEWAL_SOON_DAYS"),
    fn("parseRenewalDate"),
    fn("addMonthsClamped"),
    fn("nextRenewal"),
    fn("renewalSummary"),
    "globalThis.__t = { parseRenewalDate, nextRenewal, renewalSummary };",
].join("\n");

// The test pins the time zone to one with a clock change, so the day count is
// tested across one.
process.env.TZ = "Europe/London";
const ctx = vm.createContext({ Date, Math, Number, String, Object });
vm.runInContext(code, ctx);
const T = ctx.__t;

const day = (text) => {
    const [y, m, d] = text.split("-").map(Number);
    return new Date(y, m - 1, d, 15, 30); // mid-afternoon: time of day must not matter
};
const iso = (date) =>
    date
        ? `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`
        : "null";
const next = (date, every, today) => iso(T.nextRenewal({ date, every }, day(today)));

console.log("\nparsing");
check(T.parseRenewalDate("2026-02-30") === null, "an impossible date is refused, not rolled into March", "it was accepted");
check(T.parseRenewalDate("14/11/2026") === null, "only the date input's own format is read", "it was accepted");
check(iso(T.parseRenewalDate("2028-02-29")) === "2028-02-29", "a real leap day is accepted", "it was refused");
check(T.nextRenewal({ date: "2026-11-14", every: "weekly" }, day("2026-10-17")) === null, "an unknown cycle draws nothing", "it drew a date");

console.log("\nrolling forward");
check(next("2026-11-14", "month", "2026-10-17") === "2026-11-14", "a future date is the next renewal", next("2026-11-14", "month", "2026-10-17"));
check(next("2026-10-17", "month", "2026-10-17") === "2026-10-17", "a renewal due today is today, not next month", next("2026-10-17", "month", "2026-10-17"));
check(next("2026-10-16", "month", "2026-10-17") === "2026-11-16", "yesterday's renewal moves a month on", next("2026-10-16", "month", "2026-10-17"));
check(next("2023-03-05", "month", "2026-10-17") === "2026-11-05", "a date years back lands on the right month", next("2023-03-05", "month", "2026-10-17"));
check(next("2024-06-01", "year", "2026-10-17") === "2027-06-01", "a yearly plan steps by years", next("2024-06-01", "year", "2026-10-17"));

console.log("\nmonth ends");
check(next("2026-01-31", "month", "2027-02-10") === "2027-02-28", "the 31st falls on the last day of February", next("2026-01-31", "month", "2027-02-10"));
check(
    next("2026-01-31", "month", "2027-03-01") === "2027-03-31",
    "and goes back to the 31st afterwards, rather than staying on the 28th",
    next("2026-01-31", "month", "2027-03-01"),
);
check(next("2028-02-29", "year", "2029-01-01") === "2029-02-28", "a leap-day yearly plan renews on the 28th in other years", next("2028-02-29", "year", "2029-01-01"));

console.log("\nthe line on the card");
const s = (date, today) => T.renewalSummary({ date, every: "month" }, day(today));
check(/today$/.test(s("2026-10-17", "2026-10-17").text), "due today says today", s("2026-10-17", "2026-10-17").text);
check(/tomorrow$/.test(s("2026-10-18", "2026-10-17").text), "due tomorrow says tomorrow", s("2026-10-18", "2026-10-17").text);
// The UK clocks go back on 25 October 2026; that week has a 25-hour day.
check(s("2026-10-30", "2026-10-20").days === 10, "days are counted across a clock change", `got ${s("2026-10-30", "2026-10-20").days}`);
check(s("2026-10-20", "2026-10-17").soon && !s("2026-10-21", "2026-10-17").soon, "it warns inside the last three days only", "the warning window is off");
check(s("2027-01-05", "2026-12-20").text.includes("2027"), "a date in another year says which year", s("2027-01-05", "2026-12-20").text);
check(T.renewalSummary(undefined) === null, "no date set draws no line", "it drew one");

console.log("\nexpiring");
const ex = (date, today) => T.renewalSummary({ date, every: "month", kind: "expires" }, day(today));
check(
    ex("2026-11-14", "2026-10-17").text.startsWith("Expires Nov 14") && ex("2026-11-14", "2026-10-17").days === 28,
    "an expiry reads as one, with its countdown",
    ex("2026-11-14", "2026-10-17").text,
);
check(
    ex("2026-10-10", "2026-10-17").text.startsWith("Expired") && ex("2026-10-10", "2026-10-17").soon,
    "a passed expiry says it has expired, and warns, rather than rolling on a month",
    ex("2026-10-10", "2026-10-17").text,
);
check(
    /^Renews/.test(T.renewalSummary({ date: "2026-11-14", every: "month" }, day("2026-10-17")).text),
    "an entry saved before Expires existed still renews",
    T.renewalSummary({ date: "2026-11-14", every: "month" }, day("2026-10-17")).text,
);

console.log("\nwiring");
const keys = between("const SHARED_KEYS = [", "];");
check(keys.includes('"aiRenewals"'), "the date is shared with the other settings", "each device would need it entered separately");
const load = fn("loadSharedSettings");
check(/AI_RENEWALS = loadAiRenewals\(\)/.test(load), "a date set on another device is picked up", "it is only read when the page loads");

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
