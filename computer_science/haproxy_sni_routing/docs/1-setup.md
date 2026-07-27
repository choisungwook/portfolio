# Setup

TL;DR: `docker compose up -d` builds the lab CA, three nginx backends and HAProxy. `docker compose down -v` removes everything. Every other document in this directory assumes the lab is up.

## Up

Run from the workspace root (`computer_science/haproxy_sni_routing`).

```bash
docker compose up -d
```

The `certs` service runs once before the rest and writes a CA plus three leaf certificates into `certs/out/`. It is idempotent, so a second `up` reuses the existing files.

| Port | Mode | Purpose |
|---|---|---|
| 8443 | TCP passthrough | Routes on the SNI inside the ClientHello. Backends terminate TLS. |
| 8444 | TLS termination | HAProxy terminates TLS, then routes on the HTTP Host header. |
| 8404 | HTTP | HAProxy stats page. |

| Certificate | SAN |
|---|---|
| `certs/out/a.lab.local.crt` | `DNS:a.lab.local` |
| `certs/out/b.lab.local.crt` | `DNS:b.lab.local` |
| `certs/out/default.crt` | `DNS:default.lab.local`, `IP:127.0.0.1` |

Check that HAProxy accepted the configuration.

```bash
docker compose logs haproxy
curl -s http://127.0.0.1:8404 -o /dev/null -w '%{http_code}\n'
```

## Down

Stop and remove the containers and network.

```bash
docker compose down -v
```

The generated certificates stay in `certs/out/` because they are a bind mount. Delete the directory to force a fresh CA.

## Client name resolution

The hostnames are fake, so resolve them at the client instead of editing `/etc/hosts`.

```bash
curl --cacert certs/out/ca.crt --resolve a.lab.local:8443:127.0.0.1 https://a.lab.local:8443/
```
