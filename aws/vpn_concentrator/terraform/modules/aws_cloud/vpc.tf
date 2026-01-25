module "vpc" {
  source  = "terraform-aws-modules/vpc/aws"
  version = "6.6.0"

  name = "${var.project_name}-aws-cloud-vpc"
  cidr = var.aws_cloud_vpc_cidr

  azs             = ["ap-northeast-2a", "ap-northeast-2b"]
  private_subnets = var.aws_cloud_private_subnets
  public_subnets  = var.aws_cloud_public_subnets

  enable_nat_gateway   = true
  single_nat_gateway   = true
  enable_dns_hostnames = true
  enable_dns_support   = true

  tags = {
    "Project" = var.project_name
  }
}
