# 2. Local lab - tell three bottlenecks apart

The app exposes three endpoints, each saturating a different resource. The pools are deliberately tiny (Tomcat max threads 20, Hikari pool 5, app capped to 1 CPU) so every saturation shows up within a 2-minute k6 ramp. The point of the drill: the same symptom - p95 latency explodes - has three different causes, and only the metrics tell them apart. The cause decides whether scale out helps.

Start the stack first ([setup.md](./setup.md)).

## Metrics to watch

One terminal keeps polling the app metrics while k6 runs. Tomcat busy threads, Hikari pending, and per-endpoint latency all come from the Prometheus endpoint.

```bash
watch -n 2 'curl -s localhost:8080/actuator/prometheus | grep -E "tomcat_threads_busy|hikari.*(active|pending)" | grep -v "^#"'
```

Container CPU comes from Docker in a second terminal.

```bash
docker stats
```

## Round 1 - connection-bound (/api/db)

Each request holds one Hikari connection for 200 ms. Five connections serve at most ~25 req/s, so 30 VUs pile up behind the pool.

```bash
docker compose --profile load run --rm k6
```

What to observe: `hikari_connections_pending` climbs, `tomcat_threads_busy_threads` climbs to 20, container CPU stays low. Scale out would double the pool count - and double the connections held on MySQL. The bottleneck did not divide; it moved to the DB. The fix is pool sizing against the DB connection budget, not more instances.

## Round 2 - CPU-bound (/api/cpu)

Same ramp, different target.

```bash
TARGET=/api/cpu docker compose --profile load run --rm k6
```

What to observe: `docker stats` pins the app at ~100% CPU, Hikari stays idle, latency rises with VUs. This load divides cleanly across instances - the scale out case.

## Round 3 - cache expiry storm (/api/product/1)

The product cache TTL is 30 s in compose. A cache hit answers in ~1 ms; a miss pays a 100 ms DB read. Under constant load, every TTL expiry sends a burst of misses to the DB at the same instant.

```bash
TARGET=/api/product/1 docker compose --profile load run --rm k6
```

What to observe: the k6 latency graph spikes every ~30 s while the average stays flat. Restart the app with `CACHE_TTL_JITTER_RATIO: 0.1` in compose.yaml and repeat - the spikes spread out. This is the stampede an event opening triggers at scale, and why the checklist includes cache warm-up and TTL jitter, not just instance counts.

## What the drill decides

- Pool/connection saturation: fix pool sizes and the DB connection budget first; scale out multiplies connections.
- CPU saturation on a stateless API: scale out, and verify the per-instance saturation point to compute how many instances the event peak needs.
- Expiry storms: no instance count fixes this; warm the cache and add TTL jitter before the event.
