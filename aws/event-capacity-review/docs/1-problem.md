# The review question

A marketing event opens next Tuesday at 20:00. The system is an internet-facing ALB in front of an
EC2 Auto Scaling group running a Spring Boot API, with ElastiCache Redis and RDS behind it. The
question on the table is always the same: is the current spec enough, and if not, what exactly gets
bigger and by how much.

An answer that only says "CPU sits at 40 percent, we have room" is not an answer. CPU is a symptom
of one layer. Events fail on the layers that have no CPU metric worth watching: a connection pool,
a single writer, a single-threaded cache shard, a cold cache.

## What an answer must contain

A capacity review is finished when these four are written down with numbers.

| Question | Answer form |
| --- | --- |
| What load are we planning for? | peak requests per second per endpoint, and the shape of the ramp |
| What must hold while it runs? | the SLO that defines "serving", usually p99 latency and error rate |
| Where is the ceiling of each layer? | measured max throughput per layer at that SLO, not the vendor number |
| What happens past the ceiling? | shed, degrade, or fall over — chosen on purpose, not discovered live |

The SRE book calls the last one the difference between a capacity plan and a hope. Overload is not
prevented by buying capacity, because the forecast is always wrong in one direction. It is survived
by deciding in advance which requests get dropped.

## Why the ceiling has to be measured

Utilization is not capacity. A service at 50 percent CPU can already be at its ceiling if every
request waits on ten connections shared with fifty threads. The number that matters is the request
rate at which the SLO breaks, and the only way to get it is to drive load up in stages and watch
where throughput stops rising while latency keeps rising. That point is the knee, and everything in
the plan is derived from it.

Two rules make the arithmetic work.

- Little's law: concurrency = throughput x latency. A target of 500 rps at 40 ms needs 20 requests
  in flight, so pools and thread counts are derived, not guessed.
- Scaling out only relieves the layer you scale. If the bottleneck is a resource shared by every
  instance, adding instances moves the queue, adds connections, and makes it worse.

The [handson](./3-handson.md) measures both rules on a local copy of this architecture. The
[checklist](./2-review-checklist.md) is what to apply them to, layer by layer.
