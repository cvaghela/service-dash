#!/usr/bin/env python3
"""Check that every service nginx proxies to shares a network with the dashboard.

`docker compose config` validates syntax, not reachability, so a service placed
on the wrong network parses cleanly and then fails at runtime with
"host not found in upstream" — which stops nginx from starting at all.
This catches that before it ships.
"""
import re
import sys
import pathlib

REPO = pathlib.Path(__file__).resolve().parent.parent
DASHBOARD = "service-dash"
COMPOSE_FILES = [
    "docker-compose.yml",
    "docker-compose.casaos.yml",
    # The ZimaOS/CasaOS app-store copy. It carries the same upstreams, so it
    # can strand kuma-auth on the wrong network exactly the way 1.2.1 did.
    "appstore/Apps/ServiceDash/docker-compose.yml",
]

try:
    import yaml
except ImportError:
    sys.exit("PyYAML is required: pip install pyyaml")


def upstream_hosts(template: pathlib.Path) -> set[str]:
    """Hostnames nginx proxies to, whether written literally or via `set`."""
    text = template.read_text()
    hosts = set(re.findall(r"proxy_pass\s+https?://([a-zA-Z0-9_.-]+)[:/;]", text))
    # `set $var "host";` followed by proxy_pass http://$var:port
    for var, host in re.findall(r'set\s+\$(\w+)\s+"([a-zA-Z0-9_.-]+)"\s*;', text):
        if re.search(rf"proxy_pass\s+https?://\${var}\b", text):
            hosts.add(host)
    return hosts


def networks_of(service: dict) -> set[str]:
    """The set of networks a service is attached to, normalised."""
    if service.get("network_mode"):
        return {f"__mode__:{service['network_mode']}"}
    nets = service.get("networks")
    if nets is None:
        return {"default"}
    if isinstance(nets, list):
        return set(nets)
    if isinstance(nets, dict):
        return set(nets.keys())
    return {"default"}


def check(path: pathlib.Path) -> list[str]:
    doc = yaml.safe_load(path.read_text())
    services = doc.get("services", {})
    if DASHBOARD not in services:
        return [f"{path.name}: no '{DASHBOARD}' service"]

    dash_nets = networks_of(services[DASHBOARD])
    problems = []

    for host in sorted(upstream_hosts(REPO / "nginx.conf.template")):
        # Anything not defined as a service here is external (a CDN, the host
        # gateway, a template variable) and is not ours to check.
        if host not in services:
            continue
        host_nets = networks_of(services[host])
        if not (dash_nets & host_nets):
            problems.append(
                f"{path.name}: nginx proxies to '{host}', but it is on "
                f"{sorted(host_nets)} while {DASHBOARD} is on {sorted(dash_nets)} "
                f"-- the name will not resolve and nginx will refuse to start"
            )
    return problems


def main() -> int:
    failures = []
    for name in COMPOSE_FILES:
        path = REPO / name
        if not path.exists():
            failures.append(f"missing {name}")
            continue
        found = check(path)
        failures.extend(found)
        if not found:
            print(f"ok: {name}")

    for problem in failures:
        print(f"FAIL: {problem}", file=sys.stderr)
    return 1 if failures else 0


if __name__ == "__main__":
    sys.exit(main())
