# HTTPS to an IP address

TL;DR: An IP literal produces a handshake with no SNI and a client that verifies an IP SAN, so it needs both a fallback route and a certificate that names the address. Port 8443 answers it with a fallback backend, port 8444 answers it with HAProxy's default certificate plus Host header routing. Environment: [1-setup.md](1-setup.md).

## Why the IP case is two problems

Reaching `https://127.0.0.1` breaks SNI routing twice, and the two failures have different fixes.

| Problem | Where it shows | Fix |
|---|---|---|
| No SNI in the ClientHello | The proxy has nothing to route on | A fallback route, see [3-no-sni.md](3-no-sni.md) |
| The certificate must name the IP | The client rejects it with a name mismatch | A certificate with `IP:` in its subjectAltName |

RFC 6066 says the `server_name` extension carries a DNS hostname, and explicitly not a literal address, so a correct client omits the extension entirely. Modern clients also ignore the certificate CN and verify only the SAN, so `CN=127.0.0.1` is not enough. The lab certificate is issued with `DNS:default.lab.local,IP:127.0.0.1` for exactly this reason.

Public CAs will not issue an IP SAN for a private address, and only some issue them for public ones. In practice HTTPS-to-IP inside a private network means a private CA, or accepting that the client skips verification.

## Path 1: passthrough with a fallback backend

Port 8443 never terminates TLS. The connection has no SNI, so `be_nosni_tls` sends it to the fallback backend, which holds the certificate with the IP SAN.

```bash
curl --cacert certs/out/ca.crt https://127.0.0.1:8443/
```

Expected output. Note the empty `sni=`: nginx confirms the extension really was absent, and verification still succeeded because of the IP SAN.

```text
backend=default sni= host=127.0.0.1:8443 port=443
```

Drop the `--cacert` to see the other half of the problem, the client-side trust decision, which the proxy has no part in.

```bash
curl https://127.0.0.1:8443/ ; echo "exit=$?"
```

## Path 2: termination with a default certificate

Port 8444 terminates TLS. HAProxy picks a certificate by SNI from `haproxy/crt-list.txt`, and the first entry is the default used when there is no match, or no SNI at all.

```text
/certs/bundles/default.pem
/certs/bundles/a.lab.local.pem
/certs/bundles/b.lab.local.pem
```

The default is the first declared certificate. Some setups make that explicit by adding a `*` filter to the line instead of relying on order; both express the same intent.

Once the handshake is done, the request is plain HTTP and routing can use the Host header, which an IP client does send.

```text
  acl host_a req.hdr(host),field(1,:) -i a.lab.local
  use_backend be_a_http if host_a
  default_backend be_default_http
```

Compare the two clients on the same port.

```bash
curl --cacert certs/out/ca.crt https://127.0.0.1:8444/
curl --cacert certs/out/ca.crt --resolve a.lab.local:8444:127.0.0.1 https://a.lab.local:8444/
```

The first lands on the default backend with an empty SNI; the second gets the `a.lab.local` certificate and is routed by the Host header. HAProxy logs both decisions.

```bash
docker compose logs haproxy | grep has_sni=
```

`has_sni=0` marks the IP client. That single field answers "why did this request land on the default backend" without a packet capture.

## What strict-sni changes

Adding `strict-sni` to the `bind` line tells HAProxy to refuse a handshake when no certificate matches the SNI, including the case where there is no SNI. Try it by editing the `fe_tls_terminate` bind line in `haproxy/haproxy.cfg`.

```text
  bind *:8444 ssl crt-list /usr/local/etc/haproxy/crt-list.txt alpn h2,http/1.1 strict-sni
```

Apply it and repeat both requests.

```bash
docker compose restart haproxy
curl --cacert certs/out/ca.crt https://127.0.0.1:8444/ ; echo "exit=$?"
curl --cacert certs/out/ca.crt --resolve a.lab.local:8444:127.0.0.1 https://a.lab.local:8444/
```

The IP client now fails in the handshake while the named client still works. That is the tradeoff in one command pair: `strict-sni` stops the default certificate from being handed to anyone who asks, and it also breaks every IP-based health check and legacy client pointed at that port. Remove `strict-sni` and restart to return the lab to its original state.

## Choosing

| Situation | Choice |
|---|---|
| Internal health check hitting an IP | Keep a default certificate with an IP SAN, or move the check to a hostname |
| Multi-tenant edge where a wrong default is a data leak | `strict-sni`, and give probes a real hostname |
| Passthrough required (backend owns the keys) | Fallback backend, and accept that the proxy cannot help with certificates |
