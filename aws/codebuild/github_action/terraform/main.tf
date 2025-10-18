data "aws_acm_certificate" "this" {
  domain   = var.acm_domain_name
  statuses = ["ISSUED"]
}

locals {
  name_prefix = "github-action"
  common_tags = {
    Project     = "github-action-codebuild"
    Environment = var.environment
    ManagedBy   = "terraform"
  }
}

module "vpc" {
  source  = "terraform-aws-modules/vpc/aws"
  version = "~> 5.0"

  name = local.name_prefix
  cidr = var.vpc_cidr

  azs             = var.azs
  private_subnets = var.private_subnets
  public_subnets  = var.public_subnets

  enable_nat_gateway = true
  single_nat_gateway = true

  enable_dns_hostnames = true
  enable_dns_support   = true

  tags = local.common_tags
}

module "nexus" {
  source = "./_modules"

  name_prefix       = local.name_prefix
  vpc_id            = module.vpc.vpc_id
  public_subnets    = module.vpc.public_subnets
  nexus_subnet_id   = module.vpc.private_subnets[0]
  alb_allowed_cidrs = concat([module.vpc.vpc_cidr_block], var.alb_allowed_cidrs)

  nexus_instance_type    = var.nexus_instance_type
  nexus_admin_password   = var.nexus_admin_password
  nexus_root_volume_size = var.nexus_root_volume_size

  acm_certificate_arn = data.aws_acm_certificate.this.arn
  route53_zone_name   = var.route53_zone_name
  nexus_subdomain     = var.nexus_subdomain

  tags = local.common_tags
}
