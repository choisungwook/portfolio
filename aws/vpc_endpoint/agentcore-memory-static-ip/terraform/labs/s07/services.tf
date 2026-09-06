module "services" {
  source                = "../../modules/sts-memory"
  project_name          = var.project_name
  vpc_id                = var.vpc_id
  subnets               = var.subnets
  client_cidrs          = []
  trusted_principal_arn = var.trusted_principal_arn
}
