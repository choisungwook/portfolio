module "eks" {
  source = "git::https://github.com/choisungwook/terraform_practice.git//eks/module/eks?ref=v.1.35.5"

  eks_cluster_name      = var.eks_cluster_name
  eks_version           = var.eks_version
  oidc_provider_enabled = true

  vpc_id                  = data.aws_vpc.default.id
  private_subnets_ids     = data.aws_subnets.default.ids
  endpoint_private_access = var.endpoint_private_access
  endpoint_public_access  = var.endpoint_public_access

  eks_addons          = local.eks_addons
  managed_node_groups = local.managed_node_groups

  alb_controller_enabled = false

  aws_auth_admin_roles = local.eks_admin_principal_arns
}
