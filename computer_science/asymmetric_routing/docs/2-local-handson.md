# Local hands-on: what asymmetric routing actually breaks

Asymmetric routing means the reply takes a different path than the request. On its own it breaks nothing, because IP forwarding keeps no state. It breaks when a device on one of the two paths does keep state. This lab builds the asymmetry first, confirms it works, and then adds one stateful thing at a time until it stops working.

Build the environment first: [1-setup-local.md](1-setup-local.md).

| Step | Return path | Extra condition on r2 | Result |
|---|---|---|---|
| 1 | r1 (symmetric) | none | works |
| 2 | r2 (asymmetric) | none | works |
| 3 | r2 | `rp_filter=2`, no reverse route | dropped |
| 4 | r2 | `rp_filter=2`, reverse route added | works |
| 5 | r2 | `rp_filter=1` | dropped |
| 6 | r2 | stateful firewall | dropped |

## Step 1. Symmetric baseline

Send one request and watch both routers at once.

```sh
./probe.sh
```

Both directions appear on r1 and r2 sees nothing. This is the shape every diagram assumes.

## Step 2. Make it asymmetric, and watch it keep working

Point the server's route back to the client at r2 instead of r1.

```sh
docker exec ar-server /scripts/return-path.sh r2
./probe.sh
```

The request still succeeds, and now r1 shows only the client-to-server direction while r2 shows only the server-to-client direction. Nothing along the path cares that the two halves disagree.

The asymmetry is already visible in the connection tracking table, though. Give r1 a rule that makes it track connections, then look.

```sh
docker exec ar-r1 iptables -A FORWARD -m conntrack --ctstate NEW -j ACCEPT
docker exec ar-client curl -s --max-time 3 http://10.20.0.10:8080/
docker exec ar-r1 conntrack -L 2>/dev/null || docker exec ar-r1 cat /proc/net/nf_conntrack
```

The entry is marked `[UNREPLIED]`. r1 forwarded a request and never saw an answer, because the answer went past r2. That marker is the fingerprint to look for on a real firewall.

## Step 3. Reverse path filtering, loose mode

Linux can check that the source address of an arriving packet is one it knows how to route back to. r2 has no route to the server network at all, so loose mode already rejects the reply.

```sh
docker exec ar-r2 /scripts/rpfilter.sh 2
./probe.sh
```

The request fails. r1 still shows the request leaving, and r2 shows the reply arriving on its capture: tcpdump sits before the routing decision, so the packet is visible right up to the moment the kernel discards it. Nothing leaves r2 toward the client.

## Step 4. Give r2 a reverse route

Loose mode only asks whether any route to the source exists, not which one.

```sh
docker exec ar-r2 ip route replace 10.20.0.0/24 via 10.10.0.2
./probe.sh
```

Works again. The route points out the wrong interface, and loose mode does not care.

## Step 5. Strict mode

```sh
docker exec ar-r2 /scripts/rpfilter.sh 1
./probe.sh
```

Dropped again, with the same reverse route in place. Strict mode requires the return route to leave by the interface the packet arrived on, which is exactly the condition asymmetric routing violates. This is why strict `rp_filter` and multi-path networks do not mix, and why RFC 3704 recommends loose mode at network edges that carry asymmetric traffic.

Turn it back off before continuing.

```sh
docker exec ar-r2 /scripts/rpfilter.sh 0
```

## Step 6. A stateful firewall

The failure people actually hit in production. r2 now tracks connections and drops anything it cannot place in a known flow.

```sh
docker exec ar-r2 /scripts/stateful-firewall.sh on
./probe.sh
```

The request fails, and this time the reason has nothing to do with routing. r2 never saw the SYN, so the SYN-ACK belongs to no connection it knows. Confirm what r2 thinks of that packet.

```sh
docker exec ar-r2 conntrack -S 2>/dev/null | head -3
docker exec ar-r2 iptables -L FORWARD -n -v
```

The drop counter on the `INVALID` rule moves.

Worth knowing why this needs one extra setting. By default the kernel runs with `nf_conntrack_tcp_loose=1`, which lets conntrack adopt a flow whose beginning it missed. That default quietly hides asymmetric routing on plain Linux routers. `stateful-firewall.sh` turns it off, which is what firewall products do, and the problem becomes visible.

## Step 7. The two fixes

Make the routing symmetric again.

```sh
docker exec ar-server /scripts/return-path.sh r1
./probe.sh
```

Works, and it works because both directions now meet the same stateful device.

The other fix is to force symmetry with NAT instead of routing. Make r1 rewrite the source address on the way out, and the server has no choice but to reply to r1.

```sh
docker exec ar-server /scripts/return-path.sh r2
docker exec ar-r1 iptables -t nat -A POSTROUTING -s 10.10.0.0/24 -d 10.20.0.0/24 -j MASQUERADE
./probe.sh
```

Works again even though the server's route still points at r2, because the server never sees the client address any more. It replies to 10.20.0.2, which is r1. This is the same trick a cloud NAT gateway plays, and it is what the AWS half of this hands-on builds: [4-aws-handson.md](4-aws-handson.md).

The cost is that the server can no longer tell clients apart by address. Symmetry bought with NAT is symmetry paid for with identity.

## Reset

```sh
docker compose down -v && docker compose up -d
```

Teardown is in [1-setup-local.md](1-setup-local.md).
