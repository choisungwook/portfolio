resource "aws_codeconnections_connection" "github_source" {
  count = var.existing_connection_arn == null ? 1 : 0

  name          = "${var.project_name}-github"
  provider_type = "GitHub"
}

locals {
  connection_arn = var.existing_connection_arn == null ? aws_codeconnections_connection.github_source[0].arn : var.existing_connection_arn
}
