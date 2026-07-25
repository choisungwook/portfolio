---
type: Decision
title: Pair a legacy instance with a modern control
description: One terraform apply provisions both a kernel 4.14 instance (reproduction) and an AL2023 kernel 6.1 instance (control).
tags: [aws, terraform, hands-on]
timestamp: 2026-07-20T00:00:00Z
---

## Decision

Provision two instances in a single apply: `legacy` (AL2 kernel 4.14 + Corretto 8) to reproduce the blocking, and `modern` (AL2023 kernel 6.1 + Corretto 17) as a control that runs the identical drain-and-read experiment.

## Reason

- The claim "kernel 5.6 removed the blocking" is only convincing when the same commands behave differently on the two kernels side by side. A single-instance hands-on would leave the modern behavior as an unverified statement.
- The cost of the second instance is small (t4g.small, destroyed after the exercise) compared to the value of the contrast, and one apply/destroy cycle keeps the setup document short.
- Trade-off: two instances double the SSM session juggling. Accepted because the experiment on each side is only a few commands.
