# Handson: measure the ceiling

Five experiments on the local copy of the architecture. Start with [setup](./setup.md). The numbers
below were measured on one laptop class machine, so the absolute values will differ on yours. The
shape will not.

The lab is deliberately arithmetic. The downstream serves `DB_WORKERS` queries at a time and each
takes `DB_SERVICE_MS`, so its ceiling is known in advance: 4 workers at 20 ms is 200 rps. Every
experiment below either confirms that ceiling or moves it.

## 1. Find the knee

Start with the defaults and drive concurrency up in stages.

```bash
make up
make load STAGES=1,2,4,8,16,32,64 SECONDS=4
```

The last column multiplies throughput by latency, which is Little's law read backwards.

```
 conc       rps    p50 ms    p95 ms    p99 ms    err  L=rps*p50
    1      41.1      24.0      26.1      27.7      0        1.0
    2      84.8      23.3      25.8      27.8      0        2.0
    4     172.3      22.7      26.0      30.0      0        3.9
    8     196.3      40.4      41.4      58.2      0        7.9
   16     196.4      81.0     100.1     101.7      0       15.9
   32     196.9     162.9     181.9     194.4      0       32.1
   64     196.9     343.1     366.6     383.4      0       67.6
```

The knee is at concurrency 4. Past it throughput is flat at the predicted 200 rps and every extra
request in flight only adds queue time, exactly proportional. The service is saturated at 196 rps
whatever the dashboard CPU says, and any capacity plan that assumes more than that is fiction.

## 2. Scale out changes nothing

Add a second app instance and split the load across both, as the ALB would.

```bash
make scale-out
make load STAGES=16,64 SECONDS=4 TARGETS=http://127.0.0.1:8080,http://127.0.0.1:8081
```

Two instances, same throughput, same latency.

```
   16     197.2      80.8      82.4      85.4      0       15.9
   64     197.4     324.2     345.4     364.0      0       64.0
```

Check what did change, on the downstream.

```bash
make stats
```

Peak concurrent connections on the downstream went from 10 to 20, one pool per instance. Doubling
the fleet bought zero throughput and doubled the connection pressure on the shared layer. In
production this is where `max_connections` gets hit and the event ends.

## 3. Scale up the shared layer

Restart with twice the downstream capacity, one knob, nothing else changed.

```bash
make down && make up DB_WORKERS=8
make load STAGES=4,8,16,32 SECONDS=4
```

Throughput doubles because the bottleneck moved.

```
    8     354.1      22.1      25.5      28.4      0        7.8
   16     393.1      40.4      44.4      54.8      0       15.9
   32     392.4      81.3      96.9     104.9      0       31.9
```

This is the whole scale up against scale out decision in one pair of experiments. The correct move
was never a property of the app tier, it was a property of where the bottleneck lived.

## 4. The cache is capacity, and the tail tells the truth

Serve 90 percent of requests from cache with the original small downstream.

```bash
make down && make up HIT=0.9
make load STAGES=16,64 SECONDS=4
```

Throughput goes up ten times, and the latency distribution splits in two.

```
   16    1926.4       2.0      59.1      72.9      0        3.9
   64    2038.0       1.6     309.3     322.7      0        3.3
```

p50 is the cache path, p95 and p99 are the 10 percent that still reach the database. Two lessons for
event day. Cache hit ratio is a capacity number, so a deploy that invalidates the cache at 20:00
removes 90 percent of the capacity. And a p50 dashboard will show a perfectly healthy service while
one request in ten takes 300 ms.

## 5. Shed load on purpose

Give the pool a short timeout so it fails fast instead of queueing.

```bash
make down && make up POOL=4 POOL_TIMEOUT=200
make load STAGES=16,64 SECONDS=4
```

At concurrency 64 the excess is rejected rather than queued.

```
   16     171.2      89.6     121.7     155.9      0       15.3
   64     306.8     217.2     222.6     225.3    517       66.6
```

517 requests got a fast 503, and the requests that were served stayed at 225 ms p99 instead of
climbing without limit as in experiment 1. Nothing here creates capacity. It chooses who waits,
which is the only decision left once demand is past the ceiling.

## 6. How long an instance takes to become useful

Measure the time from process start to the first request the instance can serve.

```bash
make down && make coldstart
```

The JVM in this lab reports around 2.5 seconds.

```
ready after 2493 ms
```

On EC2 that number is the smallest part of the total. Add instance launch, user data, image pulls,
JIT warm up on the first real traffic, and connection pool and cache priming, and a realistic
readiness time is minutes. Compare that against how fast the event ramp arrives, which is the
input to the [warm pool decision](./4-warm-pool.md).

Stop everything when finished.

```bash
make down
```
