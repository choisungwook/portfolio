locals {
  current_caller_arn = data.aws_caller_identity.current.arn

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
    managed-node-group-cpu-spot-a = {
      node_group_name = "managed-node-group-cpu-spot-a"
      instance_types  = var.cpu_node_instance_types
      capacity_type   = "SPOT"
      disk_size       = var.cpu_node_disk_size
      desired_size    = 3
      max_size        = 3
      min_size        = 3
      labels = {
        node-type = "managed-node-group-cpu-spot-a"
      }
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
    }
  ]
}
