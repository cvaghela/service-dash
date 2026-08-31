#!/bin/sh
# Regression tests for the AI usage reporters.
#
# Every case here is a bug that actually shipped, or an invariant that would be
# expensive to break quietly. They run against the real functions in
# claude-usage.sh and codex-usage.sh -- the driver loop is stripped and the
# functions are sourced, so what is tested is what runs.
#
# Needs `jq`. No network, no Docker, no credentials.

# Deliberately no `set -e`: this harness counts failures itself, and aborting
# on the first broken transform would hide every test after it.
set -u

REPO="$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)"
WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT

PASS=0
FAIL=0

ok()   { PASS=$((PASS + 1)); printf '  ok    %s\n' "$1"; }
bad()  { FAIL=$((FAIL + 1)); printf '  FAIL  %s\n     %s\n' "$1" "$2"; }

# Source a reporter with its `while :` driver removed.
load() {
    sed -e '/^mkdir -p \/status$/,$d' "$REPO/$1" > "$WORK/$1.sh"
    # shellcheck disable=SC1090
    . "$WORK/$1.sh"
}

# ---------------------------------------------------------------------------
printf '\nclaude-usage.sh\n'
# ---------------------------------------------------------------------------
load claude-usage.sh

# The live endpoint returns ISO 8601 with fractional seconds and a numeric
# offset. `tonumber` threw on it, jq aborted, and a healthy response read as
# "shape not understood". Verified against the real API on 2026-08-28.
got=$(build_document '{"five_hour":{"utilization":12,"resets_at":"2026-08-29T01:50:00.304184+00:00"}}' "Max" \
      | jq -r '.providers[0].windows[0].resets_at' 2>/dev/null || true)
[ "$got" = "1787968200" ] \
    && ok "ISO 8601 with fraction and +00:00 offset parses" \
    || bad "ISO 8601 with fraction and +00:00 offset parses" "got '$got'"

# Epoch seconds must keep working -- the first shape we coded for.
got=$(build_document '{"five_hour":{"used_percentage":62,"resets_at":1900000000}}' "Max" \
      | jq -r '.providers[0].windows[0].resets_at' 2>/dev/null || true)
[ "$got" = "1900000000" ] \
    && ok "epoch seconds still parse" \
    || bad "epoch seconds still parse" "got '$got'"

# A non-UTC offset must resolve to the same instant as its Z equivalent.
a=$(build_document '{"five_hour":{"utilization":5,"resets_at":"2026-08-29T07:20:00+05:30"}}' "Max" | jq -r '.providers[0].windows[0].resets_at' 2>/dev/null || true)
b=$(build_document '{"five_hour":{"utilization":5,"resets_at":"2026-08-29T01:50:00Z"}}'      "Max" | jq -r '.providers[0].windows[0].resets_at' 2>/dev/null || true)
[ -n "$a" ] || a="(transform produced nothing)"
[ "$a" = "$b" ] \
    && ok "+05:30 resolves to the same instant as Z" \
    || bad "+05:30 resolves to the same instant as Z" "got '$a' vs '$b'"

# A window with a percentage but no reset is REAL (an unused model window), and
# resets_at must be OMITTED, never null -- the dashboard reads null as "now".
doc=$(build_document '{"limits":[{"kind":"weekly_scoped","percent":0,"resets_at":null,"scope":{"model":{"display_name":"Fable"}}}]}' "Max")
label=$(printf '%s' "$doc" | jq -r '.providers[0].models[0].label' 2>/dev/null || true)
haskey=$(printf '%s' "$doc" | jq -r '.providers[0].models[0] | has("resets_at")' 2>/dev/null || true)
[ "$label" = "Fable" ] && [ "$haskey" = "false" ] \
    && ok "unused model window kept, resets_at omitted not null" \
    || bad "unused model window kept, resets_at omitted not null" "label='$label' has_resets_at='$haskey'"

# The limits[] array names models properly; the top-level keys use internal
# codenames. Preferring limits[] is why Fable appears at all.
got=$(build_document '{"nimbus_quill":{"utilization":0,"resets_at":null},"limits":[{"kind":"session","percent":12,"resets_at":"2026-08-29T01:50:00Z"}]}' "Max" \
      | jq -r '.providers[0].windows[0].label' 2>/dev/null || true)
[ "$got" = "Session" ] \
    && ok "limits[] preferred over top-level codename keys" \
    || bad "limits[] preferred over top-level codename keys" "got '$got'"

# A response we cannot read must yield zero providers, so poll_once routes it
# to the "report" path instead of publishing an empty-but-valid document.
n=$(build_document '{"totally":"different"}' "Max" | jq -r '.providers | length' 2>/dev/null || echo 0)
[ "$n" = "0" ] \
    && ok "unreadable response yields zero providers" \
    || bad "unreadable response yields zero providers" "got '$n'"

# The diagnostic is quoted into a PUBLIC GitHub issue. Names only, never values.
d=$(describe_shape '{"email":"secret@example.com","five_hour":{"utilization":12}}')
case "$d" in
    *secret@example.com*) bad "diagnostic carries no values" "leaked an address: $d" ;;
    *email*)              ok  "diagnostic carries field names, not values" ;;
    *)                    bad "diagnostic carries no values" "unexpected: $d" ;;
esac

# ---------------------------------------------------------------------------
printf '\ncodex-usage.sh\n'
# ---------------------------------------------------------------------------
load codex-usage.sh

# THE INVARIANT THE README PROMISES. The Codex response carries email, user_id
# and account_id; the document nginx serves has no authentication in front of
# it, so none of them may cross over.
doc=$(build_document '{"plan_type":"pro","email":"secret@example.com","user_id":"uid-123","account_id":"acct-456",
"rate_limit":{"primary_window":{"used_percent":40,"limit_window_seconds":18000,"reset_at":1790000000}}}')
leak=""
for needle in secret@example.com uid-123 acct-456; do
    case "$doc" in *"$needle"*) leak="$leak $needle" ;; esac
done
[ -z "$leak" ] \
    && ok "no email, user_id or account_id in the served document" \
    || bad "no email, user_id or account_id in the served document" "leaked:$leak"

# ...while still carrying the figures it is supposed to.
pct=$(printf '%s' "$doc" | jq -r '.providers[0].windows[0].used_percentage' 2>/dev/null || true)
plan=$(printf '%s' "$doc" | jq -r '.providers[0].plan' 2>/dev/null || true)
[ "$pct" = "40" ] && [ "$plan" = "Pro" ] \
    && ok "plan and percentage do cross over" \
    || bad "plan and percentage do cross over" "pct='$pct' plan='$plan'"

# Labels come from the window's duration, not a hardcoded id table.
got=$(build_document '{"rate_limit":{"primary_window":{"used_percent":1,"limit_window_seconds":18000,"reset_at":1790000000},
"secondary_window":{"used_percent":2,"limit_window_seconds":604800,"reset_at":1790000000}}}' \
      | jq -r '[.providers[0].windows[].label] | join(",")' 2>/dev/null || true)
[ "$got" = "Session,Weekly" ] \
    && ok "window labels derived from duration" \
    || bad "window labels derived from duration" "got '$got'"

# The Codex diagnostic goes into a public issue too.
d=$(describe_shape '{"email":"secret@example.com","plan_type":"pro"}')
case "$d" in
    *secret@example.com*) bad "codex diagnostic carries no values" "leaked an address" ;;
    *)                    ok  "codex diagnostic carries no values" ;;
esac

# ---------------------------------------------------------------------------
printf '\ntoken renewal\n'
# ---------------------------------------------------------------------------
# `claude auth status` does NOT refresh an access token. It exits 0, reports
# loggedIn, and leaves the credential byte-for-byte identical -- so while it was
# the renewal call, every login died at the eight-hour mark and the panel told
# people to sign in again. `claude doctor` is the command that actually
# refreshes. Verified on a live credential: no-op at 7h, clean refresh at 60s.
renew="$(sed -n '/^renew_if_needed()/,/^}/p' "$REPO/claude-usage.sh")"
case "$renew" in
    *"claude doctor"*) ok "renewal calls claude doctor" ;;
    *)                 bad "renewal calls claude doctor" "found: $(printf '%s' "$renew" | tr '\n' ' ')" ;;
esac
case "$renew" in
    *"auth status"*) bad "renewal does not use auth status" "auth status never refreshes anything" ;;
    *)               ok  "renewal does not use auth status" ;;
esac

# Renewal only happens on a poll, so the poll interval near expiry is the real
# safety margin. An expired token is the one state doctor cannot rescue: it logs
# out instead.
if grep -q "renew_tighten_seconds" "$REPO/claude-usage.sh"; then
    ok "the poll tightens near expiry"
else
    bad "the poll tightens near expiry" "without it a single missed window expires the token"
fi

# Refresh tokens rotate and the old one is invalidated immediately, so a copy of
# the credential is a delayed logout, not a backup. Cost two logins to learn.
if grep -qE "(cp|mv).*(credentials|\.claude/)" "$REPO/claude-usage.sh"; then
    bad "the reporter never copies the credential aside" "a restored copy carries a rotated-out refresh token"
else
    ok "the reporter never copies the credential aside"
fi

# ---------------------------------------------------------------------------
printf '\nnginx.conf.template\n'
# ---------------------------------------------------------------------------
# nginx reads an unquoted { or } in a location regex as a block delimiter, so
# `{0,30}` ends the directive mid-pattern and nginx dies at boot with "missing
# closing parenthesis" naming a regex nobody wrote. It must stay quoted.
if awk '
    /^[[:space:]]*location[[:space:]]+~/ {
        line = $0
        sub(/[[:space:]]*\{[[:space:]]*$/, "", line)                       # drop the block opener
        sub(/^[[:space:]]*location[[:space:]]+~\*?[[:space:]]*/, "", line)  # leave just the regex
        if (line ~ /[{}]/ && line !~ /^"/) { print "  unquoted: " $0; bad = 1 }
    }
    END { exit bad ? 1 : 0 }
' "$REPO/nginx.conf.template"; then
    ok "location regexes containing braces are quoted"
else
    bad "location regexes containing braces are quoted" "an unquoted one would kill nginx at boot"
fi

# ---------------------------------------------------------------------------
printf '\n%d passed, %d failed\n' "$PASS" "$FAIL"
[ "$FAIL" -eq 0 ]
