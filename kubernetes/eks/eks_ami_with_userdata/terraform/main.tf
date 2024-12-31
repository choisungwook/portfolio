module "vpc" {
  source = "git::https://github.com/choisungwook/terraform_practice.git//eks/module/vpc?ref=v0.17-rc3"

  eks_cluster_name = var.eks_cluster_name

  vpc_cidr        = var.vpc_cidr
  public_subnets  = var.public_subnets
  private_subnets = var.private_subnets
}

module "eks" {
  source = "git::https://github.com/choisungwook/terraform_practice.git//eks/module/eks?ref=v0.17-rc3"

  eks_cluster_name      = var.eks_cluster_name
  eks_version           = var.eks_version
  oidc_provider_enabled = var.oidc_provider_enabled

  vpc_id                  = module.vpc.vpc_id
  private_subnets_ids     = module.vpc.private_subnets_ids
  endpoint_private_access = var.endpoint_private_access
  endpoint_public_access  = var.endpoint_public_access

  eks_addons = [
    # https://docs.aws.amazon.com/ko_kr/eks/latest/userguide/managing-kube-proxy.html
    {
      name                 = "kube-proxy"
      version              = "v1.30.6-eksbuild.3"
      configuration_values = jsonencode({})
    },
    # https://docs.aws.amazon.com/ko_kr/eks/latest/userguide/managing-vpc-cni.html
    {
      name                 = "vpc-cni"
      version              = "v1.19.0-eksbuild.1"
      before_compute       = true
      configuration_values = jsonencode({})
    },
    # https://docs.aws.amazon.com/ko_kr/eks/latest/userguide/managing-coredns.html
    {
      name                 = "coredns"
      version              = "v1.11.3-eksbuild.2"
      configuration_values = jsonencode({})
    }
  ]

  managed_node_groups = {
    "managed-node-group-a" = {
      node_group_name = "managed-node-group-a",
      instance_types  = ["t3.medium"],
      capacity_type   = "SPOT",
      release_version = "1.30.7-20241213"
      disk_size       = 20
      desired_size    = 1,
      max_size        = 1,
      min_size        = 1
    },
    "userdata-managed-node-group" = {
      node_group_name = "managed-node-group",
      instance_types  = ["t3.medium"],
      capacity_type   = "SPOT",
      release_version = "1.30.7-20241213"
      disk_size       = 20
      desired_size    = 1,
      max_size        = 1,
      min_size        = 1
      user_data       = filebase64("${path.module}/userdata.tpl")
    }
  }

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
