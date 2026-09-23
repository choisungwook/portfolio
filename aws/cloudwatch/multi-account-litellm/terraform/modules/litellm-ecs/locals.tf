locals {
  name = "${var.project_name}-${var.env}"
  # 같은 VPC에 스택을 여러 번 띄워도 namespace가 겹치지 않도록 project 이름을 넣는다.
  namespace     = "${var.env}.${var.project_name}.internal"
  litellm_dns   = "litellm.${local.namespace}"
  db_dns        = "db.${local.namespace}"
  database_url  = "postgresql://litellm:${var.db_password}@${local.db_dns}:5432/litellm"
  app_log_group = "/litellm/${var.env}/app"
  emf_log_group = "/litellm/${var.env}/emf"

  collector_config = templatefile("${path.module}/collector.yaml.tftpl", {
    env                 = var.env
    region              = var.aws_region
    scrape_interval     = var.scrape_interval
    litellm_dns         = local.litellm_dns
    emf_log_group       = local.emf_log_group
    selfhosted_endpoint = var.remote_write_selfhosted_endpoint
    amp                 = var.remote_write_amp
  })
}
