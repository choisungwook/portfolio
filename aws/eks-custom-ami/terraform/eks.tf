module "eks" {
  source = "git::https://github.com/choisungwook/terraform_practice.git//eks/module/eks?ref=v1.35.4"

  eks_cluster_name      = var.eks_cluster_name
  eks_version           = var.eks_version
  oidc_provider_enabled = var.oidc_provider_enabled

  vpc_id                  = data.aws_vpc.default.id
  private_subnets_ids     = data.aws_subnets.default.ids
  endpoint_private_access = var.endpoint_private_access
  endpoint_public_access  = var.endpoint_public_access

  eks_addons = [
    # Ref: https://docs.aws.amazon.com/ko_kr/eks/latest/userguide/managing-kube-proxy.html
    # EKS 1.35 호환
    {
      name                 = "kube-proxy"
      version              = "v1.35.2-eksbuild.4"
      configuration_values = jsonencode({})
    },
    # Ref: https://docs.aws.amazon.com/ko_kr/eks/latest/userguide/managing-vpc-cni.html
    # EKS 1.35 호환
    {
      name                 = "vpc-cni"
      version              = "v1.21.1-eksbuild.5"
      before_compute       = true
      configuration_values = jsonencode({})
    },
    # Ref: https://docs.aws.amazon.com/ko_kr/eks/latest/userguide/managing-coredns.html
    # EKS 1.35 호환
    {
      name                 = "coredns"
      version              = "v1.13.2-eksbuild.4"
      configuration_values = jsonencode({})
    },
    # Ref: aws eks describe-addon-versions --addon-name metrics-server --kubernetes-version 1.35 --query "addons[].addonVersions[0].addonVersion"
    # EKS 1.35 호환
    {
      name                 = "metrics-server"
      version              = "v0.8.1-eksbuild.4"
      configuration_values = jsonencode({})
    }
  ]

  managed_node_groups = {
    "custom-ami-node-group" = {
      node_group_name = "custom-ami-node-group"
      name            = "custom-ami-node"
      instance_types  = ["t3.medium"]
      capacity_type   = "ON_DEMAND"
      ami_id          = var.custom_ami_id
      disk_size       = 30
      desired_size    = 1
      max_size        = 1
      min_size        = 1
      labels = {
        "ami-type" = "custom"
      }
    }
  }

  # EKS auto mode
  auto_mode_enabled      = false
  cluster_compute_config = {}

  # IRSA role: Karpenter 커스텀 AMI 테스트를 위해 활성화
  karpenter_enabled      = true
  alb_controller_enabled = false
  external_dns_enabled   = false
  enable_amp             = false

  # EKS access entry 설정
  aws_auth_admin_roles = [
    var.assume_role_arn
  ]
}
