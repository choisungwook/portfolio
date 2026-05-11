module "vpc" {
  source  = "terraform-aws-modules/vpc/aws"
  version = "6.6.0"

  for_each = var.vpc_configs

  name = "${var.project_name}-vpc-${each.key}"
  cidr = each.value.cidr

  azs             = ["${var.aws_region}a"]
  private_subnets = each.value.private_subnets
  public_subnets  = each.value.public_subnets

  enable_nat_gateway = true
  single_nat_gateway = true

  tags = {
    VPC = each.key
  }
}
