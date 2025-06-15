eks_cluster_name = "eks-gpu"
eks_version      = "1.32"

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
# Managed Node Groups
######################################################################

managed_node_groups = {
  "managed-node-group-a" = {
    node_group_name = "managed-node-group-a",
    instance_types  = ["t3.medium"],
    capacity_type   = "ON_DEMAND",
    release_version = "1.32.3-20250501",
    disk_size       = 20,
    desired_size    = 1,
    max_size        = 1,
    min_size        = 1,
    labels = {
      "node-type" = "managed-node-group-a"
    }
  },
  # GPU 노드 예제
  "managed-node-group-gpu-a" = {
    node_group_name = "managed-node-group-gpu-a",
    instance_types  = ["g6.xlarge"],
    capacity_type   = "ON_DEMAND",
    # EKS nvidia GPU optimized AMI
    release_version = "1.32.3-20250501",
    ami_type        = "AL2023_x86_64_NVIDIA",
    disk_size       = 20,
    desired_size    = 1,
    max_size        = 1,
    min_size        = 1,
    labels = {
      "nvidia.com/gpu" = "true",
      "node-type"      = "managed-node-group-gpu-a"
    }
    taints = [
      {
        key    = "nvidia.com/gpu"
        value  = "true"
        effect = "NO_SCHEDULE"
      }
    ]
  },
  # not optimized GPU 노드 예제
  # "managed-node-group-gpu-b" = {
  #   node_group_name = "managed-node-group-gpu-b",
  #   instance_types  = ["g6.xlarge"],
  #   capacity_type   = "ON_DEMAND",
  #   # EKS nvidia GPU optimized AMI
  #   release_version = "1.32.3-20250501",
  #   ami_type      = "AL2023_x86_64_STANDARD",
  #   disk_size       = 20,
  #   desired_size    = 1,
  #   max_size        = 1,
  #   min_size        = 1,
  #   labels = {
  #     "nvidia.com/gpu" = "true",
  #     "node-type" = "managed-node-group-gpu-b"
  #   }
  #   taints = [
  #     {
  #       key    = "nvidia.com/gpu"
  #       value  = "true"
  #       effect = "NO_SCHEDULE"
  #     }
  #   ]
  # },
}

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
    az   = "ap-northeast-2b",
    tags = {
      Name = "public-subnet-b1"
    }
  },
  "subnet_c1" = {
    cidr = "10.0.12.0/24",
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
