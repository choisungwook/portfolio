# Routing on SNI

TL;DR: SNI is a plaintext extension in the ClientHello, so an L4 proxy can read the hostname before any key is exchanged and pick a backend without owning a certificate. HAProxy needs `tcp-request inspect-delay` to wait for that first record, then matches `req.ssl_sni`. Environment: [1-setup.md](1-setup.md).

## Why an L4 proxy can read a hostname

A TLS handshake starts with the client sending a ClientHello in the clear. The `server_name` extension (RFC 6066) carries the hostname the client intends to reach, and it is sent before the server picks a certificate, because the server needs it to pick one.

Two consequences follow, and both are the point of this hands-on.

- A TCP proxy can route on the hostname while staying a TCP proxy. No private key, no termination, no HTTP parsing.
- Anything the proxy reads there is unauthenticated. The client can put any name in the extension, and the certificate the client actually accepts is decided later, between the client and the backend.

## What HAProxy needs

In TCP mode HAProxy would forward the connection as soon as it is accepted, before any payload arrives. `tcp-request inspect-delay` holds the connection so the content rules can look at the buffer.

The routing part of `haproxy/haproxy.cfg`:

```text
frontend fe_sni_passthrough
  bind *:8443
  mode tcp
  tcp-request inspect-delay 5s
  tcp-request content set-var(sess.sni) req.ssl_sni
  tcp-request content accept if { req.ssl_hello_type 1 }
  tcp-request content reject

  use_backend be_a_tls if { req.ssl_sni -i a.lab.local }
  use_backend be_b_tls if { req.ssl_sni -i b.lab.local }
  use_backend be_nosni_tls if !{ req.ssl_sni -m found }
  default_backend be_unknown_tls
```

| Element | Meaning |
|---|---|
| `req.ssl_hello_type 1` | The buffered bytes are a ClientHello. Non-TLS traffic never matches. |
| `req.ssl_sni` | The `server_name` value. Undefined when the extension is absent. |
| `-m found` | Match on existence, not on value. This is what separates "no SNI" from "unknown SNI". |
| `tcp-request content reject` | Reached only after the inspect-delay expires with no ClientHello. Drops plain HTTP sent to 8443. |

`req.ssl_sni` only exists while the request buffer is intact, which is gone by the time the log line is written. Copying it into a session variable (`set-var(sess.sni)`) and logging `%[var(sess.sni)]` survives that. The older idiom, `tcp-request content capture` plus `%[capture.req.hdr(0)]`, is an HTTP fetch and HAProxy 3.x refuses it in a pure TCP frontend. When HAProxy terminates TLS itself, the equivalent fetch is `ssl_fc_sni`.

## Hands-on

Send the two known names and confirm they land on different backends.

```bash
curl --cacert certs/out/ca.crt --resolve a.lab.local:8443:127.0.0.1 https://a.lab.local:8443/
curl --cacert certs/out/ca.crt --resolve b.lab.local:8443:127.0.0.1 https://b.lab.local:8443/
```

Expected output. `sni=` is echoed by nginx, which proves the name survived the proxy and reached the backend handshake.

```text
backend=a sni=a.lab.local host=a.lab.local:8443 port=443
backend=b sni=b.lab.local host=b.lab.local:8443 port=443
```

Read the SNI on the wire with `openssl`, without a certificate check.

```bash
openssl s_client -connect 127.0.0.1:8443 -servername a.lab.local </dev/null 2>/dev/null | grep -E "subject=|CN ="
```

The subject is `CN = a.lab.local`, so backend A terminated the handshake.

Confirm HAProxy logged the routing decision.

```bash
docker compose logs haproxy | grep sni=
```

## The name is a routing key, not an identity

The destination address never changes in the commands below, only the extension value. The certificate that comes back follows the extension.

```bash
openssl s_client -connect 127.0.0.1:8443 -servername a.lab.local </dev/null 2>/dev/null | grep "subject="
openssl s_client -connect 127.0.0.1:8443 -servername b.lab.local </dev/null 2>/dev/null | grep "subject="
```

Nothing in the handshake proves the client was entitled to reach either backend. HAProxy made a dispatch decision on a client-controlled string, and the certificate check happened afterwards between the client and the backend. In passthrough mode HAProxy also cannot compare the SNI with the HTTP Host header, because the Host header is inside the encrypted stream. If those two must agree, TLS has to be terminated where the comparison can be made.

Next: [3-no-sni.md](3-no-sni.md).
