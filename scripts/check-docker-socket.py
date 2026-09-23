#!/usr/bin/env python3
"""Check that CetusGuard is the only service holding the Docker socket.

This exists because a reviewer found what every check here missed. `netdata`
mounted `/var/run/docker.sock` directly, in all three Compose files, while the
README said in three separate places that the socket went only to CetusGuard.
The claim was false for two releases and nothing in the repository disagreed.

Two things make this worth a guard of its own:

- **`:ro` on a socket mount restricts nothing.** It makes the *mount* read-only;
  the socket still accepts `POST /containers/create`, `/exec`, everything. A
  mount that reads as restricted is exactly the kind that survives review, so
  matching on the path and ignoring the mode is deliberate.
- **The service that had it is the worst one to give it to.** netdata already
  runs with `pid: host`, `SYS_ADMIN`, `SYS_PTRACE` and the host root mounted.

Measured on a real host before this landed: netdata genuinely does need Docker
to name its cgroup charts -- without it every container reads as a truncated id
like `80a653f2a9c5`, and the dashboard's per-card container mapping (stored by
name) breaks whenever a container is recreated. So the fix was not to remove
the access but to route it through CetusGuard's allowlist via DOCKER_HOST,
which resolves names while `POST /containers/create` returns 403.

Hence the two rules below: only the proxy may hold the socket, and anything
else needing Docker data must come through the proxy.
"""
import pathlib
import sys

REPO = pathlib.Path(__file__).resolve().parent.parent

# The service allowed to hold the real socket, and the name others must reach
# it by. This is the Compose *service* name, which is also its DNS name.
PROXY = "docker-metadata"
SOCKET = "/var/run/docker.sock"

COMPOSE_FILES = [
    "docker-compose.yml",
    "docker-compose.casaos.yml",
    # The ZimaOS/CasaOS app-store copy is a third hand-maintained copy of the
    # same stack, so it can regrow the mount on its own.
    "appstore/Apps/ServiceDash/docker-compose.yml",
]

try:
    import yaml
except ImportError:
    sys.exit("PyYAML is required: pip install pyyaml")


def mounts_socket(service: dict) -> bool:
    """Does this service bind-mount the Docker socket, under any mode?

    The mode is ignored on purpose: `:ro` does not restrict the Docker API, so
    a read-only mount is not a safer mount and must not pass.
    """
    for volume in service.get("volumes") or []:
        if isinstance(volume, str):
            source = volume.split(":", 1)[0]
        elif isinstance(volume, dict):
            source = str(volume.get("source", ""))
        else:
            continue
        if source == SOCKET:
            return True
    return False


def docker_host_of(service: dict) -> str | None:
    """The service's DOCKER_HOST, whether env is a map or a list."""
    env = service.get("environment")
    if isinstance(env, dict):
        value = env.get("DOCKER_HOST")
        return None if value is None else str(value)
    if isinstance(env, list):
        for entry in env:
            if isinstance(entry, str) and entry.startswith("DOCKER_HOST="):
                return entry.split("=", 1)[1]
    return None


def networks_of(service: dict) -> set[str]:
    """The networks a service is attached to, normalised."""
    if service.get("network_mode"):
        return {f"__mode__:{service['network_mode']}"}
    nets = service.get("networks")
    if nets is None:
        return {"default"}
    if isinstance(nets, dict):
        return set(nets.keys())
    return set(nets)


def check(path: pathlib.Path, label: str) -> list[str]:
    config = yaml.safe_load(path.read_text()) or {}
    services = config.get("services") or {}
    problems = []

    if PROXY not in services:
        problems.append(f"{label}: no '{PROXY}' service -- has the proxy been renamed?")
    elif not mounts_socket(services[PROXY]):
        problems.append(
            f"{label}: '{PROXY}' does not mount {SOCKET}; it is the one "
            f"service that is supposed to"
        )

    for name, service in services.items():
        if name == PROXY or not isinstance(service, dict):
            continue

        if mounts_socket(service):
            problems.append(
                f"{label}: '{name}' mounts {SOCKET} directly. Only '{PROXY}' "
                f"may. Note that ':ro' is not a fix -- it makes the mount "
                f"read-only, not the Docker API. Point it at the proxy with "
                f"DOCKER_HOST=tcp://{PROXY}:2375 instead"
            )

        host = docker_host_of(service)
        if host is None:
            continue
        if PROXY not in host:
            problems.append(
                f"{label}: '{name}' sets DOCKER_HOST={host}, which does not "
                f"go through '{PROXY}' -- Docker access must be allowlisted"
            )
            continue
        # Routing Docker access through the proxy creates a dependency that
        # check-compose-networks.py does not see, because that script only
        # follows nginx upstreams. Strand the two on different networks and the
        # name will not resolve -- the same shape as the 1.2.1 outage, but
        # failing quietly here: netdata simply falls back to naming every
        # container by id, and nothing else says why.
        if PROXY in services and not (networks_of(service) & networks_of(services[PROXY])):
            problems.append(
                f"{label}: '{name}' reaches Docker via '{PROXY}' but they share "
                f"no network ({sorted(networks_of(service))} vs "
                f"{sorted(networks_of(services[PROXY]))}) -- the name will not "
                f"resolve and container charts will silently fall back to ids"
            )

    return problems


def main() -> int:
    failures = []
    for name in COMPOSE_FILES:
        path = REPO / name
        if not path.exists():
            failures.append(f"missing {name}")
            continue
        found = check(path, name)
        failures.extend(found)
        if not found:
            print(f"ok: {name}")

    for problem in failures:
        print(f"FAIL: {problem}", file=sys.stderr)
    return 1 if failures else 0


if __name__ == "__main__":
    sys.exit(main())
