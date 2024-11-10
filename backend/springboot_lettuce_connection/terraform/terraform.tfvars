vpc_cidr = "10.0.0.0/16"

eks_cluster_name = "eks-from-terraform"
eks_version      = "1.29"

# EKS 접근 유형
endpoint_private_access = true
# public_access가 false이면, terraform apply를 실행한 host가 private subnet이 접근 가능해야 합니다.
endpoint_public_access = true

# Amazon Managed Prometheus 설치 여부
enable_amp = false

# Managed Node Groups
managed_node_groups = {
  "managed-node-group-a" = {
    node_group_name = "managed-node-group-a",
    instance_types  = ["t3.medium"],
    capacity_type   = "SPOT",
    release_version = "" #latest
    disk_size       = 20
    desired_size    = 3,
    max_size        = 3,
    min_size        = 3
  }
}
