# Hands-on

Provision the base with Terraform, then do everything service-related in the AWS console on purpose — creating, breaking, and deploying by hand is the point of this hands-on. The same nginx image runs twice, once per launch type, so the differences are observable side by side. Install and provision first: [setup.md](./setup.md).

## 1. Check the image locally

The same image that ECS will run, started locally via compose.

```bash
curl -s http://localhost:8080 | grep title
```

Expected: `<title>Welcome to nginx!</title>`.

## 2. Read the Terraform outputs

The console steps below need these values. Also open the cluster's Infrastructure tab and confirm one container instance is registered — that is the EC2 launch type capacity.

```bash
terraform -chdir=terraform output
```

## 3. Create the Fargate service (quickstart)

1. ECS console → Clusters → ecs-fundamentals → Services → Create.
2. Launch type Fargate. Family: ecs-fundamentals-web. Service name: web. Desired tasks: 1.
3. Networking: select the subnets and security group from the Terraform outputs, and turn Public IP on.
4. Create, then watch the Tasks tab until the task is RUNNING. Open the task detail and copy its public IP.

Check from your machine (only your IP is allowed by the security group).

```bash
curl http://<task-public-ip>
```

Expected: the nginx welcome page.

The task definition declares a container health check, so the Health status column turns HEALTHY about half a minute after the task starts. Without that block ECS reports UNKNOWN — it means nothing is checking, not that something is wrong.

## 4. Create the EC2 launch type service

1. Same cluster → Services → Create.
2. Launch type EC2. Family: ecs-fundamentals-web-ec2. Service name: web-ec2. Desired tasks: 1.
3. The task definition uses bridge network mode, so there is no networking section to fill in. Create.
4. Watch the Tasks tab until the task is RUNNING. It is placed on the container instance.

This time the address is the instance's public IP, from the container_instance_public_ip output.

```bash
curl http://<container-instance-public-ip>
```

Expected: the same nginx welcome page.

## 5. Compare the two launch types

Open both task details side by side.

- Networking: the Fargate task has its own ENI and IP (awsvpc). The EC2 task shares the instance's IP and host port 80 (bridge) — which is why the two curl targets differed.
- Host visibility: the container instance shows up in the EC2 console (patching and capacity are yours). Fargate has no host to look at.
- Task detail: the Fargate task shows an ENI ID, the EC2 task shows a container instance.

## 6. Observe self-healing

Works the same on either service; try both if you have time.

1. Tasks tab → select the running task → Stop.
2. Within tens of seconds a new task appears (PROVISIONING → RUNNING) with no manual action.
3. The service Events tab shows "has started 1 tasks" followed by "has reached a steady state".

## 7. Get a shell inside a task with ECS Exec

Fargate has no host to SSH into, so this is how you look inside a running container. Install the Session Manager plugin first (see [setup.md](./setup.md)).

ECS Exec is off by default and is a service setting, not a task definition one. Turning it on replaces the running tasks, because the SSM agent has to be injected at task start.

```bash
aws ecs update-service --cluster ecs-fundamentals --service web --enable-execute-command --force-new-deployment
```

Wait for the new task to reach RUNNING, then open a shell. The image is alpine-based, so use /bin/sh rather than bash.

```bash
aws ecs execute-command --cluster ecs-fundamentals --task <task-id> --container web --interactive --command "/bin/sh"
```

Expected: a shell prompt inside the container. `ls /usr/share/nginx/html` shows the page you fetched with curl earlier.

If it fails with TargetNotConnectedError, the task predates the setting — confirm with the command below, which must print true.

```bash
aws ecs describe-tasks --cluster ecs-fundamentals --tasks <task-id> --query 'tasks[0].enableExecuteCommand'
```

The same works on the EC2 launch type service (web-ec2); both task definitions carry the task role that grants the SSM channel permissions.

## 8. Rolling deployment

Done on the Fargate service (web).

1. Task definitions → ecs-fundamentals-web → Create new revision. Add an environment variable such as DEPLOY_VER=2 to the web container.
2. Cluster → service web → Update service → select the new revision → Update.
3. Watch the Deployments tab: new-revision tasks start first, then old-revision tasks drain and stop. Traffic is never fully down because minimumHealthyPercent keeps the old tasks until the new ones are healthy.

When done, clean up: [3-cleanup.md](./3-cleanup.md).
