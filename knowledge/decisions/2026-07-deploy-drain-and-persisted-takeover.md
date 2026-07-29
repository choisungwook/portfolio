---
type: Decision
title: Deploys drain in-flight runs and hand state over via disk
description: akbun-terraform-apply-remote survives redeployment by draining running terraform jobs on SIGTERM and persisting locks and plan records to the data directory, which the next instance loads at boot.
tags: [terraform, automation, deployment, product]
timestamp: 2026-07-29T00:00:00Z
---

## Decision

Deployment safety for akbun-terraform-apply-remote is built from two mechanisms instead of a multi-node HA cluster. First, on SIGTERM the server stops accepting webhooks and waits (up to 30 minutes) for in-flight plan/apply jobs to finish before exiting. Second, locks and planned-SHA records are written to state.json in the data directory after every handled event and loaded at startup, so the next instance takes over where the previous one stopped. Self-deployment rides on these: the EC2 stack runs a systemd timer that swaps the binary when the published binary URL changes and restarts the service, and the ECS stack does a rolling task replacement (minimum healthy 100%, maximum 200%) with the data directory on EFS.

## Reason

- The worst deploy outcome is a terraform apply killed halfway, leaving state partially mutated. Draining removes that failure mode at the source; it is cheaper and more reliable than trying to resume a half-finished apply on another node.
- Active-active HA needs distributed locking and plan-artifact replication for a service whose real workload is a few webhook deliveries a day. Single active instance + persisted state gives the takeover property that actually matters (a deploy or crash does not lose locks or force surprise re-reviews) at a fraction of the complexity.
- Handover through a file on the data directory works identically for a systemd restart on EC2 (same disk) and an ECS rolling replacement (shared EFS), so both deploy targets reuse the same server code path with no deployment-specific logic.
- Fargate caps stopTimeout at 120 seconds, so the ECS variant cannot honor the full 30-minute drain. This is accepted and documented: state on EFS means an interrupted run is recoverable by re-planning, and users with long applies are pointed to the EC2 variant.
