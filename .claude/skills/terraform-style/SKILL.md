---
name: terraform-style-guide
description: >
  Generate Terraform HCL code following personalized style conventions for hands-on practice
  in a personal AWS account (ap-northeast-2). Use when writing, reviewing, or generating
  Terraform configurations. Triggers on: creating EC2, RDS, VPC, ALB, S3, IAM, or any AWS
  resource with Terraform; reviewing Terraform code style; setting up new Terraform projects;
  generating infrastructure-as-code for personal AWS environments.
---

# Terraform Style Guide

Personalized Terraform conventions for hands-on practice in a personal AWS account.
See `references/code-examples.md` for full HCL code patterns.

## Agent Restrictions

- **Never run `git commit`** or any git write operations
- After writing code, always run `terraform fmt -recursive` and `terraform validate`

## File Organization

Split `.tf` files by role or resource type. Each file should have a clear, descriptive name reflecting its responsibility (e.g., `ec2.tf`, `rds.tf`, `alb.tf`, `security_group.tf`, `site_to_site.tf`). Use `main.tf` only as a **last resort** when no descriptive name applies.

Common shared files: `terraform.tf`, `providers.tf`, `variables.tf`, `outputs.tf`, `locals.tf`, `data.tf`.

## Provider Defaults

- Default region: **ap-northeast-2** (Seoul)
- Terraform version: `>= 1.11`
- AWS provider and module versions: **do not hardcode**. Use web search to find the latest stable version at the time of code generation.
- Always include `default_tags` with `ManagedBy = "Terraform"` and `Project = var.project_name`

## EC2 Conventions

- Default instance type: **t4g.small** (Graviton arm64, minimum starting point)
- Scale up within the `t4g` family or to larger Graviton families as needed
- **If user requests non-Graviton (x86_64) instance type**, ask whether to switch AMI architecture too
- Default OS: **Amazon Linux 2023**, also support **Ubuntu** via `var.os_type`
- AMI lookup: always use `data "aws_ami"` blocks with `var.arch` (`arm64` | `x86_64`) to control architecture
- Default EBS: **30 GB**, `gp3`, **encryption mandatory** (default AWS-managed KMS key)

See `references/code-examples.md#ec2-and-ami` for full data block patterns.

## VPC and Networking

**Always ask the user** which approach to use:

1. **Default VPC** (priority) — use `data "aws_vpc"` and `data "aws_subnets"` with `default = true`
2. **New VPC** — use `terraform-aws-modules/vpc/aws` (search for latest version)

See `references/code-examples.md#vpc-and-networking` for both patterns.

## Route53 and ACM

Both are **pre-created in the AWS Console**. Always reference via variables:

- `var.route53_zone_id` — pre-existing hosted zone ID
- `var.acm_certificate_arn` — pre-existing ACM certificate ARN

## RDS Conventions

- Default instance type: **db.t4g.medium** (Graviton, minimum starting point). Scale up as needed.
- **Encryption mandatory** with default AWS-managed KMS key
- **Performance Insights mandatory** with 7-day retention (free tier)
- Logs are **optional** — enable only when user requests
- `skip_final_snapshot = true` for hands-on use

See `references/code-examples.md#rds` for full example.

## Security Group Conventions

For services accessible only from the user's current IP (RDS, bastion, SSH):

```hcl
data "http" "my_ip" {
  url = "https://api.ipify.org?format=text"
}
# Then use: cidr_blocks = ["${chomp(data.http.my_ip.response_body)}/32"]
```

**When to use**: RDS direct access, bastion hosts, any service not behind a load balancer.
**When in doubt**, ask the user whether to IP-restrict or open to VPC CIDR / security group.

See `references/code-examples.md#security-groups` for full pattern.

## Security Defaults

- **EBS/RDS encryption**: always enabled with default AWS-managed KMS key
- **S3**: versioning enabled, KMS encryption, public access blocked
- Never hardcode credentials; mark sensitive outputs with `sensitive = true`

## Decision Points (Must Ask User)

1. **VPC**: default VPC or create new with terraform-aws-modules?
2. **Non-Graviton instance**: also switch AMI architecture to x86_64?
3. **Security group access**: IP-restricted or VPC CIDR / security group reference?

## Code Review Checklist

- [ ] Files named after primary resource (not `main.tf` unless unavoidable)
- [ ] `terraform fmt` and `terraform validate` passed
- [ ] EBS and RDS encryption enabled with default KMS
- [ ] EC2/RDS use Graviton instance types
- [ ] RDS has Performance Insights enabled (7-day)
- [ ] AMI selected via data block supporting AL2023 and Ubuntu
- [ ] Route53 zone ID and ACM ARN passed as variables
- [ ] VPC strategy confirmed with user
- [ ] Security group IP restrictions reviewed with user when ambiguous
