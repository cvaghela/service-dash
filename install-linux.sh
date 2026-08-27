#!/bin/sh
# Service Dash — guided installer for Linux hosts.
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

cd "$(dirname "$0")"

if [ "$(uname -s)" != "Linux" ]; then
    echo "Service Dash host monitoring requires Linux." >&2
    exit 1
fi

case "$(uname -m)" in
    x86_64|amd64) ;;
    *) echo "Service Dash currently supports only Linux AMD64 hosts." >&2; exit 1 ;;
esac

if ! command -v docker >/dev/null 2>&1; then
    echo "Docker Engine with Docker Compose v2 is required." >&2
    exit 1
fi

if ! docker compose version >/dev/null 2>&1; then
    echo "The Docker Compose v2 plugin is required." >&2
    exit 1
fi

# Some ZimaOS/CasaOS releases have a read-only root home. Use their writable
# Docker state directory only on systems with the standard /DATA/AppData path.
if [ -z "${DOCKER_CONFIG:-}" ] && [ -d /DATA/AppData ]; then
    export DOCKER_CONFIG=/var/lib/docker/.docker
    mkdir -p "$DOCKER_CONFIG"
fi

docker compose pull
docker compose up -d
docker compose ps

if ! docker compose exec -T service-dash wget -q -O /dev/null http://netdata:19999/api/v1/info; then
    echo "Embedded Netdata connectivity check failed." >&2
    docker compose logs --tail=100 service-dash netdata >&2
    exit 1
fi

if ! docker compose exec -T service-dash wget -q -O - http://127.0.0.1/network-info/status | grep -q '"lan"'; then
    echo "Linux host network detection check failed." >&2
    docker compose logs --tail=100 service-dash network-info >&2
    exit 1
fi

if ! docker compose exec -T service-dash sh -c 'wget -q -O - "http://127.0.0.1/kuma/api/status-page/$STATUS_SLUG" | grep -q publicGroupList'; then
    echo "Uptime Kuma status-page check failed for slug configured in STATUS_SLUG." >&2
    echo "Verify KUMA_PORT and STATUS_SLUG under environment in docker-compose.yml." >&2
    docker compose logs --tail=100 service-dash >&2
    exit 1
fi

echo
echo "Service Dash, host network detection, and embedded Netdata installation complete."
echo "Open http://SERVER-IP:8888 (or the host port configured in docker-compose.yml)."
