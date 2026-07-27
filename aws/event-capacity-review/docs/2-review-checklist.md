# Layer by layer review

One rule decides scale up against scale out everywhere below.

- Scale out when the work is stateless and every added instance brings its own share of the
  bottleneck resource.
- Scale up when the bottleneck is a resource that all instances share: a single writer, a single
  threaded shard, a lock, a fixed size pool.

Scaling out past a shared bottleneck is the classic event outage. Ten more app instances open ten
more pools of connections against the same database, and the database is the thing that was slow.

## Sizing arithmetic

Do this before touching any console. Every number below comes from a measured p50 service time.

| Quantity | Formula | Example at 500 rps |
| --- | --- | --- |
| In-flight requests | rps x latency | 500 x 0.04 s = 20 |
| Connection pool per instance | in-flight DB work / instances | 500 x 0.01 s / 4 = 1.25, round to 4 |
| App instances | rps / measured rps per instance at SLO | 500 / 180 = 3, round up |
| Headroom target | peak x forecast error / surviving fraction | 500 x 1.5 / 0.67 = 1120 |

The surviving fraction is the AZ rule. With three AZs, losing one leaves two thirds of the fleet,
so plan the fleet to serve peak with one AZ gone. The SRE book states the same idea as N+2: enough
to serve peak, plus one unit for planned maintenance, plus one for the failure that happens anyway.

## ALB

ALB scales itself, but it scales in steps and not instantly. A step function of traffic at 20:00 is
the case to prepare, either by ramping real traffic beforehand or by asking AWS support to prepare
the load balancer for a known event.

| Metric | Read it as |
| --- | --- |
| RequestCountPerTarget | the only clean per-instance load signal, and the best scaling trigger |
| TargetResponseTime | latency at the edge, compare against the app view to find queueing |
| HTTPCode_ELB_5XX_Count, 504 | targets not answering in time, the load balancer's own verdict |
| RejectedConnectionCount | connection ceiling reached |
| TargetConnectionErrorCount | targets refusing connections, usually accept queue full |

Two settings cause self-inflicted 5xx during events. The target's keep alive timeout must be longer
than the ALB idle timeout, otherwise the target closes a connection the ALB is still using and the
client sees 502. And health checks must be loose enough that a slow instance under peak load is not
evicted, which removes capacity exactly when capacity is short.

## EC2 Auto Scaling group

A predictable event does not deserve a reactive policy. Scheduled scaling is the primary tool, with
target tracking left underneath as the safety net for the part of the forecast that is wrong.

| Setting | What to check |
| --- | --- |
| Scheduled action | fleet raised before the event starts, not when load arrives |
| Target tracking | on ALBRequestCountPerTarget, target value from the measured knee |
| Default instance warmup | at least boot plus application readiness, otherwise the group overscales |
| Cooldown and step policy | one step big enough to matter, spikes are not caught one instance at a time |
| Termination behaviour | graceful shutdown plus deregistration delay longer than the slowest request |
| Max size and quotas | instance limits, EIP and ENI limits, and target group size all raised in advance |

If instance readiness takes minutes and the ramp takes seconds, no policy is fast enough and the
answer is a [warm pool or a pre-scaled fleet](./4-warm-pool.md).

## Spring Boot application

The application is where a healthy fleet and a healthy database still add up to an outage.

| Item | Failure at peak |
| --- | --- |
| Tomcat max threads (default 200) | too high hides the queue and burns latency budget, too low rejects early |
| Hikari max pool (default 10) | derived from the arithmetic above, not left at the default |
| Connection timeout on the pool | with no timeout, a slow database becomes an unbounded queue |
| Read and connect timeouts on every outbound call | one missing timeout parks every thread |
| Retries | retry without a budget, backoff and jitter turns a slow dependency into an outage |
| Circuit breaker and bulkhead | keeps one slow dependency from consuming the whole thread pool |
| Cache stampede protection | a key expiring under peak sends the full rate to the database |
| Graceful shutdown | in-flight requests finish before the instance leaves the target group |
| JVM heap and GC | sized so that peak allocation does not turn into pause driven timeouts |

The last line of defence is load shedding. Returning 503 quickly on a full pool keeps the requests
that are inside the system fast, which is what the SRE overload chapter means by degrading on
purpose. The [handson](./3-handson.md) shows the difference in the numbers.

## ElastiCache Redis

Redis serves commands on one thread per shard, so a shard's ceiling is one core no matter how large
the node is. Watch EngineCPUUtilization, not CPUUtilization: the node can look half idle while the
engine thread is saturated.

| Situation | Move |
| --- | --- |
| Engine CPU high, reads dominate | add replicas and read from them |
| Engine CPU high, writes dominate or one hot key | cluster mode, more shards, and a key design that spreads |
| Memory near the limit, evictions rising | scale up the node type, review maxmemory-policy and TTLs |
| Connection count spiking | client side pooling, connections created per request is a bug |

Also check for O(N) commands in the slow log. A single KEYS on a large keyspace at peak stalls every
other client on that shard.

## RDS

The writer is one instance. Writes scale up or they shard, and read replicas only relieve reads,
with replication lag as the cost the application must tolerate.

| Metric | Read it as |
| --- | --- |
| DBLoad against vCPU count (Performance Insights) | the true saturation signal, average active sessions |
| DatabaseConnections against max_connections | the ceiling that scale out walks into |
| ReadIOPS, WriteIOPS, throughput against provisioned | storage ceiling, gp3 is provisioned and finite |
| EBSIOBalance and EBSByteBalance | burst credit draining, the slow surprise mid-event |
| FreeableMemory | buffer pool being squeezed, reads falling to disk |
| ReplicaLag | how stale a read replica answer is allowed to be |

Two event specific items. Changing the instance class needs a reboot, so it happens days before the
event, not on the day. And a freshly restarted or restored instance has a cold buffer pool, so warm
it with representative queries before traffic arrives.

Connection budget is the sentence to write down: instances x pool size must stay under about 80
percent of max_connections, with room for maintenance sessions. If the fleet size needed for the
event breaks that budget, RDS Proxy or a smaller pool per instance is the fix, not more instances.
