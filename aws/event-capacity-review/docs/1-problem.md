# 1. Problem

An interview question, and a real pre-event checklist: a big promotion starts next week. Traffic is expected to jump roughly 10x. The stack is EC2 (Auto Scaling Group) behind an internet-facing ALB, a Spring Boot API, Redis, and RDS. You are asked to review instance and DB specs in advance. What do you check, and on what basis do you decide scale up vs scale out?

"CPU looks fine" is not an answer. The review needs four things:

- A number for the expected peak load, not a feeling.
- The saturation point of each layer, measured by a load test, not guessed.
- A rule for choosing scale up vs scale out per bottleneck.
- A plan for the time wall of scale out: booting an instance takes minutes, a spike takes seconds.

The studysheet ([../studysheet-event-capacity-review-v1.html](../studysheet-event-capacity-review-v1.html)) is the main body. It walks the four golden signals, per-layer checklists (ALB, ASG/EC2, Spring Boot, Redis, RDS), the up/out decision rule, and warm pool. The two labs make the abstract parts observable:

- [2-handson.md](./2-handson.md) - reproduce three different bottlenecks locally and read the metrics that tell them apart.
- [3-warmpool.md](./3-warmpool.md) - create an ASG warm pool on AWS and measure what it does and does not save.
