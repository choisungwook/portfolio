---
type: Topic
title: Linux /dev/random history
description: The blocking pool was removed in kernel 5.6, so /dev/random equals /dev/urandom after CRNG initialization.
tags: [linux, kernel, entropy]
timestamp: 2026-07-20T00:00:00Z
---

## Insight

* Before kernel 5.6, `/dev/random` blocked whenever the entropy estimate dropped below a threshold. Headless VMs without keyboard, mouse, or spinning-disk interrupts accumulated entropy slowly, so reads could stall for minutes.
* Kernel 5.6 (March 2020) removed the blocking pool. `/dev/random` now blocks only until the CRNG is initialized once at boot, then behaves like `/dev/urandom`. Kernel 5.18 unified the two devices internally.
* After 5.6, `entropy_avail` is a fixed indicator (256) of CRNG readiness, not a depletable budget. Draining reads no longer make later reads block.
* Kernel versions relevant to this hands-on: CentOS 7 ships 3.10, early Amazon Linux 2 AMIs ship 4.14 (both reproduce blocking); AL2 default is now 5.10 and AL2023 ships 6.1+ (both do not).

## Citations

1. https://lwn.net/Articles/808575/
2. https://lwn.net/Articles/884875/
3. https://docs.aws.amazon.com/linux/al2023/ug/compare-with-al2-kernel.html
4. https://docs.aws.amazon.com/linux/al2/ug/aml2-kernel.html
