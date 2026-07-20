---
type: Decision
title: Reproduce on EC2 with AL2 kernel 4.14
description: Reproduce /dev/random blocking on an EC2 instance booted from an early Amazon Linux 2 AMI instead of macOS, Docker, or local VMs.
tags: [aws, linux, terraform]
timestamp: 2026-07-20T00:00:00Z
---

## Decision

Reproduce the JVM seed-read hang on an EC2 instance launched from an early Amazon Linux 2 AMI (kernel 4.14, name pattern `amzn2-ami-hvm-2.0.*`), with `rngd` disabled via user_data.

## Reason

- The hang is a kernel behavior, so macOS (Fortuna CSPRNG, never blocks) and Docker containers (shared host kernel, always ≥ 5.6 on current hosts) cannot show it regardless of image choice.
- A local VM with CentOS 7 was considered, but Apple Silicon requires x86 emulation and the repository's existing hands-on pattern already provisions EC2 with Terraform, SSM access, and Graviton instances. kernel 4.14 has an arm64 AMI, so the standard t4g.small setup works unchanged.
- CentOS 7 AMIs (kernel 3.10) also reproduce the issue but are community-owned and inconsistent across regions; the Amazon-owned AL2 AMI keeps the Terraform lookup deterministic.
- `rngd` is stopped because it can refill the entropy pool from hardware sources and make the reproduction flaky.
