module "eks" {
  source = "git::https://github.com/choisungwook/terraform_practice.git//eks/module/eks?ref=v.1.35.5"

  eks_cluster_name      = var.eks_cluster_name
  eks_version           = var.eks_version
  oidc_provider_enabled = false

  vpc_id                  = data.aws_vpc.default.id
  private_subnets_ids     = data.aws_subnets.default.ids
  endpoint_private_access = true
  endpoint_public_access  = true

  # addon을 넘기지 않으면 EKS가 vpc-cni, kube-proxy, coredns를 self-managed로 설치한다(bootstrap_self_managed_addons).
  # EKS 1.36에 맞는 버전을 고르는 일을 EKS에 맡긴다. managed addon으로 바꾸려면 아래 명령으로 버전을 조회해 넘긴다
  # aws eks describe-addon-versions --kubernetes-version 1.36 --addon-name vpc-cni --query 'addons[0].addonVersions[0].addonVersion'
  eks_addons = []

  managed_node_groups = {
    bottlerocket = {
      node_group_name = "bottlerocket"
      name            = "bottlerocket-node"
      instance_types  = [var.instance_type]
      capacity_type   = "ON_DEMAND"
      ami_type        = var.ami_type
      # 모듈은 /dev/xvda만 잡는다. Bottlerocket의 xvda는 OS 볼륨(AMI 스냅샷 2GiB)이라 이 값은 데이터 볼륨(xvdb, 기본 20GiB)을 키우지 않는다
      disk_size    = 4
      desired_size = 1
      max_size     = 1
      min_size     = 1
      # 모듈은 ami_id가 없으면 user_data를 launch template에 그대로 넘기므로 호출자가 base64로 넘긴다
      user_data = base64encode(local.bottlerocket_settings)
      labels = {
        "os" = "bottlerocket"
      }
    }
  }

  auto_mode_enabled      = false
  cluster_compute_config = {}

  karpenter_enabled      = false
  alb_controller_enabled = false
  external_dns_enabled   = false
  enable_amp             = false

  aws_auth_admin_roles = [data.aws_iam_session_context.current.issuer_arn]
}
