# When the handshake has no SNI

TL;DR: A ClientHello without a `server_name` extension is legal, so SNI routing needs an answer for it. `req.ssl_sni -m found` separates "no SNI" from "unknown SNI", and from there the choice is a fallback backend, a rejection, or terminating TLS and routing on something else. Environment: [1-setup.md](1-setup.md).

## Who sends no SNI

| Case | Reason |
|---|---|
| The client connects to an IP literal | RFC 6066 forbids putting an IP address in `server_name`, so a correct client omits the extension. This is the common one. See [4-ip-https.md](4-ip-https.md). |
| Health checks and probes | Load balancer and monitoring probes often open a TLS connection to an address, not a name. |
| Tools called without a name | `openssl s_client` sends no SNI unless `-servername` is given. |
| Old stacks | Clients predating widespread SNI support: Windows XP era browsers, Java 6, Android 2.x. Rare now, but they exist behind corporate proxies. |
| Non-HTTP protocols over TLS | Some clients speak TLS without any hostname concept. |
| Encrypted ClientHello | With ECH the real name is encrypted; the outer SNI is a shared public name, so it is useless as a tenant key. |

The extension is optional in the specification. Treating its absence as a client bug leads to outages that look random from the outside.

## What HAProxy sees

`req.ssl_sni` is undefined, not empty. Value matches such as `req.ssl_sni -i a.lab.local` simply do not match, so the connection falls through to `default_backend` unless an explicit rule catches it first. The lab config splits the two cases so the logs can tell them apart.

```text
  use_backend be_nosni_tls if !{ req.ssl_sni -m found }
  default_backend be_unknown_tls
```

`-m found` is a match method on existence. This distinction matters operationally: "a client sent no SNI" and "a client asked for a tenant we do not host" are different incidents.

## Four ways to answer

| Strategy | Config shape | Cost |
|---|---|---|
| Fallback backend | `default_backend be_fallback` | Something must own the fallback and serve a certificate the client will accept. Used by this lab. |
| Explicit no-SNI backend | `use_backend be_nosni if !{ req.ssl_sni -m found }` | Same as above, plus the logs and stats separate the two causes. |
| Reject | `tcp-request content reject unless { req.ssl_sni -m found }` | Strict and simple, but it also kills IP-based health checks and legacy clients. Choose it only when every client is known. |
| Terminate TLS | `bind *:443 ssl crt-list ...` and route on the Host header | HAProxy holds the keys, but a client with no SNI still gets the default certificate and is then routed by a header it did send. |

There is a fifth answer that avoids the question: give each tenant its own listening port or IP, and route on `dst_port` or `dst`. It does not scale to many tenants, and it is still the right call for a small number of internal services.

## Hands-on

Connect with no SNI. `openssl` omits the extension unless told otherwise.

```bash
openssl s_client -connect 127.0.0.1:8443 </dev/null 2>/dev/null | grep "subject="
```

The subject is `CN = default`: the connection reached `be_nosni_tls`, which points at the fallback backend. Compare with the routed case from [2-sni-routing.md](2-sni-routing.md), where the subject follows `-servername`.

Now send an SNI that is not in the routing table.

```bash
openssl s_client -connect 127.0.0.1:8443 -servername c.lab.local </dev/null 2>/dev/null | grep "subject="
```

Same certificate, different path. The HAProxy log separates them.

```bash
docker compose logs haproxy | grep -E "be_nosni_tls|be_unknown_tls"
```

The `sni=` field is empty for the first case and `c.lab.local` for the second. That single field is what turns "TLS errors on the edge" into a diagnosable event.

## The inspect-delay tradeoff

`tcp-request content reject` at the end of the frontend drops anything that is not a ClientHello. Send plain HTTP to the TLS port and watch the connection hang for the inspect-delay, then die.

```bash
time curl -s -m 10 http://127.0.0.1:8443/ ; echo "exit=$?"
```

The rules are evaluated again when the delay expires, this time with whatever arrived. A ClientHello that is split across packets and arrives slowly is indistinguishable from garbage at that moment, so a delay that is too short rejects real clients and a delay that is too long holds sockets open for anyone who connects and says nothing. 5s is a starting point, not an answer.

Next: [4-ip-https.md](4-ip-https.md).
