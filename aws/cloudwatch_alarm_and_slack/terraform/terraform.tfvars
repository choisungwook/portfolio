# --- project Configuration ---
aws_region       = "ap-northeast-2"
project_name     = "cloudwatch-alarm"
environment_name = "cloudwatch-alarm-demo"
# It is used to cloudwatch, RDS, Lambda, and EC2
common_tags = {
  Project = "cloudwatch-alarm"
  Name    = "cloudwatch-alarm-demo"
}

# --- RDS Configuration ---
db_name                = "demodb"
rds_cluster_identifier = "cloudwatch-alarm-demo"
rds_engine             = "aurora-mysql"
rds_engine_version     = "8.0.mysql_aurora.3.06.0"
rds_instance_class     = "db.t3.medium"
rds_username           = "admin"
rds_password           = "Password1234!!#"
rds_storage_type       = "aurora"
rds_storage_encrypted  = true

# --- Lambda Configuration ---
lambda_function_name = "cloudwatch-to-slack-notifier"
lambda_runtime       = "python3.12"
lambda_handler       = "lambda_function.lambda_handler"

# --- EC2 instance ---
sysbench_ec2_instance_type = "t3.medium"

# --- Slack Configuration ---
eks_cluster_name = "cloudwatch-alarm-demo-1-33"
eks_version      = "1.33"

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

# It is used when auto_mode_enabled is true.
cluster_compute_config = {}
# cluster_compute_config = {
#   enabled    = true
#   node_pools = ["general-purpose", "system"]
# }

######################################################################
# Managed Node Groups
######################################################################

managed_node_groups = {
  "managed-node-group-a" = {
    node_group_name = "managed-node-group-a",
    instance_types  = ["t3.medium"],
    capacity_type   = "ON_DEMAND",
    release_version = "1.33.0-20250519",
    disk_size       = 20,
    desired_size    = 1,
    max_size        = 1,
    min_size        = 1,
    labels = {
      "node-type" = "managed-node-group-a"
    }
  }
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
