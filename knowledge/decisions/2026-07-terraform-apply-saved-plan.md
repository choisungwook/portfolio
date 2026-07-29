---
type: Decision
title: Apply only the saved plan file, never a fresh plan
description: akbun-terraform-apply-remote applies the exact tfplan file produced by the last plan run and refuses to apply when the PR head moved since that plan.
tags: [terraform, automation, product]
timestamp: 2026-07-29T00:00:00Z
---

## Decision

In akbun-terraform-apply-remote, the apply command never runs a fresh plan-and-apply. It applies the tfplan file saved by the latest plan run (terraform apply .akbun.tfplan). The server records the PR head SHA at plan time; if the PR head has changed when apply is requested, apply is refused and the user must plan again. A per-project-directory lock is taken at plan time and released on apply success, PR close, or explicit unlock.

## Reason

- What the reviewer approved must be exactly what reaches the infrastructure. terraform apply without a plan file recomputes the diff at apply time, so a push after review — or drift in the remote state — could apply changes nobody reviewed. Applying the saved binary plan makes terraform itself fail if the state changed underneath (stale plan error), which is the safe failure mode.
- The head-SHA check turns "the PR changed after review" from a silent hazard into an explicit re-plan request in the PR comment thread.
- The project-directory lock serializes PRs that touch the same state. Two PRs planning the same directory would otherwise race: the second apply would either fail on a stale plan or, worse, revert the first PR's change.
- Atlantis made the same choices (saved plan artifact plus project locks), which validates the model; this tool reimplements it in a minimal form instead of adopting Atlantis because the repository only needs comment-driven plan/apply, not Atlantis's full feature surface.
