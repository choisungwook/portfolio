module "vpc" {
  source = "git::https://github.com/choisungwook/terraform_practice.git//eks/module/vpc?ref=v0.22"

  eks_cluster_name = var.eks_cluster_name

  vpc_cidr        = var.vpc_cidr
  public_subnets  = var.public_subnets
  private_subnets = var.private_subnets
}

module "eks" {
  source = "git::https://github.com/choisungwook/terraform_practice.git//eks/module/eks?ref=v0.22"

  eks_cluster_name      = var.eks_cluster_name
  eks_version           = var.eks_version
  oidc_provider_enabled = var.oidc_provider_enabled

  vpc_id                  = module.vpc.vpc_id
  private_subnets_ids     = module.vpc.private_subnets_ids
  endpoint_private_access = var.endpoint_private_access
  endpoint_public_access  = var.endpoint_public_access

  eks_addons = [
    # Ref: https://docs.aws.amazon.com/ko_kr/eks/latest/userguide/managing-kube-proxy.html
    # EKS 1.32 호환
    {
      name                 = "kube-proxy"
      version              = "v1.32.0-eksbuild.2"
      configuration_values = jsonencode({})
    },
    # Ref: https://docs.aws.amazon.com/ko_kr/eks/latest/userguide/managing-vpc-cni.html
    # EKS 1.32 호환
    {
      name                 = "vpc-cni"
      version              = "v1.19.2-eksbuild.5"
      before_compute       = true
      configuration_values = jsonencode({})
    },
    # Ref: https://docs.aws.amazon.com/ko_kr/eks/latest/userguide/managing-coredns.html
    # EKS 1.32 호환
    {
      name                 = "coredns"
      version              = "v1.11.4-eksbuild.2"
      configuration_values = jsonencode({})
    },
    # Ref: aws eks describe-addon-versions --addon-name metrics-server --kubernetes-version 1.32 --query "addons[].addonVersions[].addonVersion"
    # # EKS 1.32 호환
    {
      name                 = "metrics-server"
      version              = "v0.7.2-eksbuild.3"
      configuration_values = jsonencode({})
    }
  ]

  managed_node_groups = var.managed_node_groups

  # EKS auto mode
  auto_mode_enabled      = var.auto_mode_enabled
  cluster_compute_config = var.cluster_compute_config

  # IRSA role 생성 여부
  karpenter_enabled      = true
  alb_controller_enabled = true
  external_dns_enabled   = true
  enable_amp             = var.enable_amp

  # EKS access entry 설정
  aws_auth_admin_roles = [
    var.assume_role_arn
  ]
}
