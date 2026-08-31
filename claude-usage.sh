#!/bin/sh
# Service Dash — Claude plan usage reporter.
# Copyright (C) 2026 Chintan Vaghela
#
# This program is free software: you can redistribute it and/or modify it
# under the terms of the GNU General Public License as published by the Free
# Software Foundation, either version 3 of the License, or (at your option)
# any later version. See the LICENSE file, or <https://www.gnu.org/licenses/>.
#
# Attribution notice (GPLv3 section 7b): the attribution shown in this
# program's interface must be preserved in modified versions.
#
# ---------------------------------------------------------------------------
# WHAT THIS TALKS TO, AND WHY IT IS FRAGILE
#
# Plan usage -- the five-hour session window, the seven-day window and the
# per-model windows -- is not part of the documented Anthropic API. There is no
# published endpoint for it. This reads the same one Claude Code itself uses,
# https://api.anthropic.com/api/oauth/usage, with the credential Claude Code
# stores after `claude auth login`.
#
# That means it can change without a deprecation notice. Everything below is
# written to fail into "not connected" rather than to guess: an unexpected
# shape, an expired login or a 404 all produce an honest empty document, never
# an invented figure. If Anthropic changes the endpoint, the panel disappears
# and the dashboard carries on.
#
# It also means the endpoint needs the `user:profile` scope, which only a full
# login carries. A `claude setup-token` token is inference-only and is refused.
# ---------------------------------------------------------------------------

set -u

refresh_seconds="${CLAUDE_USAGE_REFRESH_SECONDS:-300}"

case "$refresh_seconds" in
    ''|*[!0-9]*)
        echo "CLAUDE_USAGE_REFRESH_SECONDS must be a whole number of seconds" >&2
        exit 1 ;;
esac
if [ "$refresh_seconds" -lt 60 ]; then refresh_seconds=60; fi

status_file="/status/claude.json"
temporary_file="/status/.claude.json.tmp"
# Defaulted: HOME is set for root in a container, but not in every exec path.
credentials_file="${HOME:-/root}/.claude/.credentials.json"

api_base="${ANTHROPIC_BASE_URL:-https://api.anthropic.com}"

# Windows this reporter understands, and what to call them on the card. The
# dashboard renders whatever labels arrive, so adding one here is the only
# change a new window needs.
#
# Order matters: it is the order the panel draws them in, and the panel does
# not re-sort. Account windows first, then the per-model ones.
windows_spec='[
  {"id":"five_hour","label":"Session","kind":"window"},
  {"id":"seven_day","label":"Weekly","kind":"window"},
  {"id":"seven_day_opus","label":"Opus","kind":"model"},
  {"id":"seven_day_sonnet","label":"Sonnet","kind":"model"},
  {"id":"seven_day_oauth_apps","label":"Connected apps","kind":"model"}
]'

write_status() {
    printf '%s' "$1" > "$temporary_file" || return 1
    # Same filesystem as the document: rename cannot cross mounts.
    mv "$temporary_file" "$status_file"
}

# An empty, honest document. `note` is for the settings page, never for the
# card -- the panel simply does not render when nothing is connected. It says
# only WHY; the sign-in command belongs to the dashboard, which shows it beside
# this text and would otherwise print it twice.
# $2 is what the reader can DO about it, and the three cases are genuinely
# different actions:
#   sign-in  the login command will fix it
#   report   nothing the reader can run will; the fix is a bug report
#   none     wait -- it is transient, and there is nothing to do or to file
# Absent, the dashboard assumes "sign-in", which is all an older reporter here
# ever meant.
write_disconnected() {
    write_status "$(jq -n --arg note "$1" --arg action "${2:-sign-in}" --arg diagnostic "${3:-}" \
        '{generatedAt: (now | floor), providers: [], note: $note, action: $action}
         + (if $diagnostic == "" then {} else {diagnostic: $diagnostic} end)')"
}

# Field NAMES and window ids only -- never a value. Enough for a maintainer to
# see how the response shape moved, and nothing that could carry usage figures,
# an account identifier or any part of the credential. It rides along in the
# status document so the dashboard's "Report this" button can quote it.
describe_shape() {
    printf '%s' "$1" | jq -c '
        def names: [.. | objects | keys[]] | unique;
        def ids: [.. | objects | .id? // empty] | map(select(type == "string")) | unique;
        {fieldNames: names, windowIds: ids}
    ' 2>/dev/null | cut -c1-1500
}

read_access_token() {
    [ -r "$credentials_file" ] || return 1
    jq -er '.claudeAiOauth.accessToken // empty' "$credentials_file" 2>/dev/null
}

token_expires_at() {
    jq -r '.claudeAiOauth.expiresAt // 0' "$credentials_file" 2>/dev/null
}

# Refresh through the official client rather than by posting to the token
# endpoint ourselves. Claude Code owns the rotation, the on-disk format and the
# lock file that stops two writers clobbering each other; reimplementing that
# here would mean owning all three.
#
# `claude doctor` is the command that does it. This used to be
# `claude auth status --json`, on the belief that a read command going through
# the credential path would renew a token close to expiry. It does not: it exits
# 0, reports loggedIn, and leaves the file byte-for-byte identical. So nothing
# ever renewed, and every login died silently at the eight-hour mark.
#
# Measured on a live credential: doctor is a no-op with 7 hours left, and issues
# a clean refresh with 60 seconds left. The refresh token survives either way.
#
# TWO THINGS THAT COST A LOGIN TO LEARN:
#
#   * Refresh tokens ROTATE, and the previous one is invalidated the instant a
#     new one is issued. Claude Code persists the replacement itself. This is
#     the whole reason to call the official client rather than mint tokens here:
#     getting rotation wrong is not a degraded panel, it is a login that cannot
#     be recovered without a fresh `claude auth login`.
#   * NEVER copy this credential file aside and restore it. A restored copy
#     carries a refresh token that has already been rotated out, so it looks
#     valid on disk and fails at the next renewal -- and doctor's response to a
#     failed renewal is to log out. A backup of an OAuth credential is not a
#     safety net; it is a delayed logout.
#
# doctor costs roughly 3.2s per run, so it is not called on every poll. The
# window is deliberately generous and the poll tightens towards the end: doctor
# has its own notion of "close to expiry" and the exact threshold is unknown, so
# what matters is that many attempts land inside it before the token dies. An
# expired token is the one state doctor cannot rescue.
renew_window_seconds=3600
renew_tighten_seconds=900

seconds_until_expiry() {
    expires_at="$(token_expires_at)"
    case "$expires_at" in ''|*[!0-9]*) expires_at=0 ;; esac
    if [ "$expires_at" -le 0 ]; then
        echo 0
        return
    fi
    echo "$(( expires_at / 1000 - $(date +%s) ))"
}

renew_if_needed() {
    left="$(seconds_until_expiry)"
    if [ "$left" -gt "$renew_window_seconds" ]; then
        return 0
    fi
    claude doctor >/dev/null 2>&1 || true
}

# Body, then the HTTP status on its own last line. The status is the whole
# point: without it every failure looks identical, and "your login expired" gets
# printed for a dropped packet. Deliberately no -f, so an error body still
# arrives -- it is ignored, but the exit code no longer swallows the status.
fetch_usage() {
    token="$1"
    curl -sS --max-time 20 -w '\n%{http_code}' \
        -H "Authorization: Bearer $token" \
        -H "anthropic-beta: oauth-2025-04-20" \
        -H "Accept: application/json" \
        "$api_base/api/oauth/usage" 2>/dev/null
}

# Turn whatever the endpoint returned into the panel's shape.
#
# Two shapes are accepted on purpose. The statusline contract exposes
# `used_percentage` and `resets_at`; the rate-limit headers use `utilization`
# and `reset`. Which one this endpoint speaks is not documented, so both are
# read and the first that yields a number wins. A window that yields neither is
# dropped rather than reported as zero -- a confident 0% would be a lie.
build_document() {
    usage_json="$1"
    plan="$2"

    printf '%s' "$usage_json" | jq -c \
        --argjson spec "$windows_spec" \
        --arg plan "$plan" '
        # resets_at arrives as ISO 8601 with fractional seconds and a numeric
        # UTC offset -- "2026-08-29T01:50:00.304184+00:00". jq'"'"'s
        # fromdateiso8601 accepts neither, and `tonumber` throws on it. A throw
        # aborts the whole program, stderr was discarded, and the empty result
        # was indistinguishable from "shape not understood" -- so a working
        # endpoint read as a broken one. Verified against the live API.
        def epoch_of:
          if type == "number" then .
          elif type != "string" then null
          else
            (capture("^(?<base>[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2})([.][0-9]+)?(?<tz>Z|[+-][0-9]{2}:[0-9]{2})?$") // null) as $m
            | if $m == null then null
              else (($m.base + "Z") | fromdateiso8601) as $t
                | if (($m.tz // "Z") == "Z") then $t
                  else ($m.tz | capture("^(?<sg>[+-])(?<h>[0-9]{2}):(?<n>[0-9]{2})$")) as $o
                    | ((($o.h | tonumber) * 3600) + (($o.n | tonumber) * 60)) as $off
                    | if $o.sg == "+" then ($t - $off) else ($t + $off) end
                  end
              end
          end;
        def number_of: if type == "number" then . elif type == "string" then (try tonumber catch null) else null end;
        def title:
          sub("^seven_day_"; "") | sub("^five_hour_"; "") | gsub("_"; " ")
          | split(" ") | map(select(length > 0) | (.[0:1] | ascii_upcase) + .[1:]) | join(" ");
        def slug: ascii_downcase | gsub("[^a-z0-9]+"; "_");

        # SHAPE A -- the `limits` array, and the one to prefer. It is
        # self-describing (kind, percent, resets_at) and, for a model-scoped
        # window, carries scope.model.display_name. That name is the point:
        # the top-level keys use internal codenames, so Fable arrives there as
        # "nimbus_quill" and no amount of guessing turns that into "Fable".
        # This array is what claude.ai itself renders.
        def from_limits:
          [ .limits[]?
            | select(type == "object")
            | ((.percent // .used_percentage // .utilization) | number_of) as $pct
            | select($pct != null)
            | ((.resets_at // .reset) | epoch_of) as $reset
            | ((.scope.model.display_name // .scope.surface.display_name) // null) as $scoped
            | (if .kind == "session" then {l: "Session", k: "window"}
               elif .kind == "weekly_all" then {l: "Weekly", k: "window"}
               elif $scoped != null then {l: $scoped, k: "model"}
               else {l: ((.kind // "limit") | title), k: "model"} end) as $meta
            | {
                id: ((.kind // "limit") + (if $scoped != null then ("_" + ($scoped | slug)) else "" end)),
                label: $meta.l,
                kind: $meta.k,
                used_percentage: $pct
              }
              # Omitted, never null: a window nobody has used yet has no reset,
              # and the dashboard reads a null here as "resets now".
              + (if $reset != null then {resets_at: $reset} else {} end)
          ];

        # SHAPE B -- top-level per-window keys. Kept as a fallback for
        # responses without a limits array. Known ids get curated labels;
        # anything else carrying both a percentage and a reset passes through,
        # so a new window is not silently discarded.
        def from_keys:
          (.rate_limits // .) as $limits
          | (if ($limits | type) == "object" then ($limits | keys_unsorted) else [] end) as $present
          | (($spec | map(.id)) + ($present - ($spec | map(.id)))) as $ids
          | [ $ids[]
              | . as $id
              | (($spec | map(select(.id == $id)) | first) // {id: $id, label: ($id | title), kind: "model"}) as $s
              | ($limits[$id] // empty) as $w
              | select(($w | type) == "object")
              | (($w.used_percentage // $w.utilization) | number_of) as $pct
              | (($w.resets_at // $w.reset) | epoch_of) as $reset
              | select($pct != null and $reset != null)
              | {id: $s.id, label: $s.label, kind: $s.kind, used_percentage: $pct, resets_at: $reset}
            ];

        (from_limits) as $a
        | (if ($a | length) > 0 then $a else from_keys end) as $measures
        | {
            generatedAt: (now | floor),
            providers: (
              if ($measures | length) == 0 then []
              else [{
                id: "claude",
                label: "Claude",
                plan: $plan,
                connected: true,
                generatedAt: (now | floor),
                windows: [$measures[] | select(.kind == "window") | del(.kind)],
                models:  [$measures[] | select(.kind == "model")  | del(.kind)]
              }]
              end
            )
          }' 2>/dev/null
}

plan_label() {
    # `auth status` reports the subscription without touching the credential
    # file. "max" -> "Max"; anything unknown passes through as sent.
    raw="$(claude auth status --json 2>/dev/null | jq -r '.subscriptionType // empty' 2>/dev/null)"
    [ -n "$raw" ] || return 0
    printf '%s' "$raw" | awk '{ print toupper(substr($0,1,1)) substr($0,2) }'
}

poll_once() {
    if [ ! -r "$credentials_file" ]; then
        write_disconnected "Nobody has signed in yet."
        return
    fi

    renew_if_needed

    token="$(read_access_token)" || {
        write_disconnected "The stored login was signed out, or cannot be read."
        return
    }

    response="$(fetch_usage "$token")"
    http_status="$(printf '%s' "$response" | tail -n 1)"
    usage="$(printf '%s' "$response" | sed '$d')"

    case "$http_status" in
        200) ;;
        401 | 403)
            # The API looked at the credential and said no. This is the only
            # failure a sign-in actually fixes.
            write_disconnected "Claude refused the stored login. It has most likely expired."
            return
            ;;
        *)
            # Everything else -- no network, DNS, a 5xx, a 429, a timeout, curl
            # never running at all -- is a moment, not a state. Polling every
            # five minutes means these WILL happen; treating one as a signed-out
            # account would tell people to re-authenticate over a dropped
            # packet, and blanking the panel would throw away a reading that was
            # true minutes ago.
            #
            # So: leave the last document exactly where it is and let the
            # dashboard age it. It dims the timestamp at fifteen minutes and
            # gives up at an hour, which is the honest way to say "this may have
            # moved" without either lying or flickering. Those two thresholds
            # only ever fire because of this branch.
            #
            # The one exception is having nothing to leave behind.
            [ -s "$status_file" ] || write_disconnected "Cannot reach Claude right now." "none"
            return
            ;;
    esac

    document="$(build_document "$usage" "$(plan_label)")"

    # Count what actually SURVIVED, rather than testing the string for
    # emptiness. jq is perfectly happy to build a well-formed document with zero
    # providers out of a response it recognised nothing in, and that document is
    # not empty -- it just says nothing. Publishing it made the panel disappear
    # with no explanation anywhere, which is the exact failure this branch was
    # written to prevent. The filter mirrors the dashboard's own: a provider
    # counts only if it is connected and kept at least one window.
    usable="$(printf '%s' "$document" \
        | jq -r '[.providers[]? | select(.connected and ((.windows | length) > 0))] | length' 2>/dev/null)"
    if [ -z "$document" ] || [ "${usable:-0}" -eq 0 ]; then
        # Reached the endpoint and could not understand it. Most likely the
        # response shape changed. Say so rather than publish a guess.
        write_disconnected "Claude returned usage in a shape this version does not understand." \
            "report" "$(describe_shape "$usage")"
        return
    fi

    write_status "$document"
}

mkdir -p /status
while :; do
    poll_once
    # Renewal only ever happens on a poll, so the gap between polls is the gap
    # between chances. Near expiry that gap has to be smaller than doctor's own
    # refresh window, which we do not know -- 60s is below the smallest value
    # observed to work.
    left="$(seconds_until_expiry)"
    if [ "$left" -gt 0 ] && [ "$left" -le "$renew_tighten_seconds" ]; then
        sleep 60
    else
        sleep "$refresh_seconds"
    fi
done
