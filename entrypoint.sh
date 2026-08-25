#!/bin/sh
set -eu

: "${KUMA_PORT:?Set KUMA_PORT under environment in docker-compose.yml}"
: "${STATUS_SLUG:?Set STATUS_SLUG under environment in docker-compose.yml}"
: "${STORAGE_MOUNT:?Set STORAGE_MOUNT under environment in docker-compose.yml}"

case "$KUMA_PORT" in
    ''|*[!0-9]*) echo "KUMA_PORT must be a number between 1 and 65535" >&2; exit 1 ;;
esac

if [ "$KUMA_PORT" -lt 1 ] || [ "$KUMA_PORT" -gt 65535 ]; then
    echo "KUMA_PORT must be a number between 1 and 65535" >&2
    exit 1
fi

KUMA_UPSTREAM="http://host.docker.internal:$KUMA_PORT"

case "$STATUS_SLUG" in
    ''|*[!A-Za-z0-9_-]*) echo "STATUS_SLUG may contain only letters, numbers, underscores, and hyphens" >&2; exit 1 ;;
esac

case "$STORAGE_MOUNT" in
    auto|/*) ;;
    *) echo "STORAGE_MOUNT must be auto or an absolute mount path beginning with /" >&2; exit 1 ;;
esac

# Optional per-service icon overrides, e.g.
#   SERVICE_ICONS: '{"Plex":"https://example.com/plex.png","LTT Catalog":""}'
# An empty string value keeps that card on its category emoji.
# NB: ${SERVICE_ICONS:={}} does not work here — the shell ends the expansion at
# the first brace, so the default has to be applied explicitly.
SERVICE_ICONS="${SERVICE_ICONS:-}"
[ -n "$SERVICE_ICONS" ] || SERVICE_ICONS='{}'
SERVICE_ICONS="$(printf '%s' "$SERVICE_ICONS" | tr -d '\n\r')"

case "$SERVICE_ICONS" in
    '{'*'}') ;;
    *) echo 'SERVICE_ICONS must be a JSON object, for example {"Plex":"https://example.com/plex.png"}' >&2; exit 1 ;;
esac

# Embedded as a JSON *string* and parsed in the browser, so a malformed value
# degrades to "no overrides" instead of breaking config.js and the whole page.
ESCAPED_SERVICE_ICONS="$(printf '%s' "$SERVICE_ICONS" | sed -e 's/\\/\\\\/g' -e 's/"/\\"/g')"

printf 'window.__DASHBOARD_CONFIG__ = { statusSlug: "%s", storageMount: "%s", iconOverrides: "%s" };\n' \
    "$STATUS_SLUG" "$STORAGE_MOUNT" "$ESCAPED_SERVICE_ICONS" \
    > /usr/share/nginx/html/config.js

export KUMA_UPSTREAM
envsubst '${KUMA_UPSTREAM}' \
    < /etc/nginx/templates/default.conf.template \
    > /etc/nginx/conf.d/default.conf

exec "$@"
