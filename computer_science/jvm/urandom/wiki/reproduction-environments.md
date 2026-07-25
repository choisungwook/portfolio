---
type: Topic
title: Reproduction environments
description: /dev/random blocking is a kernel behavior, so only a machine that boots a pre-5.6 kernel can reproduce it.
tags: [linux, docker, aws]
timestamp: 2026-07-20T00:00:00Z
---

## Insight

* macOS cannot reproduce the hang: its `/dev/random` is a Fortuna-family CSPRNG with no entropy-estimate blocking at all.
* Docker cannot reproduce it either, on any host. Containers share the host kernel; an old userland image such as `centos:7` still sees the modern kernel of Docker Desktop's Linux VM. `docker run --rm centos:7 uname -r` printing 6.x is the one-line proof.
* Reproduction therefore requires booting a kernel older than 5.6. The cheapest option is an EC2 instance from an early Amazon Linux 2 AMI (kernel 4.14, AMI name pattern `amzn2-ami-hvm-2.0.*`), which also lets a modern AL2023 instance run beside it as a control.
* On the 4.14 instance, stopping `rngd` and looping `dd if=/dev/random` keeps the pool drained so the JVM seed read blocks reliably.

## Citations

1. [Linux /dev/random history](linux-dev-random-history.md)
2. [ADR 0001](adr/0001-reproduce-on-ec2-with-al2-kernel-4-14.md)
