# Local lab setup

Four containers on three bridge networks. The client reaches the server only through r1, and the server decides on its own which router the reply leaves by.

## Topology

```text
                    edge 10.10.0.0/24
  client .10 ──────┬──── r1 .2 ──── net_a 10.20.0.0/24 ──── .10 server
                   └──── r2 .3 ──── net_b 10.30.0.0/24 ──── .20 server

  forward path: pinned to r1 by a route on the client
  return path:  chosen by a route on the server, flipped during the hands-on
```

The server is dual homed, which is the cheapest way to build a second path. Every scenario keeps the same forward path and only moves the return path.

## Requirements

Docker with the compose plugin, and a Linux kernel that exposes `nf_conntrack` sysctls to containers. Docker Desktop on macOS and Windows runs its own Linux VM, so both work.

## Up

Run from the workspace root.

```sh
docker compose up -d
```

The containers configure themselves on boot: routers turn on forwarding, the client pins the forward path to r1, and the server starts an HTTP listener on 8080 with a symmetric return path.

Confirm the baseline before starting the hands-on.

```sh
docker exec ar-client curl -s --max-time 3 http://10.20.0.10:8080/
```

`ok` means the lab is ready.

## Down

```sh
docker compose down -v
```
