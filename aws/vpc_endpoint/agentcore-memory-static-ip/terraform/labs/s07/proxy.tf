module "proxy" {
  source                     = "../../modules/connect-proxy"
  project_name               = var.project_name
  vpc_id                     = var.vpc_id
  subnets                    = var.subnets
  client_cidrs               = var.client_cidrs
  services                   = module.services.lab.services
  endpoint_security_group_id = module.services.endpoint_security_group_id
  scheme                     = "internet-facing"
  nlb_private_ips            = var.nlb_private_ips
  route53_zone_id            = var.route53_zone_id
  proxy_domain               = var.proxy_domain
  acm_certificate_arn        = var.acm_certificate_arn
  os_type                    = var.os_type
}
