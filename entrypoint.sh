#!/bin/sh
# Service Dash — container entrypoint.
# Copyright (C) 2026 Chintan Vaghela
#
# This program is free software: you can redistribute it and/or modify it
# under the terms of the GNU General Public License as published by the Free
# Software Foundation, either version 3 of the License, or (at your option)
# any later version. See the LICENSE file, or <https://www.gnu.org/licenses/>.
#
# Attribution notice (GPLv3 section 7b): the attribution shown in this
# program's interface must be preserved in modified versions.

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

# Settings live in a volume and are shared by every browser. There is nothing
# to switch on: reading them is open, and writing is gated on an Uptime Kuma
# login by the validator nginx consults. The directory is created either way, so
# a deployment without the volume still works — it just loses the settings when
# the container is recreated.
SHARED_SETTINGS_ROOT="/var/lib/service-dash"

# The temp directory has to sit on the same filesystem as the document: WebDAV
# writes a temp file and renames it, and rename cannot cross mounts.
mkdir -p "$SHARED_SETTINGS_ROOT/settings" "$SHARED_SETTINGS_ROOT/tmp"

# nginx workers drop to this user, so the volume has to belong to it.
chown -R nginx:nginx "$SHARED_SETTINGS_ROOT"

# kumaPort is here for the empty state alone: when no status page can be
# reached, the panel prints a diagnostic command the reader can paste, and a
# command naming the wrong port is worse than no command. Both values are
# already validated above, so neither can inject into the JS literal.
printf 'window.__DASHBOARD_CONFIG__ = { statusSlug: "%s", storageMount: "%s", kumaPort: "%s" };\n' \
    "$STATUS_SLUG" "$STORAGE_MOUNT" "$KUMA_PORT" \
    > /usr/share/nginx/html/config.js

export KUMA_UPSTREAM
envsubst '${KUMA_UPSTREAM}' \
    < /etc/nginx/templates/default.conf.template \
    > /etc/nginx/conf.d/default.conf

exec "$@"
