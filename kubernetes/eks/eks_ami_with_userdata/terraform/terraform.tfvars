eks_cluster_name = "userdata"
eks_version      = "1.30"

# EKS 접근 유형
endpoint_private_access = true
# public_access가 false이면, terraform apply를 실행한 host가 private subnet이 접근 가능해야 합니다.
endpoint_public_access = true

# Amazon Managed Prometheus 설치 여부
enable_amp = false

######################################################################
# EKS auto Mode
######################################################################

auto_mode_enabled = false

cluster_compute_config = {}

######################################################################
# VPC
######################################################################

vpc_cidr = "10.0.0.0/16"

public_subnets = {
  "subnet_a1" = {
    cidr = "10.0.10.0/24",
    az   = "ap-northeast-2a",
    tags = {
      Name = "public-subnet-a1"
    }
  },
  "subnet_b1" = {
    cidr = "10.0.11.0/24",
    az   = "ap-northeast-2c",
    tags = {
      Name = "public-subnet-c1"
    }
  }
}

private_subnets = {
  "subnet_a1" = {
    cidr = "10.0.100.0/24",
    az   = "ap-northeast-2a",
    tags = {
      Name = "private-subnet-a1"
    }
  },
  "subnet_b1" = {
    cidr = "10.0.101.0/24",
    az   = "ap-northeast-2c",
    tags = {
      Name = "private-subnet-c1"
    }
  }
}
