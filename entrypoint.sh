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

# Shared settings: off by default, because turning it on lets anyone who can
# reach the dashboard rewrite everyone's customisations.
SHARED_SETTINGS="${SHARED_SETTINGS:-off}"

case "$SHARED_SETTINGS" in
    on|off) ;;
    *) echo "SHARED_SETTINGS must be on or off" >&2; exit 1 ;;
esac

SHARED_SETTINGS_ROOT="/var/lib/service-dash"
SHARED_SETTINGS_HTPASSWD="/etc/nginx/shared-settings.htpasswd"
mkdir -p /etc/nginx/snippets

if [ "$SHARED_SETTINGS" = "on" ]; then
    # The temp directory has to sit on the same filesystem as the document:
    # WebDAV writes a temp file and renames it, and rename cannot cross mounts.
    if ! mkdir -p "$SHARED_SETTINGS_ROOT/settings" "$SHARED_SETTINGS_ROOT/tmp" 2>/dev/null; then
        echo "SHARED_SETTINGS is on but $SHARED_SETTINGS_ROOT is not writable — mount a volume there" >&2
        exit 1
    fi
    # nginx workers drop to this user, so the volume has to belong to it.
    chown -R nginx:nginx "$SHARED_SETTINGS_ROOT"

    # Writes are authenticated. Without this, anyone who can reach the dashboard
    # could rewrite what every browser and device shows — including the image
    # URLs each viewer's browser then requests. Reads stay open, matching the
    # rest of the dashboard.
    SHARED_SETTINGS_USER="${SHARED_SETTINGS_USER:-dashboard}"

    case "$SHARED_SETTINGS_USER" in
        ''|*[!A-Za-z0-9._-]*)
            echo "SHARED_SETTINGS_USER may contain only letters, numbers, dots, underscores, and hyphens" >&2
            exit 1 ;;
    esac

    # A file keeps the secret out of `docker inspect` and the process environment.
    if [ -n "${SHARED_SETTINGS_PASSWORD_FILE:-}" ]; then
        # A bind mount whose source does not exist arrives as a directory, so
        # check for a regular file and say so plainly.
        if [ -d "$SHARED_SETTINGS_PASSWORD_FILE" ]; then
            echo "SHARED_SETTINGS_PASSWORD_FILE points at a directory ($SHARED_SETTINGS_PASSWORD_FILE) — create the password file on the host before starting" >&2
            exit 1
        fi
        if [ ! -f "$SHARED_SETTINGS_PASSWORD_FILE" ] || [ ! -r "$SHARED_SETTINGS_PASSWORD_FILE" ]; then
            echo "SHARED_SETTINGS_PASSWORD_FILE is set but $SHARED_SETTINGS_PASSWORD_FILE cannot be read" >&2
            exit 1
        fi
        SHARED_SETTINGS_PASSWORD="$(head -n 1 "$SHARED_SETTINGS_PASSWORD_FILE")"
    fi

    # Fail closed: no credential means no write endpoint, not an open one.
    if [ -z "${SHARED_SETTINGS_PASSWORD:-}" ]; then
        echo "SHARED_SETTINGS is on but no password is set — set SHARED_SETTINGS_PASSWORD_FILE (preferred) or SHARED_SETTINGS_PASSWORD" >&2
        exit 1
    fi

    if [ "${#SHARED_SETTINGS_PASSWORD}" -lt 12 ]; then
        echo "SHARED_SETTINGS_PASSWORD must be at least 12 characters" >&2
        exit 1
    fi

    # apr1 rather than bcrypt: nginx implements apr1 itself, so it does not
    # depend on crypt(3), which on Alpine's musl has no bcrypt support.
    # -stdin keeps the password out of the process arguments.
    SHARED_SETTINGS_HASH="$(printf '%s' "$SHARED_SETTINGS_PASSWORD" | openssl passwd -apr1 -stdin)"
    unset SHARED_SETTINGS_PASSWORD

    printf '%s:%s\n' "$SHARED_SETTINGS_USER" "$SHARED_SETTINGS_HASH" > "$SHARED_SETTINGS_HTPASSWD"
    chown root:nginx "$SHARED_SETTINGS_HTPASSWD"
    chmod 0640 "$SHARED_SETTINGS_HTPASSWD"
    unset SHARED_SETTINGS_HASH

    # DELETE is not used by the dashboard, so it is not exposed.
    cat > /etc/nginx/snippets/shared-settings.conf <<'SETTINGS'
    location = /settings/state.json {
        root /var/lib/service-dash;

        limit_except GET {
            auth_basic "Service Dash settings";
            auth_basic_user_file /etc/nginx/shared-settings.htpasswd;
        }

        dav_methods PUT;
        create_full_put_path on;
        dav_access user:rw group:rw all:r;

        client_body_temp_path /var/lib/service-dash/tmp;
        client_max_body_size 256k;

        add_header Cache-Control "no-store";
    }
SETTINGS
else
    rm -f "$SHARED_SETTINGS_HTPASSWD"
    cat > /etc/nginx/snippets/shared-settings.conf <<'SETTINGS'
    location = /settings/state.json {
        return 404;
    }
SETTINGS
fi

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

if [ "$SHARED_SETTINGS" = "on" ]; then SHARED_SETTINGS_JS=true; else SHARED_SETTINGS_JS=false; fi

printf 'window.__DASHBOARD_CONFIG__ = { statusSlug: "%s", storageMount: "%s", iconOverrides: "%s", sharedSettings: %s };\n' \
    "$STATUS_SLUG" "$STORAGE_MOUNT" "$ESCAPED_SERVICE_ICONS" "$SHARED_SETTINGS_JS" \
    > /usr/share/nginx/html/config.js

export KUMA_UPSTREAM
envsubst '${KUMA_UPSTREAM}' \
    < /etc/nginx/templates/default.conf.template \
    > /etc/nginx/conf.d/default.conf

exec "$@"
