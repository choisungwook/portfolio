output "codebuild_project_name" {
  description = "CodeBuild project name"
  value       = aws_codebuild_project.this.name
}

output "github_connection_arn" {
  description = "CodeConnections connection ARN"
  value       = aws_codeconnections_connection.github.arn
}

output "github_connection_status" {
  description = "Connection status. PENDING이면 AWS console에서 GitHub 연결을 완료해야 한다"
  value       = aws_codeconnections_connection.github.connection_status
}

output "repo_a_url" {
  description = "CodeBuild source repository (repo a)"
  value       = local.repo_a_url
}

output "repo_b_url" {
  description = "Repository cloned inside the build (repo b)"
  value       = local.repo_b_url
}

output "codebuild_log_group_name" {
  description = "CloudWatch Logs group name"
  value       = aws_cloudwatch_log_group.codebuild.name
}
