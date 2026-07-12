# NAT gateway도 IGW 라우트도 없는 완전 폐쇄 VPC. private subnet만 만든다.
# interface endpoint의 private DNS를 쓰려면 DNS support/hostnames가 켜져 있어야 한다.
module "vpc" {
  source  = "terraform-aws-modules/vpc/aws"
  version = "~> 6.0"

  name = var.project_name
  cidr = var.vpc_cidr

  azs             = var.azs
  private_subnets = var.private_subnet_cidrs

  enable_nat_gateway   = false
  enable_dns_hostnames = true
  enable_dns_support   = true

  private_subnet_tags = {
    Tier = "private-airgap"
  }
}
