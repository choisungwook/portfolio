# Code Examples Reference

Complete HCL code patterns for the terraform-style-guide skill.

## Table of Contents

1. [Provider Configuration](#provider-configuration)
2. [EC2 and AMI](#ec2-and-ami)
3. [VPC and Networking](#vpc-and-networking)
4. [Route53 and ACM](#route53-and-acm)
5. [RDS](#rds)
6. [Security Groups](#security-groups)
7. [S3 Bucket](#s3-bucket)

## Provider Configuration

Note: Use web search to find the latest stable AWS provider version before generating code.

```hcl
# terraform.tf
terraform {
  required_version = ">= 1.11"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> X.0"  # Search for the latest stable version
    }
  }
}

# providers.tf
provider "aws" {
  region = var.aws_region

  default_tags {
    tags = {
      ManagedBy = "Terraform"
      Project   = var.project_name
    }
  }
}

# variables.tf
variable "aws_region" {
  description = "AWS region for resource deployment"
  type        = string
  default     = "ap-northeast-2"
}

variable "project_name" {
  description = "Project name used for resource naming and tagging"
  type        = string
}
```

## EC2 and AMI

### Variables

```hcl
variable "instance_type" {
  description = "EC2 instance type (t4g Graviton preferred)"
  type        = string
  default     = "t4g.small"
}

variable "os_type" {
  description = "Operating system type for EC2 instances"
  type        = string
  default     = "al2023"

  validation {
    condition     = contains(["al2023", "ubuntu"], var.os_type)
    error_message = "OS type must be al2023 or ubuntu."
  }
}

variable "arch" {
  description = "CPU architecture for EC2 AMI (arm64 for Graviton, x86_64 for Intel/AMD)"
  type        = string
  default     = "arm64"

  validation {
    condition     = contains(["arm64", "x86_64"], var.arch)
    error_message = "Architecture must be arm64 or x86_64."
  }
}

variable "ebs_size" {
  description = "Root EBS volume size in GB"
  type        = number
  default     = 30
}
```

### AMI Data Blocks

```hcl
# data.tf
locals {
  al2023_ami_name = var.arch == "arm64" ? "al2023-ami-*-kernel-6.1-arm64" : "al2023-ami-*-kernel-6.1-x86_64"
  ubuntu_ami_name = var.arch == "arm64" ? "ubuntu/images/hvm-ssd-gp3/ubuntu-noble-24.04-arm64-server-*" : "ubuntu/images/hvm-ssd-gp3/ubuntu-noble-24.04-amd64-server-*"
}

data "aws_ami" "al2023" {
  most_recent = true
  owners      = ["amazon"]

  filter {
    name   = "name"
    values = [local.al2023_ami_name]
  }

  filter {
    name   = "architecture"
    values = [var.arch]
  }

  filter {
    name   = "virtualization-type"
    values = ["hvm"]
  }
}

data "aws_ami" "ubuntu" {
  most_recent = true
  owners      = ["099720109477"] # Canonical

  filter {
    name   = "name"
    values = [local.ubuntu_ami_name]
  }

  filter {
    name   = "architecture"
    values = [var.arch]
  }

  filter {
    name   = "virtualization-type"
    values = ["hvm"]
  }
}

# locals.tf
locals {
  ami_id = var.os_type == "al2023" ? data.aws_ami.al2023.id : data.aws_ami.ubuntu.id
}
```

### EC2 Instance

```hcl
# ec2.tf
resource "aws_instance" "web" {
  ami           = local.ami_id
  instance_type = var.instance_type

  root_block_device {
    volume_size = var.ebs_size
    volume_type = "gp3"
    encrypted   = true
  }

  tags = {
    Name = "${var.project_name}-web"
  }
}
```

## VPC and Networking

### Option 1: Default VPC (Priority)

```hcl
# data.tf
data "aws_vpc" "default" {
  default = true
}

data "aws_subnets" "default" {
  filter {
    name   = "vpc-id"
    values = [data.aws_vpc.default.id]
  }

  filter {
    name   = "default-for-az"
    values = ["true"]
  }
}
```

### Option 2: New VPC with Module

Note: Use web search to find the latest stable version of terraform-aws-modules/vpc/aws.

```hcl
# vpc.tf
module "vpc" {
  source  = "terraform-aws-modules/vpc/aws"
  version = "~> X.0"  # Search for the latest stable version

  name = "${var.project_name}-vpc"
  cidr = var.vpc_cidr

  azs             = ["${var.aws_region}a", "${var.aws_region}b"]
  private_subnets = var.private_subnet_cidrs
  public_subnets  = var.public_subnet_cidrs

  enable_nat_gateway = true
  single_nat_gateway = true

  tags = {
    Project = var.project_name
  }
}

# variables.tf
variable "vpc_cidr" {
  description = "CIDR block for the VPC"
  type        = string
  default     = "10.0.0.0/16"
}

variable "private_subnet_cidrs" {
  description = "CIDR blocks for private subnets"
  type        = list(string)
  default     = ["10.0.1.0/24", "10.0.2.0/24"]
}

variable "public_subnet_cidrs" {
  description = "CIDR blocks for public subnets"
  type        = list(string)
  default     = ["10.0.101.0/24", "10.0.102.0/24"]
}
```

## Route53 and ACM

```hcl
# variables.tf
variable "route53_zone_id" {
  description = "Pre-existing Route53 hosted zone ID"
  type        = string
}

variable "acm_certificate_arn" {
  description = "Pre-existing ACM certificate ARN"
  type        = string
}

# route53.tf
data "aws_route53_zone" "main" {
  zone_id = var.route53_zone_id
}

# Example: ALB HTTPS listener using pre-existing ACM certificate
resource "aws_lb_listener" "https" {
  load_balancer_arn = aws_lb.main.arn
  port              = 443
  protocol          = "HTTPS"
  certificate_arn   = var.acm_certificate_arn

  default_action {
    type             = "forward"
    target_group_arn = aws_lb_target_group.main.arn
  }
}
```

## RDS

```hcl
# rds.tf
resource "aws_db_instance" "main" {
  identifier     = "${var.project_name}-db"
  engine         = "mysql"
  engine_version = "8.0"
  instance_class = var.db_instance_class

  allocated_storage = var.db_allocated_storage
  storage_encrypted = true  # Uses default AWS-managed KMS key

  performance_insights_enabled          = true
  performance_insights_retention_period = 7

  # Logs are optional — uncomment or add when user requests
  # enabled_cloudwatch_logs_exports = ["audit", "error", "general", "slowquery"]

  skip_final_snapshot = true

  tags = {
    Name = "${var.project_name}-db"
  }
}

# variables.tf
variable "db_instance_class" {
  description = "RDS instance class (db.t4g Graviton preferred)"
  type        = string
  default     = "db.t4g.medium"
}

variable "db_allocated_storage" {
  description = "RDS allocated storage in GB"
  type        = number
  default     = 20
}
```

## Security Groups

### My-IP-Only Access Pattern

```hcl
# data.tf
data "http" "my_ip" {
  url = "https://api.ipify.org?format=text"
}

# security_group.tf
resource "aws_security_group" "database" {
  name        = "${var.project_name}-db-sg"
  description = "Security group for database access from my IP"
  vpc_id      = data.aws_vpc.default.id

  ingress {
    description = "MySQL access from my IP"
    from_port   = 3306
    to_port     = 3306
    protocol    = "tcp"
    cidr_blocks = ["${chomp(data.http.my_ip.response_body)}/32"]
  }

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = {
    Name = "${var.project_name}-db-sg"
  }
}
```

## S3 Bucket

```hcl
# s3.tf
resource "aws_s3_bucket" "data" {
  bucket = "${var.project_name}-${var.environment}-data"
}

resource "aws_s3_bucket_versioning" "data" {
  bucket = aws_s3_bucket.data.id

  versioning_configuration {
    status = "Enabled"
  }
}

resource "aws_s3_bucket_server_side_encryption_configuration" "data" {
  bucket = aws_s3_bucket.data.id

  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "aws:kms"
    }
  }
}

resource "aws_s3_bucket_public_access_block" "data" {
  bucket = aws_s3_bucket.data.id

  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}
```
