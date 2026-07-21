locals {
  # kernel 4.14를 쓰는 Amazon Linux 2 초기 AMI. kernel-5.10 AMI와 이름 패턴이 다르다.
  al2_kernel414_ami_name = var.arch == "arm64" ? "amzn2-ami-hvm-2.0.*-arm64-gp2" : "amzn2-ami-hvm-2.0.*-x86_64-gp2"
  al2023_ami_name        = var.arch == "arm64" ? "al2023-ami-*-kernel-6.1-arm64" : "al2023-ami-*-kernel-6.1-x86_64"
}

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

# 재현용: kernel 4.14 (blocking /dev/random)
data "aws_ami" "al2_kernel414" {
  most_recent = true
  owners      = ["amazon"]

  filter {
    name   = "name"
    values = [local.al2_kernel414_ami_name]
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

# 대조용: kernel 6.1 (non-blocking /dev/random)
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
