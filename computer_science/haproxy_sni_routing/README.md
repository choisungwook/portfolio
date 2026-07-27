# HAProxy SNI routing

TL;DR: HAProxy reads the `server_name` extension out of a plaintext ClientHello and routes TCP without terminating TLS. This workspace reproduces that, then answers the two cases that break it: a handshake with no SNI, and a client that speaks HTTPS to an IP address.

Study sheet: [studysheet-haproxy-sni-routing.html](studysheet-haproxy-sni-routing.html) (open in a browser)

| Document | Content |
|---|---|
| [1-setup.md](docs/1-setup.md) | `docker compose up -d` / `down -v`, ports, generated certificates |
| [2-sni-routing.md](docs/2-sni-routing.md) | Why an L4 proxy can read a hostname, `inspect-delay` and `req.ssl_sni`, routing hands-on |
| [3-no-sni.md](docs/3-no-sni.md) | Who sends no SNI, `-m found`, four ways to answer, the inspect-delay tradeoff |
| [4-ip-https.md](docs/4-ip-https.md) | IP SAN certificates, fallback backend vs default certificate, `strict-sni` |

| File | Role |
|---|---|
| `compose.yaml` | Lab: certificate generator, three nginx backends, HAProxy |
| `haproxy/haproxy.cfg` | Passthrough frontend (8443), TLS terminating frontend (8444), stats (8404) |
| `haproxy/crt-list.txt` | Certificate list; the first entry is the default certificate |
| `certs/gen-certs.sh` | Lab CA and three leaf certificates, one of them with an IP SAN |
| `nginx/backend.conf.template` | Backend that echoes the SNI and Host it received |
