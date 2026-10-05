resource "aws_ecs_cluster" "hello_cluster" {
  name = local.cluster_name
}

resource "aws_cloudwatch_log_group" "hello_services" {
  for_each = toset(local.service_names)

  name              = "/ecs/${var.project_name}/${each.key}"
  retention_in_days = var.log_retention_days
}

resource "aws_cloudwatch_log_group" "deployment_builds" {
  name              = "/aws/codebuild/${local.codebuild_project_name}"
  retention_in_days = var.log_retention_days
}
