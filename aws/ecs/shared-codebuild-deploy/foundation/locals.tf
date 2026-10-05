locals {
  service_names          = ["hello-alpha", "hello-beta"]
  cluster_name           = "${var.project_name}-cluster"
  codebuild_project_name = "${var.project_name}-deploy"
  arn_prefix             = "arn:${data.aws_partition.lab.partition}"
  regional_arn_prefix    = "${local.arn_prefix}:ecs:${var.aws_region}:${data.aws_caller_identity.lab.account_id}"
  service_arns           = [for service in local.service_names : "${local.regional_arn_prefix}:service/${local.cluster_name}/${service}"]
  task_definition_arns   = [for service in local.service_names : "${local.regional_arn_prefix}:task-definition/${var.project_name}-${service}:*"]
}
