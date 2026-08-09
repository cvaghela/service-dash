#!/bin/sh
set -eu

cd "$(dirname "$0")"

# ZimaOS has a read-only root home on some releases. Keep Docker CLI state in
# ZimaOS's writable data area instead.
export DOCKER_CONFIG="${DOCKER_CONFIG:-/var/lib/docker/.docker}"
mkdir -p "$DOCKER_CONFIG"

docker compose pull
docker compose up -d
docker compose ps

if ! docker compose exec -T service-dash wget -q -O /dev/null http://netdata:19999/api/v1/info; then
    echo "Embedded Netdata connectivity check failed." >&2
    docker compose logs --tail=100 service-dash netdata >&2
    exit 1
fi

if ! docker compose exec -T service-dash wget -q -O - http://127.0.0.1/network-info/status | grep -q '"lan"'; then
    echo "ZimaOS host network detection check failed." >&2
    docker compose logs --tail=100 service-dash network-info >&2
    exit 1
fi

if ! docker compose exec -T service-dash sh -c 'wget -q -O - "$KUMA_UPSTREAM/api/status-page/$STATUS_SLUG" | grep -q publicGroupList'; then
    echo "Uptime Kuma status-page check failed for slug configured in STATUS_SLUG." >&2
    echo "Verify KUMA_UPSTREAM and STATUS_SLUG in docker-compose.yml or an optional .env file." >&2
    docker compose logs --tail=100 service-dash >&2
    exit 1
fi

echo
echo "Service Dash, host network detection, and embedded Netdata installation complete. Open http://ZIMAOS-IP:8888"
