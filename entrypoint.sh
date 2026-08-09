#!/bin/sh
set -eu

: "${KUMA_UPSTREAM:=http://uptime-kuma:3001}"
: "${NETDATA_UPSTREAM:=http://netdata:19999}"
: "${STATUS_SLUG:=homelab}"
: "${STORAGE_MOUNT:=auto}"

case "$KUMA_UPSTREAM" in
    http://*|https://*) ;;
    *) echo "KUMA_UPSTREAM must start with http:// or https://" >&2; exit 1 ;;
esac

case "$NETDATA_UPSTREAM" in
    http://*|https://*) ;;
    *) echo "NETDATA_UPSTREAM must start with http:// or https://" >&2; exit 1 ;;
esac

case "$STATUS_SLUG" in
    ''|*[!A-Za-z0-9_-]*) echo "STATUS_SLUG may contain only letters, numbers, underscores, and hyphens" >&2; exit 1 ;;
esac

case "$STORAGE_MOUNT" in
    auto|/*) ;;
    *) echo "STORAGE_MOUNT must be auto or an absolute mount path beginning with /" >&2; exit 1 ;;
esac

printf 'window.__DASHBOARD_CONFIG__ = { statusSlug: "%s", storageMount: "%s" };\n' "$STATUS_SLUG" "$STORAGE_MOUNT" \
    > /usr/share/nginx/html/config.js

export KUMA_UPSTREAM NETDATA_UPSTREAM
envsubst '${KUMA_UPSTREAM} ${NETDATA_UPSTREAM}' \
    < /etc/nginx/templates/default.conf.template \
    > /etc/nginx/conf.d/default.conf

exec "$@"
