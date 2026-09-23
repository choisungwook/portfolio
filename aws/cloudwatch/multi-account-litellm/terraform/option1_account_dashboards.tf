# 방안 1. 계정마다 자기 대시보드를 만든다. 보려면 그 계정 콘솔에 로그인해야 한다.
# 대시보드는 계정당 3개까지 무료라 항상 만든다.
locals {
  dashboard_accounts = {
    dev = {
      name                    = "dev"
      account_id              = local.account_ids.dev
      cluster_name            = module.litellm_dev.cluster_name
      service_name            = module.litellm_dev.service_name
      alb_arn_suffix          = module.litellm_dev.alb_arn_suffix
      target_group_arn_suffix = module.litellm_dev.target_group_arn_suffix
      log_group_name          = module.litellm_dev.app_log_group_name
      log_group_arn           = module.litellm_dev.app_log_group_arn
    }
    prod = {
      name                    = "prod"
      account_id              = local.account_ids.prod
      cluster_name            = module.litellm_prod.cluster_name
      service_name            = module.litellm_prod.service_name
      alb_arn_suffix          = module.litellm_prod.alb_arn_suffix
      target_group_arn_suffix = module.litellm_prod.target_group_arn_suffix
      log_group_name          = module.litellm_prod.app_log_group_name
      log_group_arn           = module.litellm_prod.app_log_group_arn
    }
  }
}

module "dashboard_dev" {
  source = "./modules/cloudwatch-dashboard"

  providers = {
    aws = aws.dev
  }

  dashboard_name = "litellm-dev"
  aws_region     = var.aws_region
  cross_account  = false
  accounts       = [local.dashboard_accounts.dev]
}

module "dashboard_prod" {
  source = "./modules/cloudwatch-dashboard"

  providers = {
    aws = aws.prod
  }

  dashboard_name = "litellm-prod"
  aws_region     = var.aws_region
  cross_account  = false
  accounts       = [local.dashboard_accounts.prod]
}
