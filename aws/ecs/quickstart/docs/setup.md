# Setup

Prerequisites: Docker, Terraform >= 1.11, AWS credentials for ap-northeast-2.

The ECS Exec step also needs the AWS CLI Session Manager plugin.

```bash
brew install --cask session-manager-plugin
```

Note: the Up step launches one t4g.small container instance for the EC2 launch type, which costs money while it runs. Tear down with the Down step when you finish.

## Up

Start the local container and create the AWS base resources (cluster, two task definitions, container instance, IAM roles, log group, security group). Run from the workspace root (aws/ecs/quickstart).

```bash
docker compose up -d && terraform -chdir=terraform init && terraform -chdir=terraform apply -auto-approve
```

## Down

Delete the ECS services in the console first if you created them (see [3-cleanup.md](./3-cleanup.md)), then tear everything down.

```bash
terraform -chdir=terraform destroy -auto-approve && docker compose down -v
```
