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

module "nexus" {
  source = "./_modules"

  name_prefix       = local.name_prefix
  vpc_id            = module.vpc.vpc_id
  vpc_cidr          = var.vpc_cidr
  public_subnets    = module.vpc.public_subnets
  private_subnets   = module.vpc.private_subnets
  nexus_subnet_id   = module.vpc.private_subnets[0]
  alb_allowed_cidrs = concat(var.alb_allowed_cidrs)

  nexus_instance_type    = var.nexus_instance_type
  nexus_admin_password   = var.nexus_admin_password
  nexus_root_volume_size = var.nexus_root_volume_size

  acm_certificate_arn         = data.aws_acm_certificate.this.arn
  private_acm_certificate_arn = data.aws_acm_certificate.this.arn
  route53_zone_name           = var.route53_zone_name
  nexus_subdomain             = var.nexus_subdomain
  nexus_internal_subdomain    = var.nexus_internal_subdomain

  tags = local.common_tags
}
