# Problem

Assume a service running as a single container started with docker run on one EC2 instance.

- Nobody notices when the container dies. Recovery means SSH and docker run again.
- Deployment is stop then run, so the service goes down in between.
- Scaling out means manually adding instances, placing containers, and wiring a load balancer.

One way to solve this is container orchestration: declare the desired state (how many containers, which version) and hand the responsibility of keeping it to a system. This hands-on uses ECS, the AWS-managed orchestrator, and runs the same image under both launch types — Fargate and EC2 — to compare how the networking and the operational responsibility differ.

The main learning material is the interactive study sheet at the workspace root: open [studysheet-ecs-fundamentals-v2.html](../studysheet-ecs-fundamentals-v2.html) in a browser. It covers how ECS works (desired state reconciliation), the cluster/service/task structure, both launch types and their trade-offs, and deployment strategies. This docs directory only carries the setup and the console steps.
