# Cleanup

The services were created in the console, so Terraform does not know about them. Delete them first or destroy will fail on the in-use security group.

1. ECS console → Clusters → ecs-fundamentals → delete both services: web and web-ec2 (force delete).
2. Wait until the services and their tasks are gone.

Then run the Down step in [setup.md](./setup.md). The container instance is managed by Terraform, so destroy removes it.
