# 방안 3. 모니터링 계정 ECS에 VictoriaMetrics + Grafana를 직접 띄운다.
# dev·prod 수집기는 PrivateLink interface endpoint로 remote write 한다.
# endpoint는 AZ마다 시간 요금이 붙어 2개 AZ에만 둔다.
resource "random_password" "grafana_admin" {
  count = var.enable_selfhosted ? 1 : 0

  length  = 20
  special = false
}

module "selfhosted" {
  source = "./modules/selfhosted-observability"
  count  = var.enable_selfhosted ? 1 : 0

  providers = {
    aws = aws.monitoring
  }

  name                   = "${var.project_name}-obs"
  aws_region             = var.aws_region
  vpc_id                 = data.aws_vpc.monitoring.id
  vpc_cidr               = data.aws_vpc.monitoring.cidr_block
  subnet_ids             = data.aws_subnets.monitoring.ids
  allowed_cidr           = local.my_cidr
  source_account_ids     = [local.account_ids.dev, local.account_ids.prod]
  cpu_architecture       = var.cpu_architecture
  victoriametrics_image  = var.victoriametrics_image
  grafana_image          = var.grafana_image
  retention_days         = var.metrics_retention_days
  grafana_admin_password = random_password.grafana_admin[0].result
  dashboards             = local.grafana_dashboards
  amp_query = {
    enabled       = var.enable_amp
    workspace_arn = var.enable_amp ? aws_prometheus_workspace.litellm[0].arn : null
  }
}

# ---------- dev 계정 쪽 PrivateLink endpoint ----------
resource "aws_security_group" "vm_endpoint_dev" {
  provider = aws.dev
  count    = var.enable_selfhosted ? 1 : 0

  name        = "${var.project_name}-dev-vm-endpoint"
  description = "remote write to central VictoriaMetrics"
  vpc_id      = data.aws_vpc.dev.id
}

resource "aws_vpc_security_group_ingress_rule" "vm_endpoint_dev" {
  provider = aws.dev
  count    = var.enable_selfhosted ? 1 : 0

  security_group_id            = aws_security_group.vm_endpoint_dev[0].id
  referenced_security_group_id = module.litellm_dev.task_security_group_id
  ip_protocol                  = "tcp"
  from_port                    = 8428
  to_port                      = 8428
}

resource "aws_vpc_endpoint" "vm_dev" {
  provider = aws.dev
  count    = var.enable_selfhosted ? 1 : 0

  vpc_id             = data.aws_vpc.dev.id
  service_name       = module.selfhosted[0].endpoint_service_name
  vpc_endpoint_type  = "Interface"
  subnet_ids         = slice(sort(data.aws_subnets.dev.ids), 0, min(2, length(data.aws_subnets.dev.ids)))
  security_group_ids = [aws_security_group.vm_endpoint_dev[0].id]
}

# ---------- prod 계정 쪽 PrivateLink endpoint ----------
resource "aws_security_group" "vm_endpoint_prod" {
  provider = aws.prod
  count    = var.enable_selfhosted ? 1 : 0

  name        = "${var.project_name}-prod-vm-endpoint"
  description = "remote write to central VictoriaMetrics"
  vpc_id      = data.aws_vpc.prod.id
}

resource "aws_vpc_security_group_ingress_rule" "vm_endpoint_prod" {
  provider = aws.prod
  count    = var.enable_selfhosted ? 1 : 0

  security_group_id            = aws_security_group.vm_endpoint_prod[0].id
  referenced_security_group_id = module.litellm_prod.task_security_group_id
  ip_protocol                  = "tcp"
  from_port                    = 8428
  to_port                      = 8428
}

resource "aws_vpc_endpoint" "vm_prod" {
  provider = aws.prod
  count    = var.enable_selfhosted ? 1 : 0

  vpc_id             = data.aws_vpc.prod.id
  service_name       = module.selfhosted[0].endpoint_service_name
  vpc_endpoint_type  = "Interface"
  subnet_ids         = slice(sort(data.aws_subnets.prod.ids), 0, min(2, length(data.aws_subnets.prod.ids)))
  security_group_ids = [aws_security_group.vm_endpoint_prod[0].id]
}
