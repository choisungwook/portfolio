# dev·prod 계정에 같은 모양의 LiteLLM 환경을 만든다. 모든 방안이 이 위에서 동작한다.
module "litellm_dev" {
  source = "./modules/litellm-ecs"

  providers = {
    aws = aws.dev
  }

  env                = "dev"
  project_name       = var.project_name
  aws_region         = var.aws_region
  vpc_id             = data.aws_vpc.dev.id
  subnet_ids         = data.aws_subnets.dev.ids
  allowed_cidr       = local.my_cidr
  replicas           = var.dev_replicas
  loadgen_count      = var.loadgen_count
  cpu_architecture   = var.cpu_architecture
  litellm_image      = var.litellm_image
  collector_image    = var.collector_image
  postgres_image     = var.postgres_image
  loadgen_image      = var.loadgen_image
  litellm_master_key = local.litellm_master_key
  db_password        = random_password.db_password.result
  litellm_config     = local.litellm_config
  loadgen_script     = local.loadgen_script
  scrape_interval    = var.scrape_interval
  log_retention_days = var.log_retention_days
  container_insights = var.container_insights

  remote_write_selfhosted_endpoint = var.enable_selfhosted ? "http://${aws_vpc_endpoint.vm_dev[0].dns_entry[0].dns_name}:8428/api/v1/write" : null
  remote_write_amp                 = local.remote_write_amp
}

module "litellm_prod" {
  source = "./modules/litellm-ecs"

  providers = {
    aws = aws.prod
  }

  env                = "prod"
  project_name       = var.project_name
  aws_region         = var.aws_region
  vpc_id             = data.aws_vpc.prod.id
  subnet_ids         = data.aws_subnets.prod.ids
  allowed_cidr       = local.my_cidr
  replicas           = var.prod_replicas
  loadgen_count      = var.loadgen_count
  cpu_architecture   = var.cpu_architecture
  litellm_image      = var.litellm_image
  collector_image    = var.collector_image
  postgres_image     = var.postgres_image
  loadgen_image      = var.loadgen_image
  litellm_master_key = local.litellm_master_key
  db_password        = random_password.db_password.result
  litellm_config     = local.litellm_config
  loadgen_script     = local.loadgen_script
  scrape_interval    = var.scrape_interval
  log_retention_days = var.log_retention_days
  container_insights = var.container_insights

  remote_write_selfhosted_endpoint = var.enable_selfhosted ? "http://${aws_vpc_endpoint.vm_prod[0].dns_entry[0].dns_name}:8428/api/v1/write" : null
  remote_write_amp                 = local.remote_write_amp
}
