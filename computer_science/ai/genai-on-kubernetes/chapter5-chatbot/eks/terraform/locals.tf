locals {
  current_caller_arn = data.aws_caller_identity.current.arn

  # EKS access entries need the IAM role ARN, not the temporary STS assumed-role session ARN.
  current_caller_assumed_role_name = try(regex("^arn:[^:]+:sts::[0-9]+:assumed-role/([^/]+)/.+$", local.current_caller_arn)[0], null)

  current_caller_iam_role_arn = local.current_caller_assumed_role_name == null ? null : format(
    "arn:%s:iam::%s:role/%s",
    data.aws_partition.current.partition,
    data.aws_caller_identity.current.account_id,
    local.current_caller_assumed_role_name
  )

  current_admin_principal_arn  = local.current_caller_iam_role_arn == null ? local.current_caller_arn : local.current_caller_iam_role_arn
  current_admin_principal_arns = var.grant_current_caller_admin ? [local.current_admin_principal_arn] : []

  eks_admin_principal_arns = distinct(concat(
    var.eks_admin_principal_arns,
    local.current_admin_principal_arns
  ))

  managed_node_groups = {
    managed-node-group-cpu-a = {
      node_group_name = "managed-node-group-cpu-a"
      instance_types  = var.cpu_node_instance_types
      capacity_type   = "ON_DEMAND"
      disk_size       = var.cpu_node_disk_size
      desired_size    = 3
      max_size        = 3
      min_size        = 3
      labels = {
        node-type = "managed-node-group-cpu-a"
      }
    }

    managed-node-group-gpu-a = {
      node_group_name = "managed-node-group-gpu-a"
      instance_types  = var.gpu_node_instance_types
      capacity_type   = "SPOT"
      ami_type        = "AL2023_x86_64_NVIDIA"
      disk_size       = var.gpu_node_disk_size
      desired_size    = 1
      max_size        = 1
      min_size        = 1
      labels = {
        "nvidia.com/gpu" = "true"
        node-type        = "managed-node-group-gpu-a"
      }
      taints = [
        {
          key    = "nvidia.com/gpu"
          value  = "true"
          effect = "NO_SCHEDULE"
        }
      ]
    }
  }

  eks_addons = [
    {
      name                      = "vpc-cni"
      version                   = null
      before_compute            = true
      configuration_values      = jsonencode({})
      pod_identity_associations = []
    },
    {
      name                      = "kube-proxy"
      version                   = null
      before_compute            = false
      configuration_values      = jsonencode({})
      pod_identity_associations = []
    },
    {
      name                      = "coredns"
      version                   = null
      before_compute            = false
      configuration_values      = jsonencode({})
      pod_identity_associations = []
    },
    {
      name                      = "metrics-server"
      version                   = null
      before_compute            = false
      configuration_values      = jsonencode({})
      pod_identity_associations = []
    },
    {
      name                      = "eks-pod-identity-agent"
      version                   = null
      before_compute            = false
      configuration_values      = jsonencode({})
      pod_identity_associations = []
    },
    {
      name                 = "aws-ebs-csi-driver"
      version              = null
      before_compute       = false
      configuration_values = jsonencode({})
      pod_identity_associations = [
        {
          role_arn        = aws_iam_role.ebs_csi_controller.arn
          service_account = "ebs-csi-controller-sa"
        }
      ]
    },
    {
      name                 = "aws-efs-csi-driver"
      version              = null
      before_compute       = false
      configuration_values = jsonencode({})
      pod_identity_associations = [
        {
          role_arn        = aws_iam_role.efs_csi_controller.arn
          service_account = "efs-csi-controller-sa"
        },
        {
          role_arn        = aws_iam_role.efs_csi_node.arn
          service_account = "efs-csi-node-sa"
        }
      ]
    }
  ]

  chapter5_data_dir = abspath("${path.module}/../../data/chapter5")
  notebook_dir      = abspath("${path.module}/../notebooks")

  chapter5_data_files = fileset(local.chapter5_data_dir, "*")
  notebook_files      = fileset(local.notebook_dir, "*.ipynb")
}
