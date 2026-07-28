# Setup

Every install and teardown command lives here. The other documents link back to this page.

## Requirements

| Tool | Used for |
|---|---|
| Docker with Compose v2 | Lab 1, the mock account |
| Terraform >= 1.11 | Lab 2, the real account |
| AWS credentials with the region set to `ap-northeast-2` | Lab 2 only |

Lab 1 needs no AWS account and no credentials. Verified with Cloud Custodian 0.9.51 and moto 5.2.2.

## Lab 1: mock account

Up. This starts the mock AWS endpoint and seeds two EC2 instances, a detached EBS volume, and an RDS instance.

```bash
cd aws/custodian-finops
docker compose up -d
docker compose logs seed
```

Down.

```bash
docker compose down -v
```

Custodian itself runs on demand rather than as a long lived service.

```bash
docker compose run --rm custodian run --dryrun --cache-period 0 -s /out /policies/1-tag-audit.yml
```

If the image does not accept those arguments directly, the entrypoint is not set on your tag. Prefix the command with `custodian`.

## Lab 2: real AWS account

Up. This creates two EC2 instances, one detached EBS volume, one RDS instance, and an unattached IAM policy.

```bash
cd aws/custodian-finops/terraform
cp terraform.tfvars.example terraform.tfvars
terraform init && terraform apply
```

Down. RDS and EC2 bill by the hour, so run this the same day.

```bash
terraform destroy
```

Set `create_rds = false` in `terraform.tfvars` to skip the expensive half.

## Running custodian outside Docker

Lab 2 talks to real AWS, so custodian runs on the host with your own credentials.

```bash
uv tool install c7n
custodian version
```
