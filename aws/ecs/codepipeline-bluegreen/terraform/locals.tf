locals {
  account_id = data.aws_caller_identity.current.account_id

  task_family  = "${var.project_name}-web"
  service_name = "${var.project_name}-web"

  artifact_bucket_name = "${var.project_name}-artifacts-${local.account_id}"
  config_bucket_name   = "${var.project_name}-config-${local.account_id}"

  test_url = "http://${aws_lb.web.dns_name}:${var.test_listener_port}/health"
}
