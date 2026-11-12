# Auto Mode는 Nitro Sandbox runtime이 들어간 노드를 직접 준비한다. 관리형 노드그룹은 runtime을 넣은 커스텀 AMI가 필요하다
module "eks" {
  source  = "terraform-aws-modules/eks/aws"
  version = "~> 21.29"

  name               = var.eks_cluster_name
  kubernetes_version = var.eks_version

  endpoint_public_access       = true
  endpoint_public_access_cidrs = [local.my_ip_cidr]

  enable_cluster_creator_admin_permissions = true

  compute_config = {
    enabled    = true
    node_pools = ["general-purpose", "system"]
  }

  # 로그와 메트릭 확인용. kubectl top은 metrics-server, CloudWatch Logs와 Container Insights는 cloudwatch-observability가 맡는다
  addons = {
    metrics-server = {
      addon_version = "v0.9.0-eksbuild.14"
    }
    amazon-cloudwatch-observability = {
      addon_version = "v7.0.1-eksbuild.1"
      pod_identity_association = [{
        role_arn        = aws_iam_role.cloudwatch_agent.arn
        service_account = "cloudwatch-agent"
      }]
    }
  }

  vpc_id     = module.vpc.vpc_id
  subnet_ids = module.vpc.private_subnets
}
