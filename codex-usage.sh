#!/bin/sh
# Service Dash — Codex plan usage reporter.
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
# https://chatgpt.com/backend-api/codex/usage, with the credential the Codex
# CLI stores after `codex login`. Undocumented, exactly like the Anthropic one
# next door, and it can change without notice. Everything below fails into
# "not connected" rather than guessing.
#
# It is a passive GET, and that is the whole reason this service exists in this
# shape. Codex also reports rate limits attached to a completed turn -- but
# reading those would mean sending a request every poll, spending quota to
# measure quota. A usage panel that consumes usage is worse than no panel.
# If this endpoint ever goes away, the answer is to drop the feature, not to
# start issuing turns.
#
# THE RESPONSE CARRIES PII. Verified live: `email`, `user_id` and `account_id`
# sit alongside the numbers. The document this writes is served by nginx to
# anyone who can reach the dashboard, with no authentication in front of it, so
# only the plan name and the window figures are ever copied across. Adding a
# field here is publishing it.
# ---------------------------------------------------------------------------

set -u

refresh_seconds="${CODEX_USAGE_REFRESH_SECONDS:-300}"

case "$refresh_seconds" in
    ''|*[!0-9]*)
        echo "CODEX_USAGE_REFRESH_SECONDS must be a whole number of seconds" >&2
        exit 1 ;;
esac
if [ "$refresh_seconds" -lt 60 ]; then refresh_seconds=60; fi

status_file="/status/codex.json"
temporary_file="/status/.codex.json.tmp"
# Defaulted: HOME is set for root in a container, but not in every exec path.
credentials_file="${HOME:-/root}/.codex/auth.json"
api_base="${CODEX_BASE_URL:-https://chatgpt.com}"

write_status() {
    printf '%s' "$1" > "$temporary_file" || return 1
    # Same filesystem as the document: rename cannot cross mounts.
    mv "$temporary_file" "$status_file"
}

# $2 is what the reader can DO about it -- "sign-in", "report" or "none". See
# the same function in claude-usage.sh; the dashboard reads both identically.
write_disconnected() {
    write_status "$(jq -n --arg note "$1" --arg action "${2:-sign-in}" --arg diagnostic "${3:-}" \
        '{generatedAt: (now | floor), providers: [], note: $note, action: $action}
         + (if $diagnostic == "" then {} else {diagnostic: $diagnostic} end)')"
}

# Field NAMES only, never a value -- this rides along in the status document so
# the dashboard's "Report this" button can quote it into a PUBLIC issue, and
# this response contains an email address. Names are safe; a values walk here
# would publish the account it belongs to.
describe_shape() {
    printf '%s' "$1" | jq -c '
        def names: [.. | objects | keys[]] | unique;
        {fieldNames: names}
    ' 2>/dev/null | cut -c1-1500
}

read_access_token() {
    [ -r "$credentials_file" ] || return 1
    jq -er '.tokens.access_token // empty' "$credentials_file" 2>/dev/null
}

account_id() {
    jq -r '.tokens.account_id // empty' "$credentials_file" 2>/dev/null
}

# Refresh through the official client, for the same reason the Claude reporter
# does: Codex owns the credential format and the rotation, and `login status`
# is a read command that goes through that path without spending quota.
renew_if_needed() {
    codex login status >/dev/null 2>&1 || true
}

fetch_usage() {
    # Body, then the HTTP status on its own last line. Without the status every
    # failure looks identical and a dropped packet reads as a signed-out
    # account. Deliberately no -f, so the exit code cannot swallow the status.
    #
    # The User-Agent is load-bearing, and its absence is a trap: with curl's
    # default the endpoint answers 403 with a perfectly good credential, which
    # reads exactly like an expired login. Measured -- default UA and
    # "Mozilla/5.0" both 403; anything that names a real client, this one
    # included, gets 200. It is filtering browsers and anonymous tools, not
    # checking for Codex, so there is nothing to imitate: it says who we are.
    curl -sS --max-time 20 -w '\n%{http_code}' \
        -H "Authorization: Bearer $1" \
        -H "chatgpt-account-id: $2" \
        -H "Accept: application/json" \
        -H "User-Agent: service-dash-codex-usage" \
        "$api_base/backend-api/codex/usage" 2>/dev/null
}

# Windows are described by their DURATION, not by an id, so the label is
# derived rather than looked up in a table. That is deliberate: hardcoding ids
# is exactly what made the Claude reporter miss a window it was being sent.
build_document() {
    usage_json="$1"

    printf '%s' "$usage_json" | jq -c '
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

        # Names the reader would recognise, with a tolerance either side --
        # a "5 hour" window has never been exactly 18000 seconds in practice.
        def duration_label($s):
          if $s == null then "Limit"
          elif $s <= 27000      then "Session"
          elif $s <= 108000     then "Daily"
          elif $s <= 691200     then "Weekly"
          elif $s <= 2764800    then "Monthly"
          else "Long term" end;

        def window($w; $fallback):
          if ($w | type) != "object" then empty
          else
            (($w.used_percent // $w.used_percentage // $w.utilization) | number_of) as $pct
            | if $pct == null then empty
              else
                (($w.limit_window_seconds // (($w.window_minutes | number_of) * 60)) | number_of) as $secs
                | (($w.reset_at // $w.resets_at) | epoch_of) as $reset
                | {
                    id: ("codex_" + (if $secs == null then $fallback else ($secs | tostring) end)),
                    label: (if $secs == null then $fallback else duration_label($secs) end),
                    used_percentage: $pct
                  }
                  # Omitted, never null: a window nobody has used yet has no
                  # reset, and the dashboard reads a null as "resets now".
                  + (if $reset != null then {resets_at: $reset} else {} end)
              end
          end;

        [ window(.rate_limit.primary_window; "Primary"),
          window(.rate_limit.secondary_window; "Secondary")
        ] as $windows
        # Parenthesised on purpose: `as` binds tighter than `+`, so without
        # these jq reads it as `array + (object)` and dies.
        | ([ window(.code_review_rate_limit; "Code review") ]
           + [ (.additional_rate_limits // {} | if type == "object" then (to_entries[] | window(.value; .key)) else empty end) ]
          ) as $models
        | ((.plan_type // "") | if . == "" then "" else ((.[0:1] | ascii_upcase) + .[1:]) end) as $plan
        | {
            generatedAt: (now | floor),
            providers: (
              if (($windows | length) + ($models | length)) == 0 then []
              else [{
                id: "codex",
                label: "Codex",
                plan: $plan,
                connected: true,
                generatedAt: (now | floor),
                # Only these two fields cross over. The response also carries
                # email, user_id and account_id, and this document is public.
                windows: $windows,
                models: $models
              }]
              end
            )
          }' 2>/dev/null
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

    response="$(fetch_usage "$token" "$(account_id)")"
    http_status="$(printf '%s' "$response" | tail -n 1)"
    usage="$(printf '%s' "$response" | sed '$d')"

    case "$http_status" in
        200) ;;
        401)
            write_disconnected "Codex refused the stored login. It has most likely expired."
            return
            ;;
        403)
            # Split from 401 deliberately. A 403 here is genuinely ambiguous:
            # it is what an expired login looks like, and also what the
            # endpoint returns when it does not like the request itself --
            # which is how the missing User-Agent above presented. Saying
            # "expired" outright sent me chasing a credential that was fine.
            write_disconnected "Codex refused the request. The login may have expired, or this client may no longer be accepted."
            return
            ;;
        *)
            # Transient. Leave the last good document alone and let the
            # dashboard age it rather than blanking the panel over one lost
            # packet -- see the long note on this in claude-usage.sh.
            [ -s "$status_file" ] || write_disconnected "Cannot reach Codex right now." "none"
            return
            ;;
    esac

    document="$(build_document "$usage")"
    usable="$(printf '%s' "$document" \
        | jq -r '[.providers[]? | select(.connected and (((.windows | length) + (.models | length)) > 0))] | length' 2>/dev/null)"
    if [ -z "$document" ] || [ "${usable:-0}" -eq 0 ]; then
        write_disconnected "Codex returned usage in a shape this version does not understand." \
            "report" "$(describe_shape "$usage")"
        return
    fi

    write_status "$document"
}

mkdir -p /status
while :; do
    poll_once
    sleep "$refresh_seconds"
done
