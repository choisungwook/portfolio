module "vpc" {
  source = "git::https://github.com/choisungwook/terraform_practice.git//eks/module/vpc?ref=0.14"

  eks_cluster_name = var.eks_cluster_name

  vpc_cidr        = var.vpc_cidr
  public_subnets  = var.public_subnets
  private_subnets = var.private_subnets
}

module "eks" {
  source = "git::https://github.com/choisungwook/terraform_practice.git//eks/module/eks?ref=0.14"

  eks_cluster_name      = var.eks_cluster_name
  eks_version           = var.eks_version
  oidc_provider_enabled = var.oidc_provider_enabled

  vpc_id                  = module.vpc.vpc_id
  private_subnets_ids     = module.vpc.private_subnets_ids
  endpoint_private_access = var.endpoint_private_access
  endpoint_public_access  = var.endpoint_public_access

  # EKS auto mode를 사용하면 애드온 관리가 필요 없습니다.
  eks_addons = []

  managed_node_groups = var.managed_node_groups

  # EKS auto mode
  auto_mode_enabled      = var.auto_mode_enabled
  cluster_compute_config = var.cluster_compute_config

  # IRSA role 생성 여부
  karpenter_enabled      = false
  alb_controller_enabled = false
  external_dns_enabled   = false
  enable_amp             = var.enable_amp

  # EKS access entry 설정
  aws_auth_admin_roles = [
    var.assume_role_arn
  ]
}
