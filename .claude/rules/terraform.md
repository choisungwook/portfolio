# Terraform HCL 작성 규칙

개인 AWS 계정(ap-northeast-2)에서 실습용으로 사용하는 Terraform 스타일 규칙이다. 비용 절약을 위해 Graviton 인스턴스와 default VPC를 우선 사용한다.

## 파일 구조

- `.tf` 파일은 역할 또는 리소스 타입별로 분리한다.
- 파일명은 리소스를 설명하는 이름을 사용한다. 예: `ec2.tf`, `rds.tf`, `alb.tf`, `security_group.tf`
- `main.tf`는 적절한 이름이 없을 때만 최후 수단으로 사용한다.
- 공통 파일: `terraform.tf`, `providers.tf`, `variables.tf`, `outputs.tf`, `locals.tf`, `data.tf`

## Provider 설정

- 기본 리전: **ap-northeast-2** (서울)
- Terraform 버전: `>= 1.11`
- AWS provider 및 모듈 버전은 **하드코딩하지 않는다**. 웹 검색으로 최신 안정 버전을 확인한다.
- `default_tags`에 `ManagedBy = "Terraform"`과 `Project = var.project_name`을 반드시 포함한다.

```hcl
# terraform.tf
terraform {
  required_version = ">= 1.11"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> X.0"  # 웹 검색으로 최신 버전 확인
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
```

## EC2 규칙

- 기본 인스턴스 타입: **t4g.small** (Graviton arm64, 비용 절약)
- 스케일업 시 `t4g` 패밀리 또는 더 큰 Graviton 패밀리를 사용한다.
- 사용자가 non-Graviton(x86_64) 인스턴스를 요청하면 AMI 아키텍처도 변경할지 확인한다.
- 기본 OS: **Amazon Linux 2023**, Ubuntu도 `var.os_type`으로 지원한다.
- AMI 조회: 반드시 `data "aws_ami"` 블록을 사용하고, `var.arch`(`arm64` | `x86_64`)로 아키텍처를 제어한다.
- 기본 EBS: **30 GB**, `gp3`, **암호화 필수** (기본 AWS 관리형 KMS 키)
- 원격 접속: **AWS SSM Session Manager**를 사용한다. SSH를 사용하지 않으므로 key pair, port 22 ingress, bastion을 만들지 않는다.
- SSM 접속을 위해 `AmazonSSMManagedInstanceCore` 정책이 붙은 IAM instance profile을 EC2에 연결한다.

```hcl
# data.tf - AMI 조회 패턴
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

# iam.tf - SSM 접속용 IAM instance profile 패턴
resource "aws_iam_role" "ec2_ssm" {
  name = "${var.project_name}-ec2-ssm"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect    = "Allow"
        Principal = { Service = "ec2.amazonaws.com" }
        Action    = "sts:AssumeRole"
      }
    ]
  })
}

resource "aws_iam_role_policy_attachment" "ec2_ssm_core" {
  role       = aws_iam_role.ec2_ssm.name
  policy_arn = "arn:aws:iam::aws:policy/AmazonSSMManagedInstanceCore"
}

resource "aws_iam_instance_profile" "ec2_ssm" {
  name = "${var.project_name}-ec2-ssm"
  role = aws_iam_role.ec2_ssm.name
}

# ec2.tf - EC2 인스턴스 패턴
resource "aws_instance" "web" {
  ami                  = local.ami_id
  instance_type        = var.instance_type
  iam_instance_profile = aws_iam_instance_profile.ec2_ssm.name

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

## VPC 및 네트워킹

- **기본 VPC 사용을 우선**한다 (비용 절약).
- 사용자가 명시적으로 VPC 생성을 요청할 때만 새 VPC를 만든다.
- 새 VPC 생성 시 `terraform-aws-modules/vpc/aws` 모듈을 사용한다 (웹 검색으로 최신 버전 확인).

기본 VPC 사용 패턴:

```hcl
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

## Route53 및 ACM

- Route53 Hosted Zone과 ACM 인증서는 **콘솔에서 미리 생성한 것을 참조**한다.
- 반드시 변수로 전달한다: `var.route53_zone_id`, `var.acm_certificate_arn`

## RDS 규칙

- 기본 인스턴스 타입: **db.t4g.medium** (Graviton, 비용 절약)
- **암호화 필수**: 기본 AWS 관리형 KMS 키 사용
- **Performance Insights 필수**: 7일 보관 (프리 티어)
- 로그는 **선택사항** — 사용자가 요청할 때만 활성화한다.
- `skip_final_snapshot = true` (실습 환경)

```hcl
resource "aws_db_instance" "main" {
  identifier     = "${var.project_name}-db"
  engine         = "mysql"
  engine_version = "8.0"
  instance_class = var.db_instance_class

  allocated_storage = var.db_allocated_storage
  storage_encrypted = true

  performance_insights_enabled          = true
  performance_insights_retention_period = 7

  skip_final_snapshot = true

  tags = {
    Name = "${var.project_name}-db"
  }
}
```

## ElastiCache 규칙

- 기본 엔진: **Valkey** (`engine = "valkey"`). Redis는 사용하지 않는다.
- 최소 버전: **Valkey 7.2 이상**. RBAC(user group)과 IAM 인증이 모두 이 버전부터 가능하다.
- 기본 노드 타입: **cache.t4g.micro** (Graviton, 비용 절약). 스케일업 시 `cache.t4g` 패밀리를 사용한다.
- **암호화 필수**: 전송 중 암호화(`transit_encryption_enabled = true`, `transit_encryption_mode = "required"`)와 저장 시 암호화(`at_rest_encryption_enabled = true`)를 항상 켠다.
- **인증은 RBAC + IAM을 기본**으로 한다. AUTH token 단독 방식은 쓰지 않는다.
  - `aws_elasticache_user`로 IAM user를 만든다. IAM user는 `user_id`와 `user_name`이 같아야 하고 `authentication_mode { type = "iam" }`을 쓴다.
  - `aws_elasticache_user_group`으로 user들을 묶고, `aws_elasticache_replication_group`의 `user_group_ids`에 연결한다.
  - IAM 인증으로 접속하는 주체(EC2 instance role 등)의 IAM role에 `elasticache:Connect` 권한을 replication group ARN과 user ARN에 부여한다.
- 장기 password가 필요하면(레거시 클라이언트 호환 등) `default` user를 `authentication_mode { type = "password" }`로 추가한다. 새로 만드는 클러스터는 IAM 전용을 기본으로 한다.
- Security Group: ElastiCache는 퍼블릭에 노출하지 않는다. 접속하는 app security group에서만 port 6379 ingress를 허용한다(`referenced_security_group_id` 사용).
- 이미 떠 있는 AUTH token 클러스터를 RBAC/IAM으로 무중단 전환하는 절차는 별도다. `aws/elasticache-authentication` 핸즈온과 [ElastiCache 인증 전환 결정](../../knowledge/decisions/2026-07-elasticache-valkey-rbac.md)을 참고한다.

RBAC user, user group, IAM 인증을 갖춘 Valkey replication group 패턴:

```hcl
# elasticache.tf - IAM 전용 user와 user group
resource "aws_elasticache_user" "iam" {
  user_id       = var.iam_user_name
  user_name     = var.iam_user_name # IAM user는 user_id와 user_name이 같아야 한다
  access_string = "on ~* +@all"
  engine        = "valkey"

  authentication_mode {
    type = "iam"
  }
}

resource "aws_elasticache_user_group" "this" {
  engine        = "valkey"
  user_group_id = "${var.project_name}-users"
  user_ids      = [aws_elasticache_user.iam.user_id]
}

resource "aws_elasticache_replication_group" "this" {
  replication_group_id = var.project_name
  description          = "Valkey RBAC + IAM auth"

  engine         = "valkey"
  engine_version = "8.0" # RBAC/IAM은 Valkey 7.2 이상 필요
  node_type      = var.cache_node_type
  port           = 6379

  subnet_group_name  = aws_elasticache_subnet_group.this.name
  security_group_ids = [aws_security_group.elasticache.id]

  at_rest_encryption_enabled = true
  transit_encryption_enabled = true
  transit_encryption_mode    = "required"
  user_group_ids             = [aws_elasticache_user_group.this.id]

  tags = {
    Name = var.project_name
  }
}
```

IAM 인증 주체의 role에 붙일 `elasticache:Connect` 정책 패턴:

```hcl
# iam.tf - IAM 클라이언트가 연결 token을 서명할 때 필요한 권한
data "aws_iam_policy_document" "elasticache_connect" {
  statement {
    actions = ["elasticache:Connect"]
    resources = [
      "arn:aws:elasticache:${var.aws_region}:${data.aws_caller_identity.current.account_id}:replicationgroup:${var.project_name}",
      "arn:aws:elasticache:${var.aws_region}:${data.aws_caller_identity.current.account_id}:user:${var.iam_user_name}",
    ]
  }
}

resource "aws_iam_role_policy" "elasticache_connect" {
  name   = "${var.project_name}-elasticache-connect"
  role   = aws_iam_role.app.id
  policy = data.aws_iam_policy_document.elasticache_connect.json
}
```

app security group에서만 Valkey port를 여는 Security Group 패턴:

```hcl
# security_group.tf - app security group에서만 6379 허용
resource "aws_vpc_security_group_ingress_rule" "elasticache_from_app" {
  security_group_id            = aws_security_group.elasticache.id
  description                  = "TLS Valkey from the app security group"
  referenced_security_group_id = aws_security_group.app.id
  from_port                    = 6379
  ip_protocol                  = "tcp"
  to_port                      = 6379
}
```

## Security Group 규칙

- EC2 원격 접속은 SSM Session Manager를 사용하므로 SSH(port 22) ingress를 열지 않는다.
- RDS 등 특정 사용자만 접근하는 서비스는 **현재 IP로 제한**한다.
- 접근 범위가 모호할 때는 사용자에게 IP 제한 또는 VPC CIDR/보안 그룹 참조 중 선택을 확인한다.

현재 IP 조회 패턴:

```hcl
data "http" "my_ip" {
  url = "https://api.ipify.org?format=text"
}
# 사용: cidr_blocks = ["${chomp(data.http.my_ip.response_body)}/32"]
```

## 보안 기본값

- **EBS/RDS 암호화**: 항상 활성화 (기본 AWS 관리형 KMS 키)
- **S3**: 버저닝 활성화, 암호화 필수(SSE-S3 `AES256` 기본, 필요 시 KMS), 퍼블릭 액세스 차단
- 자격증명을 하드코딩하지 않는다. 민감한 output에는 `sensitive = true`를 설정한다.

## CloudFront 규칙

- S3 Origin 접근 시 **OAC(Origin Access Control)**을 사용한다. OAI는 사용하지 않는다.
- OAC 설정: `signing_behavior = "always"`, `signing_protocol = "sigv4"`
- Origin의 Cache-Control을 존중하려면 캐시 정책에 **`min_ttl = 0`**을 설정한다. `min_ttl`이 0보다 크면 Origin 헤더를 무시하고 강제 캐시한다.
- `viewer_protocol_policy`는 실습 환경에서는 `"allow-all"`, 프로덕션에서는 `"redirect-to-https"`를 사용한다.

OAC와 S3 버킷 정책 예시:

```hcl
resource "aws_cloudfront_origin_access_control" "s3" {
  name                              = "${var.project_name}-s3-oac"
  origin_access_control_origin_type = "s3"
  signing_behavior                  = "always"
  signing_protocol                  = "sigv4"
}

resource "aws_s3_bucket_policy" "this" {
  bucket = aws_s3_bucket.this.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid       = "AllowCloudFrontOAC"
        Effect    = "Allow"
        Principal = { Service = "cloudfront.amazonaws.com" }
        Action    = "s3:GetObject"
        Resource  = "${aws_s3_bucket.this.arn}/*"
        Condition = {
          StringEquals = {
            "AWS:SourceArn"     = aws_cloudfront_distribution.this.arn
            "AWS:SourceAccount" = data.aws_caller_identity.current.account_id
          }
        }
      }
    ]
  })
}
```
