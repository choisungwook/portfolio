output "codebuild_project_name" {
  description = "CodeBuild project name"
  value       = aws_codebuild_project.this.name
}

output "codebuild_role_arn" {
  description = "CodeBuild service role ARN"
  value       = aws_iam_role.codebuild.arn
}

output "codebuild_log_group_name" {
  description = "CloudWatch Logs group name"
  value       = aws_cloudwatch_log_group.codebuild.name
}
