# Warm pool, and when it is the wrong answer

A warm pool is a set of pre-initialized EC2 instances that sit beside the Auto Scaling group,
already booted and configured but not registered with the load balancer, so they take no traffic.
On scale out the group takes an instance from the pool instead of launching one from scratch.

The decision is one comparison: how long an instance takes to become useful against how fast the
event ramp arrives. Experiment 6 in the [handson](./3-handson.md) measures the first half of that.

## The three states

| State | Billing | Time to serve | Use it when |
| --- | --- | --- | --- |
| Stopped | EBS only | boot plus application start | the default choice, cheapest useful option |
| Hibernated | EBS, including the saved memory image | resume, memory already warm | JVM heap, JIT state and caches must survive |
| Running | full instance cost | fastest, only registration remains | seconds matter and the window is short |

Hibernation is the one that fits a warm JVM, because the memory image comes back with the heap and
the JIT compiled code already in place. It also carries the most requirements: supported instance
types, a supported AMI, an encrypted root volume large enough to hold the memory image.

## The parts to configure

- Pool size. `MinSize` for a fixed number, or `MaxGroupPreparedCapacity` to keep the pool and the
  group together up to a ceiling.
- Instance reuse policy. Without it a scale in terminates the instance. With reuse on scale in, the
  instance goes back to the pool, which is what a spiky event day wants.
- Lifecycle hooks. The launch hook fires when an instance enters the pool and again when it leaves
  for the group. Slow one time work belongs in the first, fast priming in the second: connection
  pools opened, caches loaded, a few synthetic requests to get past the cold code paths.
- Health. Instances sitting in the pool still need to be healthy when they are called on, so the
  priming step is also the check that the AMI and the application still work.

The same three decisions as a block inside `aws_autoscaling_group`.

```hcl
warm_pool {
  pool_state                  = "Stopped"
  min_size                    = 4
  max_group_prepared_capacity = 10

  instance_reuse_policy {
    reuse_on_scale_in = true
  }
}
```

## When not to use it

For a single event at a known time, scheduled scaling is simpler and usually cheaper. Raise the
minimum capacity before the event, lower it after. A warm pool earns its cost when the ramp is
unpredictable, repeated, or when instances are slow to prepare for a reason that cannot be removed.

Before adding a warm pool, try removing the reason it is needed.

- Bake the image. Work done at boot time by user data is work that could have been in the AMI.
- Cut JVM startup with class data sharing or ahead of time compilation, and measure the result the
  same way experiment 6 does.
- Check what the readiness probe actually waits for. Waiting on a slow dependency at startup is a
  frequent, fixable minute.

And the failure this cannot fix: if the bottleneck is RDS or a Redis shard, warm instances arrive
faster only to queue on the same shared resource. A warm pool shortens the time to add app capacity.
It never adds capacity to the layer below, which is the layer the [checklist](./2-review-checklist.md)
asks about first.
