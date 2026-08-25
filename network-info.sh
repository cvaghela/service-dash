#!/bin/sh
set -u

# The starting value only. The dashboard's settings page overrides it, so this
# no longer has to be set by hand — it is the default until someone changes it.
default_refresh_seconds="${NETWORK_INFO_REFRESH_SECONDS:-600}"

case "$default_refresh_seconds" in
    ''|*[!0-9]*)
        echo "NETWORK_INFO_REFRESH_SECONDS must be a whole number of seconds" >&2
        exit 1 ;;
esac

status_file="/status/status.json"
temporary_file="/status/.status.json.tmp"
# Mounted read-only from the same volume the dashboard writes its settings to.
# Absent when the volume is not mounted, which simply means "use the default".
settings_file="/settings/settings/state.json"

# The document stores each browser value as the JSON string localStorage held,
# so the preference has to be parsed out of a string inside the document.
read_refresh_seconds() {
    [ -r "$settings_file" ] || { printf '%s' "$default_refresh_seconds"; return; }

    value="$(jq -r '.values.serviceDashPrefs // empty' "$settings_file" 2>/dev/null \
        | jq -r '.networkRefreshSeconds // empty' 2>/dev/null)"

    case "$value" in
        ''|*[!0-9]*) printf '%s' "$default_refresh_seconds"; return ;;
    esac

    # Bounded here as well as in the browser: this file is shared, and a value
    # from anywhere else should not be able to spin this loop.
    if [ "$value" -lt 30 ] || [ "$value" -gt 86400 ]; then
        printf '%s' "$default_refresh_seconds"
        return
    fi

    printf '%s' "$value"
}

write_status() {
    route_json="$(ip -j route get 1.1.1.1 2>/dev/null || printf '[]')"
    lan_interface="$(printf '%s' "$route_json" | jq -r '.[0].dev // empty' 2>/dev/null)"
    lan_address="$(printf '%s' "$route_json" | jq -r '.[0].prefsrc // .[0].src // empty' 2>/dev/null)"
    lan_gateway="$(printf '%s' "$route_json" | jq -r '.[0].gateway // empty' 2>/dev/null)"
    lan_prefix=""

    if [ -n "$lan_interface" ]; then
        address_json="$(ip -j address show dev "$lan_interface" 2>/dev/null || printf '[]')"
        if [ -z "$lan_address" ]; then
            lan_address="$(printf '%s' "$address_json" | jq -r '.[0].addr_info[]? | select(.family == "inet" and .scope == "global") | .local' 2>/dev/null | head -n 1)"
        fi
        if [ -n "$lan_address" ]; then
            lan_prefix="$(printf '%s' "$address_json" | jq -r --arg ip "$lan_address" '.[0].addr_info[]? | select(.family == "inet" and .local == $ip) | .prefixlen' 2>/dev/null | head -n 1)"
        fi
    fi

    # A host can still have a usable LAN address without a working internet route.
    # Prefer a global address on a non-container interface as the fallback.
    if [ -z "$lan_address" ]; then
        fallback_json="$(ip -j address show up scope global 2>/dev/null || printf '[]')"
        lan_interface="$(printf '%s' "$fallback_json" | jq -r '[.[] | select(.ifname | test("^(docker|br-|veth|lo|virbr)") | not) | select(any(.addr_info[]?; .family == "inet" and .scope == "global"))][0].ifname // empty' 2>/dev/null)"
        if [ -n "$lan_interface" ]; then
            address_json="$(printf '%s' "$fallback_json" | jq -c --arg dev "$lan_interface" '[.[] | select(.ifname == $dev)][0]' 2>/dev/null)"
            lan_address="$(printf '%s' "$address_json" | jq -r '.addr_info[]? | select(.family == "inet" and .scope == "global") | .local' 2>/dev/null | head -n 1)"
            lan_prefix="$(printf '%s' "$address_json" | jq -r --arg ip "$lan_address" '.addr_info[]? | select(.family == "inet" and .local == $ip) | .prefixlen' 2>/dev/null | head -n 1)"
        fi
    fi

    wan_address="$(curl -fsS --max-time 5 'https://api.ipify.org' 2>/dev/null || true)"
    if [ -z "$wan_address" ]; then
        wan_address="$(curl -fsS --max-time 5 'https://www.cloudflare.com/cdn-cgi/trace' 2>/dev/null | awk -F= '$1 == "ip" { print $2; exit }' || true)"
    fi

    jq -n \
        --arg interface "$lan_interface" \
        --arg address "$lan_address" \
        --arg prefix "$lan_prefix" \
        --arg gateway "$lan_gateway" \
        --arg wan "$wan_address" \
        --arg generatedAt "$(date -u +%Y-%m-%dT%H:%M:%SZ)" \
        '{
            generatedAt: $generatedAt,
            lan: {
                interface: ($interface | if length > 0 then . else null end),
                address: ($address | if length > 0 then . else null end),
                prefix: ($prefix | tonumber? // null),
                gateway: ($gateway | if length > 0 then . else null end)
            },
            wan: {
                address: ($wan | if length > 0 then . else null end)
            }
        }' > "$temporary_file"
    mv "$temporary_file" "$status_file"
}

mkdir -p /status
while :; do
    write_status
    # Re-read each pass, so a change on the settings page takes effect without
    # recreating the container.
    sleep "$(read_refresh_seconds)"
done
